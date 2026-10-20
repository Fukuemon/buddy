# ADR-0004: デザインシステムのトークンとコンポーネントの置き場

## Status

提案

## Context

画面のコンポーネントとテーマは apps/web の中にあり、receipt-front から写した色と大きさを使っている。  
照合の画面を足す前に、見た目を揃える基準と、アクセシビリティの基準を決める必要がある。

- 今のテーマには、白の上で 4.5:1 に届かない文字の色がある。主の色 `#4d89c0` は 3.71:1、選ばれていないタブの文字 `#bcbdc1` は 1.88:1 である。入力欄の枠 `#e9e9eb` は 1.21:1 で、文字でないものの基準の 3:1 にも届かない。
- フォーカスの表示はコンポーネントごとに違う。ボタンは青の外枠、入力欄は青の枠と面の色、複数行の入力は青の枠を使う。
- 職員の色は、色相を人数で等分した `hsl(h 65% 45%)` で作るので、色相によっては白の文字が読めない。
- デジタル庁デザインシステム（DADS）は、トークンを npm の `@digital-go-jp/design-tokens` で配っている。2.1.0 は MIT で、`dist/tokens.css` に CSS の変数として色、文字、角丸、影を持つ。余白とフォーカスのトークンは持たない。
  - 出典: [@digital-go-jp/design-tokens](https://www.npmjs.com/package/@digital-go-jp/design-tokens)
- DADS の Tailwind の plugin `@digital-go-jp/tailwind-theme-plugin` 1.0.1 は、v4 の `@theme` を持つ。原色の全ての段を `--color-blue-900` のような名前で Tailwind のテーマに入れる。
  - 出典: [@digital-go-jp/tailwind-theme-plugin](https://www.npmjs.com/package/@digital-go-jp/tailwind-theme-plugin)
- Storybook のカタログは GitHub Pages に公開する。buddy のリポジトリは private だが、Pages の URL を知る人は誰でも開ける。

## Decision

### トークンは DADS の基本、buddy の意味、Tailwind のテーマの 3 段にする

コンポーネントと画面は意味のトークンだけを使い、DADS の段の名前を直に書かない。  
DADS の値を替えても、意味のトークンの参照先を 1 か所直せば画面が追従する。

| 段 | 置き場 | 名前の例 | 書くもの |
| --- | --- | --- | --- |
| DADS の基本 | `@digital-go-jp/design-tokens` の `dist/tokens.css` | `--color-primitive-blue-800`、`--font-size-16`、`--border-radius-8`、`--elevation-3` | 色の階調、文字の大きさと行高、角丸、影の値 |
| buddy の意味 | `packages/ui/src/tokens/semantic.css` | `--buddy-color-primary`、`--buddy-color-border-field` | 用途ごとの名前と、DADS の基本への参照。値は書かない |
| Tailwind のテーマ | `packages/ui/src/tokens/theme.css` | `bg-primary`、`text-caption`、`rounded-8`、`desktop:` | `@theme inline` で意味のトークンをユーティリティにする。Tailwind の既定の色、文字の大きさ、角丸、影、ブレークポイントは消す |

- 値は CSS の変数で持ち、JSON から生成しない。DADS が生成済みの CSS を配っており、buddy が足すのは参照だけなので、生成の手順を持つ理由がない。
- DADS の `@digital-go-jp/design-tokens` は依存にし、バージョンを `2.1.0` に固定する。値を写すと、DADS の修正を手で追い、MIT の表示を自分で持つ必要がある。バージョンを上げるときは、`tokens.css` の差分と、意味のトークンのコントラストを確かめる。
- `@digital-go-jp/tailwind-theme-plugin` は使わない。原色の段がそのまま Tailwind のユーティリティになり、画面が意味のトークンを経ずに `bg-blue-800` と書ける。
- DADS が持たないトークンは、次のように扱う。
  - 余白は、Tailwind の既定の 4px の段を使い、トークンを足さない。DADS は余白を 8px を基準に組む例を示し、トークンにするかは任意としている。
  - フォーカスは、DADS の実装例の値で `focus-ring` のユーティリティを `theme.css` に置く。
  - 文字は、DADS のテキストスタイルのうち 6 つを、`text-caption` のような用途の名前で `theme.css` に置く。
  - 出典: [DADS の余白](https://design.digital.go.jp/dads/foundations/spacing/)
- 意味のトークンの一覧と使い分けは [packages/ui の DESIGN.md](../design/packages/ui.md#トークン) にある。

### 今の画面のテーマは、全ての使い道を意味のトークンに置き換える

今の色、文字の大きさ、角丸、影、ブレークポイントの使い道ごとに、置き換える先を [今の画面のテーマとトークンの対応表](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/current-theme-map.md) に決めた。  
置き換えると、次の箇所の見た目が大きく変わる。

- 主の色が、くすんだ青 `#4d89c0` から DADS のキーカラーの blue-800 `#0031d8` になる。主のボタン、ロゴ、選ばれている選択肢が対象である。
- 入力欄、副のボタン、選択肢の枠が、薄い灰色から solid-gray-600 `#666666` になる。
- フォーカスの表示が、青の 1 重の枠から、DADS の黄と黒の 2 重の枠になる。
- 角丸が、ボタンと入力欄で 15px から 8px、幅の広い画面のダイアログで 24px から 8px になる。
- 14px 未満の文字をなくし、11px と 12px の文字を 14px にする。日の格子の予定は、高さ 20px の枠に文字が収まらなくなることがある。
- 書体が M PLUS 1p から Noto Sans JP になる。
- 職員の色を、白の文字で 4.5:1 以上の 10 色の繰り返しにする。11 人目から色が重なる。

照合の結果の区分と印は、新しい色のトークンを作らず、状態の色に当てる。対応は DESIGN.md に書く。  
照合のドメインの名前を packages/ui に持ち込まないためである。

### packages/ui には、ドメインを持たない Base と Case のコンポーネントを置く

コンポーネントは BCD Design で分類し、名前はドメイン、場面、基本の語の順に並べる。  
packages/ui には Base と Case だけを置き、Domain のコンポーネントは apps/web の `features/<機能>/components` に残す。

- 出典: [BCD Design によるコンポーネントの分類](https://qiita.com/misuken/items/19f9f603ab165e228fe1)

| 今のコンポーネント | 分類 | packages/ui での名前 | 置き場 |
| --- | --- | --- | --- |
| Button | Base | `Button` | `src/base/Button/` |
| Modal | Base | `Modal` | `src/base/Modal/` |
| TextTab | Base | `SegmentedControl` | `src/base/SegmentedControl/` |
| Table | Base | `Table` | `src/base/Table/` |
| Loading | Base | `Loading` | `src/base/Loading/` |
| DatePicker、TimePicker、NumberPicker、TextareaField | Base | 同じ名前 | `src/base/<名前>/` |
| FieldFrame | Base。コンポーネントの中だけで使う | 同じ名前。export しない | `src/base/FieldFrame/` |
| SearchBox | Case（Search が場面） | `SearchBox` | `src/case/SearchBox/` |
| SiteHeader | Domain（buddy の画面の帯） | apps/web に残す | `apps/web/src/components/site/` |
| Schedule で始まるコンポーネント、職員と利用者の選択の一覧 | Domain | apps/web に残す | `apps/web/src/features/schedule/components/` |

- TextTab は、表示の単位と予定の種類の、値を 1 つ選ぶ操作に使っており、切り替える領域（tabpanel）を持たない。DADS のタブは同じ主題の内容を観点で切り替えるコンポーネントなので、ラジオボタンの役割を持つ `SegmentedControl` に名前と役割を替える。タブのコンポーネントは、切り替える領域を持つ画面ができるまで作らない。
  - 出典: [DADS のタブ](https://design.digital.go.jp/dads/components/tab/)
- 入力のコンポーネントは、今と同じく React Hook Form の `control` と `name` を受ける。packages/ui は `react-hook-form` を peer dependency にする。

### アクセシビリティは WCAG 2.2 の AA を基準にし、コンポーネントごとに自動で確かめる

DADS が参照する WCAG 2.2 の AA を基準にし、DADS の指針の値を使う。

- 出典: [DADS のアクセシビリティ](https://design.digital.go.jp/dads/guidance/accessibility/)

| 項目 | 基準 | 確かめ方 |
| --- | --- | --- |
| 文字のコントラスト | 4.5:1 以上。面の上の状態の色の文字も含む | Storybook の a11y のアドオン（axe）を全ての story で動かし、違反をテストの失敗にする |
| 文字でないもののコントラスト | 入力欄と押せる枠の境界、フォーカスの表示が 3:1 以上 | 意味のトークンの組のコントラストを計算する Vitest のテストを置く。axe は枠の色を確かめないため |
| フォーカスの見え方 | 全ての操作できる要素で `focus-ring` を `:focus-visible` に出す | story の play 関数で Tab キーを押し、フォーカスの位置を確かめる |
| ターゲットの大きさ | ボタンは 44×44 CSS px 以上。S のボタンとアイコンのボタンは、見た目の外に押せる領域を広げる | コンポーネントの Vitest のテストで、押せる領域の大きさを確かめる |
| キーボードの操作 | コンポーネントごとの操作を DESIGN.md のコンポーネントの節に書き、その通りに動く | story の play 関数と Vitest で、キーを押した結果を確かめる |

- 出典: [DADS の色](https://design.digital.go.jp/dads/foundations/color/)
- 出典: [DADS のボタンのアクセシビリティ](https://design.digital.go.jp/dads/components/button/accessibility/)

story をテストとして動かすのは、Storybook の Vitest のアドオンにする。`pnpm --filter @buddy/ui test` が、コンポーネントの単体のテストと story のテストの両方を動かす。

### DADS の指針から外れる 3 点は、理由を DESIGN.md に書いて残す

- 予定の作成と編集は、URL を持つモーダルのダイアログに入力のコンポーネントを置く。DADS はモーダルのダイアログをフォームに使わないとしているが、カレンダーの上で予定を作り、閉じてカレンダーに戻る操作を画面仕様が決めている。
  - 出典: [DADS のモーダルダイアログ](https://design.digital.go.jp/dads/components/modal-dialog/)
- 日付と時刻は、ブラウザの `input type="date"` と `type="time"` を使う。DADS は年、月、日を分けた 3 つの入力欄を勧めるが、buddy の日付は近い日を選ぶことが多く、ブラウザのカレンダーから選べる方が手数が少ない。
  - 出典: [DADS の日付ピッカー](https://design.digital.go.jp/dads/components/date-picker/)
- ダイアログの中身を読み込む間も、回転する `Loading` を出す。DADS は回転する表示を画面全体の待ちに限るが、ダイアログは開いている間ほかを操作できないので、画面全体の待ちと同じに扱う。
  - 出典: [DADS のプログレスインジケーター](https://design.digital.go.jp/dads/components/progress-indicator/)

### 文書は、使う側の DESIGN.md と、保守の判断の ADR に分ける

`packages/ui/DESIGN.md` は、画面を作る人とコーディングエージェントが読む。原則、トークンの使い分け、コンポーネントの選び方、Storybook の title の規則を書く。  
トークンの値とコンポーネントの振る舞いはコードを参照先にし、DESIGN.md には値を書き写さない。  
packages/ui の構成を変える判断は ADR に書く。

mitame-ai/design-system（Tezawari）の DESIGN.md と DESIGN.local.md の分け方は採らない。  
mitame-ai/design-system は、パッケージとして配る DESIGN.md と、配らない保守の資料を分けている。packages/ui は外に配らず、保守の判断はこのリポジトリの規則で ADR に書くため、2 つ目の文書を持つ理由がない。  
mitame-ai/design-system の DESIGN.md から、知りたいことごとに参照するファイルを示す表だけを採る。

### Storybook は、apps/web の Storybook を 1 つのカタログにして公開する

カタログは apps/web の Storybook で組み、packages/ui の MDX と story も読み込む。  
apps/web は packages/ui に依存するので、依存の向きを変えずに 1 つのサイドバーと検索で全てを読める。

- packages/ui は自分の Storybook も持つ。コンポーネントを単独で開発し、`pnpm --filter @buddy/ui build-storybook` と story のテストを packages/ui の中で完結させるためである。
- a11y のアドオンの設定と decorator は packages/ui の `.storybook/preview` に置き、apps/web の preview はそれを読み込む。2 つの Storybook で確かめる基準が分かれないようにするためである。
- カタログのページは、はじめに、トークン、コンポーネント、パターン、画面の 5 つに分ける。DADS のサイトと SmartHR Design System のように、原則とトークンとコンポーネントの使い方を読めるサイトにする。
  - 出典: [SmartHR Design System](https://smarthr.design/)
- title は、ファイルの置き場から機械的に決める。規則は DESIGN.md にある。
- カタログに載せるのは、コンポーネントと架空のデータだけにする。Pages の URL を知る人は誰でも開けるためである。

## Considered Options

### トークンの値の置き場

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** `@digital-go-jp/design-tokens` を依存にし、意味のトークンを CSS の変数で参照する | DADS の修正をバージョンの更新で取り込める。MIT の表示はパッケージが持つ | DADS が名前を変えると、意味のトークンの参照を直す必要がある |
| `@digital-go-jp/tailwind-theme-plugin` の v4 の `@theme` を読み込む | Tailwind のテーマを書かずに済む | 原色の全ての段がユーティリティになり、意味のトークンを経ない書き方を止められない。1.0.1 が対応する Figma のバージョンは 2.14.0 までで、tokens の 2.1.0 の 2.18.1 より古い |
| DADS の値を `semantic.css` に写す | 依存が増えない | DADS の修正を手で追う。MIT の表示を自分で持つ |
| トークンを JSON に書き、Style Dictionary で CSS を生成する | CSS 以外の形式にも出せる | CSS 以外で使う場所がない。生成の手順と、生成物のずれの確認が増える |

### カタログの組み方

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** apps/web の Storybook に packages/ui の MDX と story も読ませる | 1 回のビルドで 1 つのサイトになる。原則から画面までを 1 つのサイドバーと検索でたどれる | packages/ui の story を 2 つの Storybook でビルドする |
| Storybook の refs で、apps/web から packages/ui の Storybook を合成する | 2 つの Storybook を独立にビルドできる | 2 つのビルドと公開先を揃える必要がある。refs の URL は開発の時と Pages とで違う。相対の URL で動くかは未確認 |
| 2 つの Storybook を別々に公開し、一覧のページから 2 つへリンクする（kufu-apps の形） | 公開の仕組みが単純になる | 原則とトークンとコンポーネントのサイトと、画面のサイトが分かれ、行き来できない |
| packages/ui の Storybook に apps/web の story も読ませる | packages/ui の中でカタログが完結する | packages/ui が apps/web の import の別名と plugin に依存し、依存の向きが逆になる |

### 文書の分け方

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 使う側の DESIGN.md と、保守の判断の ADR | 使う側は 1 つの文書を読めばよい。判断の経緯は ADR の規則で残る | DESIGN.md に経緯を書かない規則を、書く人が守る必要がある |
| mitame-ai/design-system と同じく DESIGN.md と DESIGN.local.md に分ける | 保守の資料を自由に書ける | 配らないパッケージでは分ける境界がない。ADR と保守の資料に同じ判断が並ぶ |

### 入力のコンポーネントとフォームのライブラリ

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 今と同じく `control` と `name` を受け、`react-hook-form` を peer dependency にする | 呼び出す側を直さずに移せる | packages/ui がフォームのライブラリに依存する |
| `value` と `onChange` だけを受けるコンポーネントにし、React Hook Form との結び付けは apps/web に置く | packages/ui がフォームのライブラリに依存しない | 全ての呼び出す側と結び付けのコンポーネントを書き直す |

## Consequences

### Positive

- 画面の全ての文字が白の面で 4.5:1 以上、入力欄の枠とフォーカスの表示が 3:1 以上になる。
- 画面は Tailwind のユーティリティで意味のトークンしか書けなくなり、色の値を直に書くと見つけられる。
- 原則、トークン、コンポーネント、画面を 1 つのカタログで読める。

### Negative

- 主の色、枠、角丸、フォーカス、書体が変わり、今の画面と見た目が大きく違う。
- コンポーネントを移すときに、Tailwind の既定のユーティリティ（`text-sm`、`rounded-xl` など）を使う箇所を全て書き換える必要がある。
- DADS のバージョンを上げるたびに、`tokens.css` の名前と値の差分を確かめる必要がある。
- カタログに実際の利用者や職員のデータを載せると、URL を知る人に見える。story のデータを作る人が、架空のデータに限る規則を守る必要がある。
