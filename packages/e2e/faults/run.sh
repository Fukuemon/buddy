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

fail() {
  echo "$1" >&2
  exit 1
}

# 操作する compose と HTTP の宛先は、worktree の .env を正とする。
# シェルに別の worktree の値が残っていると、docker の操作と HTTP の宛先が別の compose に向くので、違えば止める
[ -f "$root/.env" ] || fail "worktree の .env が無い。wt で作った worktree で流す"
env_value() { sed -n "s/^$1=//p" "$root/.env" | tr -d '\r'; }

project=$(env_value COMPOSE_PROJECT_NAME)
case $project in
  '' | buddy | *[!a-z0-9_-]*) fail ".env の COMPOSE_PROJECT_NAME が、main の checkout（buddy）以外の compose の名前でない: '$project'" ;;
esac
for name in COMPOSE_PROJECT_NAME E2E_COMPOSE_PROJECT; do
  value=$(printenv "$name" || true)
  [ -z "$value" ] || [ "$value" = "$project" ] || fail "シェルの ${name}（${value}）が .env の COMPOSE_PROJECT_NAME（${project}）と違う"
done
for name in E2E_BASE_URL E2E_HYDRA_URL E2E_SCHEDULE_URL; do
  value=$(env_value "$name")
  case $value in
    '' | *://*.buddy.localhost | *://*.buddy.localhost/* | *://*.buddy.localhost:*)
      fail ".env の ${name} が無いか、main の checkout の compose を指す: '${value}'"
      ;;
  esac
  # tests/fixtures/env.ts はシェルの値を .env より優先するので、別の worktree の URL が残っていれば止める
  shell=$(printenv "$name" || true)
  [ -z "$shell" ] || [ "$shell" = "$value" ] || fail "シェルの ${name}（${shell}）が .env の値（${value}）と違う"
done
export COMPOSE_PROJECT_NAME="$project" E2E_COMPOSE_PROJECT="$project"

quick=false
keep=false
for arg in "$@"; do
  case $arg in
    --quick) quick=true ;;
    --keep) keep=true ;;
  esac
done

# 入れた故障を戻す。測定の afterEach が戻せなかったとき（中断、失敗）のためで、戻すものが無くても続ける。
# compose を戻せなかったときは、測定が通っていても失敗で終える
restore() {
  rc=$?
  trap '' INT TERM
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
  # --keep ではスタブを作り直さないので、答え方を素通しに戻す
  docker exec "$project-hook-stub-1" wget -qO- http://127.0.0.1:9000/mode >/dev/null 2>&1
  cd "$root"
  if [ "$keep" = true ]; then
    portless compose -p "$project" -f compose.yml -f packages/e2e/faults/compose.faults.yml up -d --wait
  else
    portless compose -p "$project" up -d --wait --remove-orphans
  fi
  if [ $? -ne 0 ]; then
    echo "compose を戻せなかった。portless compose -p $project up -d --wait --remove-orphans を流し直す" >&2
    [ "$rc" -ne 0 ] || rc=1
  fi
  exit "$rc"
}

echo "Docker のメモリ（VM は 4GB。足りなければ、ほかの compose を止めてから流す）:"
docker stats --no-stream --format '  {{.Name}} {{.MemUsage}}'

# 起動の途中で失敗しても、スタブを外した compose に戻す
trap restore EXIT
trap 'exit 130' INT TERM
cd "$root"
portless compose -p "$project" -f compose.yml -f packages/e2e/faults/compose.faults.yml up -d --build --wait

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
