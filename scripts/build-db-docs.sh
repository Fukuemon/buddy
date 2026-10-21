#!/bin/sh
# schedule-api のマイグレーションを使い捨ての MySQL に当て、tbls で表の文書と ER 図を docs/db/schedule-api/ に生成し直す。
# 表とカラムの説明と、ER 図を分ける業務のまとまり（viewpoints）は apps/schedule-api/.tbls.yml に書く。
# 生成の後に tbls lint で、どの viewpoint にも入らない表がないかを確かめる。
# 最後に、生成した viewpoint の文書が全て zensical.toml の nav にあるかを確かめる。
#
# 使い方: sh scripts/build-db-docs.sh（リポジトリのルートで実行する。Docker と、mise の Go と tbls が要る）
# 終了コード: 0 は生成でき、lint と nav の点検も通った。nav に無い viewpoint の文書があれば 1。それ以外は、失敗したコマンドの終了コードで終わる。
set -eu

password=tbls-dev
# 生成物に MySQL の版が入るので、パッチ版まで固定する。上げるときは文書も生成し直す
container=$(docker run -d --rm -e MYSQL_ROOT_PASSWORD=$password -e MYSQL_DATABASE=buddy -p 127.0.0.1::3306 mysql:8.4.11)
trap 'docker rm -f "$container" >/dev/null' EXIT
# dash は割り込みで止まると EXIT の trap を流さないので、exit を経由させてコンテナを消す
trap 'exit 130' INT TERM
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
tbls doc --rm-dist --config apps/schedule-api/.tbls.yml "mysql://root:$password@127.0.0.1:$port/buddy?charset=utf8mb4"
tbls lint --config apps/schedule-api/.tbls.yml "mysql://root:$password@127.0.0.1:$port/buddy?charset=utf8mb4"

# nav をコメントにした行に当たらないよう、コメントの行を外してから照合する
nav=$(grep -v '^[[:space:]]*#' zensical.toml)
missing=0
for doc in docs/db/schedule-api/viewpoint-*.md; do
  if [ ! -e "$doc" ]; then
    echo "viewpoint の文書が生成されていない" >&2
    exit 1
  fi
  if ! printf '%s\n' "$nav" | grep -qF "\"${doc#docs/}\""; then
    echo "zensical.toml の nav に ${doc#docs/} が無い" >&2
    missing=1
  fi
done
exit "$missing"
