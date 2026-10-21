# receipt-upload API との対応

[照合](index.md) の項目と、web の型と OpenAPI の項目の対応。画面を作る人と API を変える人が読む。OpenAPI の項目は、`createCheck`（`POST /v1/checks`）の本文と応答で書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 予定の取り方 | Google カレンダーか予定の CSV | `ScheduleSource`（`calendar`、`csv`）。画面の中だけの値 | `month` と `schedules` のどちらを送るか |
| 対象の月 | `YYYY-MM` の月 | `ReceiptCheckInput.month` | 本文の `month` |
| 予定の CSV | ファイル | `ReceiptCheckInput.schedules` | 本文の `schedules` |
| 実績の CSV | ファイル | `ReceiptCheckInput.visits` | 本文の `visits` |
| 失敗の文 | 状態ごとの文 | `ApiError.status`、`ApiError.message` | 応答の status と `Error.message` |
| 失敗の文 | 行ごとの誤り | `ApiError.rowErrors`（`ReceiptRowError`） | `Error.errors[]` の `source`、`line`、`column`、`message` |
| 照合する | 照合の結果 | `ReceiptReport`。`ReceiptResult` に包んで query の cache（`receiptResultKey`）に置く | 応答の `Report` |

- 失敗の文と status の対応は `apps/web/src/features/receipt/lib/errorMessage.ts` の `checkErrorMessage` にある。status と `Error.code` は次のとおり。
  - 400 は `bad_request` か `missing_file`、413 は `payload_too_large`、422 は `invalid_csv`
  - 502 は `schedule_source_failed`、503 は `calendar_not_configured`。500（`internal`）とそのほかは照合の失敗の文にする
  - 422 で `errors` が空なら、ファイル全体の誤りとして、`Error.message` を文に続ける
- 行ごとの誤りのファイルの名前は、`source` が `schedules` なら「予定の CSV」、`visits` なら「実績の CSV」にする。
- ファイルの合計の上限は `MAX_RECEIPT_UPLOAD_BYTES`（`apps/web/src/api/bff/receiptCall.ts`）である。照合の API の `MAX_UPLOAD_BYTES` の既定（10 MiB）から 64 KiB を引く。BFF の server function も、`parseReceiptForm` で同じ上限を確かめる。
- 401 は照合の API ではなく BFF が返す。セッションが無いときに、`checkReceipt`（`apps/web/src/server/receipt.ts`）が返し、`createBffReceiptApi` がログインの画面へ移す。
- 対象の月の既定は `previousMonth`、月の形の確かめは `isMonth`（`apps/web/src/features/receipt/lib/month.ts`）である。
