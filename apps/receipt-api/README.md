# receipt-api

iBow から出した実訪問の CSV と予定（予定の CSV か Google カレンダー）を照合し、不整合、予定のみ、実績のみ、整合の 4 つに分けて返す API。  
照合の規則と、元の Python との違いは [DesignDoc.md](DesignDoc.md) にある。

## 準備

Go と golangci-lint のバージョンは、リポジトリのルートの `mise.toml` にある。

```sh
mise install go golangci-lint
```

## 動かす

```sh
go run ./cmd/api
```

設定は環境変数で渡す。

- `PORT`: 待ち受けるポート。既定は `8080`
- `MAX_UPLOAD_BYTES`: `POST /v1/checks` の本文の上限のバイト数。既定は 10 MiB
- `LOG_LEVEL`: `debug`、`info`、`warn`、`error` のいずれか。既定は `info`
- `GOOGLE_CALENDARS_FILE`: 照合の対象のカレンダーの設定（JSON）のパス。空なら Google カレンダーを使わない
- `GOOGLE_APPLICATION_CREDENTIALS`: Application Default Credentials が読む認証情報のファイルのパス
- `GOOGLE_CALENDAR_ENDPOINT`: Calendar API の代わりに呼ぶ URL。偽物の API で試すためのもので、認証をしない

コンテナで動かすときは、次を実行する。

```sh
docker build -t receipt-api .
docker run --rm -p 8080:8080 receipt-api
```

## テストとチェック

`apps/receipt-api` で実行する。

```sh
go test ./...
go vet ./...
golangci-lint run
```

## コードの生成

API の定義の正本は [openapi.yaml](openapi.yaml) である。  
oapi-codegen が、そこから net/http の strict server のインターフェイスと型を `internal/httpapi/openapi/openapi.gen.go` に生成する。`internal/httpapi` がそのインターフェイスを実装する。  
oapi-codegen は `go.mod` の `tool` でバージョンを固定し、`go tool` で動かす。設定は [oapi-codegen.yaml](oapi-codegen.yaml) にある。

openapi.yaml を変えたら、`apps/receipt-api` で生成し直し、生成物も一緒にコミットする。

```sh
go generate ./...
```

画面の型も同じ openapi.yaml から生成する。両方の API と画面の生成物がそろっているかは、リポジトリのルートの `pnpm check:generated` で確かめる（[CONTRIBUTING.md](../../CONTRIBUTING.md)）。

## API

要求と応答の項目の定義は [openapi.yaml](openapi.yaml) にある。

- `GET /healthz`、`GET /readyz`: `{"status":"ok"}` を返す。照合の API は起動に要る依存先を持たないので、`/readyz` も応答できれば 200 を返す
- `POST /v1/checks`: multipart/form-data の `visits`（実訪問の CSV）と予定を照合する
  - 予定は、ファイル `schedules`（予定の CSV）があればそれを使う。無くてフォームの値 `month`（`2024-04` の形）があれば、その月の予定を Google カレンダーから取る
  - Google カレンダーの予定のうち、題名を解釈できずに照合に使わなかったものは、`warnings` にカレンダー ID、予定の ID、開始の日時で返す
  - 結果は、`Accept` によらず JSON で返す。行ごとに区分、両側の値、項目ごとの判定を持つ。記号と CSV の書き出しは画面が持つ（[DesignDoc.md](DesignDoc.md)）
  - 入力の CSV は、UTF-8（BOM の有無を問わない）と CP932 を受ける

`testdata/` の架空の CSV で試すときは、次を実行する。

```sh
curl -s -F visits=@testdata/visits_utf8.csv -F schedules=@testdata/schedules_utf8.csv \
  http://localhost:8080/v1/checks
curl -s -F visits=@testdata/visits_cp932.csv -F schedules=@testdata/schedules_cp932.csv \
  http://localhost:8080/v1/checks
```

Google カレンダーから取るときは、`schedules` の代わりに `month` を送る。

```sh
curl -s -F visits=@testdata/visits_utf8.csv -F month=2024-04 http://localhost:8080/v1/checks
```

エラーは `{"code","message"}` の JSON で返す。

- `schedules` も `month` も無い: 400 の `missing_file`
- `month` の形が違う: 400 の `bad_request`
- Google カレンダーの設定が無いのに `month` を送った: 503 の `calendar_not_configured`
- Calendar API の呼び出しに失敗した: 502 の `schedule_source_failed`
- 入力の CSV の行の誤り: 422 の `invalid_csv` と、行番号つきの `errors`

```json
{
  "code": "invalid_csv",
  "message": "実績の CSV に誤りがある",
  "errors": [{ "source": "visits", "line": 2, "column": "終了時間", "message": "終了時間が開始時間より前である。日付をまたぐ訪問は扱わない" }]
}
```

## Google カレンダーから予定を取る

サービスアカウントに職員のカレンダーを閲覧の権限で共有し、API はそのサービスアカウントで予定を読む。  
ドメイン全体の委任は使わない。読めるカレンダーを、照合に使うものだけに絞るためである。

1. Google Cloud のプロジェクトで Google Calendar API を有効にし、サービスアカウントを作る。
2. 職員ごとに、Google カレンダーの「特定のユーザーとの共有」にサービスアカウントのメールアドレスを足し、権限を「予定の表示（すべての予定の詳細）」にする。
3. 照合の対象のカレンダーを JSON に書き、`apps/receipt-api/.secrets/calendars.json` に置く。形は [calendars.example.json](calendars.example.json) にある。
   - `calendar_id` はカレンダーの設定の「カレンダーの統合」にあるカレンダー ID
   - `staff_name` は主訪問者の名前で、iBow の主訪問者と同じ表記にする。省くとカレンダーの表示名を使う
4. サービスアカウントの鍵のファイル（JSON）を作り、`apps/receipt-api/.secrets/` に置く。`.secrets/` は、鍵と職員のカレンダー ID を持つので Git で追跡しない。
5. 環境変数で設定と鍵のファイルを渡して起動する。

```sh
GOOGLE_CALENDARS_FILE=.secrets/calendars.json \
GOOGLE_APPLICATION_CREDENTIALS=.secrets/service-account.json \
go run ./cmd/api
```

予定の題名は `【サービス内容】利用者名` の形にする。照合の対象にする予定の規則は [DesignDoc.md](DesignDoc.md) にある。

EKS では鍵のファイルを使わず、Workload Identity Federation の外部アカウントの設定のファイルを `GOOGLE_APPLICATION_CREDENTIALS` に渡す。Application Default Credentials が同じ環境変数から読む。  
Workload Identity Federation のプールとプロバイダーの作り方は、インフラのリポジトリが持つ。

## 文書

- [DesignDoc.md](DesignDoc.md): パッケージの構成、入力の CSV、判定の規則、元の実装との違い
- [tools/parity/README.md](tools/parity/README.md): 元の Python の実装と結果を比べる手順
- [全体の Design Doc](../../docs/design/DesignDoc.md): 画面と 2 つの API の責務、インフラとの約束
