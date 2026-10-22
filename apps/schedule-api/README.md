# schedule-api

訪問看護の事業所の予定を管理する HTTP の API。  
API の定義の正本は [openapi.yaml](openapi.yaml) である。サーバーのハンドラのインターフェイスと型、web のクライアントの型は、このファイルから生成する。

## セットアップ

Go、sqlc、golang-migrate、golangci-lint は、リポジトリのルートの `mise.toml` がバージョンを決める。  
ルートで `mise install` を実行する。  
PostgreSQL 18 とテストは Docker を使う。

## 設定

API とマイグレーションは、次の環境変数を読む。

| 名前 | 必須 | デフォルト | 中身 |
| --- | --- | --- | --- |
| `DB_HOST` | いいえ | `localhost` | PostgreSQL のホスト |
| `DB_PORT` | いいえ | `5432` | PostgreSQL のポート |
| `DB_USER` | はい | なし | PostgreSQL の利用者 |
| `DB_PASSWORD` | はい | なし | PostgreSQL のパスワード |
| `DB_NAME` | はい | なし | データベースの名前 |
| `OIDC_ISSUER` | はい | なし | ブローカーの Issuer の URL。トークンの `iss` と一致させ、`<OIDC_ISSUER>/.well-known/openid-configuration` から JWKS の場所を読む |
| `OIDC_AUDIENCE` | はい | なし | トークンの `aud` に求める値 |
| `OIDC_ORG_CLAIM` | いいえ | `org_id` | 組織の ID を持つクレームの名前 |
| `PORT` | いいえ | `8080` | API が待ち受けるポート |
| `CORS_ALLOW_ORIGINS` | いいえ | 空 | カンマで区切ったオリジン。空なら CORS のヘッダーを返さない |
| `LOG_LEVEL` | いいえ | `info` | `debug`、`info`、`warn`、`error` のいずれか |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT` | いいえ | 空 | 職員がカレンダーを共有する相手のサービスアカウントのメールアドレス。空なら Google カレンダーを読み書きせず、カレンダーを読む操作は 503 を返し、予定の書き出しの処理を動かさない。認証の情報は Application Default Credentials で、書き出すときはスコープ `calendar.events` で読む |
| `GOOGLE_CALENDAR_ENDPOINT` | いいえ | 空 | Calendar API の代わりに呼ぶ URL。フェイクの API で試すためのもので、認証をしない。`GOOGLE_CALENDAR_SERVICE_ACCOUNT` と一緒に渡す |
| `GOOGLE_CALENDAR_EXPORT_ENABLED` | いいえ | `false` | `true` なら、予定を Google カレンダーに書き出す。`GOOGLE_CALENDAR_SERVICE_ACCOUNT` と一緒に渡す。`false` のときは書き出しの待ちを積まず、スコープは `calendar.readonly` で読む |
| `GOOGLE_CALENDAR_EXPORT_INTERVAL` | いいえ | `30s` | 予定の書き出しの待ちを確かめる間隔。Go の時間の書式で、`1s` 以上 |
| `GOOGLE_CALENDAR_SYNC_ENABLED` | いいえ | `false` | `true` なら、Google カレンダーの変わった予定を読み、buddy の予定に当てる。`GOOGLE_CALENDAR_EXPORT_ENABLED` を `true` にして渡す |
| `GOOGLE_CALENDAR_SYNC_INTERVAL` | いいえ | `2m` | Google カレンダーの変わった予定を読む間隔。Go の時間の書式で、`1s` 以上 |

パスワードはコードにデフォルト値を持たない。  
ログは標準出力に JSON で書き、接続の設定とトークンは書かない。  
`cmd/migrate` は `DB_` で始まる変数だけを読む。

## 起動する

コマンドは、このディレクトリで実行する。  
パスワードはローカルでだけ使う値を決めて、環境変数に入れる。  
API の 8080 とフェイクの Issuer の 9000 は、ルートの compose の schedule-api と IdP と重なる。  
compose を起動しているときは、重なる 2 つを `docker compose stop schedule-api idp` で止めてから実行する。

```sh
export DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=buddy DB_NAME=buddy
export DB_PASSWORD=<ローカルで決めた値>

docker run -d --rm --name buddy-db -p 5432:5432 \
  -e POSTGRES_DB="$DB_NAME" -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASSWORD" postgres:18.6

go run ./cmd/migrate up
go run ./cmd/migrate seed

# ブローカーの代わりに、フェイクの Issuer を別のターミナルで起動する
go run ./cmd/devissuer -addr 127.0.0.1:9000

export OIDC_ISSUER=http://127.0.0.1:9000 OIDC_AUDIENCE=schedule-api
go run ./cmd/api
```

`curl localhost:8080/readyz` が `{"status":"ok"}` を返せば、起動できている。  
API は SIGINT か SIGTERM を受けると、処理中のリクエストを最大 30 秒待ってから止まる。

`cmd/devissuer` は、`GET /token` で署名したトークンを返す。  
シードの事業所は組織 `org-sample` に結び付いているので、シードの職員のメールでトークンを作れば API を呼べる。

```sh
TOKEN=$(curl -s '127.0.0.1:9000/token?sub=dev-aoki&email=hina.aoki@example.com&org_id=org-sample' | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" localhost:8080/v1/facilities/01M3TC5H00QV17BC0J9V3393ZP/schedules
```

フェイクの Issuer は、起動のたびに署名の鍵を作り直す。Issuer を起動し直したら、API も起動し直す。

Google カレンダーの取り込みをローカルで試すときは、Calendar API のフェイク `cmd/fakegcal` を別のターミナルで起動し、API に向ける。  
フェイクは、ルートの `compose/fake-google-calendar.json` の予定を返す。compose は同じフェイクを `fake-google` として起動する。

```sh
go run ./cmd/fakegcal -addr 127.0.0.1:8085 -file ../../compose/fake-google-calendar.json

export GOOGLE_CALENDAR_SERVICE_ACCOUNT=buddy-calendar@example.iam.gserviceaccount.com
export GOOGLE_CALENDAR_ENDPOINT=http://127.0.0.1:8085/
go run ./cmd/api
```

## マイグレーション

マイグレーションは `db/migrations` に golang-migrate の形式で置き、シードは `db/seed/seed.sql` に置く。  
どちらもバイナリに埋め込むので、`cmd/migrate` は SQL のファイルがない環境でも動く。

- `go run ./cmd/migrate up` は、未適用のマイグレーションをすべて適用する。事業所に属さず全ての環境で同じ値のマスタ（予定の種類、サービスコード、訪問の区分）も、マイグレーションが入れる。
- `go run ./cmd/migrate down [N]` は、マイグレーションを N 個戻す。N のデフォルトは 1。
- `go run ./cmd/migrate seed` は、ダミーデータを入れる。事業所のレコードが既にあれば、何もせずに終わる。

migrate の CLI を直接使うときは、次のように実行する。

```sh
migrate -path db/migrations \
  -database "pgx5://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" up
```

新しいマイグレーションは `migrate create -ext sql -dir db/migrations -seq <名前>` で作る。  
シードには実在の事業所、人、連絡先を入れず、メールは `example.com` を使う。

## テストとチェック

```sh
go test ./...
go test -short ./...
go vet ./...
golangci-lint run
```

`go test ./...` は、リポジトリの結合テストのために、testcontainers-go で PostgreSQL 18 のコンテナを起動する。  
`-short` を付けると、コンテナを使うテストを飛ばす。  
テストと lint は `GOWORK=off` を付けて流す。  
理由は [CONTRIBUTING.md](../../CONTRIBUTING.md) の「開発環境のセットアップ」にある。

テストの種類ごとに保証することと配置先は、[テスト](../../context/testing.md) にある。

## コードの生成

### API の定義を変えたとき

oapi-codegen が、openapi.yaml から gin の strict server のインターフェイスと型を `internal/httpapi/openapi/openapi.gen.go` に生成する。  
oapi-codegen は `go.mod` の `tool` でバージョンを固定し、`go tool` で実行する。設定は [oapi-codegen.yaml](oapi-codegen.yaml) にある。  
openapi.yaml を変えたら、生成し直し、生成物も同じコミットに入れる。

```sh
go generate ./...
```

画面の型も同じ openapi.yaml から生成する。生成物がそろっているかは、リポジトリのルートの `pnpm check:generated` で確かめる（[CONTRIBUTING.md](../../CONTRIBUTING.md)）。

ハンドラは `internal/httpapi` の `server` に、生成した `openapi.StrictServerInterface` のメソッドとして書く。

- 操作を足したら、生成し直すと `server` がインターフェイスを満たさなくなり、コンパイルが失敗する。メソッドを足して直す。
- 成功のレスポンスは、生成した `<操作>200JSONResponse` か `<操作>201JSONResponse` で返す。
- 機能のパッケージの `Usecase` のエラーは、そのまま `error` として返す。`writeError` が、`apperr` のエラーから状態コードと `{code,message}` を決める。
- リクエストの検証の規則（必須、長さ、ID の形、列挙）は、`openapi.yaml` の schema に書く。`openapi_validate.go` のミドルウェアが、埋め込んだ定義でパスの引数、クエリ、本文を確かめ、合わなければ 400（`invalid_input`）を返す。
  - 必須の文字列で空を拒むときは、`required` に加えて `minLength: 1` を書く。`required` は項目があることしか求めない。
  - 本文は `Content-Type: application/json` で、1 MiB までを受ける。空の値のクエリ（`?date_from=` など）は、定義では確かめず、ハンドラが指定なしとして扱う。
  - 日付と時刻は文字列で受け、ハンドラが `civil` で読むときに暦の上で正しいかを確かめる。日付の範囲と事業所の確認のように、定義で表せない検証は、ハンドラと機能のパッケージに置く。
- 認証、事業所の確認、パスの ID の形の確認は、`/v1` の全てのパスに適用する gin のミドルウェアが受け持つ。ハンドラでは繰り返さない。

### SQL を変えたとき

クエリは `db/queries` に書き、sqlc が `internal/postgres/sqlcgen` に Go のコードを生成する。  
生成したコードもコミットする。

```sh
sqlc generate
sqlc diff
```

`sqlc diff` が何も出さなければ、生成したコードは SQL と一致している。  
一覧の並べ替えは、許可したカラムごとの `CASE` を `ORDER BY` に固定で書く。利用者の入力を SQL の文字列に連結しない。

## コンテナのイメージ

このディレクトリで次を実行する。ビルドの文脈はリポジトリの直下である（`packages/go` を読むため）。

```sh
docker build -f Dockerfile -t buddy-schedule-api ../..
```

イメージは distroless の上に `api` と `migrate` の 2 つのバイナリを持つ。エントリポイントは `api` である。  
マイグレーションは `--entrypoint /usr/local/bin/migrate` を指定して実行する。

## 認証

認証から事業所の確認までの流れは、[DesignDoc.md](DesignDoc.md) の「認証から事業所の確認までの流れ」にある。`GET /healthz` と `GET /readyz` は認証を求めない。`/readyz` は、PostgreSQL に届かなければ 503 を返す。

## コードの層

層ごとに持つものは [DesignDoc.md](DesignDoc.md) の「コードの層」に、依存してよい向きは [コードベースの構造](../../context/codebase.md) にある。

## 文書

- [DesignDoc.md](DesignDoc.md): コードの層、テーブルの構成、認証から事業所の確認までの流れ、繰り返しの予定
- [全体の Design Doc](../../docs/design/DesignDoc.md): 画面と 2 つの API の責務、インフラとの約束
- [ADR-0002](../../docs/adr/0002-pbac.md): 権限を役職のデフォルトと職員ごとの上書きで持つ判断
