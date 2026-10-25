# 照合の API

iBow から出した実訪問の CSV と予定（予定の CSV か Google カレンダー）を照合し、不整合、予定のみ、実績のみ、整合の 4 つに分けて返す API。  
照合の規則と、元の Python との違いは [DesignDoc.md](DesignDoc.md) にある。

## Setup

Go と golangci-lint のバージョンは、リポジトリのルートの `mise.toml` にある。

```sh
mise install go golangci-lint
```

## Running

API の 8080 とフェイクの Issuer の 9000 は、ルートの compose の予定の API と IdP と重なる。  
compose を起動しているときは、重なる 2 つを `docker compose stop schedule idp` で止めてから実行する。

```sh
# Hydra の代わりに、フェイクの Issuer を別のターミナルで起動する
go run ./cmd/devissuer -addr 127.0.0.1:9000

export OIDC_ISSUER=http://127.0.0.1:9000 OIDC_AUDIENCE=receipt
go run ./cmd/api
```

`curl localhost:8080/readyz` が `{"status":"ok"}` を返せば、起動できている。  
`cmd/devissuer` は、`GET /token` で署名したトークンを返す。フェイクの Issuer は起動のたびに署名の鍵を作り直すので、Issuer を起動し直したら API も起動し直す。

```sh
TOKEN=$(curl -s '127.0.0.1:9000/token?sub=dev-aoki&org_id=org-sample' | jq -r .access_token)
```

設定は環境変数で渡す。

- `PORT`: 待ち受けるポート。デフォルトは `8080`
- `MAX_UPLOAD_BYTES`: `POST /v1/checks` の本文の上限のバイト数。デフォルトは 10 MiB
- `LOG_LEVEL`: `debug`、`info`、`warn`、`error` のいずれか。デフォルトは `info`
- `OIDC_ISSUER`: 必須。Hydra の Issuer の URL。トークンの `iss` と一致させ、discovery の文書をここから読む
- `OIDC_AUDIENCE`: 必須。トークンの `aud` に求める値
- `OIDC_ORG_CLAIM`: 組織の ID を持つクレームの名前。デフォルトは `org_id`
- `CORS_ALLOW_ORIGINS`: CORS でレスポンスを読ませるオリジンを、カンマで区切って並べる。空なら CORS のヘッダーを返さない
- `GOOGLE_CALENDARS_FILE`: 照合の対象のカレンダーの設定（JSON）のパス。空なら Google カレンダーを使わない
- `GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE`: 組織の ID と、その事業所の職員がカレンダーを共有するサービスアカウントの対応（JSON）のパス。`GOOGLE_CALENDARS_FILE` と一緒に渡す
- `GOOGLE_APPLICATION_CREDENTIALS`: Application Default Credentials が読む認証情報のファイルのパス。`go run` で実際の Google カレンダーを読むときは設定せず、gcloud で作った Application Default Credentials を使う
- `GOOGLE_CALENDAR_ENDPOINT`: Calendar API の代わりに呼ぶ URL。ローカル環境の calendarpit で試すためのもので、`GOOGLE_APPLICATION_CREDENTIALS` を渡したときだけ、その認証情報をなりすまさずに全ての事業所で使い、渡さなければ認証をしない。`GOOGLE_CALENDARS_FILE` を渡さずにこれだけを渡すと、起動しない

コンテナで起動するときは、このディレクトリで次を実行する。ビルドの文脈はリポジトリの直下である（`packages/go` を読むため）。

```sh
docker build -f Dockerfile -t receipt ../..
docker run --rm -p 8080:8080 -e OIDC_ISSUER=<Issuer の URL> -e OIDC_AUDIENCE=receipt receipt
```

ルートの compose の照合の API は、Google カレンダーの代わりに calendarpit を読む。  
読むカレンダーは `compose/receipt-calendars.json` の森 健太のカレンダーで、サービスアカウントの対応と認証の情報は予定の API と同じものを使う。  
`compose/calendarpit/fixture.json` の森の予定は `2026-11` の月にあるので、`month=2026-11` で照合すると、その予定が結果に出る。  
起動とトークンの取り方は、[CONTRIBUTING.md](../../CONTRIBUTING.md) の Running Locally にある。

## Tests and Checks

`services/receipt` で実行する。

```sh
go test ./...
go vet ./...
golangci-lint run
```

テストと lint は `GOWORK=off` を付けて流す。  
理由は [CONTRIBUTING.md](../../CONTRIBUTING.md) の「Go のモジュール」にある。

## Code Generation

API の定義の正本は [openapi.yaml](openapi.yaml) である。  
oapi-codegen が、そこから net/http の strict server のインターフェイスと型を `internal/httpapi/openapi/openapi.gen.go` に生成する。`internal/httpapi` がそのインターフェイスを実装する。  
oapi-codegen は `go.mod` の `tool` でバージョンを固定し、`go tool` で実行する。設定は [oapi-codegen.yaml](oapi-codegen.yaml) にある。

openapi.yaml を変えたら、`services/receipt` で生成し直し、生成物も一緒にコミットする。

```sh
go generate ./...
```

画面の型も同じ openapi.yaml から生成する。両方の API と画面の生成物がそろっているかは、リポジトリのルートの `pnpm check:generated` で確認する（[CONTRIBUTING.md](../../CONTRIBUTING.md)）。

## API

リクエストとレスポンスの項目の定義は [openapi.yaml](openapi.yaml) にある。

- `GET /healthz`、`GET /readyz`: `{"status":"ok"}` を返す。照合の API は起動のときに Hydra の discovery の文書を読み、読めなければ起動しない。起動した後は依存先を確認しないので、プロセスが動いていれば 200 を返す
- `POST /v1/checks`: multipart/form-data の `visits`（実訪問の CSV）と予定を照合する
  - `Authorization: Bearer` の access token を求める
  - 予定は、ファイル `schedules`（予定の CSV）があればそれを使う。無くてフォームの値 `month`（`2024-04` の形）があれば、その月の予定を Google カレンダーから取る
  - Google カレンダーの予定のうち、タイトルを解釈できずに照合に使わなかったものは、`warnings` にカレンダー ID、予定の ID、開始の日時で返す
  - 結果は、`Accept` によらず JSON で返す。行ごとに区分、両側の値、項目ごとの判定を持つ。記号と CSV の書き出しは画面が持つ（[DesignDoc.md](DesignDoc.md)）
  - 入力の CSV は、UTF-8（BOM の有無を問わない）と CP932 を受ける

`testdata/` のダミーの CSV で試すときは、次を実行する。

```sh
curl -s -H "Authorization: Bearer $TOKEN" \
  -F visits=@testdata/visits_utf8.csv -F schedules=@testdata/schedules_utf8.csv \
  http://localhost:8080/v1/checks
curl -s -H "Authorization: Bearer $TOKEN" \
  -F visits=@testdata/visits_cp932.csv -F schedules=@testdata/schedules_cp932.csv \
  http://localhost:8080/v1/checks
```

Google カレンダーから取るときは、`schedules` の代わりに `month` を送る。トークンの組織に結び付けたカレンダーだけを読む。

```sh
curl -s -H "Authorization: Bearer $TOKEN" -F visits=@testdata/visits_utf8.csv -F month=2024-04 http://localhost:8080/v1/checks
```

エラーは `{"code","message"}` の JSON で返す。

- トークンが無いか、検証に失敗した: 401 の `unauthenticated`
- `month` を送ったが、トークンに組織が無い: 403 の `forbidden`
- `schedules` も `month` も無い: 400 の `missing_file`
- `month` の形が違う: 400 の `bad_request`
- 本文が `MAX_UPLOAD_BYTES` を超えた: 413 の `payload_too_large`
- Google カレンダーの設定が無いか、トークンの組織のカレンダーが無いのに `month` を送った: 503 の `calendar_not_configured`
- Calendar API の呼び出しに失敗した: 502 の `schedule_source_failed`
- 入力の CSV の行のエラー: 422 の `invalid_csv` と、行番号つきの `errors`

```json
{
  "code": "invalid_csv",
  "message": "実績の CSV に誤りがある",
  "errors": [{ "source": "visits", "line": 2, "column": "終了時間", "message": "終了時間が開始時間より前である。日付をまたぐ訪問は扱わない" }]
}
```

## Google カレンダーから予定を取る

職員は、自分の事業所のサービスアカウントにカレンダーを共有する。共有の権限は、[基盤と運用の事業所を足す手順](../../context/operations.md#adding-a-facility) にある。  
API は、Application Default Credentials で認証し、カレンダーの組織のサービスアカウントになりすまして予定を読む。  
ドメイン全体の委任とサービスアカウントのキーは使わない。

- ADR-0012: [Google カレンダーのサービスアカウントを事業所ごとに分け、buddy は IAM の権限借用で切り替える](../../docs/adr/0012-google-calendar-facility-service-accounts.md)

ローカルで検証の事業所のカレンダーを読む手順は、次のとおり。  
この手順はメンテナー向けで、運営側の GCP のプロジェクトと検証の事業所のサービスアカウントを前提にする。ほかの人は、`GOOGLE_CALENDAR_ENDPOINT` で Google カレンダーの代わりの calendarpit に向けて試すか、予定の CSV で照合する。

1. 運営側に、検証の事業所のサービスアカウントのトークン作成者のロール（`roles/iam.serviceAccountTokenCreator`）を、自分のアカウントに付けてもらう。本番の事業所のアカウントのロールは付けない。
   - 検証の事業所のアカウントに、`serviceusage.services.use` を持つロールも要るかは、未確認である。
     - ADR-0012: [承認の条件](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0012-google-calendar-facility-service-accounts.md#承認の条件)
2. 検証のカレンダーを、検証の事業所のサービスアカウントに、事業所を足す手順と同じ権限で共有する。
3. 検証の事業所のサービスアカウントになりすました Application Default Credentials を作る。
   ```sh
   gcloud auth application-default login --impersonate-service-account=<検証の事業所のサービスアカウント>
   ```
4. 照合の対象のカレンダーを JSON に書き、`services/receipt/.secrets/calendars.json` に置く。形は [calendars.example.json](calendars.example.json) にある。
   - `calendar_id` はカレンダーの設定の「カレンダーの統合」にあるカレンダー ID
   - `org_id` はカレンダーを使う事業所の、ブローカーの組織の ID。access token の組織のクレームと同じ値にする。この組織のトークンを持つリクエストだけが、このカレンダーを読む
   - `staff_name` は主訪問者の名前で、iBow の主訪問者と同じ表記にする。省くとカレンダーの表示名を使う
5. 組織とサービスアカウントの対応を JSON に書き、`services/receipt/.secrets/service-accounts.json` に置く。形は [service-accounts.example.json](service-accounts.example.json) にあり、予定の API と同じ形にする。
   - `calendars.json` の全ての `org_id` を書く。足りない組織があると、API は起動しない
   - `.secrets/` は、職員のカレンダー ID とサービスアカウントのメールアドレスを持つので Git で追跡しない
6. `GOOGLE_APPLICATION_CREDENTIALS` を設定せずに起動する。

```sh
GOOGLE_CALENDARS_FILE=.secrets/calendars.json \
GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE=.secrets/service-accounts.json \
go run ./cmd/api
```

Application Default Credentials が検証の事業所のサービスアカウントそのものとして動くとき、API は重ねてなりすまさず、その token をそのまま使う。  
このため、ローカルでは、サービスアカウント自身へのトークン作成者のロールが要らない。

予定のタイトルは `【サービス内容】利用者名` の形にする。照合の対象にする予定の規則は [DesignDoc.md](DesignDoc.md) にある。

デプロイした環境では、Workload Identity Federation の外部アカウントの設定のファイルを `GOOGLE_APPLICATION_CREDENTIALS` に渡す。  
認証する主体に、事業所のサービスアカウントごとのトークン作成者のロールを付ける。  
Workload Identity Federation のプールとプロバイダーの作り方は、インフラのリポジトリが持つ。

## Documentation

- [DesignDoc.md](DesignDoc.md): パッケージの構成、入力の CSV、判定の規則、元の実装との違い
- [tools/parity/README.md](tools/parity/README.md): 元の Python の実装と結果を比べる手順
- [全体の Design Doc](../../docs/design/DesignDoc.md): 画面と 2 つの API の責務、インフラとの約束
