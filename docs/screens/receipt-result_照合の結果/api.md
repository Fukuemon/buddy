# receipt-result API との対応

[照合の結果](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。  
OpenAPI の項目は、`createCheck`（`POST /v1/checks`）のレスポンスの `Report` で書く。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| アカウント | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| ナビゲーション、権限が無いことのタイトル | 照合の権限を持つか | `Viewer.policyCodes` に `receipt.check` があるか（`hasPermission`） | `getMe` の `policies[].code` に `receipt.check` があるか |
| ページのタイトル | 予定の取り方 | `ReceiptResult.month` | リクエストの `month` |
| 照合に使わなかった予定 | 開始の日時と理由 | `ReceiptReport.warnings`（`ReceiptWarning`） | `warnings[].start`、`warnings[].reason`、`warnings[].column` |
| 結果の表 | 対の一覧 | `ReceiptReport.rows` | `rows` |
| 区分の見出しの行 | 区分と、区分の行の数 | `ReceiptRow.category` | `rows[].category` |
| 結果の行 | 訪問日、利用者名、主訪問者 | `ReceiptRow` | `rows[].date`、`client`、`staff` |
| 結果の行 | 予定と実績の値 | `ReceiptRow.schedule`、`visit` | `rows[].schedule`、`rows[].visit` の `service`、`start`、`end`、`duration` |
| 結果の行 | 加算 | `ReceiptRow.visit.additions` | `rows[].visit.additions` |
| 結果の行、確認すること、印の意味 | 印と確認することの文 | `ReceiptRow.checks` | `rows[].checks` の `start`、`service`、`duration_equal`、`end_equal`、`schedule_elapsed`、`visit_elapsed`、`schedule_duration`、`visit_duration`、`additions` |
| 表示する行、区分の見出しの行 | 確認が要る行と全ての行の件数 | `ReceiptReport.rows` と、`needsCheck` が真の行 | `rows`、`rows[].category`、`rows[].checks` |

- 印の条件と `checks` の項目の対応は次のとおり。
  - 開始時間の一致は `checks.start.ok`、サービス内容の対応は `checks.service.ok`
  - 提供時間の一致は `checks.duration_equal`、終了時間の一致は `checks.end_equal`
  - 終了時間の許容範囲は `checks.schedule_elapsed` と `checks.visit_elapsed` で決める
  - 提供時間の許容範囲は `checks.schedule_duration` と `checks.visit_duration` で決める
  - 許容範囲の 4 つの項目は、どれも `ok`、`minutes`、`range` を持つ
  - 加算は `checks.additions.ok`
- 照合に使わなかった予定の理由の文は、`apps/web/src/features/receipt/lib/errorMessage.ts` の `warningReasonText` が `reason` と `column` から作る。
  - `warnings[].message` は画面に出さない。
- 結果の表の印と確認することの文は、`apps/web/src/features/receipt/lib/reportCells.ts` の `rowFindings` と `cellMarks` が `checks` から作る。
  - アイコンと重さの名前は `ReceiptMark.tsx` の `MARKS` にある。
- CSV の行は、`reportCells.ts` の `reportRowCells` が作る。確認することの列は、`rowFindings` の文に重さを前に付けてつなぐ。
- ログアウトは、開発の設定（フェイクの API で動かす形、`mode` が `bff` でない）では出さない（`SiteLayoutContainer.tsx` の `canLogout`、`ViewerMenu.tsx`）。
- 「結果が無い」の状態は、query の cache に `ReceiptResult`（`useReceiptResult`）が無いときになる（`ReceiptResultContainer.tsx`）。
- 「使わなかった予定がある」の状態は、`ReceiptReport.warnings` が空でないときになる（`ReceiptResultView.tsx`）。

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 表示する行に「全ての行」を選んでいる | `ReceiptResultRows` の `view` が `all` |
| 区分に、表示する行がある | 表示する行のうち、`ReceiptRow.category` がその区分の行が 1 つ以上ある |

- 判定は `ReceiptResultTable.tsx` の `hidesEmptyCategories` にあり、`ReceiptResultRows.tsx` が「確認が要る行」のときに真を渡す。
- 確認が要る行は `reportCells.ts` の `needsCheck` が決める。`category` が `match` でないか、`rowFindings` に重さのある判定がある行である。
- 「確認が要る行が無い」の状態は、`view` が `needs` で、`needsCheck` が真の行が 0 のときになる（`ReceiptResultRows.tsx`）。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 6 | CSV をダウンロード | `receipt-download` |
| 7 | 結果の表 | `receipt-result-table` |
| 7 | 照合に使わなかった予定 | `receipt-warnings` |
| 8 | 区分の見出しの行 | `receipt-category-mismatch` |
| 8 | 区分の見出しの行 | `receipt-category-schedule_only` |
| 8 | 区分の見出しの行 | `receipt-category-visit_only` |
| 8 | 区分の見出しの行 | `receipt-category-match` |
| 8 | 結果の表 | `receipt-result-table` |
| 9 | 区分の見出しの行 | `receipt-category-mismatch` |
| 9 | 区分の見出しの行 | `receipt-category-schedule_only` |
| 9 | 区分の見出しの行 | `receipt-category-visit_only` |
| 9 | 区分の見出しの行 | `receipt-category-match` |
| 11 | 印の意味 | `receipt-mark-legend` |
| 12 | 印の意味 | `receipt-mark-legend` |
| 13 | 表示する行 | `receipt-row-view` |
| 14 | 表示する行 | `receipt-row-view` |
| 7 | 表示する行 | `receipt-row-view` |
| 8 | 確認が要る行が無いことの知らせ | `receipt-needs-empty` |
| 9 | 全ての行を表示 | `receipt-row-view-show-all` |
| 10 | メニュー | `site-nav-toggle` |
| 11 | メニュー | `site-nav-toggle` |
| 6 | メニュー | `site-nav-toggle` |
| 6 | 予定のカレンダーへ | `page-forbidden-back` |
| 7 | メニュー | `site-nav-toggle` |

- 区分の見出しの行の testid の末尾は、区分（`ReceiptCategory`）の `mismatch`、`schedule_only`、`visit_only`、`match` である。
  - 区分の名前と件数の文字には、`receipt-category-label-<区分>` を付ける。区分の見出しの行の一部なので、この表に載せない。
- 表示する行の選択肢には `receipt-row-view-needs` と `receipt-row-view-all` を、読み上げだけの行の数には `receipt-row-count` を付ける。
- 結果の行の次の要素には testid を付ける。結果の行の一部なので、この表に載せない。
  - 確認することのセルの文の一覧の `receipt-findings`
  - 印を付けたセルの値の `receipt-marked-cell`（重さを `data-severity` に持つ）
  - 重さのアイコンの `receipt-mark-mismatch` と `receipt-mark-note`
- 次の入れ物の testid は、構成要素の表に載せないので、この表に載せない。
  - 結果の入れ物の `receipt-result` と、結果が無いことの入れ物の `receipt-result-empty`
  - アカウントの入れ物の `viewer-menu` と、メニューの自分の情報の `viewer-profile`
  - 権限が無いことの入れ物の `page-forbidden`
- 別のファイルで照合すると照合の画面へは、実装もモックも testid を持たない。
