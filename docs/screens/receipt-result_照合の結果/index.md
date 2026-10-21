# receipt-result 照合の結果

照合の担当が、照合の結果を区分ごとに見て、CSV で受け取る画面。照合の画面で照合が終わったときに開く。

| 項目 | 値 |
| --- | --- |
| URL | `/receipt/result` |
| 使う人 | 全ての職員 |
| 実装 | `apps/web/src/routes/receipt.result.tsx`、`ReceiptResultContainer`、`ReceiptResultView`、`ReceiptResultTable` |

画面の項目と、web の型、OpenAPI の項目の対応は [API との対応](api.md) にある。

## 構成

=== "結果の表示"

    照合の結果があり、照合に使わなかった予定が無いとき。

    <iframe class="mock" title="照合の結果の、結果の表示" src="mocks/01-result.html"></iframe>
    <a class="mock-open" href="mocks/01-result.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | リンク | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ラベル | ログインした職員 | [ログインした職員](#ログインした職員) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページの題 | [ページの題](#ページの題) |
    | 5 | リンク | 別のファイルで照合する | [別のファイルで照合する](#別のファイルで照合する) |
    | 6 | ボタン | CSV をダウンロード | [CSV をダウンロード](#csv-をダウンロード) |
    | 7 | ラベル | 区分ごとの件数 | [区分ごとの件数](#区分ごとの件数) |
    | 8 | 表 | 結果の表 | [結果の表](#結果の表) |
    | 9 | ラベル | 区分の見出しの行 | [区分の見出しの行](#区分の見出しの行) |
    | 10 | ラベル | 結果の行 | [結果の行](#結果の行) |

=== "使わなかった予定がある"

    照合の結果があり、Google カレンダーの予定のうち照合に使わなかったものがあるとき。

    <iframe class="mock" title="照合の結果の、使わなかった予定がある" src="mocks/02-warnings.html"></iframe>
    <a class="mock-open" href="mocks/02-warnings.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | リンク | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ラベル | ログインした職員 | [ログインした職員](#ログインした職員) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | ページの題 | [ページの題](#ページの題) |
    | 5 | リンク | 別のファイルで照合する | [別のファイルで照合する](#別のファイルで照合する) |
    | 6 | ボタン | CSV をダウンロード | [CSV をダウンロード](#csv-をダウンロード) |
    | 7 | ラベル | 区分ごとの件数 | [区分ごとの件数](#区分ごとの件数) |
    | 8 | メッセージ | 照合に使わなかった予定 | [照合に使わなかった予定](#照合に使わなかった予定) |
    | 9 | 表 | 結果の表 | [結果の表](#結果の表) |
    | 10 | ラベル | 区分の見出しの行 | [区分の見出しの行](#区分の見出しの行) |
    | 11 | ラベル | 結果の行 | [結果の行](#結果の行) |

=== "結果が無い"

    画面を読み直したか、URL を直に開いたとき。照合の結果は保存せず、ブラウザの中にだけ置くので、読み直すと消える。保存しないのは、PRD の Non-Goals の「照合の結果の保存」に従うためである。

    <iframe class="mock" title="照合の結果の、結果が無い" src="mocks/03-empty.html"></iframe>
    <a class="mock-open" href="mocks/03-empty.html" target="_blank">別タブで開く</a>

    | 番号 | 種別 | 要素名 | 仕様 |
    | --- | --- | --- | --- |
    | 1 | リンク | ナビゲーション | [ナビゲーション](#ナビゲーション) |
    | 2 | ラベル | ログインした職員 | [ログインした職員](#ログインした職員) |
    | 3 | ボタン | ログアウト | [ログアウト](#ログアウト) |
    | 4 | ラベル | 結果が無いことの題 | [結果が無いことの題](#結果が無いことの題) |
    | 5 | リンク | 照合の画面へ | [照合の画面へ](#照合の画面へ) |

## ナビゲーション

**概要**: 予定と照合の画面を行き来する。

**値のソース**: 「予定」と「照合」のリンク。この画面では「照合」を今の画面として示す。

**活性条件**: 常に活性

**表示条件**: 常に表示

**カタログ**: [SiteNav の Receipt](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-sitenav--receipt)

### インタラクション

#### 1. 「予定」を押す

1. 予定のカレンダーへ移る。照合の結果は消える。

#### 2. 「照合」を押す

1. 照合の画面へ移る。照合の結果は消える。

## ログインした職員

**概要**: ログインしている職員を示す。

**値のソース**: 職員の名前。

**活性条件**: 常に活性

**表示条件**: ログインしているとき。幅 768px 未満では出さない

**カタログ**: [ViewerMenu の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-viewermenu--default)

## ログアウト

**概要**: ログアウトする。

**値のソース**: 「ログアウト」

**活性条件**: 常に活性

**表示条件**: BFF を通して API を呼ぶ動かし方で、ログインしているとき

**カタログ**: [ViewerMenu の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-common-viewermenu--default)

### インタラクション

#### 1. 押す

1. ログアウトし、ログインの画面へ移る。

## ページの題

**概要**: 何の結果かを示す。

**値のソース**: 「照合の結果」と、予定の取り方。Google カレンダーから取ったときは「予定: <年> 年 <月> 月の Google カレンダー」、予定の CSV のときは「予定: 予定の CSV」。

**活性条件**: 常に活性

**表示条件**: 照合の結果があるとき

**カタログ**: [ReceiptResultView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultview--default)

## 別のファイルで照合する

**概要**: 照合の画面に戻り、照合し直す。

**値のソース**: 「別のファイルで照合する」

**活性条件**: 常に活性

**表示条件**: 照合の結果があるとき

**カタログ**: [ReceiptResultView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultview--default)

### インタラクション

#### 1. 押す

1. 照合の画面を読み込む。今の結果は消える。

## CSV をダウンロード

**概要**: 結果の表と同じ内容を CSV で保存する。

**値のソース**: 「CSV をダウンロード」

**活性条件**: 常に活性

**表示条件**: 照合の結果があるとき

**カタログ**: [ReceiptResultView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultview--default)

### インタラクション

#### 1. 押す

1. 結果の CSV を保存させる。元の照合のアプリの CSV と、行と印を同じにする。
   - ファイル名は `照合結果_<対象の月>.csv`。予定の CSV で照合したときは `照合結果_<照合した日の YYYY-MM-DD>.csv`
   - 文字コードは BOM 付きの UTF-8 で、行は CRLF で区切る。Excel で開いても文字化けしないためである
   - 1 行目は列の名前。その後に区分ごとに、区分の名前と `---` の区切りの行、区分の行を並べる
   - 値は、区切り、引用符、改行を含む値と空白で始まる値を引用符で囲む
   - 値と印は、結果の表と同じ文字列にする

## 区分ごとの件数

**概要**: 4 つの区分の件数を示す。

**値のソース**: 「不整合データ」「予定のみ」「実績のみ」「整合データ」と、それぞれの件数。

**活性条件**: 常に活性

**表示条件**: 照合の結果があるとき

**カタログ**: [ReceiptResultView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultview--default)

## 照合に使わなかった予定

**概要**: Google カレンダーの予定のうち、照合に使わなかったものを示し、直すよう案内する。

**値のソース**: 「照合に使わなかった予定（<件数> 件）」、「次の Google カレンダーの予定は、照合に使いませんでした。予定を直して、もう一度照合してください。」と、予定の開始の日時と理由の一覧。予定の題名は出さない。

**活性条件**: 常に活性

**表示条件**: 照合に使わなかった予定が 1 件以上あるとき

**カタログ**: [ReceiptResultView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultview--default)

## 結果の表

**概要**: 予定と実績の対を、区分ごとに並べる。横に送れ、送っても訪問日の列は左端に残る。

**値のソース**: 列は「訪問日」「利用者名」「主訪問者」「サービス内容_予定」「開始時間_予定」「終了時間_予定」「提供時間_予定」「サービス内容_実績」「開始時間_実績」「終了時間_実績」「提供時間_実績」「加算」の順。列の名前と並びは、元の照合のアプリの CSV に合わせる。

- 片側の無い行の、無い側の値と、空の提供時間は「データなし」にする。実績に加算が無ければ、加算は空欄にする。
- 不整合の行
  - 開始時間、サービス内容、提供時間の一致のどれかが合わなければ、予定と実績の両方に「 ❌」を付ける。
  - 終了時間と提供時間が許容範囲を外れたら、その側に「 ❌ (最小~最大)」を付ける。範囲の無いサービス内容は「 ❌」だけにする。
  - 加算が通常の 1 つでなければ、加算に「 ※」を付ける。
- 整合の行
  - 提供時間が違えば、両側の提供時間に「 ※ (最小~最大)」を付ける。
  - 終了時間が違えば、両側の終了時間に「 ※」を付ける。
- 「❌」の付いた値は危険の背景、「※」の付いた値は注意の背景の色にする。

**活性条件**: 常に活性

**表示条件**: 照合の結果があるとき

**カタログ**: [ReceiptResultView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultview--default)

## 区分の見出しの行

**概要**: 区分の区切りを示す。

**値のソース**: 「不整合データ（3 件）」の形。行の無い区分も出す。表を横に送っても、文字は左端に残る。

**活性条件**: 常に活性

**表示条件**: 照合の結果があるとき。4 つの区分ごとに 1 行

**カタログ**: [ReceiptResultView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultview--default)

## 結果の行

**概要**: 1 つの予定と実績の対を示す。

**値のソース**: 結果の表の列ごとの値と印。

**活性条件**: 常に活性

**表示条件**: 照合の結果があるとき。区分の中の対ごとに 1 行

**カタログ**: [ReceiptResultView の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultview--default)

## 結果が無いことの題

**概要**: 照合の結果が無いことを伝える。

**値のソース**: 「照合の結果がありません」と、「照合の結果は保存しません。画面を読み直したときは、もう一度照合してください。」

**活性条件**: 常に活性

**表示条件**: 照合の結果が無いとき

**カタログ**: [ReceiptResultEmpty の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultempty--default)

## 照合の画面へ

**概要**: 照合の画面に戻る。

**値のソース**: 「照合の画面へ」

**活性条件**: 常に活性

**表示条件**: 照合の結果が無いとき

**カタログ**: [ReceiptResultEmpty の Default](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/story/画面-receipt-receiptresultempty--default)

### インタラクション

#### 1. 押す

1. 照合の画面を読み込む。

## 全体動作

### 初期処理

- 結果は、照合の画面が照合を終えたときにブラウザの中に置く。この画面はサーバーで描画せず、置かれた結果を読む。
- フォーカスは `body` にある。URL の search params は読まない。

## 未決

- 区分で行を絞る操作を足すか。元の照合のアプリには無い。
- 結果の表が数千行になったときに、表示を分けるか。
