#!/bin/sh
# web の負荷の検証（ADR-0047、#1040）で、k6 と並べて PostgreSQL の接続の数と CPU を 5 秒ごとに記録する。
# 止めると、接続の数と CPU の最大と、web のセッションの読み取りの pg_stat_statements の平均と回数を書く。
#
# 使い方: apps/web/scripts/load-sample.sh <postgres のコンテナの名前> <記録の CSV のパス>
# 先に compose/load.yml を重ねて起動しておく。始めるときに web のデータベースの pg_stat_statements を空にする。
# Ctrl-C か kill で止める。
set -eu

container=${1:?postgres のコンテナの名前を渡す}
out=${2:?記録の CSV のパスを渡す}

psql() { docker exec "$container" psql -U buddy -d web -XAtq -c "$1"; }

psql 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements'
psql 'SELECT pg_stat_statements_reset()' >/dev/null

summarize() {
  echo "接続の数の最大（全てのデータベース）: $(awk -F, 'NR > 1 && $2 > m { m = $2 } END { print m + 0 }' "$out")"
  echo "接続の数の最大（web）: $(awk -F, 'NR > 1 && $3 > m { m = $3 } END { print m + 0 }' "$out")"
  echo "CPU の最大（%）: $(awk -F, 'NR > 1 && $4 + 0 > m { m = $4 + 0 } END { print m + 0 }' "$out")"
  echo "セッションの読み取り（回数、平均 ms、最大 ms）:"
  psql "SELECT calls, round(mean_exec_time::numeric, 3), round(max_exec_time::numeric, 3)
        FROM pg_stat_statements
        WHERE query LIKE 'SELECT value FROM web_sessions%'"
  exit 0
}
trap summarize INT TERM

echo 'time,connections,web_connections,cpu_percent' >"$out"
while :; do
  # 測るための接続（この psql）は数えない
  counts=$(psql "SELECT count(*), count(*) FILTER (WHERE datname = 'web')
                 FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()" | tr '|' ',')
  cpu=$(docker stats --no-stream --format '{{.CPUPerc}}' "$container" | tr -d '%')
  echo "$(date +%H:%M:%S),$counts,$cpu" >>"$out"
  sleep 5 &
  wait $!
done
