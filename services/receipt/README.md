# 照合の API

iBow から出した実訪問の CSV と予定（予定の CSV か Google カレンダー）を照合し、不整合、予定のみ、実績のみ、整合の 4 つに分けて返す API。  
照合の規則と、元の Python との違いは [DesignDoc.md](DesignDoc.md) にある。

## Setup

ツールは、[CONTRIBUTING.md](../../CONTRIBUTING.md#setup) の Setup の手順で入れる。

## Configuration

設定は環境変数で渡す。

- `PORT`: 待ち受けるポート。
  - デフォルトは `8080`。
- `MAX_UPLOAD_BYTES`: `POST /v1/checks` の本文の上限のバイト数。
  - デフォルトは 10 MiB。
- `LOG_LEVEL`: `debug`、`info`、`warn`、`error` のいずれか。
  - デフォルトは `info`。
- `OIDC_ISSUER`: Hydra の Issuer の URL。
  - 必須。
  - トークンの `iss` と一致させ、discovery の文書をここから読む。
- `OIDC_AUDIENCE`: トークンの `aud` に求める値。
  - 必須。
- `OIDC_ORG_CLAIM`: 組織の ID を持つクレームの名前。
  - デフォルトは `org_id`。
- `SCHEDULE_URL`: 予定の API の URL。
  - 必須。
  - 照合の API は、照合の前に、受けたトークンで `GET /v1/me` を呼び、照合の権限（`receipt.check`）を持つかを確認する。
  - ADR-0014: [照合を照合の権限で許し、事務の役職を足し、訪問しない職員を予定と担当から外す](../../docs/adr/0014-receipt-check-policy-and-non-visiting-staff.md)
- `CORS_ALLOW_ORIGINS`: CORS でレスポンスを読ませるオリジンを、カンマで区切って並べた値。
  - 空なら CORS のヘッダーを返さない。
- `GOOGLE_CALENDARS_FILE`: 照合の対象のカレンダーの設定を書いた JSON のパス。
  - 空なら Google カレンダーを使わない。
- `GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE`: 組織の ID と、その事業所の職員がカレンダーを共有するサービスアカウントの対応を書いた JSON のパス。
  - `GOOGLE_CALENDARS_FILE` と一緒に渡す。
- `GOOGLE_APPLICATION_CREDENTIALS`: Application Default Credentials が読む認証情報のファイルのパス。
  - `go run` で実際の Google カレンダーを読むときは設定せず、gcloud で作った Application Default Credentials を使う。
- `GOOGLE_CALENDAR_ENDPOINT`: Calendar API の代わりに呼ぶ URL。
  - ローカル環境の calendarpit で試すために使う。
  - `GOOGLE_APPLICATION_CREDENTIALS` を渡したときだけ、その認証情報をなりすまさずに全ての事業所で使う。渡さなければ認証をしない。
  - `GOOGLE_CALENDARS_FILE` を渡さずにこれだけを渡すと、照合の API は起動しない。

## Running

API の 8080 とフェイクの Issuer の 9000 は、ルートの compose の予定の API と IdP と重なる。  
compose を起動しているときは、重なる 2 つを `docker compose stop schedule idp` で止めてから実行する。

照合の API は、`SCHEDULE_URL` の予定の API に同じトークンで `GET /v1/me` を呼び、照合の権限を確認する。  
予定の API はフェイクの Issuer のトークンを受けないので、この起動の仕方では、照合は 502 か 403 を返す。  
照合を試すときは、ルートの compose で起動する。

- ADR-0014: [照合を照合の権限で許し、事務の役職を足し、訪問しない職員を予定と担当から外す](../../docs/adr/0014-receipt-check-policy-and-non-visiting-staff.md)

```sh
# Hydra の代わりに、フェイクの Issuer を別のターミナルで起動する
go run ./cmd/devissuer -addr 127.0.0.1:9000

export OIDC_ISSUER=http://127.0.0.1:9000 OIDC_AUDIENCE=receipt SCHEDULE_URL=http://127.0.0.1:8081  # 予定の API が無くても起動する
go run ./cmd/api
```

`curl localhost:8080/readyz` が `{"status":"ok"}` を返せば、起動できている。  
`cmd/devissuer` は、`GET /token` で署名したトークンを返す。  
フェイクの Issuer は起動のたびに署名の鍵を作り直すので、Issuer を起動し直したら API も起動し直す。

```sh
TOKEN=$(curl -s '127.0.0.1:9000/token?sub=dev-aoki&org_id=org-sample' | jq -r .access_token)
```

コンテナで起動するときは、このディレクトリで次を実行する。  
ビルドの文脈は、`packages/go` を読むため、リポジトリの直下である。

```sh
docker build -f Dockerfile -t receipt ../..
docker run --rm -p 8080:8080 -e OIDC_ISSUER=<Issuer の URL> -e OIDC_AUDIENCE=receipt -e SCHEDULE_URL=<予定の API の URL> receipt
```

ルートの compose の照合の API は、Google カレンダーの代わりに calendarpit を読む。  
読むカレンダーは、`compose/receipt-calendars.json` の森 健太のカレンダーである。  
サービスアカウントの対応と認証の情報は、予定の API と同じものを使う。  
起動、トークンの取り方、照合する月は、[CONTRIBUTING.md](../../CONTRIBUTING.md#running-locally) の Running Locally にある。

## Tests and Checks

`services/receipt` で実行する。

```sh
go test ./...
go vet ./...
golangci-lint run
```

テストと lint は `GOWORK=off` を付けて流す。  
理由は [CONTRIBUTING.md](../../CONTRIBUTING.md#go-のモジュール) の「Go のモジュール」にある。

## Code Generation

API の定義の正本は [openapi.yaml](openapi.yaml) である。  
openapi.yaml を変えたら、`services/receipt` で生成し直し、生成物も一緒にコミットする。  
画面の型の生成と生成物の確認は、[CONTRIBUTING.md](../../CONTRIBUTING.md#changing-the-api-definition) の Changing the API Definition にある。

```sh
go generate ./...
```

## API

リクエストとレスポンスの項目、`POST /v1/checks` の振る舞いとエラーの定義は [openapi.yaml](openapi.yaml) にある。

`testdata/` のダミーの CSV で試すときは、次を実行する。

```sh
curl -s -H "Authorization: Bearer $TOKEN" \
  -F visits=@testdata/visits_utf8.csv -F schedules=@testdata/schedules_utf8.csv \
  http://localhost:8080/v1/checks
curl -s -H "Authorization: Bearer $TOKEN" \
  -F visits=@testdata/visits_cp932.csv -F schedules=@testdata/schedules_cp932.csv \
  http://localhost:8080/v1/checks
```

Google カレンダーから取るときは、`schedules` の代わりに `month` を送る。  
照合の API は、トークンの組織に結び付けたカレンダーだけを読む。

```sh
curl -s -H "Authorization: Bearer $TOKEN" -F visits=@testdata/visits_utf8.csv -F month=2024-04 http://localhost:8080/v1/checks
```

## Google カレンダーから予定を取る

職員は、自分の事業所のサービスアカウントにカレンダーを共有する。  
共有の権限は、[基盤と運用の事業所を足す手順](../../context/operations.md#adding-a-facility) にある。  
認証のしかたは、[DesignDoc.md](DesignDoc.md#予定のデータソース-google-カレンダー) の「予定のデータソース: Google カレンダー」にある。

- ADR-0009: [Google カレンダーとの連携を事業所ごとの正本のモードで分け、職員のカレンダーを事業所ごとのサービスアカウントへの共有で読み書きする](../../docs/adr/0009-google-calendar-sync.md)

ローカルで検証の事業所のカレンダーを読む手順は、次のとおり。  
この手順はメンテナー向けで、運営側の GCP のプロジェクトと検証の事業所のサービスアカウントを前提にする。  
ほかの人は、`GOOGLE_CALENDAR_ENDPOINT` で Google カレンダーの代わりの calendarpit に向けて試すか、予定の CSV で照合する。

1. 運営側に、検証の事業所のサービスアカウントのトークン作成者のロール（`roles/iam.serviceAccountTokenCreator`）を、自分のアカウントに付けてもらう。本番の事業所のアカウントのロールは付けない。
   - 検証の事業所のアカウントに、`serviceusage.services.use` を持つロールも要るかは、未確認である。
     - ADR-0009: [承認の条件](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0009-google-calendar-sync.md#承認の条件)
2. 検証のカレンダーを、検証の事業所のサービスアカウントに、事業所を足す手順と同じ権限で共有する。
3. 検証の事業所のサービスアカウントになりすました Application Default Credentials を作る。
   ```sh
   gcloud auth application-default login --impersonate-service-account=<検証の事業所のサービスアカウント>
   ```
4. 照合の対象のカレンダーを JSON に書き、`services/receipt/.secrets/calendars.json` に置く。形は [calendars.example.json](calendars.example.json) にある。
   - `calendar_id` は、カレンダーの設定の「カレンダーの統合」にあるカレンダー ID
   - `org_id` は、カレンダーを使う事業所の、ブローカーの組織の ID
     - access token の組織のクレームと同じ値にする。
     - この組織のトークンを持つリクエストだけが、このカレンダーを読む。
   - `staff_name` は主訪問者の名前で、iBow の主訪問者と同じ表記にする。
     - 省くと、カレンダーの表示名を使う。
5. 組織とサービスアカウントの対応を JSON に書き、`services/receipt/.secrets/service-accounts.json` に置く。形は [service-accounts.example.json](service-accounts.example.json) にあり、予定の API と同じ形にする。
   - `calendars.json` の全ての `org_id` を書く。
     - 足りない組織があると、API は起動しない。
   - `.secrets/` は、職員のカレンダー ID とサービスアカウントのメールアドレスを持つので、Git で追跡しない。
6. `GOOGLE_APPLICATION_CREDENTIALS` を設定せずに起動する。

```sh
GOOGLE_CALENDARS_FILE=.secrets/calendars.json \
GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE=.secrets/service-accounts.json \
go run ./cmd/api
```

Application Default Credentials が検証の事業所のサービスアカウントそのものとして動くとき、API は重ねてなりすまさず、その token をそのまま使う。  
このため、ローカルでは、サービスアカウント自身へのトークン作成者のロールが要らない。

予定のタイトルは `【サービス内容】利用者名` の形にする。  
照合の対象にする予定の規則は [DesignDoc.md](DesignDoc.md) にある。

デプロイした環境の認証は、[全体の Design Doc のデプロイの要件](../../docs/design/DesignDoc.md#デプロイの要件) にある。

## Documentation

- [DesignDoc.md](DesignDoc.md): パッケージの構成、入力の CSV、判定の規則、元の実装との違い
- [tools/parity/README.md](tools/parity/README.md): 元の Python の実装と結果を比べる手順
- [全体の Design Doc](../../docs/design/DesignDoc.md): 画面と 2 つの API の責務、デプロイの要件
