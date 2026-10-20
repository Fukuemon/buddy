# schedule-api

訪問看護の事業所の予定を管理する HTTP の API。  
API の定義は [openapi.yaml](openapi.yaml) にあり、web はこのファイルからクライアントを生成する。

## 必要なもの

Go、sqlc、golang-migrate、golangci-lint は、リポジトリのルートの `mise.toml` が版を決める。  
ルートで `mise install` を実行する。  
MySQL 8.4 とテストは Docker を使う。

## 設定

API とマイグレーションは、次の環境変数を読む。

| 名前 | 必須 | 既定 | 中身 |
| --- | --- | --- | --- |
| `DB_HOST` | いいえ | `localhost` | MySQL のホスト |
| `DB_PORT` | いいえ | `3306` | MySQL のポート |
| `DB_USER` | はい | なし | MySQL の利用者 |
| `DB_PASSWORD` | はい | なし | MySQL のパスワード |
| `DB_NAME` | はい | なし | データベースの名前 |
| `PORT` | いいえ | `8080` | API が待ち受けるポート |
| `CORS_ALLOW_ORIGINS` | いいえ | 空 | カンマで区切ったオリジン。空なら CORS のヘッダーを返さない |
| `LOG_LEVEL` | いいえ | `info` | `debug`、`info`、`warn`、`error` のいずれか |

パスワードはコードに既定値を持たない。  
ログは標準出力に JSON で書き、接続の設定は書かない。

## 手元で起動する

コマンドは、このディレクトリで実行する。  
パスワードは手元でだけ使う値を決めて、環境変数に入れる。

```sh
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=buddy DB_NAME=buddy
export DB_PASSWORD=<手元で決めた値>

docker run -d --rm --name buddy-db -p 3306:3306 \
  -e MYSQL_DATABASE="$DB_NAME" -e MYSQL_USER="$DB_USER" -e MYSQL_PASSWORD="$DB_PASSWORD" \
  -e MYSQL_RANDOM_ROOT_PASSWORD=yes mysql:8.4

go run ./cmd/migrate up
go run ./cmd/migrate seed
go run ./cmd/api
```

`curl localhost:8080/health` が `{"status":"ok"}` を返せば、起動できている。  
API は SIGINT か SIGTERM を受けると、処理中のリクエストを最大 30 秒待ってから止まる。

## マイグレーション

マイグレーションは `db/migrations` に golang-migrate の形式で置き、シードは `db/seed/seed.sql` に置く。  
どちらもバイナリに埋め込むので、`cmd/migrate` は SQL のファイルがない環境でも動く。

- `go run ./cmd/migrate up` は、未適用のマイグレーションをすべて当てる。
- `go run ./cmd/migrate down [N]` は、マイグレーションを N 版戻す。N の既定は 1。
- `go run ./cmd/migrate seed` は、架空のデータを入れる。同じ ID の行があると失敗するので、空のデータベースに 1 度だけ当てる。

migrate の CLI を直接使うときは、次のように実行する。

```sh
migrate -path db/migrations \
  -database "mysql://$DB_USER:$DB_PASSWORD@tcp($DB_HOST:$DB_PORT)/$DB_NAME?multiStatements=true" up
```

新しいマイグレーションは `migrate create -ext sql -dir db/migrations -seq <名前>` で作る。  
シードには実在の事業所、人、連絡先を入れず、メールは `example.com` を使う。

## SQL を変えたとき

クエリは `db/queries` に書き、sqlc が `internal/infrastructure/mysql/sqlcgen` に Go のコードを生成する。  
生成したコードもコミットする。

```sh
sqlc generate
sqlc diff
```

`sqlc diff` が何も出さなければ、生成したコードは SQL と一致している。  
一覧の並べ替えは、許可した列ごとの `CASE` を `ORDER BY` に固定で書く。利用者の入力を SQL の文字列に連結しない。

## テスト

```sh
go test ./...
go test -short ./...
go vet ./...
golangci-lint run
```

`go test ./...` は、リポジトリの結合テストのために、testcontainers-go で MySQL 8.4 のコンテナを起動する。  
`-short` を付けると、コンテナを使うテストを飛ばす。

テストの種類と置き場は次のとおり。

- domain の値の検証と繰り返しの規則は、`internal/domain` の表駆動のテストが確かめる。
- usecase の手順は、`internal/usecase` のテストが、リポジトリのメモリ上の偽物で確かめる。
- リポジトリの SQL は、`internal/infrastructure/mysql` のテストが、マイグレーションとシードを当てた MySQL で確かめる。
- ハンドラの状態コードと本文は、`internal/presentation/http/handler` のテストが、httptest で確かめる。

## コンテナのイメージ

```sh
docker build -t buddy-schedule-api .
```

イメージは distroless の上に `api` と `migrate` の 2 つのバイナリを持ち、既定で `api` を起動する。  
マイグレーションは `--entrypoint /usr/local/bin/migrate` を指定して実行する。

## コードの層

依存してよい向きは、presentation、usecase、domain の順の 1 方向に限る。

- `internal/domain` は、エンティティ、値の検証、リポジトリのインターフェイスを持ち、標準ライブラリだけに依存する。
- `internal/usecase` は、domain のインターフェイスだけに依存する。トランザクションは `domain.Transactor` で受け取る。
- `internal/infrastructure/mysql` は、domain のリポジトリを sqlc の生成コードで実装する。
- `internal/presentation/http/handler` は、gin のハンドラと、リクエストとレスポンスの型を持つ。
- `cmd/api` は、設定を読み、依存を組み立てて、サーバーを起動する。
