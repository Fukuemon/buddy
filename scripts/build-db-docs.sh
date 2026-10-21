#!/bin/sh
# schedule-api のマイグレーションを使い捨ての MySQL に当て、tbls で表の文書と ER 図を docs/db/schedule-api/ に生成し直す。
# 表とカラムの説明は apps/schedule-api/.tbls.yml に書く。
#
# 使い方: sh scripts/build-db-docs.sh（リポジトリのルートで実行する。Docker と、mise の Go と tbls が要る）
# 終了コード: 0 は生成できた。それ以外は、失敗したコマンドの終了コードで終わる。
set -eu

password=tbls-dev
container=$(docker run -d --rm -e MYSQL_ROOT_PASSWORD=$password -e MYSQL_DATABASE=buddy -p 127.0.0.1::3306 mysql:8.4)
trap 'docker rm -f "$container" >/dev/null' EXIT
port=$(docker port "$container" 3306/tcp | head -n 1 | sed 's/.*://')

# 初期化の途中で MySQL が 1 度再起動するので、TCP で応答するまで待つ
i=0
until docker exec "$container" mysqladmin ping -h 127.0.0.1 -uroot -p$password --silent >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "MySQL が 90 秒で起動しなかった" >&2
    exit 1
  fi
  sleep 1
done

(cd apps/schedule-api && GOWORK=off DB_HOST=127.0.0.1 DB_PORT=$port DB_USER=root DB_PASSWORD=$password DB_NAME=buddy go run ./cmd/migrate up)
tbls doc --rm-dist --config apps/schedule-api/.tbls.yml "mysql://root:$password@127.0.0.1:$port/buddy"
