# receipt-api

iBow から出した実訪問の CSV と予定の CSV を照合し、不整合、予定のみ、実績のみ、整合の 4 つに分けて返す API。  
照合の規則と、元の Python との違いは [DesignDoc.md](DesignDoc.md) にある。

## 準備

Go と golangci-lint のバージョンは、リポジトリのルートの `mise.toml` にある。

```sh
mise install go golangci-lint
```

## テストとチェック

`apps/receipt-api` で実行する。

```sh
go test ./...
go vet ./...
golangci-lint run
```

## 起動

```sh
go run ./cmd/api
```

設定は環境変数で渡す。

- `PORT`: 待ち受けるポート。既定は `8080`
- `MAX_UPLOAD_BYTES`: `POST /v1/checks` の本文の上限のバイト数。既定は 10 MiB
- `LOG_LEVEL`: `debug`、`info`、`warn`、`error` のいずれか。既定は `info`

コンテナで動かすときは、次を実行する。

```sh
docker build -t receipt-api .
docker run --rm -p 8080:8080 receipt-api
```

## API

- `GET /health`: `{"status":"ok"}` を返す
- `POST /v1/checks`: multipart/form-data の `visits`（実訪問の CSV）と `schedules`（予定の CSV）を照合する
  - 結果は、`Accept` によらず JSON で返す。行ごとに区分、両側の値、項目ごとの判定を持つ。記号と CSV の書き出しは画面が持つ（[DesignDoc.md](DesignDoc.md)）
  - 入力の CSV は、UTF-8（BOM の有無を問わない）と CP932 を受ける

`testdata/` の架空の CSV で試すときは、次を実行する。

```sh
curl -s -F visits=@testdata/visits_utf8.csv -F schedules=@testdata/schedules_utf8.csv \
  http://localhost:8080/v1/checks
curl -s -F visits=@testdata/visits_cp932.csv -F schedules=@testdata/schedules_cp932.csv \
  http://localhost:8080/v1/checks
```

エラーは `{"code","message"}` の JSON で返す。  
入力の CSV の行の誤りでは、状態コード 422 と、行番号つきの `errors` を返す。

```json
{
  "code": "invalid_csv",
  "message": "実績の CSV に誤りがある",
  "errors": [{ "source": "visits", "line": 2, "column": "終了時間", "message": "終了時間が開始時間より前である。日付をまたぐ訪問は扱わない" }]
}
```
