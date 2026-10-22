# buddy のデザインシステム

buddy の画面を作る人とコーディングエージェントが、画面を作る前に読む文書。  
デジタル庁デザインシステム（DADS）のトークンとコンポーネントの指針に基づき、packages/ui のトークンとコンポーネントの使い方を決める。  
トークンの段の分け方、コンポーネントの配置先、カタログの組み方を決めた理由は [ADR-0004](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0004-design-system.md) にある。

- 出典: [デジタル庁デザインシステム](https://design.digital.go.jp/dads/)

トークンとコンポーネントの見た目と使い方は、[カタログ（Storybook）](https://buddy-docs.emon-apps.workers.dev/storybook/)で見る。カタログは Cloudflare Access で許可した人だけが開ける。ローカルでは `pnpm --filter @buddy/web storybook` で開く。

## 知りたいことごとの参照先

この文書には、使い方の規則だけを書き、値と振る舞いはコードを参照先にする。

| 知りたいこと | 参照先 |
| --- | --- |
| 色、文字、角丸、影の値 | DADS の `@digital-go-jp/design-tokens` の `dist/tokens.css` |
| 意味のトークンの名前と、DADS のどの値を指すか | [`src/tokens/semantic.css`](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/semantic.css) |
| Tailwind のユーティリティの名前 | [`src/tokens/theme.css`](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/theme.css) |
| トークンに置き換える前の apps/web の値が、どのトークンになったか | [置き換える前のテーマとトークンの対応表](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/current-theme-map.md) |
| コンポーネントの props と振る舞い | `src/base/` と `src/case/` のコンポーネントのコードと story |
| 構成の判断と、却下した案 | `docs/adr/` の ADR |

## 画面を作るときの原則

- 色、文字、角丸、影は、`theme.css` のユーティリティだけで書く。色の値と、DADS の変数の名前を、画面のコードに直に書かない。
- 状態を色だけで伝えない。エラー、不一致、注意には、文と印を色と一緒に出す。
- 14px より小さい文字を使わない。本文と操作の文字は 16px にし、14px は補足だけに使う。
- 主のボタン（`variant="primary"`）は、1 つの画面かダイアログに 1 つまでにする。
- フォーカスの表示は `focus-ring` だけを使い、コンポーネントごとに色や太さを変えない。DADS の指針が変更を禁じている。
- 押せる領域は 44×44 CSS px 以上にする。見た目を小さくするときは、見た目の外に押せる領域を広げる。
- 余白は Tailwind の段（1 段 4px）で書く。ブロックの間は 8px の倍数（`gap-2`、`gap-4`、`gap-6`）にする。

## トークン

### 色

ユーティリティの名前は、Tailwind の `bg-`、`text-`、`border-`、`ring-` の後ろに、表の名前を付けたもの。  
例として、`--color-primary` は `bg-primary`、`text-primary`、`ring-primary` で使う。

| 名前 | 使う場面 |
| --- | --- |
| `surface` | 画面、カード、入力欄、ダイアログの地 |
| `surface-subtle` | 切り替えの溝、押せる行の hover |
| `surface-disabled` | 無効のボタンの地 |
| `overlay` | ダイアログの後ろの幕 |
| `text` | 本文、見出し、入力した値 |
| `text-secondary` | 補足、項目のラベル、表の見出し、プレースホルダー |
| `text-disabled` | 無効のコンポーネントの文字。ほかの文字には使わない |
| `text-inverse` | `primary` と `categorical-*` の面の上の文字 |
| `border` | 行と帯の区切り、格子の線。押せるものの境界には使わない |
| `border-field` | 入力欄、副のボタン、選択肢の枠。押せるものと入力できるものの境界 |
| `primary` | 主のボタンの面、副のボタンの文字、選ばれている選択肢の枠、リンク |
| `primary-surface` | 選ばれている選択肢の面、入力中の欄の面、カレンダーの今日 |
| `danger`、`danger-surface` | エラーの文と枠、取り消せない操作のボタン |
| `warning`、`warning-surface` | 確かめてほしい値。エラーではないもの |
| `success`、`success-surface` | 完了と整合 |
| `categorical-1` から `categorical-10` | 職員のように、意味を持たない並びの区別。番号の順に割り当て、11 個目からは 1 に戻る |

`*-surface` の面の上の文字は、同じ系統の文字の色（`danger-surface` の上なら `danger`）か `text` にする。どちらも 4.5:1 以上になる。

照合の結果の表示は、照合のための色を作らず、状態の色に当てる。

| 照合の表示 | 色 | 色と一緒に出すもの |
| --- | --- | --- |
| 不整合の区分の区切り、規則に合わない値の印 | `danger` | 区分の名前、印の文字と許容範囲（例は「(20~29)」） |
| 予定のみと実績のみの区分の区切り | `warning` | 区分の名前 |
| 整合のままの注意の印、加算の注意の印 | `warning` | 印の文字「※」 |
| 整合の区分の区切り | `success` | 区分の名前 |
| 片側がない欄の「データなし」 | `text-secondary` | 文字 |

- 出典: [レセプトの照合の Design Doc の、画面が JSON から作る表示](https://github.com/Fukuemon/buddy/blob/develop/services/receipt/DesignDoc.md#画面が-json-から作る表示)

### 文字

書体は `font-sans`（Noto Sans JP）だけを使う。  
文字の大きさは、次の 6 つのユーティリティで、大きさと行高と文字の間隔をまとめて決める。太さを変えるときだけ `font-bold` を足す。

| ユーティリティ | DADS のスタイル | 使う場面 |
| --- | --- | --- |
| `text-caption` | Dns-14N-130 | 補足の文、エラーの文、時刻の目盛り、カレンダーの予定 |
| `text-body-dense` | Dns-16N-130 | 表のセル、入力欄の値、選択肢の文字 |
| `text-body` | Std-16N-170 | 本文。`body` のデフォルト |
| `text-label` | Oln-16B-100 | ボタン、切り替えの選択肢 |
| `text-heading-sm` | Std-18B-160 | 節の見出し、ダイアログのタイトル、ロゴ |
| `text-heading-md` | Std-20B-150 | 画面全体の待ちの文 |

- 出典: [DADS のタイポグラフィ](https://design.digital.go.jp/dads/foundations/typography/)

### 角丸、影、ブレークポイント

| 種類 | ユーティリティ | 使う場面 |
| --- | --- | --- |
| 角丸 | `rounded-8` | ボタン、入力欄、選択肢のカード、ダイアログ |
| 角丸 | `rounded-6` | 枠の内側に置くコンポーネント（切り替えのつまみ） |
| 角丸 | `rounded-4` | カレンダーの予定のような小さい面 |
| 角丸 | `rounded-full` | 読み込みの輪、丸いアイコン |
| 影 | `shadow-1` | スクロールしても上に残る見出しの行 |
| 影 | `shadow-3` | ダイアログ |
| ブレークポイント | `desktop:` | 幅 768px 以上。未満では、ダイアログを画面いっぱいに出し、段組みを 1 列にする |

影は、重なりの高さを示すときだけ使い、ボタンと入力欄の飾りには使わない。  
DADS は、重ねて出すものを下のコンポーネントより 2 段以上高い影にすると決めている。

- 出典: [DADS のエレベーション](https://design.digital.go.jp/dads/foundations/elevation/)

## コンポーネントの選び方

コンポーネントは、BCD Design の Base（基本のコンポーネント）と Case（場面を持つコンポーネント）だけを packages/ui に置く。  
予定や職員のようなドメインの名前を持つコンポーネントは、apps/web の `features/<機能>/components` に置く。  
名前は、ドメイン、場面、基本の語の順に並べる（例は `StaffSearchBox`）。  
`src/icons/` には、packages/ui のコンポーネントが中で使う印（SVG を描くコンポーネント）を置く。  
印は `index.ts` から export せず、カタログにも載せない。  
apps/web の画面だけが使う印は、`apps/web/src/assets/icons/` の SVG を使う。

| コンポーネント | 使う場面 | 使わない場面 | キーボード |
| --- | --- | --- | --- |
| `Button` | 操作を 1 つ実行する | 画面を移る（`Link` に `buttonClassName` を渡す） | Tab で移り、Enter と Space で押す。押せない間は `aria-disabled` にし、フォーカスは受ける |
| `Modal` | 今の画面の上で、予定の詳細や入力を行い、閉じて元の画面に戻る | 完了の通知、ナビゲーション | 開くとタイトルにフォーカスが移る。Tab はダイアログの中だけを回る。Esc で閉じる要求を出す。閉じると、開いたボタンにフォーカスが戻る |
| `Drawer` | 幅 768px 未満で、PC の幅では常に出す絞り込みを、ボタンで左端から開閉する | 予定の詳細や入力（`Modal` を使う）、PC の幅で常に出せるもの | 開くとタイトルにフォーカスが移る。Tab はドロワーの中だけを回る。Esc で閉じる要求を出す。閉じると、開いたボタンにフォーカスが戻る。開くボタンには `aria-expanded` と `aria-controls` を付ける |
| `SegmentedControl` | 2 から 4 個の選択肢から 1 つを選び、すぐに表示を切り替える（表示の単位、予定の種類） | 選択肢が 5 個以上、送信するまで反映しない入力 | Tab で選ばれている選択肢に移り、← と → で選び直す |
| `Table` | 同じ項目を持つ行を並べる | 項目名と値の組（`dl` を使う） | コンポーネントの操作はない。見出しのセルは `th` にする |
| `Loading` | 画面全体かダイアログの中身を待つ | ボタンを押した後の待ち（`Button` の `isLoading` を使う）、画面の一部の待ち | 操作はない。`aria-live` で待ちを伝える |
| `DatePicker`、`TimePicker` | 日付と時刻を 1 つ入力する | 生年月日のように遠い日付 | ブラウザの入力欄の操作に従う |
| `NumberPicker` | 分のような、単位の決まった数を入力する | 電話番号や番号のように、計算しない数字 | ブラウザの入力欄の操作に従う |
| `TextareaField` | 複数行の文を入力する | 1 行で足りる名前やタイトル | Tab で移る。改行は Enter |
| `SearchBox` | 一覧を語で絞り込む | 決まった選択肢から選ぶ（`SegmentedControl` か選択肢のカード） | Tab で移る。Esc で語を消す。見えるラベルがないので `aria-label` を渡す |

入力のコンポーネントは、ラベルを入力欄に結び付け、エラーがあれば `aria-invalid` と、エラーの文への `aria-describedby` を付ける。

- 出典: [DADS のコンポーネント](https://design.digital.go.jp/dads/components/)

### DADS の指針との違い

| コンポーネント | DADS の指針 | buddy の使い方 | 理由 |
| --- | --- | --- | --- |
| `Modal` | モーダルのダイアログをフォームに使わない | 予定の作成と編集をダイアログで行う | カレンダーの上で予定を作り、閉じてカレンダーに戻る流れを画面仕様が決めている |
| `DatePicker`、`TimePicker` | 年、月、日を 3 つの入力欄に分ける。`input type="date"` を避ける | ブラウザの `type="date"` と `type="time"` を使う | 予定の日付は近い日を選ぶことが多く、ブラウザのカレンダーから選ぶ方が手数が少ない |
| `Loading` | 回転する表示は画面全体の待ちだけに使う | ダイアログの中身の待ちにも使う | ダイアログを開いている間はほかを操作できず、画面全体の待ちと同じになる |

## Storybook のカタログ

[カタログ](https://buddy-docs.emon-apps.workers.dev/storybook/)は apps/web の Storybook で組み、packages/ui の MDX と story も読み込む。  
packages/ui の Storybook は、コンポーネントを単独で開発し、story のテストを実行するために使う。

### カタログのページ

| ページ | 書くこと | 配置先 |
| --- | --- | --- |
| はじめに | 原則、アクセシビリティの基準 | `packages/ui/src/docs/*.mdx` |
| トークン | 色の階調と意味のトークン（`ColorPalette`）、文字（`Typeset`）、余白、角丸、影 | `packages/ui/src/tokens/*.mdx` |
| コンポーネント | コンポーネントごとの MDX。使う場面、使わない場面、Do と Don't、状態、キーボードの操作 | `packages/ui/src/base/<コンポーネント>/`、`packages/ui/src/case/<コンポーネント>/` |
| パターン | コンポーネントを組み合わせた形（入力のダイアログ、絞り込みの一覧） | `packages/ui/src/patterns/`。パターンを作るときの配置先で、ディレクトリはパターンを作るときに作る |
| 画面 | apps/web のコンポーネントと画面の story | `apps/web/src/features/<機能>/components/`、`apps/web/src/components/` |

コンポーネントの MDX の「状態」には、デフォルト、hover、フォーカス、無効、エラー、読み込みのうち、そのコンポーネントが持つものを全て story で並べる。

### title の規則

title は、ファイルの配置先から機械的に決め、story を作るときに分類を判断しない。

| 配置先 | title |
| --- | --- |
| `packages/ui/src/docs/<名前>.mdx` | `はじめに/<名前>` |
| `packages/ui/src/tokens/<名前>.mdx` | `トークン/<名前>` |
| `packages/ui/src/base/<コンポーネント>/` | `コンポーネント/Base/<コンポーネント>` |
| `packages/ui/src/case/<コンポーネント>/` | `コンポーネント/Case/<コンポーネント>` |
| `packages/ui/src/patterns/<名前>.*` | `パターン/<名前>` |
| `apps/web/src/features/<機能>/components/<コンポーネント>.stories.tsx` | `画面/<機能>/<コンポーネント>`。`<機能>` は kebab-case のディレクトリ名を PascalCase にしたもの（`schedule` から `Schedule`） |
| `apps/web/src/components/<ディレクトリ>/<コンポーネント>.stories.tsx` | `画面/Common/<コンポーネント>` |

サイドバーの並びは、はじめに、トークン、コンポーネント、パターン、画面の順にする。

### カタログに載せてよいもの

カタログは文書のサイトの `/storybook/` として Cloudflare に公開し、Cloudflare Access で許可した人だけが開ける（`apps/docs-site/README.md`）。許可した人の範囲は変わりうるので、story と MDX には、コンポーネントとダミーデータだけを載せる。

- 利用者と職員の名前、事業所、予定は、`青木 一郎` のようなダミーの値にする。実際の画面やデータベースからコピーしない。
- API を呼ぶ story を作らない。データは story の中か、ダミーデータのファイルから渡す。
- story と MDX に、URL、ホスト名、シークレットを書かない。この規則は story と MDX だけに当てはまり、この文書と画面仕様書からカタログへのリンクは、カタログの URL で書く。
