# receipt-upload API との対応

[照合](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。  
OpenAPI の項目は、`createCheck`（`POST /v1/checks`）の本文とレスポンスで書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 予定の取り方 | Google カレンダーか予定の CSV | `ScheduleSource`（`calendar`、`csv`）。画面の中だけの値 | `month` と `schedules` のどちらを送るか |
| 対象の月 | `YYYY-MM` の月 | `ReceiptCheckInput.month` | 本文の `month` |
| 予定の CSV | ファイル | `ReceiptCheckInput.schedules` | 本文の `schedules` |
| 実績の CSV | ファイル | `ReceiptCheckInput.visits` | 本文の `visits` |
| 失敗の文 | 状態ごとの文 | `ApiError.status`、`ApiError.message` | レスポンスの status と `Error.message` |
| 失敗の文 | 行ごとのエラー | `ApiError.rowErrors`（`ReceiptRowError`） | `Error.errors[]` の `source`、`line`、`column`、`message` |
| 照合する | 照合の結果 | `ReceiptReport`。`ReceiptResult` に包んで query の cache（`receiptResultKey`）に置く | レスポンスの `Report` |

- 失敗の文と status の対応は `apps/web/src/features/receipt/lib/errorMessage.ts` の `checkErrorMessage` にある。status と `Error.code` は次のとおり。
  - 400 は `bad_request` か `missing_file`、413 は `payload_too_large`、422 は `invalid_csv`
  - 403 は `forbidden`、502 は `schedule_source_failed`、503 は `calendar_not_configured`
  - 500（`internal`）とそのほかは照合の失敗の文にする
  - 422 で `errors` が空なら、ファイル全体のエラーとして、`Error.message` を文に続ける
- 行ごとのエラーのファイルの名前は、`source` が `schedules` なら「予定の CSV」、`visits` なら「実績の CSV」にする。
- ファイルの合計の上限は `MAX_RECEIPT_UPLOAD_BYTES`（`apps/web/src/api/bff/receiptCall.ts`）である。
  - 照合の API の `MAX_UPLOAD_BYTES` のデフォルト（10 MiB）から 64 KiB を引く。
  - BFF の server function も、`parseReceiptForm` で同じ上限を確認する。
- 401 は、セッションが無いときに BFF の `checkReceipt`（`apps/web/src/server/receipt.ts`）が返す。
  - 照合の API も、access token が無いか正しくないときに 401（`unauthenticated`）を返す。`checkReceipt` はその status をそのまま返す。
  - どちらも `createBffReceiptApi` がログインの画面へ移す。
- 対象の月のデフォルトは `previousMonth`、月の形の確認は `isMonth`（`apps/web/src/features/receipt/lib/month.ts`）である。
