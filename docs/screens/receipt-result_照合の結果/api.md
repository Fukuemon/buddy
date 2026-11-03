# receipt-result API との対応

[照合の結果](index.md) の項目と、web の型と OpenAPI の項目の対応。  
OpenAPI の項目は、`createCheck`（`POST /v1/checks`）のレスポンスの `Report` で書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 権限が無いこと | 照合の権限を持つか | `Viewer.policyCodes` に `receipt.check` があるか（`hasPermission`） | `getMe` の `policies[].code` に `receipt.check` があるか |
| ページのタイトル | 予定の取り方 | `ReceiptResult.month` | リクエストの `month` |
| 照合に使わなかった予定 | 開始の日時と理由 | `ReceiptReport.warnings`（`ReceiptWarning`） | `warnings[].start`、`warnings[].reason`、`warnings[].column` |
| 結果の表 | 対の一覧 | `ReceiptReport.rows` | `rows` |
| 区分の見出しの行 | 区分と、区分の行の数 | `ReceiptRow.category` | `rows[].category` |
| 結果の行 | 訪問日、利用者名、主訪問者 | `ReceiptRow` | `rows[].date`、`client`、`staff` |
| 結果の行 | 予定と実績の値 | `ReceiptRow.schedule`、`visit` | `rows[].schedule`、`rows[].visit` の `service`、`start`、`end`、`duration` |
| 結果の行 | 加算 | `ReceiptRow.visit.additions` | `rows[].visit.additions` |
| 結果の行 | 印 | `ReceiptRow.checks` | `rows[].checks` の `start`、`service`、`duration_equal`、`end_equal`、`schedule_elapsed`、`visit_elapsed`、`schedule_duration`、`visit_duration`、`additions` |

- 印の条件と `checks` の項目の対応は次のとおり。
  - 開始時間の一致は `checks.start.ok`、サービス内容の対応は `checks.service.ok`
  - 提供時間の一致は `checks.duration_equal`、終了時間の一致は `checks.end_equal`
  - 終了時間の許容範囲は `checks.schedule_elapsed` と `checks.visit_elapsed` で決める
  - 提供時間の許容範囲は `checks.schedule_duration` と `checks.visit_duration` で決める
  - 許容範囲の 4 つの項目は、どれも `ok`、`minutes`、`range` を持つ
  - 加算は `checks.additions.ok`
- 照合に使わなかった予定の理由の文は、`apps/web/src/features/receipt/lib/errorMessage.ts` の `warningReasonText` が `reason` と `column` から作る。
  - `warnings[].message` は画面に出さない。
- 印と CSV は、`apps/web/src/features/receipt/lib/reportCells.ts` が、照合の API の `tools/parity/report` と同じ付け方で作る。
