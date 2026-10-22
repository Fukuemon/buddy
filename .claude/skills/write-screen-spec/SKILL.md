---
name: write-screen-spec
description: 画面仕様書（docs/screens/<画面 ID>_<画面の名前>/ の index.md、api.md、mocks/ の HTML のモック）を書くとき、直すとき、点検するときに使う。「画面仕様書を書いて」「モックを足して」「画面の状態を足して」「testid を仕様書に足して」「モックに操作をつけて」で読み込む。E2E のテストのコードは write-e2e-test を使う。
---

# write-screen-spec

書き方の規則は [画面仕様書の規約](../../../docs/screens/rules.md) が正本である。このスキルは、規約に沿って作業を進める順と、確かめ方だけを持つ。規則をここにコピーしない。

作業の最初に、規約の全文と、[画面仕様書の目次](../../../docs/screens/index.md) の「画面の ID の規則」を読む。規約と食い違うことをこのスキルで見つけたら、規約を直す変更として分けて提案する。

## 新しい画面を書く

1. 画面 ID と画面の名前を、目次の規則で決める。目次の画面の一覧に行を足す。
2. `docs/screens/_template/` を `docs/screens/<画面 ID>_<画面の名前>/` にコピーする。`mocks/screen-id.css` を `mocks/<画面 ID>.css` に名前を変え、モックの読み込みも直す。
3. 状態を、規約の「画面のモック」の数え方で決める。PRD と実装から、読み込み中、空、エラー、ダイアログを開いた状態、送信中のうち、この画面が取り得るものを拾う。
   - 幅で出し分ける開閉式の要素（幅 768px 未満だけのドロワー）は状態に数えない。各状態のモックに閉じた状態で描き、規約の「画面の中の操作」のとおり `data-panel` で開閉する。
4. 状態ごとにモックを書く。
   - 実装があれば、画面のコンポーネント（`apps/web/src/features/<機能>/components/`、`components/site/`）を読み、配置、文言、`data-testid` を実装に合わせる。testid は `rg -n 'data-testid' apps/web/src` で集める。
   - 共通の見た目は `docs/screens/_common/wireframe.css` の `wf-*` から探し、無いものだけを書く。配置先は規約の「幅と配置」にある。
   - 構成要素の表に載せる要素に、規約の「構成番号と data-testid」のとおり `data-m` を振る。
   - 開閉式の要素と、開いて初めて見える要素にも `data-m` を振り、開くと出る印を仕様書の状態の説明に書く。
5. 全てのモックを書いた後に、各要素のインタラクションの節の操作を、規約の「画面の中の操作」の属性でモックに付ける。
   - 操作ごとに、結果に最も近い状態のモックを `data-go` の先に選ぶ。先が別の画面なら、その画面のモックを指す。
   - 規約が属性を付けないとする操作と、当たる状態のモックが無い操作には付けない。
6. `index.md` を、規約の「仕様書のページ」の節の順で書く。
   - 要素ごとの節の「値のソース」は、画面に出る文言を「」で引く。実装と PRD が食い違うときは、推測で埋めず、未決に書く。
   - カタログの欄の story は、規約の「要素ごとの節」の選び方で選ぶ。候補は `rg -n "^  title:|^export const" -g '*.stories.tsx' apps/web/src packages/ui/src` で探す。story の ID は、`pnpm --filter @buddy/web storybook` で開いた URL の `path=/story/` の後ろで確かめる。
7. `api.md` に、要素ごとの web の型の項目（`apps/web/src/api/types.ts`）と OpenAPI の項目（`apps/*/openapi.yaml` の operationId と項目）を書く。
8. `zensical.toml` の `nav` に `index.md` を足す。
9. 下の「確かめる」を行う。

## 確かめる

1. `pnpm check:screens` を流す。1 画面だけなら `node scripts/check-screens.mjs docs/screens/<ディレクトリ>`。違反を全て直す。
2. `pnpm exec textlint "**/*.md"` と `node .claude/hooks/docs/hooks/check-links.mjs` を流す。
3. `uv run zensical build --clean` が警告なしで終わることを確かめる。
4. ブラウザで、仕様書のページと、モックを別タブで開いたものを見る。仕様書のページでは、全ての状態のタブを開き、モックが描かれることを見る。`uv run zensical serve` で開き、モックのツールバーの「デバイス」で 4 つのデバイスを切り替え、番号の印が要素の左上にあること、`@container` の切り替えで崩れないことを見る。
   - 主な操作を押し、移った先のモックか表示が変わること、デバイスの選択が保たれること、操作の後も番号の印が要素の上にあることを見る。仕様書のページの iframe の中でも押す。
   - スクリーンショットを撮ったら、画像を開いて中身を見る。描画の前の白い画面を、確かめた結果にしない。
   - ブラウザを使えないときは、4 を「未確認」と報告する。
