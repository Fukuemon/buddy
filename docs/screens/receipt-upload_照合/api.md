# receipt-upload API との対応

[照合](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。  
OpenAPI の項目は、`createCheck`（`POST /v1/checks`）の本文とレスポンスで書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 権限が無いこと | 照合の権限を持つか | `Viewer.canCheckReceipt` | `getMe` の `policies[].code` に `receipt.check` があるか |
| 予定の取り方 | Google カレンダーか予定の CSV | `ScheduleSource`（`calendar`、`csv`）。画面の中だけの値 | `month` と `schedules` のどちらを送るか |
| 対象の月 | `YYYY-MM` の月 | `ReceiptCheckInput.month` | 本文の `month` |
| 予定の CSV | ファイル | `ReceiptCheckInput.schedules` | 本文の `schedules` |
| 実績の CSV | ファイル | `ReceiptCheckInput.visits` | 本文の `visits` |
| 照合の失敗の文 | 状態ごとの文 | `ApiError.status`、`ApiError.code` | レスポンスの status、`Error.code` |
| 照合の失敗の文 | 入力の CSV の誤りの一覧 | `ApiError.csvErrors`（`ReceiptCsvError`） | `Error.errors[]` の `source`、`reason`、`line`、`column` |
| 照合する | 照合の結果 | `ReceiptReport`。`ReceiptResult` に包んで query の cache（`receiptResultKey`）に置く | レスポンスの `Report` |

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| ファイルが大きすぎる | 「ファイルが大きすぎます。10 MB までのファイルにしてください。」 | 選んだファイルの合計が `MAX_RECEIPT_UPLOAD_BYTES` を超える。送らない |
| 行のエラー | 「入力の CSV に誤りがあります。次のところを直して、もう一度照合してください。」と、誤りの一覧 | `createCheck` が 422 の `invalid_csv` で、`errors[]` に行を持つ誤りがある |
| ファイルのエラー | 「入力の CSV に誤りがあります。次のところを直して、もう一度照合してください。」と、誤りの一覧 | `createCheck` が 422 の `invalid_csv` で、`errors[]` がファイル全体の誤り（`missing_column`、`encoding`、`empty_file`）だけ |
| ファイルのエラー | 「ファイルが大きすぎます。10 MB までのファイルにしてください。」 | `createCheck` が 413 の `payload_too_large` |
| ファイルのエラー | 「入力を読めませんでした。ファイルを選び直して、もう一度照合してください。」 | `createCheck` が 400 の `bad_request` か `missing_file`。本文の形が違う、実績の CSV が無い、予定の CSV も対象の月も無い、対象の月の形が違う、のどれか |
| カレンダーの失敗 | 「Google カレンダーから予定を取れませんでした。時間をおいて、もう一度照合してください。」 | `createCheck` が 502 の `schedule_source_failed` |
| カレンダーの失敗 | 「この事業所では、まだ Google カレンダーを使う準備ができていません。予定の CSV で照合してください。」 | `createCheck` が 503 の `calendar_not_configured` |
| 照合の失敗 | 「照合の権限がありません。権限が要るときは、職員の管理の権限を持つ職員に頼んでください。」 | `createCheck` が 403 の `forbidden` |
| 照合の失敗 | 「照合の権限を確認できませんでした。時間をおいて、もう一度照合してください。」 | `createCheck` が 502 の `permission_check_failed` |
| 照合の失敗 | 「照合できませんでした。時間をおいて、もう一度照合してください。」 | `createCheck` が 500 の `internal` かそのほかの status、照合の API に届かない |

- 文は、`apps/web/src/features/receipt/lib/errorMessage.ts` の `checkErrorMessage` が status で選ぶ。
  - 502 は、`ApiError.code`（`Error.code`）で、照合の権限を確認できない文と Google カレンダーの失敗の文を分ける。
- 403 の `forbidden` は、画面を開いた後に照合の権限を外されたときのほかに、`month` で照合し、access token に組織が無いときにも返る。
  - どちらも同じ文を出す。
- 入力の CSV の誤りの文は、同じファイルの `csvErrorLines` が `reason` と `line` と `column` から作る。
  - `Error.message` と `errors[].message` は画面に出さない。
  - ファイルの名前は、`source` が `schedules` なら「予定の CSV」、`visits` なら「実績の CSV」にする。
  - `missing_column` は、CSV ごとに 1 つの文にまとめ、ほかの誤りより先に並べる。
- ファイルの合計の上限は `MAX_RECEIPT_UPLOAD_BYTES`（`apps/web/src/api/bff/receiptCall.ts`）である。
  - 照合の API の `MAX_UPLOAD_BYTES` のデフォルト（10 MiB）から 64 KiB を引く。
  - BFF の server function も、`parseReceiptForm` で同じ上限を確認する。
- 401 は、セッションが無いときに BFF の `checkReceipt`（`apps/web/src/server/receipt.ts`）が返す。
  - 照合の API も、access token が無いか正しくないときに 401（`unauthenticated`）を返す。`checkReceipt` はその status をそのまま返す。
  - どちらも `createBffReceiptApi` がログインの画面へ移す。
- 対象の月のデフォルトは `previousMonth`、月の形の確認は `isMonth`（`apps/web/src/features/receipt/lib/month.ts`）である。
