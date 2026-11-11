#!/bin/sh
# web の負荷の検証（ADR-0047、#1040）で、k6 と並べて PostgreSQL の接続の数と CPU を 5 秒ごとに記録する。
# 止めると、接続の数と CPU の最大と、web のセッションの読み取りの pg_stat_statements の平均と回数を書く。
#
# 使い方: apps/web/scripts/load-sample.sh <postgres のコンテナの名前> <記録を置くディレクトリ>
# 先に compose/load.yml を重ねて起動しておく。始めるときに web のデータベースの pg_stat_statements を空にする。
# Ctrl-C か kill で止める。ディレクトリに connections.csv と cpu.csv を書く。
#
# 接続の数は、始めに開いた 1 本の接続で数え続ける。接続の数が上限に達しても、数えられるようにするためである。
# この接続は、数に入れない。
set -eu

container=${1:?postgres のコンテナの名前を渡す}
dir=${2:?記録を置くディレクトリを渡す}
mkdir -p "$dir"

psql() { docker exec "$container" psql -U buddy -d web -XAtq -c "$1"; }

psql 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements' 2>/dev/null
psql 'SELECT pg_stat_statements_reset()' >/dev/null

echo 'time,all,buddy,web,hydra,broker' >"$dir/connections.csv"
while :; do
  echo "SELECT to_char(now(), 'HH24:MI:SS'), count(*),
               count(*) FILTER (WHERE datname = 'buddy'), count(*) FILTER (WHERE datname = 'web'),
               count(*) FILTER (WHERE datname = 'hydra'), count(*) FILTER (WHERE datname = 'broker')
        FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid();"
  sleep 5
done | docker exec -i "$container" psql -U buddy -d web -XAtq -F, >>"$dir/connections.csv" &
counting=$!

echo 'time,cpu_percent' >"$dir/cpu.csv"
while :; do
  echo "$(date +%H:%M:%S),$(docker stats --no-stream --format '{{.CPUPerc}}' "$container" | tr -d '%')" >>"$dir/cpu.csv"
  sleep 5
done &
cpu=$!

max() { awk -F, -v col="$2" 'NR > 1 && $col + 0 > m { m = $col + 0 } END { print m + 0 }' "$1"; }

summarize() {
  kill "$counting" "$cpu" 2>/dev/null || true
  wait 2>/dev/null || true
  c="$dir/connections.csv"
  echo "接続の数の最大: 全て $(max "$c" 2)、buddy $(max "$c" 3)、web $(max "$c" 4)、hydra $(max "$c" 5)、broker $(max "$c" 6)"
  echo "CPU の最大（%）: $(max "$dir/cpu.csv" 2)"
  echo "セッションの読み取り（回数、平均 ms、最大 ms）:"
  psql "SELECT calls, round(mean_exec_time::numeric, 3), round(max_exec_time::numeric, 3)
        FROM pg_stat_statements WHERE query LIKE 'SELECT value FROM web_sessions%'"
  exit 0
}
trap summarize INT TERM

wait
