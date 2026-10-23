#!/bin/sh
# 予定の API のマイグレーションを使い捨ての PostgreSQL に適用し、tbls でテーブル定義書と ER 図を docs/db/schedule/ に生成し直す。
# テーブルとカラムの説明はマイグレーションの COMMENT ON に、ER 図を分ける業務のまとまり（viewpoints）は services/schedule/.tbls.yml に書く。
# 生成の後に tbls lint で、どの viewpoint にも入らない表がないかを確認する。
# 最後に、生成した viewpoint の文書が全て zensical.toml の nav にあるかを確認する。
#
# 使い方: sh scripts/build-db-docs.sh（リポジトリのルートで実行する。Docker と、mise の Go と tbls が要る）
# 終了コード: 0 は生成でき、lint と nav の点検も通った。nav に無い viewpoint の文書があれば 1。それ以外は、失敗したコマンドの終了コードで終わる。
set -eu

password=tbls-dev
# 生成物に PostgreSQL の版が入るので、パッチ版まで固定する。上げるときは文書も生成し直す
container=$(docker run -d --rm -e POSTGRES_USER=buddy -e POSTGRES_PASSWORD=$password -e POSTGRES_DB=buddy -p 127.0.0.1::5432 postgres:18.6)
trap 'docker rm -f "$container" >/dev/null' EXIT
# dash は割り込みで止まると EXIT の trap を流さないので、exit を経由させてコンテナを消す
trap 'exit 130' INT TERM
port=$(docker port "$container" 5432/tcp | head -n 1 | sed 's/.*://')

# 初期化の間の一時のサーバーは TCP で待ち受けないので、127.0.0.1 で応答すれば初期化が終わっている
i=0
until docker exec "$container" pg_isready -h 127.0.0.1 -U buddy -d buddy >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "PostgreSQL が 90 秒で起動しなかった" >&2
    exit 1
  fi
  sleep 1
done

(cd services/schedule && GOWORK=off DB_HOST=127.0.0.1 DB_PORT=$port DB_USER=buddy DB_PASSWORD=$password DB_NAME=buddy go run ./cmd/migrate up)
dsn="postgres://buddy:$password@127.0.0.1:$port/buddy?sslmode=disable"
tbls doc --rm-dist --config services/schedule/.tbls.yml "$dsn"
# 版の文字列は、ローカル環境と CI で違う CPU の名前とコンパイラを含むので、版の番号だけを残す
schema=docs/db/schedule/schema.json
sed 's/"database_version": "\(PostgreSQL [0-9.]*\)[^"]*"/"database_version": "\1"/' "$schema" >"$schema.tmp"
mv "$schema.tmp" "$schema"
tbls lint --config services/schedule/.tbls.yml "$dsn"

# nav をコメントにした行に当たらないよう、コメントの行を外してから照合する
nav=$(grep -v '^[[:space:]]*#' zensical.toml)
missing=0
for doc in docs/db/schedule/viewpoint-*.md; do
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
