# 照合の結果

照合する職員が、照合の結果を区分ごとに見て、CSV で受け取る画面。  
照合の画面で照合が終わったときに開く。

| 項目 | 値 |
| --- | --- |
| 画面の ID | `receipt-result` |
| URL | `/receipt/result` |
| 使う人 | 全ての職員 |
| 実装 | `apps/web/src/routes/receipt.result.tsx`、`ReceiptResultContainer`、`ReceiptResultView`、`ReceiptResultTable` |

## UI

上端のヘッダーの下に、題と予定の取り方、照合し直すリンクと CSV のダウンロードのボタン、区分ごとの件数、照合に使わなかった予定、結果の表を縦に並べる。  
結果の表は横に送れ、送っても訪問日の列は左端に残る。

<iframe class="wireframe-viewer" src="wireframes/viewer.html?screen=receipt-result" title="照合の結果のワイヤーフレーム" width="100%" height="720" loading="lazy"></iframe>

GitHub の画面では iframe を表示しないため、ワイヤーフレームは文書のサイトで見る。  
ワイヤーフレームの HTML は [wireframes/receipt-result.html](wireframes/receipt-result.html) にある。

## 状態ごとの UI

| 状態 | 条件 | 見えるもの |
| --- | --- | --- |
| 表示 | 照合の結果がある | 件数、表、ダウンロードのボタン |
| 使わなかった予定がある | 結果の `warnings` が空でない | 表の上に、照合に使わなかった予定の一覧 |
| 結果が無い | 画面を読み直したか、URL を直に開いた | 「照合の結果がありません」と、照合の画面へのリンク |

- 照合の結果は保存しない。ブラウザの query の cache にだけ置くので、画面を読み直すと消える。PRD の Non-Goals の「照合の結果の保存」に従う。

## 構成要素

API の列は、`createCheck`（`POST /v1/checks`）の応答の `Report` の項目で書く。

| 番号 | 構成要素 | 表示する値 | web の型の項目 | OpenAPI の項目 | `data-testid` |
| --- | --- | --- | --- | --- | --- |
| 1 | `SiteHeader` | 「buddy」 | なし | なし | なし |
| 1-1 | `SiteNav` | 「予定」と「照合」のリンク。「照合」に `aria-current="page"` | なし | なし | `site-nav` |
| 1-2 | `ViewerMenu` | ログインした職員の名前とログアウトのボタン。幅 768px 未満では名前を出さない | `Viewer.staffName` | `getMe` の `username` | `viewer-menu` |
| 2 | `ReceiptResultView` | 照合の結果 | `ReceiptResult` | `Report` | `receipt-result` |
| 2-1 | 題と予定の取り方 | 「照合の結果」と、「2024 年 4 月の Google カレンダー」か「予定の CSV」 | `ReceiptResult.month` | `month` | なし |
| 2-2 | 照合し直すリンク | 「別のファイルで照合する」 | なし | なし | なし |
| 2-3 | ダウンロードのボタン | 「CSV をダウンロード」 | なし | なし | `receipt-download` |
| 2-4 | 区分ごとの件数 | 不整合データ、予定のみ、実績のみ、整合データの件数 | `ReceiptReport.summary` | `summary` | `receipt-summary`、件数は `receipt-summary-{category}` |
| 2-5 | 照合に使わなかった予定 | 件数、直す案内、予定の開始の日時と理由の一覧 | `ReceiptReport.warnings` | `warnings[].start`、`warnings[].message` | `receipt-warnings` |
| 2-6 | `ReceiptResultTable` | 結果の表。列は下の一覧 | `ReceiptReport.rows` | `rows` | `receipt-result-table` |
| 2-6-1 | 区分の見出しの行 | 「不整合データ（3 件）」の形。行の無い区分も出す | `ReceiptRow.category` | `rows[].category` | `receipt-category-{category}` |
| 2-6-2 | 結果の行 | 列ごとの値と印 | `ReceiptRow` | `rows[]` | なし |
| 3 | `ReceiptResultEmpty` | 「照合の結果がありません」と照合の画面へのリンク | なし | なし | `receipt-result-empty` |

結果の表の列と、値の決め方は次のとおり。列の名前と並びは、PRD のレセプトの照合の節と、元の照合のアプリの CSV に合わせる。

- 訪問日、利用者名、主訪問者: `date`、`client`、`staff`
- サービス内容、開始時間、終了時間、提供時間の予定の値: `schedule` の `service`、`start`、`end`、`duration`
- サービス内容、開始時間、終了時間、提供時間の実績の値: `visit` の `service`、`start`、`end`、`duration`
- 加算: `visit.additions`。実績に加算が無ければ空欄にする（照合の API の `tools/parity/report` と同じ）
- 片側の無い行の、無い側の値と、空の提供時間は「データなし」にする

値に付ける印は、`checks` から次のように決める。印の付いたセルは、❌ なら危険、※ なら注意の背景の色にする。

- 不整合の行
  - 開始時間（`checks.start.ok`）、サービス内容（`checks.service.ok`）、提供時間の一致（`checks.duration_equal`）が偽なら、予定と実績の両方に ` ❌` を付ける
  - 終了時間と提供時間が許容範囲を外れたら（`schedule_elapsed`、`visit_elapsed`、`schedule_duration`、`visit_duration` の `ok` が偽）、その側に ` ❌ (最小~最大)` を付ける。範囲の無いサービス内容は ` ❌` だけにする
  - 加算が通常の 1 つでなければ（`checks.additions.ok` が偽）、加算に ` ※` を付ける
- 整合の行
  - 提供時間が違えば（`checks.duration_equal` が偽）、両側の提供時間に ` ※ (最小~最大)` を付ける
  - 終了時間が違えば（`checks.end_equal` が偽）、両側の終了時間に ` ※` を付ける

## 構成要素ごとの活性条件と表示条件

| 番号 | 構成要素 | 表示する条件 | 押せる（入力できる）条件 |
| --- | --- | --- | --- |
| 2 | `ReceiptResultView` | 照合の結果がある | なし |
| 2-5 | 照合に使わなかった予定 | `warnings` が空でない | なし |
| 3 | `ReceiptResultEmpty` | 照合の結果が無い | 常に押せる |

## インタラクション

| 番号 | 操作 | 前提 | 結果 |
| --- | --- | --- | --- |
| 2-2 | 照合し直すリンクを押す | なし | 照合の画面を読み込む。今の結果は消える |
| 2-3 | ダウンロードのボタンを押す | なし | 結果の CSV を保存させる。中身は下の一覧 |
| 3 | 照合の画面へのリンクを押す | なし | 照合の画面を読み込む |

結果の CSV は次のとおり。元の照合のアプリの CSV と、行と印を同じにする。

- 値は、Go の encoding/csv と同じく、区切り、引用符、改行を含む値と空白で始まる値を引用符で囲む
- ファイル名は `照合結果_<対象の月>.csv`。予定の CSV で照合したときは `照合結果_<照合した日の YYYY-MM-DD>.csv`
- 文字コードは BOM 付きの UTF-8 で、行は CRLF で区切る。Excel で開いても文字化けしないためである
- 1 行目は列の名前。その後に区分ごとに、区分の名前と `---` の区切りの行、区分の行を並べる
- 値と印は、結果の表と同じ文字列にする

## 初期状態でのインタラクション

- 結果は照合の画面が置くので、サーバーで描画しない。
- フォーカスは `body` にある。search params は読まない。

## 未決

- PRD は値の無い欄を「データなし」とするが、加算の無い実績は空欄にしている。元の照合のアプリで加算の無い実績がどう出ていたかは確かめていない。

- 区分で行を絞る操作を足すか。元の照合のアプリには無い。
- 結果の表が数千行になったときに、表示を分けるか。
