---
name: write-screen-spec
description: 画面仕様書（docs/screens/<画面 ID>_<画面の名前>/ の index.md、api.md、mocks/ の HTML のモック）を書くとき、直すとき、古い形（docs/screens/<画面 ID>.md と wireframes/）から移すとき、点検するときに使う。「画面仕様書を書いて」「モックを足して」「画面の状態を足して」「testid を仕様書に足して」「画面仕様書を新しい形に移して」で読み込む。E2E のテストのコードは write-e2e-test を使う。
---

# write-screen-spec

書き方の規則は [画面仕様書の規約](../../../docs/screens/rules.md) が正本である。このスキルは、規約に沿って作業を進める順と、確かめ方だけを持つ。規則をここに写さない。

作業の最初に、規約の全文と、[画面仕様書の目次](../../../docs/screens/index.md) の「画面の ID の規則」を読む。規約と食い違うことをこのスキルで見つけたら、規約を直す変更として分けて提案する。

## 新しい画面を書く

1. 画面 ID と画面の名前を、目次の規則で決める。目次の画面の一覧に行を足す。
2. `docs/screens/_template/` を `docs/screens/<画面 ID>_<画面の名前>/` に写す。`mocks/screen-id.css` を `mocks/<画面 ID>.css` に名前を変え、モックの読み込みも直す。
3. 状態を、規約の「画面のモック」の数え方で決める。PRD と実装から、読み込み中、空、誤り、ダイアログを開いた状態、送信中のうち、この画面が取り得るものを拾う。
4. 状態ごとにモックを書く。
   - 実装があれば、画面のコンポーネント（`apps/web/src/features/<機能>/components/`、`components/site/`）を読み、配置、文言、`data-testid` を実装に合わせる。testid は `rg -n 'data-testid' apps/web/src` で集める。
   - 灰色の見た目は `docs/screens/_common/wireframe.css` の `wf-*` から探し、無いものだけを書く。置き場は規約の「幅と配置」にある。
   - 構成要素の表に載せる要素に、規約の「構成番号と data-testid」のとおり `data-m` を振る。
5. `index.md` を、規約の「仕様書のページ」の節の順で書く。
   - 要素ごとの節の「値のソース」は、画面に出る文言を「」で引く。実装と PRD が食い違うときは、推測で埋めず、未決に書く。
6. `api.md` に、要素ごとの web の型の項目（`apps/web/src/api/types.ts`）と OpenAPI の項目（`apps/*/openapi.yaml` の operationId と項目）を書く。
7. `zensical.toml` の `nav` に `index.md` を足す。
8. 下の「確かめる」を行う。

## 古い形から移す

古い形の仕様書（`docs/screens/<画面 ID>.md`）とワイヤーフレーム（`docs/screens/wireframes/<画面 ID>.html`）を、次のように新しい形へ移す。古い 2 つのファイルは、移した pull request で消す。

| 古い形 | 新しい形 |
| --- | --- |
| 概要の表の「画面の ID」 | 1 行目の `# <画面 ID> <画面の名前>`。表からは消す |
| 「UI」の配置の文 | 要素ごとの節の「概要」か、1 行目の下の用途の文 |
| 「状態ごとの UI」の表の 1 行 | 状態の節とモック 1 枚。条件は状態の見出しの直後の 1 文に |
| ワイヤーフレームの `data-show-when`、`data-hide-when` | 状態ごとのモックに分け、その状態で見える要素だけを描く |
| 「構成要素」の表の番号、構成要素、表示する値 | 状態ごとの構成要素の表と、要素ごとの節の「値のソース」 |
| 「構成要素」の表の web の型、OpenAPI | `api.md` |
| 「構成要素」の表の `data-testid` | モックの要素の `data-testid` |
| 「活性条件と表示条件」 | 要素ごとの節の「活性条件」と「表示条件」 |
| 「インタラクション」 | 要素ごとの節の「インタラクション」 |
| 「初期状態でのインタラクション」 | 全体動作の「初期処理」 |
| 「未決」 | 未決 |
| 表の下の説明文（列と値の決め方、印の条件、PRD や Design Doc への参照） | 要素ごとの節の「値のソース」。web の型と API の項目との対応は `api.md`。参照は消さずに残す |

- 古い形にあった情報を、移す先が無いからと消さない。消すときは、なぜ要らないかを pull request に書く。
- 古い仕様書へのリンクを `rg -n '<画面 ID>\.md|wireframes/<画面 ID>' -g '!site'` で探し、新しいディレクトリに直す。
- E2E が使う testid（`rg -n "getByTestId|testid" packages/e2e/tests`）が、移したモックの `data-testid` に全てあることを確かめる。

## 確かめる

1. `pnpm check:screens` を流す。1 画面だけなら `node scripts/check-screens.mjs docs/screens/<ディレクトリ>`。違反を全て直す。
2. `pnpm exec textlint "**/*.md"` と `node .claude/hooks/docs/hooks/check-links.mjs` を流す。
3. `uv run zensical build --clean` が警告なしで終わることを確かめる。
4. ブラウザで、仕様書のページと、モックを別タブで開いたものを見る。`uv run zensical serve` で開き、モックのツールバーで 4 つの端末を切り替え、番号の印が要素の左上にあること、`@container` の切り替えで崩れないことを見る。
   - スクリーンショットを撮ったら、画像を開いて中身を見る。描画の前の白い画面を、確かめた結果にしない。
   - ブラウザを使えないときは、4 を「未確認」と報告する。
