# buddy のデザインシステムのカタログ

デザインシステムの文書のうち、Storybook のカタログのページの組み方と、載せてよいものを決める文書。  
原則と画面を作るときの手順は [DESIGN.md](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/DESIGN.md) にある。

## カタログのページ

| ページ | 書くこと | 配置先 |
| --- | --- | --- |
| はじめに | 原則の ID と、アクセシビリティの基準の項目の一覧 | `packages/ui/src/docs/*.mdx` |
| トークン | 色の階調とセマンティックトークン（`ColorPalette`）、文字（`Typeset`）、余白、角丸、影 | `packages/ui/src/tokens/*.mdx` |
| コンポーネント | コンポーネントごとの MDX。状態の例と、規則を持つデザインシステムの文書のセクションの名前と、当たる原則の ID | `packages/ui/src/base/<コンポーネント>/`、`packages/ui/src/case/<コンポーネント>/` |
| パターン | コンポーネントを組み合わせた形（入力のダイアログの `InputDialog`、確認のダイアログの `ConfirmDialog`）の例と、規則を持つセクションの名前 | `packages/ui/src/patterns/` |
| 画面 | apps/web のコンポーネントと画面の story | `apps/web/src/features/<機能>/components/`、`apps/web/src/components/` |

コンポーネントの MDX の「状態」には、デフォルト、hover、フォーカス、無効、エラー、読み込みのうち、そのコンポーネントが持つものを全て story で並べる。

MDX に、デザインシステムの文書の規則の本文を写さない。

- 規則は、原則の ID と、規則を持つファイルとセクションの名前で指す。MDX には URL を書かないので、リンクにしない。
  - 写した文は、規則を直すたびに合わせ直すことになり、合わせ忘れると 2 つの規則が食い違う。
- Do と Don't の例を置くときは、描画した例に、当たる原則の ID か規則の見出しだけを添える。
- 「状態」の例に添える文は、例が何を示すかだけにする。

## title の規則

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

## カタログに載せてよいもの

カタログは、ドキュメントサイトで誰でも開ける。  
story と MDX には、コンポーネントとダミーデータだけを載せる。

- 利用者と職員の名前、事業所、予定は、`青木 一郎` のようなダミーの値にする。実際の画面やデータベースからコピーしない。
- API を呼ぶ story を作らない。データは story の中か、ダミーデータのファイルから渡す。
- story と MDX に、URL、ホスト名、シークレットを書かない。
  - この規則は story と MDX だけに当てはまる。デザインシステムの文書と画面仕様書からカタログへのリンクは、カタログの URL で書く。
