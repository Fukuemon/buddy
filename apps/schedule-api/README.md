# schedule-api

訪問看護の事業所の予定を管理する HTTP の API。  
API の定義の正本は [openapi.yaml](openapi.yaml) である。サーバーのハンドラのインターフェイスと型、web のクライアントの型は、このファイルから生成する。

## 準備

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
| `OIDC_ISSUER` | はい | なし | ブローカーの発行者の URL。トークンの `iss` と一致させ、`<OIDC_ISSUER>/.well-known/openid-configuration` から JWKS の場所を読む |
| `OIDC_AUDIENCE` | はい | なし | トークンの `aud` に求める値 |
| `OIDC_ORG_CLAIM` | いいえ | `org_id` | 組織の ID を持つクレームの名前 |
| `PORT` | いいえ | `8080` | API が待ち受けるポート |
| `CORS_ALLOW_ORIGINS` | いいえ | 空 | カンマで区切ったオリジン。空なら CORS のヘッダーを返さない |
| `LOG_LEVEL` | いいえ | `info` | `debug`、`info`、`warn`、`error` のいずれか |

パスワードはコードに既定値を持たない。  
ログは標準出力に JSON で書き、接続の設定とトークンは書かない。  
`cmd/migrate` は `DB_` で始まる変数だけを読む。

## 動かす

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

# ブローカーの代わりに、偽物の発行者を別の端末で動かす
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

偽物の発行者は、起動のたびに鍵を作り直す。発行者を起動し直したら、API も起動し直す。

## マイグレーション

マイグレーションは `db/migrations` に golang-migrate の形式で置き、シードは `db/seed/seed.sql` に置く。  
どちらもバイナリに埋め込むので、`cmd/migrate` は SQL のファイルがない環境でも動く。

- `go run ./cmd/migrate up` は、未適用のマイグレーションをすべて当てる。事業所に属さず全ての環境で同じ値のマスタ（予定の種類、サービスコード、訪問の区分）も、マイグレーションが入れる。
- `go run ./cmd/migrate down [N]` は、マイグレーションを N 版戻す。N の既定は 1。
- `go run ./cmd/migrate seed` は、架空のデータを入れる。事業所の行が既にあれば、何もせずに終わる。

migrate の CLI を直接使うときは、次のように実行する。

```sh
migrate -path db/migrations \
  -database "mysql://$DB_USER:$DB_PASSWORD@tcp($DB_HOST:$DB_PORT)/$DB_NAME?multiStatements=true" up
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

`go test ./...` は、リポジトリの結合テストのために、testcontainers-go で MySQL 8.4 のコンテナを起動する。  
`-short` を付けると、コンテナを使うテストを飛ばす。

テストの種類と置き場は次のとおり。

- domain の値の検証と繰り返しの規則は、`internal/domain` の表駆動のテストが確かめる。
- usecase の手順は、`internal/usecase` のテストが、リポジトリのメモリ上の偽物で確かめる。
- リポジトリの SQL は、`internal/infrastructure/mysql` のテストが、マイグレーションとシードを当てた MySQL で確かめる。
- ハンドラの状態コードと本文は、`internal/presentation/http/handler` のテストが、httptest で確かめる。
- トークンの検証は、`internal/infrastructure/oidc` のテストが、テストの中で鍵を作る偽物の発行者で確かめる。

## コードの生成

### API の定義を変えたとき

oapi-codegen が、openapi.yaml から gin の strict server のインターフェイスと型を `internal/presentation/http/openapi/openapi.gen.go` に生成する。  
oapi-codegen は `go.mod` の `tool` でバージョンを固定し、`go tool` で動かす。設定は [oapi-codegen.yaml](oapi-codegen.yaml) にある。  
openapi.yaml を変えたら、生成し直し、生成物も同じコミットに入れる。

```sh
go generate ./...
```

画面の型も同じ openapi.yaml から生成する。生成物がそろっているかは、リポジトリのルートの `pnpm check:generated` で確かめる（[CONTRIBUTING.md](../../CONTRIBUTING.md)）。

ハンドラは `internal/presentation/http/handler` の `server` に、生成した `openapi.StrictServerInterface` のメソッドとして書く。

- 操作を足したら、生成し直すと `server` がインターフェイスを満たさなくなり、コンパイルが失敗する。メソッドを足して直す。
- 成功の応答は、生成した `<操作>200JSONResponse` か `<操作>201JSONResponse` で返す。
- usecase のエラーは、そのまま `error` として返す。`writeError` が、domain のエラーから状態コードと `{code,message}` を決める。
- 本文の検証の規則は、`validate.go` の `bodyRules` に、生成した型の項目の名前で書く。生成した型はタグを持たないためである。
  日付と時刻は文字列で受け、ハンドラが `civil` で読むときに形を確かめる。
- 認証、事業所の確認、パスの ID の形の確認は、`/v1` の全てのパスに当てる gin のミドルウェアが受け持つ。ハンドラでは繰り返さない。

### SQL を変えたとき

クエリは `db/queries` に書き、sqlc が `internal/infrastructure/mysql/sqlcgen` に Go のコードを生成する。  
生成したコードもコミットする。

```sh
sqlc generate
sqlc diff
```

`sqlc diff` が何も出さなければ、生成したコードは SQL と一致している。  
一覧の並べ替えは、許可した列ごとの `CASE` を `ORDER BY` に固定で書く。利用者の入力を SQL の文字列に連結しない。

## コンテナのイメージ

```sh
docker build -t buddy-schedule-api .
```

イメージは distroless の上に `api` と `migrate` の 2 つのバイナリを持つ。エントリポイントは `api` である。  
マイグレーションは `--entrypoint /usr/local/bin/migrate` を指定して実行する。

## 認証

`/v1` の API は全て、OIDC のブローカーが発行した access token の JWT を `Authorization: Bearer` で求める。`GET /healthz` と `GET /readyz` は認証を求めない。`/readyz` は、MySQL に届かなければ 503 を返す。

- 署名、`iss`、`aud`、`exp`、`nbf` を確かめる。署名のアルゴリズムは RS256 と ES256 だけを受け付ける。
- JWKS は起動のときに discovery の文書から場所を読み、1 時間ごとに取り直す。知らない `kid` のトークンが来たときも取り直すが、間隔は 1 分以上あける。
- 職員は、トークンの `sub` で探す。いなければ、`email_verified` が true のときに限り、組織の事業所で `email` が同じで `sub` がまだない職員に `sub` を結び付ける。
- 事業所は `facilities.org_id` で組織に結び付ける。トークンの組織の事業所、職員の事業所、パスが指すリソースの事業所の 3 つが一致しないと 403 を返す。
- トークンがないか検証に失敗したときは、`WWW-Authenticate: Bearer` を付けて 401 を返す。

権限（`user_policies`）による判定はまだしない。特定した職員と権限は、request の context に `auth.Principal` として入れる。

## コードの層

依存してよい向きは、presentation、usecase、domain の順の 1 方向に限る。

- `internal/domain` は、エンティティ、値の検証、リポジトリのインターフェイスを持ち、標準ライブラリだけに依存する。
- `internal/usecase` は、domain のインターフェイスだけに依存する。トランザクションは `domain.Transactor` で受け取る。
- `internal/infrastructure/mysql` は、domain のリポジトリを sqlc の生成コードで実装する。
- `internal/infrastructure/oidc` は、access token をブローカーの JWKS で検証する。`oidctest` は、テストと `cmd/devissuer` が使う偽物の発行者である。
- `internal/presentation/http/openapi` は、openapi.yaml から生成したリクエストとレスポンスの型と、strict server のインターフェイスを持つ。手で書き換えない。
- `internal/presentation/http/handler` は、生成したインターフェイスを実装するハンドラと、gin のミドルウェアを持つ。
- `cmd/api` は、設定を読み、依存を組み立てて、サーバーを起動する。
- `cmd/devissuer` は、手元で試すための偽物の発行者で、イメージに入れない。

## 文書

- [DesignDoc.md](DesignDoc.md): 表の構成、認証から認可までの流れ、繰り返しの予定の展開
- [全体の Design Doc](../../docs/design/DesignDoc.md): 画面と 2 つの API の責務、インフラとの約束
- [ADR-0002](../../docs/adr/0002-pbac.md): 権限を役職の既定と職員ごとの上書きで持つ判断
