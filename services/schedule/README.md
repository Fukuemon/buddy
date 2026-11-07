# 予定の API

訪問看護の事業所の予定を管理する HTTP の API。  
API の定義の正本は [openapi.yaml](openapi.yaml) である。

## Setup

ツールは、[CONTRIBUTING.md](../../CONTRIBUTING.md#setup) の Setup の手順で入れる。  
PostgreSQL 18 とテストは Docker を使う。

## Configuration

API、Google カレンダーの Worker、マイグレーションは、次の環境変数を読む。

| 名前 | 必須 | デフォルト | 中身 |
| --- | --- | --- | --- |
| `DB_HOST` | いいえ | `localhost` | PostgreSQL のホスト |
| `DB_PORT` | いいえ | `5432` | PostgreSQL のポート |
| `DB_USER` | はい | なし | PostgreSQL の利用者 |
| `DB_PASSWORD` | はい | なし | PostgreSQL のパスワード |
| `DB_NAME` | はい | なし | データベースの名前 |
| `DB_MAX_CONNS` | いいえ | `25` | 接続のプールの接続の数の上限。1 以上の数 |
| `OIDC_ISSUER` | はい | なし | Hydra の Issuer の URL。トークンの `iss` と一致させ、`<OIDC_ISSUER>/.well-known/openid-configuration` から JWKS の場所を読む |
| `OIDC_AUDIENCE` | はい | なし | トークンの `aud` に求める値 |
| `OIDC_ORG_CLAIM` | いいえ | `org_id` | 組織の ID を持つクレームの名前 |
| `BROKER_URL` | はい | なし | ID ブローカーの内部の API の URL。ログインの画面と別のポートである。職員の登録、休職、復職、退職で呼ぶ |
| `BROKER_TOKEN_URL` | はい | なし | 内部の API を呼ぶ access token を client credentials で取る、Hydra のトークンのエンドポイント |
| `BROKER_CLIENT_ID` | いいえ | `schedule` | Hydra に登録した予定の API のクライアントの ID |
| `BROKER_CLIENT_SECRET` | はい | なし | Hydra に登録した予定の API のクライアントの secret。シークレットとして渡す |
| `BROKER_AUDIENCE` | いいえ | `broker` | 内部の API を呼ぶ access token の `aud` |
| `PORT` | いいえ | `8080` | API が待ち受けるポート |
| `CORS_ALLOW_ORIGINS` | いいえ | 空 | カンマで区切ったオリジン。空なら CORS のヘッダーを返さない |
| `LOG_LEVEL` | いいえ | `info` | `debug`、`info`、`warn`、`error` のいずれか |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE` | いいえ | 空 | 組織の ID と、その事業所の職員がカレンダーを共有するサービスアカウントの対応（JSON）のパス。形は `[{"org_id": "...", "service_account": "..."}]` で、照合の API と同じ。空なら Google カレンダーを読み書きせず、カレンダーを読む操作は 503 を返し、予定を書き出さない。対応の無い事業所のカレンダーの操作も 503 を返す。書き出すときのスコープは `calendar.events` |
| `GOOGLE_CALENDAR_ENDPOINT` | いいえ | 空 | Calendar API の代わりに呼ぶ URL。ローカル環境の calendarpit で試すためのもので、`GOOGLE_APPLICATION_CREDENTIALS` を渡したときだけ、その認証情報をなりすまさずに全ての事業所で使い、渡さなければ認証をしない。`GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE` と一緒に渡す |
| `GOOGLE_CALENDAR_EXPORT_ENABLED` | いいえ | `false` | `true` なら、予定を Google カレンダーに書き出す。API は予定の変更を書き出しの待ちに積み、`calendar-worker export` が待ちを書く。`GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE` と一緒に渡す。`false` のときは書き出しの待ちを積まず、スコープは `calendar.readonly` で読む |
| `GOOGLE_CALENDAR_EXPORT_INTERVAL` | いいえ | `30s` | `calendar-worker export` が予定の書き出しの待ちを確認する間隔。Go の時間の書式で、`1s` 以上 |
| `GOOGLE_CALENDAR_SYNC_ENABLED` | いいえ | `false` | `true` なら、`calendar-worker sync` が Google カレンダーの変わった予定を読み、buddy の予定に当てる。`GOOGLE_CALENDAR_EXPORT_ENABLED` を `true` にして渡す |
| `GOOGLE_CALENDAR_SYNC_INTERVAL` | いいえ | `2m` | `calendar-worker sync` が Google カレンダーの変わった予定を読む間隔。Go の時間の書式で、`1s` 以上 |

パスワードはコードにデフォルト値を持たない。  
ログは標準出力に JSON で書き、接続の設定とトークンは書かない。  
`cmd/migrate` は OIDC とブローカーの変数を求めず、必須として確認するのは `DB_USER`、`DB_PASSWORD`、`DB_NAME` だけである。  
ほかの変数も API と同じ規則で読むので、`PORT`、`LOG_LEVEL`、`GOOGLE_CALENDAR_` で始まる変数の値が正しくないときは、マイグレーションも失敗する。  
`cmd/calendar-worker` は、`DB_` と `GOOGLE_CALENDAR_` で始まる変数と `LOG_LEVEL` だけを読み、OIDC、ブローカー、`PORT`、`CORS_ALLOW_ORIGINS` を読まない。  
ログの項目 `component` は、書いたプロセスを示し、API が `api`、Worker が `calendar-export` か `calendar-sync` である。

## Running

コマンドは、このディレクトリで実行する。  
パスワードはローカルでだけ使う値を決めて、環境変数に入れる。  
職員の登録、休職、復職、退職は、ルートの compose のブローカーの内部の API（`127.0.0.1:8101`）と Hydra（`127.0.0.1:4444`）を呼ぶ。  
試すときは、compose を [CONTRIBUTING.md](../../CONTRIBUTING.md#portless-を通さずに起動する) の「portless を通さずに起動する」の手順で起動する。  
このとき、API の 8080 とフェイクの Issuer の 9000 は、compose の予定の API と IdP と重なるので、`docker compose stop schedule idp` で止めてから実行する。  
portless で起動した compose は、8080 と 9000 を使わない。  
PostgreSQL は、`DB_PORT` のポート（デフォルトは 5432）で `127.0.0.1` にだけ公開する。  
ほかのコンテナが 5432 を使っているときは、手順の前に `export DB_PORT=15433` のように空いているポートを入れる。

```sh
export DB_HOST=127.0.0.1 DB_PORT="${DB_PORT:-5432}" DB_USER=buddy DB_NAME=buddy
export DB_PASSWORD=<ローカルで決めた値>

docker run -d --rm --name buddy-db -p "127.0.0.1:$DB_PORT:5432" \
  -e POSTGRES_DB="$DB_NAME" -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASSWORD" postgres:18.6

go run ./cmd/migrate up
go run ./cmd/migrate seed

# Hydra の代わりに、フェイクの Issuer を別のターミナルで起動する
go run ./cmd/devissuer -addr 127.0.0.1:9000

export OIDC_ISSUER=http://127.0.0.1:9000 OIDC_AUDIENCE=schedule
# 職員の登録、休職、復職、退職は、ルートの compose のブローカーと Hydra を呼ぶ。ほかの操作は呼ばない
# クライアントの secret は、compose の予定の API と同じ値を compose の設定から読む
export BROKER_URL=http://127.0.0.1:8101 BROKER_TOKEN_URL=http://127.0.0.1:4444/oauth2/token \
  BROKER_CLIENT_SECRET="$(cd ../.. && docker compose config --format json | jq -r .services.schedule.environment.BROKER_CLIENT_SECRET)"
go run ./cmd/api
```

`curl localhost:8080/readyz` が `{"status":"ok"}` を返せば、起動できている。  
API は SIGINT か SIGTERM を受けると、処理中のリクエストを最大 30 秒待ってから止まる。

`cmd/devissuer` は、`GET /token` で署名したトークンを返す。  
シードの事業所は組織 `org-sample` に結び付いているので、シードの職員の `sub` でトークンを作れば API を呼べる。  
`sub` は、ブローカーの職員の ID で、シード（`db/seed/seed.sql`）の `users.sub` にある。

```sh
TOKEN=$(curl -s '127.0.0.1:9000/token?sub=01M5J20JC0TFEK223R3MF68HVK&org_id=org-sample' | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" localhost:8080/v1/facilities/01M3TC5H00QV17BC0J9V3393ZP/schedules
```

フェイクの Issuer は、起動のたびに署名の鍵を作り直す。  
Issuer を起動し直したら、API も起動し直す。

Google カレンダーの取り込みをローカルで試すときは、Google Calendar API をローカル環境で再現する [calendarpit](https://calendarpit.dev/ja/) を起動し、API に向ける。  
calendarpit は、ルートの `compose/calendarpit/fixture.json` の職員のカレンダーと予定を持つ。  
compose は、同じ calendarpit を `calendarpit` として起動する。  
calendarpit は、サービスアカウントの token を出さない。  
このため、`compose/calendarpit/authorize.mjs` で fixture の利用者の refresh token を取り、Application Default Credentials のファイルに書いて渡す。  
次の手順の calendarpit の 4173 は、portless を通さずに起動した compose の calendarpit と重なる。  
そのときは、`docker compose stop calendarpit` で止めてから実行し、試し終えたら `docker compose start calendarpit` で戻す。  
portless で起動した compose の calendarpit は、4173 を使わない。

```sh
docker run -d --rm --name calendarpit -p 127.0.0.1:4173:4173 \
  -v "$PWD/../../compose/calendarpit/fixture.json:/config/fixture.json:ro" \
  -e CALENDARPIT_CONFIG=/config/fixture.json -e CALENDARPIT_DATABASE=:memory: \
  ghcr.io/iktakahiro/calendarpit:0.9.5
node ../../compose/calendarpit/authorize.mjs http://127.0.0.1:4173 "$TMPDIR/buddy-calendarpit.json"

export GOOGLE_APPLICATION_CREDENTIALS="$TMPDIR/buddy-calendarpit.json"
export GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE=../../compose/google-calendar-service-accounts.json
export GOOGLE_CALENDAR_ENDPOINT=http://127.0.0.1:4173/calendar/v3/
go run ./cmd/api
```

上の手順の calendarpit は `:memory:` で動くので、起動し直すと token が消える。  
calendarpit を起動し直したら、`authorize.mjs` を流し直し、API も起動し直す。  
compose の calendarpit は、予定と token を volume に残す。

実際の Google カレンダーで試すときは、検証の事業所のサービスアカウントになりすました Application Default Credentials を使う。  
この手順はメンテナー向けで、運営側の GCP のプロジェクトと検証の事業所のサービスアカウントを前提にする。  
ほかの人は、上の calendarpit で試す。  
手順と要るロールは、[照合の API の README](../receipt/README.md#google-カレンダーから予定を取る) と同じである。  
`GOOGLE_APPLICATION_CREDENTIALS` と `GOOGLE_CALENDAR_ENDPOINT` を設定せず、シードの組織 `org-sample` と検証の事業所のサービスアカウントの対応のファイルを渡す。  
対応のファイルはサービスアカウントのメールアドレスを持つので、Git で追跡しない場所に置く。  
書き出し（`GOOGLE_CALENDAR_EXPORT_ENABLED`）は、サービスアカウントが持つ検証のカレンダーでだけ有効にする。  
職員が共有したカレンダーに「予定の変更」の共有で書けるかは、まだ確認していない。

compose の予定の API と Google カレンダーの Worker を実際の Google カレンダーに向けるときは、Git で追跡しない上書きの compose のファイルを `-f` で重ねる。  
重ねたファイルで、`schedule`、`schedule-calendar-export`、`schedule-calendar-sync` の 3 つのサービスを次のように変える。

- `GOOGLE_CALENDAR_ENDPOINT` と `GOOGLE_APPLICATION_CREDENTIALS` を空にする。
- `GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE` を、検証の対応のファイルに替え、そのファイルをマウントする。
- ローカルの Application Default Credentials のファイルを、読み取りだけでマウントする。
  - ファイルは、`gcloud` の設定のディレクトリの `application_default_credentials.json` である。
  - マウント先は `/home/nonroot/.config/gcloud/application_default_credentials.json` にする。イメージは distroless の nonroot で動くためである。

検証の事業所のアカウントそのものになりすました Application Default Credentials では、予定の API は重ねてなりすまさない。  
この形で `serviceusage.services.use` を持つロールが要るかは、ロールを外して確認していない（未確認）。

コンテナのイメージは、このディレクトリで次を実行して作る。  
ビルドの文脈は、`packages/go` を読むため、リポジトリの直下である。

```sh
docker build -f Dockerfile -t schedule:local ../..
```

イメージは、distroless の上に `api`、`calendar-worker`、`migrate` の 3 つのバイナリを持つ。  
エントリポイントは `api` である。  
Google カレンダーの Worker は、`--entrypoint /usr/local/bin/calendar-worker` を指定して実行する。  
マイグレーションは、`--entrypoint /usr/local/bin/migrate` を指定して実行する。

### Google カレンダーの Worker

API は、Google カレンダーの書き出しと同期を動かさない。  
書き出しと同期は、`cmd/calendar-worker` が役割ごとのプロセスで動かす。  
ADR-0032: [Google カレンダーの書き出しと同期を、予定の API と同じイメージの Worker のコマンドで役割ごとに動かし、繰り返しを Worker のコマンドに集める](../../docs/adr/0032-calendar-worker.md)

API と同じ `DB_` と `GOOGLE_CALENDAR_` の変数を入れた別のターミナルで、役割を引数に渡して起動する。

```sh
export GOOGLE_CALENDAR_EXPORT_ENABLED=true
go run ./cmd/calendar-worker export          # 常駐して、予定の書き出しの待ちを書く
go run ./cmd/calendar-worker export --once   # 取れる待ちが無くなるまで書いて終わる

export GOOGLE_CALENDAR_SYNC_ENABLED=true
go run ./cmd/calendar-worker sync --once --max-duration 5m
```

- `--once` を付けなければ常駐し、役割の間隔（`GOOGLE_CALENDAR_EXPORT_INTERVAL`、`GOOGLE_CALENDAR_SYNC_INTERVAL`）ごとに取れるものを処理する。
- `--max-duration` は `--once` の長さの上限で、上限に達したら新しく取るのをやめる。
- SIGINT か SIGTERM を受けると、新しく取るのをやめ、取った待ちとカレンダーの結果を書いてから終わる。
- 役割のフラグ（`GOOGLE_CALENDAR_EXPORT_ENABLED`、`GOOGLE_CALENDAR_SYNC_ENABLED`）が `false` なら、DB に繋がずに終了のコード 0 で終わる。
- 終了のコードは、最後まで処理したら 0、設定の誤りと DB に繋がらないときは 1、引数の誤りは 2 になる。
  - 1 つの予定やカレンダーの失敗は、待ちと同期の状態に書き、終了のコードには出さない。
- 同じ役割の Worker を 2 つ以上起動しても、同じ待ちとカレンダーを 2 回処理しない。
- ルートの compose は、`schedule-calendar-export` と `schedule-calendar-sync` で、2 つの役割を常駐の形で起動する。

## マイグレーション

マイグレーションは `db/migrations` に golang-migrate の形式で置き、シードは `db/seed/seed.sql` に置く。  
どちらもバイナリに埋め込むので、`cmd/migrate` は SQL のファイルがない環境でも動く。

- `go run ./cmd/migrate up` は、未適用のマイグレーションをすべて適用する。
- `go run ./cmd/migrate down [N]` は、マイグレーションを N 個戻す。N のデフォルトは 1。
- `go run ./cmd/migrate seed` は、ダミーデータを入れる。事業所のレコードが既にあれば、何もせずに終わる。

migrate の CLI を直接使うときは、次のように実行する。

```sh
migrate -path db/migrations \
  -database "pgx5://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" up
```

新しいマイグレーションは `migrate create -ext sql -dir db/migrations -seq <名前>` で作る。

## Tests and Checks

```sh
go test ./...
go test -short ./...
go vet ./...
golangci-lint run
```

`go test ./...` は、リポジトリの結合テストのために、testcontainers-go で PostgreSQL 18 のコンテナを起動する。  
`-short` を付けると、コンテナを使うテストを飛ばす。  
テストと lint は `GOWORK=off` を付けて流す。  
理由は [CONTRIBUTING.md](../../CONTRIBUTING.md#go-のモジュール) の「Go のモジュール」にある。

テストの種類ごとに保証することと配置先は、[テスト](../../context/testing.md) にある。

## Code Generation

### API の定義を変えたとき

openapi.yaml を変えたら、生成し直し、生成物も同じコミットに入れる。  
画面の型の生成と生成物の確認は、[CONTRIBUTING.md](../../CONTRIBUTING.md#changing-the-api-definition) の Changing the API Definition にある。

```sh
go generate ./...
```

ハンドラは `internal/httpapi` の `server` に、生成した `openapi.StrictServerInterface` のメソッドとして書く。

- 操作を足したら、生成し直すと `server` がインターフェースを満たさなくなり、コンパイルが失敗する。
  - メソッドを足して直す。
- 成功のレスポンスは、生成した `<操作>200JSONResponse` か `<操作>201JSONResponse` で返す。
- 機能のパッケージの操作のエラーは、そのまま `error` として返す。
  - `writeError` が、`apperr` のエラーから状態コードと `{code,message}` を決める。
- リクエストの検証の規則（必須、長さ、ID の形、列挙）は、`openapi.yaml` の schema に書く。
  - `openapi_validate.go` のミドルウェアが、埋め込んだ定義でパスの引数、クエリ、本文を確認し、合わなければ 400（`invalid_input`）を返す。
  - 必須の文字列で空を拒むときは、`required` に加えて `minLength: 1` を書く。`required` は項目があることしか求めない。
  - 本文は `Content-Type: application/json` で、1 MiB までを受ける。
  - 空の値のクエリ（`?date_from=` など）は、定義では確認せず、ハンドラが指定なしとして扱う。
  - 日付と時刻は文字列で受け、ハンドラが `civil` で読むときに暦の上で正しいかを確認する。
  - 日付の範囲と事業所の確認のように、定義で表せない検証は、ハンドラと機能のパッケージに置く。
- 認証、事業所の確認、パスの ID の形の確認は、`/v1` の全てのパスに適用する gin のミドルウェアが行う。
  - ハンドラでは繰り返さない。

### SQL を変えたとき

クエリは `db/queries` に書き、sqlc が `internal/postgres/sqlcgen` に Go のコードを生成する。  
生成したコードもコミットする。

```sh
sqlc generate
sqlc diff
```

`sqlc diff` が何も出さなければ、生成したコードは SQL と一致している。  
一覧の並べ替えは、許可したカラムごとの `CASE` を `ORDER BY` に固定で書く。  
利用者の入力を SQL の文字列に連結しない。

## Documentation

- [DesignDoc.md](DesignDoc.md): コードの構成、テーブルの構成、認証から事業所の確認までの流れ、繰り返しの予定
- [コードベースの構造](../../context/codebase.md): パッケージの間の依存してよい向き
- [全体の Design Doc](../../docs/design/DesignDoc.md): 画面と 2 つの API の責務、デプロイの要件
- [ADR-0007](../../docs/adr/0007-pbac.md): 権限を役職のデフォルトと職員ごとの上書きで持つ判断
