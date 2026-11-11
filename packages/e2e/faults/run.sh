#!/bin/sh
# token_hook とブローカーの故障を入れる測定を、1 つのコマンドで流す。手順と結果の読み方は context/operations.md の「故障を入れる仕組み」にある。
#
# 使い方: pnpm --filter @buddy/e2e faults [--quick] [--keep] [playwright の引数...]
#   --quick  答えない hook の測定（約 93 秒）を外す
#   --keep   終わった後も、スタブを重ねた compose のままにする。省くと、スタブを外した compose に起動し直す
#
# worktree の .env の COMPOSE_PROJECT_NAME の compose に、compose.faults.yml を重ねて起動し直してから流す。
# main の checkout の compose（buddy）には流さない。終わったら、失敗しても、入れた故障を戻す。
set -eu

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)

if [ -z "${COMPOSE_PROJECT_NAME:-}" ] && [ -f "$root/.env" ]; then
  COMPOSE_PROJECT_NAME=$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$root/.env")
fi
project=${COMPOSE_PROJECT_NAME:-}
case $project in
  '' | buddy)
    echo "worktree の .env の COMPOSE_PROJECT_NAME で、main の checkout（buddy）以外の compose を指す" >&2
    exit 1
    ;;
esac
export COMPOSE_PROJECT_NAME="$project"

quick=false
keep=false
for arg in "$@"; do
  case $arg in
    --quick) quick=true ;;
    --keep) keep=true ;;
  esac
done

# 入れた故障を戻す。測定の afterEach が戻せなかったとき（中断、失敗）のためで、戻すものが無くても続ける
restore() {
  set +e
  pg="$project-postgres-1"
  docker exec "$pg" psql -U buddy -d buddy -Atc "ALTER DATABASE broker ALLOW_CONNECTIONS true" >/dev/null 2>&1
  docker exec "$pg" psql -U buddy -d buddy -Atc "ALTER DATABASE hydra ALLOW_CONNECTIONS true" >/dev/null 2>&1
  docker exec "$pg" psql -U buddy -d buddy -Atc \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'buddy-faults-lock'" >/dev/null 2>&1
  for service in hook-stub hydra broker schedule; do
    c="$project-$service-1"
    case $(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null) in
      paused) docker unpause "$c" >/dev/null ;;
      exited | created) docker start "$c" >/dev/null ;;
    esac
  done
  cd "$root"
  if [ "$keep" = true ]; then
    portless compose -p "$project" -f compose.yml -f packages/e2e/faults/compose.faults.yml up -d --wait
  else
    portless compose -p "$project" up -d --wait --remove-orphans
  fi
}

echo "Docker のメモリ（VM は 4GB。足りなければ、ほかの compose を止めてから流す）:"
docker stats --no-stream --format '  {{.Name}} {{.MemUsage}}'

cd "$root"
portless compose -p "$project" -f compose.yml -f packages/e2e/faults/compose.faults.yml up -d --build --wait
trap restore EXIT
trap 'exit 130' INT TERM

FAULTS_RUN_ID=$(date +%Y-%m-%dT%H-%M-%S)
export FAULTS_RUN_ID

# --quick と --keep を外した残りを、playwright に渡す
for arg in "$@"; do
  shift
  case $arg in --quick | --keep) ;; *) set -- "$@" "$arg" ;; esac
done
if [ "$quick" = true ]; then set -- --grep-invert @slow "$@"; fi

cd "$here/.."
status=0
pnpm exec playwright test -c faults/faults.config.ts "$@" || status=$?
echo "測った値: packages/e2e/faults/results/$FAULTS_RUN_ID.md"
exit "$status"
