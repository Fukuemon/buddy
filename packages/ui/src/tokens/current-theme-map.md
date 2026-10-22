# 置き換える前のテーマとトークンの対応表

apps/web の `src/styles.css` の `@theme` と、コンポーネントのクラスに直に書いていた値を、どのトークンに置き換えたかの記録。  
対象は、コミット 9c49946 の `apps/web/src` にあった全ての色、文字の大きさ、角丸、影、ブレークポイントの使い道。  
置き換えは済み、apps/web は `theme.css` のユーティリティで書く。  
この表は、置き換えで見た目がどう変わったかを辿るときに読む。  
トークンの定義は同じディレクトリの `semantic.css` と `theme.css` にある。

「見た目」の列は、置き換えたときの変わり方を、ほぼ同じ、小、大の 3 段で書く。  
大は、並べて見比べなくても違いが分かる変化を指す。

## 色

| 置き換える前の名前と値 | 置き換える前の使い道 | 置き換えた先 | DADS の値 | 見た目 |
| --- | --- | --- | --- | --- |
| `text-default` `#09090b` | 本文の文字 | `text` | solid-gray-900 `#1a1a1a` | ほぼ同じ |
| `gray-1000` `#09090b` | 選ばれているタブの文字 | `text` | solid-gray-900 `#1a1a1a` | ほぼ同じ |
| `text-secondary` `#71737f` | 補足の文字、表の見出し、項目のラベル | `text-secondary` | solid-gray-600 `#666666` | 小。少し濃くなる |
| `gray-500` `#71737f` | プレースホルダー、時計のアイコン、ボタンの読み込みの輪、色のない職員の予定 | `text-secondary`。予定は `categorical-*` | solid-gray-600 `#666666` | 小 |
| `gray-400` `#bcbdc1` | 選ばれていないタブの文字 | `text-secondary` | solid-gray-600 `#666666` | 大。白の上で 1.88:1 から 5.74:1 になる |
| `gray-400` `#bcbdc1` | 無効のボタンと入力欄の文字、無効の文字のボタン | `text-disabled` | solid-gray-420 `#949494` | 小。少し濃くなる |
| `text-critical` `#c11111` | 削除のボタンの文字 | `danger` | red-900 `#ce0000` | 小。少し明るい赤になる |
| `incorrect-main` `#c11111` | エラーの文、入力欄のエラーの枠、カレンダーの現在時刻の線 | `danger` | red-900 `#ce0000` | 小 |
| `incorrect-bg` `#fff2f2` | 使っていない | `danger-surface` | red-50 `#fdeeee` | 変化なし |
| `action-main` `#4d89c0` | 主のボタンの面、副のボタンの文字、選ばれている選択肢の枠、ロゴ、読み込みの輪と文、文字のボタン | `primary` | light-blue-800 `#0066be` | 小。同じ色相のまま少し濃くなる |
| `action-main` `#4d89c0` | ボタンと検索欄のフォーカスの枠、入力中の欄の枠 | `focus-ring` のユーティリティ | 黒と yellow-300 `#ffd43d` | 大。青の 1 重の枠から、黄と黒の 2 重の枠になる |
| `action-bg` `#edf3ff` | 選ばれている選択肢の面、入力中の欄の面、カレンダーの今日の面 | `primary-surface` | light-blue-50 `#f0f9ff` | ほぼ同じ |
| `correct-main` `#00ad64`、`correct-bg` `#e6fdf0` | 使っていない | `success`、`success-surface` | green-800 `#197a4b`、green-50 `#e6f5ec` | 変化なし |
| `non-active-main` `#ffb800`、`non-active-bg` `#fff8e6` | 使っていない | `warning`、`warning-surface` | orange-900 `#ac3e00`、orange-50 `#ffeee2` | 変化なし |
| `gray-0` `#fff`、`background-default` `#fff` | 面、カードと入力欄の地 | `surface`。画面の地は `surface-canvas` | white `#ffffff`。`surface-canvas` は DADS に無い `#fdfcfb` | ほぼ同じ |
| `gray-0` `#fff`、`text-white`、FullCalendar の `textColor: '#fff'` | 色の面の上の文字 | `text-inverse` | white `#ffffff` | 変化なし |
| `gray-10` `#f5f6f7` | タブの溝、押せる行と格子の hover | `surface-subtle` | solid-gray-50 `#f2f2f2` | ほぼ同じ |
| `gray-100` `#f0f1f2` | 行と帯の区切りの線、タブの溝の枠 | `border` | solid-gray-100 `#e6e6e6` | 小。少し濃くなる |
| `gray-100` `#f0f1f2` | 無効のボタンの面、読み込みの輪の地 | `surface-disabled` | solid-gray-100 `#e6e6e6` | 小 |
| `gray-200` `#e9e9eb` | 入力欄、副のボタン、選択肢、日付の欄の枠 | `border-field` | solid-gray-600 `#666666` | 大。白の上で 1.21:1 の薄い枠が、5.74:1 の濃い枠になる |
| `gray-200` `#e9e9eb` | カレンダーと日の格子の線 | `border` | solid-gray-100 `#e6e6e6` | ほぼ同じ |
| `bg-black/56` | ダイアログの後ろの幕 | `overlay` | opacity-gray-500 `rgba(0,0,0,0.5)` | ほぼ同じ |
| `hsl(<職員の順の色相> 65% 45%)` | カレンダーと日の格子の予定の面 | `categorical-1` から `categorical-10` を職員の順に繰り返す | blue-800 ほか 10 色 | 大。色相の等分をやめるので色が変わり、11 人目から色が重なる |

## 文字

`font-bold` の太さ 700 は、DADS の `--font-weight-700` と同じ値なので変えていない。

| 置き換える前の値 | 置き換える前の使い道 | 置き換えた先 | 見た目 |
| --- | --- | --- | --- |
| `font-sans`: M PLUS 1p、Hiragino Sans、Noto Sans JP | 全体の書体 | `font-sans`: Noto Sans JP | 大。字形が変わる |
| `text-[11px]` | 入力欄の上のラベル、日の格子の予定 | `text-caption`（14px） | 大。予定の文字が高さ 20px の枠に収まらなくなることがある |
| `text-xs`（12px） | エラーの文、項目の要約のラベル、絞り込みの文字のボタン、時刻の目盛り、カレンダーの予定 | `text-caption`（14px） | 小 |
| `text-sm`（14px） | 該当なしの文、終了時刻の表示、詳細の項目名、保存の失敗の文、絞り込みの見出し、日の格子の職員名 | `text-caption`（14px） | ほぼ同じ |
| `text-sm`（14px） | 絞り込みの職員名、サービスコードの選択肢、項目の要約の値 | `text-body-dense`（16px） | 小 |
| `text-[15px]` と `tracking-[0.04em]` | ボタン、タブ | `text-label`（16px、0.02em） | 小 |
| `text-[15px]` | 入力欄の値、表のセル | `text-body-dense`（16px） | 小 |
| `text-[15px]` | ダイアログのタイトル | `text-heading-sm`（18px） | 小 |
| `text-base/relaxed`（16px、1.625） | 本文 | `text-body`（16px、1.7） | ほぼ同じ |
| `text-base`（16px） | 検索欄の値 | `text-body-dense`（16px） | ほぼ同じ |
| `text-lg`（18px） | 一覧と日時の見出し、訪問の種類の見出し、複数行の入力のラベル | `text-heading-sm`（18px） | ほぼ同じ |
| `font-bold`（16px） | サービスコードの見出し | `text-heading-sm`（18px） | 小。ほかの見出しと揃う |
| `text-lg` と `tracking-wide` | 上端の帯のロゴ | `text-heading-sm` | ほぼ同じ |
| `text-xl`（20px） | 画面全体の読み込みの文 | `text-heading-md`（20px） | ほぼ同じ |
| `leading-tight` | 日の格子の予定 | `text-caption` の行高 1.3 | ほぼ同じ |

## 角丸

| 置き換える前の値 | 置き換える前の使い道 | 置き換えた先 | 見た目 |
| --- | --- | --- | --- |
| `rounded-[15px]` | M と L のボタン、入力欄の枠 | `rounded-8` | 大。丸みが半分になる |
| `rounded-[14px]` | 検索欄 | `rounded-8` | 大 |
| `rounded-xl`（12px） | S のボタン、タブの溝、複数行の入力、日付の欄、選択肢のカード、項目の要約 | `rounded-8` | 小 |
| `rounded-[10px]` | 選ばれているタブのつまみ | `rounded-6` | 小 |
| `rounded-lg`（8px） | アイコンのボタン | `rounded-8` | 変化なし |
| `rounded-md`（6px） | 日の格子の予定 | `rounded-4` | 小 |
| `rounded-3xl`（24px）と `rounded-t-3xl`、`rounded-b-3xl` | 幅の広い画面のダイアログと、その上下の帯 | `rounded-8` | 大 |
| `rounded-t-xl`（12px） | 幅の狭い画面のダイアログの上端 | `rounded-8` | 小 |
| `rounded-full` | 読み込みの輪 | `rounded-full` | 変化なし |

## 影

DADS のボタンと入力欄は影を持たないので、コンポーネントの飾りの影は消した。影は、重なりの高さを示すときだけ使う。

| 置き換える前の値 | 置き換える前の使い道 | 置き換えた先 | 見た目 |
| --- | --- | --- | --- |
| `shadow-[inset_0_-2px_0_0_rgb(0_0_0/16%),0_2px_4px_0_rgb(9_9_11/4%)]` | 主のボタン | なし | 小。下端の影が消える |
| `shadow-sm` | 副と削除のボタン | なし | 小 |
| `shadow-[0_1px_2px_0_#e5e5e8]` | 入力欄、検索欄 | なし | 小 |
| `shadow-[0_1px_2px_0_rgb(0_0_0/4%)]` | 選ばれているタブのつまみ | なし。`border-field` の枠で選択を示す | 小 |
| `box-shadow: 2px 0 4px 0 rgb(0 0 0 / 10%)` | カレンダーの固定した見出しの行 | `shadow-1` | 小。影が濃くなる |
| なし | ダイアログ | `shadow-3` | 小。影が付く |

## ブレークポイント

| 置き換える前の値 | 置き換える前の使い道 | 置き換えた先 | 見た目 |
| --- | --- | --- | --- |
| `lg`（45rem、720px） | ダイアログを画面いっぱいに出すかの境、予定の入力の段組み | `desktop`（48rem、768px） | 小。幅 720px から 767px の間で、ダイアログが画面いっぱいになる |
| `md`（Tailwind のデフォルトの 48rem） | カレンダーの操作の帯の並び | `desktop`（48rem） | 変化なし |
