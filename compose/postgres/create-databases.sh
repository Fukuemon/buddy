#!/bin/sh
# 同じ PostgreSQL に、Hydra とブローカーのデータベースを作る。あれば何もしない。
# 予定の API のデータベース buddy は、postgres のイメージが初期化のときに作る。
set -eu

for db in hydra broker; do
  if [ "$(psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$db'")" != 1 ]; then
    createdb "$db"
    echo "created $db"
  fi
done
