# receipt-upload API との対応

[照合](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。  
OpenAPI の項目は、`createCheck`（`POST /v1/checks`）の本文とレスポンスで書く。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| アカウント | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| ナビゲーション、権限が無いことのタイトル | 照合の権限を持つか | `Viewer.policyCodes` に `receipt.check` があるか（`hasPermission`） | `getMe` の `policies[].code` に `receipt.check` があるか |
| 予定の取り方 | Google カレンダーか予定の CSV | `ScheduleSource`（`calendar`、`csv`）。画面の中だけの値 | `month` と `schedules` のどちらを送るか |
| 対象の月 | `YYYY-MM` の月 | `ReceiptCheckInput.month` | 本文の `month` |
| 予定の CSV | ファイル | `ReceiptCheckInput.schedules` | 本文の `schedules` |
| 実績の CSV | ファイル | `ReceiptCheckInput.visits` | 本文の `visits` |
| 照合の失敗の文 | 状態ごとの文 | `ApiError.status`、`ApiError.code` | レスポンスの status、`Error.code` |
| 照合の失敗の文 | 入力の CSV の誤りの一覧 | `ApiError.csvErrors`（`ReceiptCsvError`） | `Error.errors[]` の `source`、`reason`、`line`、`column` |
| 照合する | 照合の結果 | `ReceiptReport`。`ReceiptResult` に包んで query の cache（`receiptResultKey`）に置く | レスポンスの `Report` |

- ログアウトは、開発の設定（フェイクの API で動かす形、`mode` が `bff` でない）では出さない（`SiteLayoutContainer.tsx` の `canLogout`、`ViewerMenu.tsx`）。

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 予定の取り方が、Google カレンダーである | 予定の取り方（`ScheduleSource`）が `calendar` |
| 予定の取り方が、予定の CSV である | 予定の取り方（`ScheduleSource`）が `csv` |
| 職員が、実績の CSV を選んでいる | 実績の CSV（`ReceiptCheckInput.visits` に送る `File`）が `null` でない |
| 予定の取り方が Google カレンダーで、対象の月を選んでいる | 予定の取り方が `calendar` で、対象の月（`ReceiptCheckInput.month` に送る値）が `isMonth` で `true` |
| 予定の取り方が予定の CSV で、予定の CSV を選んでいる | 予定の取り方が `csv` で、予定の CSV（`ReceiptCheckInput.schedules` に送る `File`）が `null` でない |
| 実績の CSV の欄が、空である | 実績の CSV（`ReceiptCheckInput.visits` に送る `File`）が `null` |
| 予定の取り方が Google カレンダーで、対象の月の欄が空である | 予定の取り方が `calendar` で、対象の月が `isMonth` で `false` |
| 予定の取り方が予定の CSV で、予定の CSV の欄が空である | 予定の取り方が `csv` で、予定の CSV が `null` |
| 選んだファイルの合計が、上限以下である | 実績の CSV と予定の CSV の `File.size` の和が `MAX_RECEIPT_UPLOAD_BYTES` 以下。予定の取り方が `calendar` なら、予定の CSV は数えない |
| 職員が、照合を送っている途中である | `createCheck` を呼ぶ mutation の `isPending` が `true`（`ReceiptCheckForm` の `isSubmitting`） |

- 予定の取り方、対象の月、2 つのファイルは、`ReceiptCheckFormContainer.tsx` の state（`source`、`month`、`schedules`、`visits`）が持つ。
- 照合するの活性は、同じファイルの `ready`、`tooLarge` から作る `canSubmit` と、`isSubmitting` で決める。
- 照合するの条件の文は、同じファイルが `ready` でないときに `submitHint` に文を渡し、`ReceiptCheckForm.tsx` が `canSubmit` が `false` で送っていない間だけ出す。
  - `ReceiptCheckForm.tsx` は、`canSubmit` が `false` なら `Button` に `disabled` を、送っている間は `isLoading` を渡す。packages/ui の `Button` は、どちらでも押しても動かない。
  - 入力を変えると `check.reset()` が `isPending` を `false` に戻すので、送っている途中でも押せるようになる（#811）。
- 対象の月の欄と予定の CSV の欄は、`ReceiptCheckForm.tsx` が `source` で出し分ける。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 6 | 予定の取り方 | `receipt-source` |
| 7 | 対象の月 | `receipt-month` |
| 7 | 予定の CSV | `receipt-schedules-file` |
| 8 | 実績の CSV | `receipt-visits-file` |
| 9 | 照合する | `receipt-check-submit` |
| 9 | 照合の失敗の文 | `receipt-check-error` |
| 10 | 照合する | `receipt-check-submit` |
| 10 | 照合するの条件の文 | `receipt-check-submit-hint` |
| 10 | メニュー | `site-nav-toggle` |
| 11 | メニュー | `site-nav-toggle` |
| 6 | 予定のカレンダーへ | `page-forbidden-back` |
| 7 | メニュー | `site-nav-toggle` |

- 予定の取り方の選択肢は、`receipt-source-calendar`、`receipt-source-csv` である。
- 次の testid は、構成要素の表に載せないので、この表に載せない。
  - 説明の文の一部の、「詳しく」の `receipt-more` と、続きの説明の `receipt-more-text`
  - フォームの入れ物の `receipt-check-form`
  - アカウントの入れ物の `viewer-menu` と、メニューの自分の情報の `viewer-profile`
  - 権限が無いことの入れ物の `page-forbidden`

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
- ファイルの合計の上限は `MAX_RECEIPT_UPLOAD_BYTES`（`apps/web/src/api/BuddyApi.ts`）である。
  - 照合の API の `MAX_UPLOAD_BYTES` のデフォルト（10 MiB）から 64 KiB を引く。
  - BFF の server function も、`parseReceiptForm` で同じ上限を確認する。
- 401 は、セッションが無いときに BFF の `checkReceipt`（`apps/web/src/server/receipt.ts`）が返す。
  - 照合の API も、access token が無いか正しくないときに 401（`unauthenticated`）を返す。`checkReceipt` はその status をそのまま返す。
  - どちらも `createBffReceiptApi` がログインの画面へ移す。
- 対象の月のデフォルトは `previousMonth`、月の形の確認は `isMonth`（`apps/web/src/features/receipt/lib/month.ts`）である。
