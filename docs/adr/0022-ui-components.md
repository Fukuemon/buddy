# ADR-0022: packages/ui に、ドメインを持たない Base と Case のコンポーネントを置き、DADS の指針から外れる 3 点は理由を DESIGN.md に書く

## Status

承認

## Context

packages/ui に置くコンポーネントと、DADS の指針から外れる使い方の扱いを決める必要がある。

- コンポーネントと画面は、意味のトークンだけを使う。
  - ADR-0004: [デザインシステムのトークンを DADS の基本、buddy の意味、Tailwind のテーマの 3 段にする](0004-design-system.md)

## Decision

### packages/ui には、ドメインを持たない Base と Case のコンポーネントを置く

コンポーネントは BCD Design で分類し、名前はドメイン、場面、基本の語の順に並べる。  
packages/ui には Base と Case だけを置き、Domain のコンポーネントは apps/web の `features/<機能>/components` に置く。

- 出典: [BCD Design によるコンポーネントの分類](https://qiita.com/misuken/items/19f9f603ab165e228fe1)

| コンポーネント | 分類 | 配置先 |
| --- | --- | --- |
| `Button`、`Modal`、`SegmentedControl`、`Table`、`Loading`、`DatePicker`、`TimePicker`、`NumberPicker`、`TextareaField` | Base | `packages/ui/src/base/<名前>/` |
| `FieldFrame` | Base。コンポーネントの中だけで使い、export しない | `packages/ui/src/base/FieldFrame/` |
| `SearchBox` | Case（Search が場面） | `packages/ui/src/case/SearchBox/` |
| `SiteHeader` | Domain（buddy の画面の帯） | `apps/web/src/components/layout/` |
| Schedule で始まるコンポーネント、職員と利用者の選択の一覧 | Domain | `apps/web/src/features/schedule/components/` |

- 表示の単位と予定の種類の、値を 1 つ選ぶ操作は、切り替える領域（tabpanel）を持たないので、ラジオボタンの役割を持つ `SegmentedControl` にする。DADS のタブは同じ主題の内容を観点で切り替えるコンポーネントなので、タブのコンポーネントは、切り替える領域を持つ画面ができるまで作らない。
  - 出典: [DADS のタブ](https://design.digital.go.jp/dads/components/tab/)
- 入力のコンポーネントは、React Hook Form の `control` と `name` を受ける。packages/ui は `react-hook-form` を peer dependency にする。

### DADS の指針から外れる 3 点は、理由を DESIGN.md に書いて残す

- 予定の作成と編集は、URL を持つモーダルのダイアログに入力のコンポーネントを置く。DADS はモーダルのダイアログをフォームに使わないとしているが、カレンダーの上で予定を作り、閉じてカレンダーに戻る操作を画面仕様が決めている。
  - 出典: [DADS のモーダルダイアログ](https://design.digital.go.jp/dads/components/modal-dialog/)
- 日付と時刻は、ブラウザの `input type="date"` と `type="time"` を使う。DADS は年、月、日を分けた 3 つの入力欄を勧めるが、buddy の日付は近い日を選ぶことが多く、ブラウザのカレンダーから選べる方が手数が少ない。
  - 出典: [DADS の日付ピッカー](https://design.digital.go.jp/dads/components/date-picker/)
- ダイアログの中身を読み込む間も、回転する `Loading` を出す。DADS は回転する表示を画面全体の待ちに限るが、ダイアログは開いている間ほかを操作できないので、画面全体の待ちと同じに扱う。
  - 出典: [DADS のプログレスインジケーター](https://design.digital.go.jp/dads/components/progress-indicator/)

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** `control` と `name` を受け、`react-hook-form` を peer dependency にする | 呼び出す側を直さずに移せる | packages/ui がフォームのライブラリに依存する |
| `value` と `onChange` だけを受けるコンポーネントにし、React Hook Form との結び付けは apps/web に置く | packages/ui がフォームのライブラリに依存しない | 全ての呼び出す側と結び付けのコンポーネントを書き直す |

## Consequences

### Positive

- 呼び出す側を直さずに、入力のコンポーネントを packages/ui に移せる。

### Negative

- packages/ui がフォームのライブラリに依存する。
