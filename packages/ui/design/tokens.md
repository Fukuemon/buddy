# buddy のデザインシステムのトークン

デザインシステムの文書のうち、トークンの層と、セマンティックトークン、文字、角丸、影、ブレークポイントの使い方を決める文書。  
原則と画面を作るときの手順は [DESIGN.md](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/DESIGN.md) にある。値は書かず、[DESIGN.md の「知りたいことごとの参照先」](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/DESIGN.md#知りたいことごとの参照先)の表が指すコードを参照先にする。  
色、文字、余白と角丸と影の見本は、カタログの[トークン/色](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/トークン-色--docs)、[トークン/文字](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/トークン-文字--docs)、[トークン/余白と角丸と影](https://buddy-docs.emon-apps.workers.dev/storybook/?path=/docs/トークン-余白と角丸と影--docs)で見る。

トークンは 3 つの層に分かれる。画面とコンポーネントは、テーマ変数のユーティリティだけを書く。

| 層 | ファイル | 持つもの |
| --- | --- | --- |
| プリミティブトークン | `src/tokens/primitive.css` | DADS からコピーした色の階調、文字の大きさと行高、角丸、影の値。名前は `--buddy-primitive-` で始まる |
| セマンティックトークン | `src/tokens/semantic.css` | 面、文字、枠、操作、フォーカス、状態、区別の役割の名前。名前は `--buddy-color-` で始まり、プリミティブトークンを参照する |
| テーマ変数 | `src/tokens/theme.css` | Tailwind の `@theme` に渡す名前。色はセマンティックトークンを、文字、角丸、影はプリミティブトークンを参照する |

- セマンティックトークンは、DADS のセマンティックカラー（成功、エラー、警告の色）より広い。面、文字、枠、操作の役割を表す変数も含む。
- 層の呼び名は、DADS の変数の名前（`--color-primitive-*`、`--color-semantic-*`）と、Tailwind CSS の theme variables に合わせている。
  - 出典: [DADS のカラー](https://design.digital.go.jp/dads/foundations/color/)
  - 出典: [Tailwind CSS の Theme variables](https://tailwindcss.com/docs/theme)

## 色

ユーティリティの名前は、Tailwind の `bg-`、`text-`、`border-`、`ring-` の後ろに、表の名前を付けたもの。  
例として、`--color-primary` は `bg-primary`、`text-primary`、`ring-primary` で使う。

| 名前 | 使う場面 |
| --- | --- |
| `surface` | カード、入力欄、ダイアログ、ヘッダーの背景 |
| `surface-canvas` | 画面の背景（`body`）。カードと入力欄を置く下地 |
| `surface-subtle` | 切り替えの背景、押せる行の hover |
| `surface-disabled` | 無効のボタンの背景 |
| `overlay` | ダイアログの後ろを覆う面 |
| `text` | 本文、見出し、入力した値 |
| `text-secondary` | 補足、項目のラベル、表の見出し、プレースホルダー |
| `text-disabled` | 無効のコンポーネントの文字。ほかの文字には使わない |
| `text-inverse` | `primary` と `categorical-*` の面の上の文字 |
| `border` | 行と帯の区切り、格子の線。押せるものの境界には使わない |
| `border-strong` | 表の見出しの行とデータの行の区切り |
| `border-field` | 入力欄、副のボタン、選択肢の枠。押せるものと入力できるものの境界 |
| `border-field-hover` | マウスを乗せた入力欄の枠 |
| `primary` | 主のボタンの面、副のボタンの文字、選ばれている選択肢の枠、リンク |
| `primary-surface` | 選ばれている選択肢の面、入力中の欄の面、カレンダーの今日 |
| `danger`、`danger-surface` | エラーの文と枠、取り消せない操作のボタン |
| `danger-hover` | マウスを乗せた、誤りのある入力欄の枠 |
| `warning`、`warning-surface` | 確認してほしい値。エラーではないもの |
| `success`、`success-surface` | 完了と整合 |
| `categorical-1` から `categorical-10` | 職員のように、意味を持たない並びの区別。番号の順に割り当て、11 個目からは 1 に戻る。`primary` と状態の色に近い青、緑、橙、赤は、6 番目より後ろに置き、選ばれている表示や状態と見分けられるようにする |
| `team-blue`、`team-orange`、`team-magenta`、`team-cyan`、`team-yellow`、`team-purple`、`team-green`、`team-lime` | 職員と利用者の一覧と、カレンダーの職員の絞り込みの見出しで、名前の横に置く、チームの色の点。面と文字には使わない |

背景を指定しない要素は `surface-canvas` の色になるので、カード、表、入力欄には `bg-surface` を付ける。

- ADR-0013: [デザインシステムのトークンを、buddy に持つプリミティブトークン、セマンティックトークン、テーマ変数の 3 つの層にする](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0013-design-system-primitive-tokens.md)

`*-surface` の面の上の文字は、同じ系統の文字の色（`danger-surface` の上なら `danger`）か `text` にする。  
どちらも 4.5:1 以上になる。

照合の結果の表示は、照合のための色を作らず、状態の色に当てる。

| 照合の表示 | 色 | 色と一緒に出すもの |
| --- | --- | --- |
| 不一致の印（規則に合わない値） | `danger` のアイコン、`danger-surface` の面 | 丸の中に「!」のアイコン、読み上げの「（不一致）」、確認することの文、印の意味 |
| 注意の印（範囲の中だが予定と違う値） | `warning` のアイコン、`warning-surface` の面 | 三角のアイコン、読み上げの「（注意）」、確認することの文、印の意味 |
| 区分の区切り | `surface-subtle` | 区分の名前 |
| 空の提供時間の「データなし」 | `text-secondary` | 文字 |

- 不一致と注意は、色のほかに、アイコンの形と文で見分けられるようにする。
- 印の付いたセルの値と範囲の文字は `text` にする。

- 出典: [レセプトの照合の Design Doc の、画面が JSON から作る表示](https://github.com/Fukuemon/buddy/blob/develop/services/receipt/DesignDoc.md#画面が-json-から作る表示)

### チームの色

チームの色は、チームが持つ値（`blue` など）に `team-` を付けたトークンで塗る。  
値の一覧と、色を省いて作ったチームに入る色の順は、[予定の管理の Design Doc](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md) にある。

- 点は、チームの名前か職員の名前と並べて出し、色だけでチームを伝えない。
- 8 色は、DADS の 10 の色相から、`primary` に近い light-blue と、`danger` と紛れる red を除いた 8 つである。
- 区別の色は 800 から 1000 の濃い段を使うので、チームの色は、同じ色相の明るい段から選ぶ。
  - カレンダーの職員の絞り込みで、職員の色のチェックボックスとチームの点が並んでも、明るさで見分けられる。
- チームの色の段は、`surface`、`surface-canvas`、`surface-subtle`、`primary-surface` の全てに対して、文字でないもののコントラストの 3:1 に届くもののうち、最も明るいものにした。
- 組のコントラストは `pnpm check:contrast` が計算する。

| トークン | DADS の値 | 4 つの面に対する最小のコントラスト比 | 同じ色相の区別の色 |
| --- | --- | --- | --- |
| `team-blue` | `blue-500` | 3.51 | `categorical-6`（`blue-800`） |
| `team-orange` | `orange-700` | 3.47 | `categorical-8`（`orange-900`） |
| `team-magenta` | `magenta-600` | 3.73 | `categorical-3`（`magenta-800`） |
| `team-cyan` | `cyan-700` | 3.50 | `categorical-2`（`cyan-900`） |
| `team-yellow` | `yellow-800` | 3.30 | `categorical-5`（`yellow-1000`） |
| `team-purple` | `purple-500` | 3.22 | `categorical-1`（`purple-800`） |
| `team-green` | `green-600` | 3.08 | `categorical-7`（`green-800`） |
| `team-lime` | `lime-800` | 3.49 | `categorical-4`（`lime-900`） |

- `team-lime` と `team-green`、`team-lime` と `categorical-4` は、8 色の中で色の差が最も小さい組である。
  - lime の明るい段は 3:1 に届かないので、これ以上離せない。色を省いて作るときの順で、lime を最後に置いた。
- 出典: [DADS の色](https://design.digital.go.jp/dads/foundations/color/)

## 文字

書体は `font-sans`（Noto Sans JP）だけを使う。  
文字の大きさは、次の 6 つのユーティリティで、大きさと行高と文字の間隔をまとめて決める。  
太さを変えるときだけ `font-bold` を足す。

| ユーティリティ | DADS のスタイル | 使う場面 |
| --- | --- | --- |
| `text-caption` | Dns-14N-130 | 補足の文、エラーの文、時刻の目盛り、カレンダーの予定 |
| `text-body-dense` | Dns-16N-130 | 表のセル、入力欄の値、選択肢の文字 |
| `text-body` | Std-16N-170 | 本文。`body` のデフォルト |
| `text-label` | Oln-16B-100 | ボタン、切り替えの選択肢 |
| `text-heading-sm` | Std-18B-160 | セクションの見出し、ダイアログのタイトル、ロゴ |
| `text-heading-md` | Std-20B-150 | 画面の見出し、画面全体の待ちの文 |

- 出典: [DADS のタイポグラフィ](https://design.digital.go.jp/dads/foundations/typography/)

## 角丸、影、ブレークポイント

| 種類 | ユーティリティ | 使う場面 |
| --- | --- | --- |
| 角丸 | `rounded-8` | ボタン、入力欄、選択肢のカード、ダイアログ |
| 角丸 | `rounded-6` | 枠の内側に置くコンポーネント（切り替えのつまみ） |
| 角丸 | `rounded-4` | カレンダーの予定のような小さい面 |
| 角丸 | `rounded-full` | スピナー、丸いアイコン |
| 影 | `shadow-1` | スクロールしても上に残る見出しの行 |
| 影 | `shadow-3` | ダイアログ |
| ブレークポイント | `desktop:` | 幅 768px 以上。未満では、ダイアログを画面いっぱいに出し、段組みを 1 列にする |

影は、重なりの高さを示すときだけ使い、ボタンと入力欄の飾りには使わない。  
DADS は、重ねて出すものを下のコンポーネントより 2 段以上高い影にすると決めている。

- 出典: [DADS のエレベーション](https://design.digital.go.jp/dads/foundations/elevation/)

