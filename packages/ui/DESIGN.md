# buddy のデザインシステム

buddy の画面を作る人とコーディングエージェントが、画面を作る前に読む文書。  
packages/ui のトークンとコンポーネントの使い方と、アクセシビリティと UI/UX の規則を決める。  
値と規則はデジタル庁デザインシステム（DADS）を元にしたが、規則の元はこの文書と、下の「話題ごとの文書」の 3 つの文書である。DADS の指針のうち buddy が使うものを、buddy の規則として書き、DADS は出典として示す。  
出典と、構成を決めた理由の ADR は次のとおり。

- 出典: [デジタル庁デザインシステム](https://design.digital.go.jp/dads/)
- ADR-0013: [デザインシステムのトークンを、buddy に持つプリミティブトークン、セマンティックトークン、テーマ変数の 3 つの層にする](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0013-design-system-primitive-tokens.md)
- ADR-0014: [packages/ui に、ドメインを持たない Base と Case のコンポーネントを置き、DADS の指針から外れる 3 点は理由を DESIGN.md に書く](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0014-ui-components.md)
- ADR-0015: [アクセシビリティは WCAG 2.2 の AA を基準にし、自動で確認する](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0015-accessibility.md)
- ADR-0017: [アクセシビリティと UI/UX の規則は、DADS の指針を元にし、DESIGN.md に buddy の規則として書く](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0017-design-system-guidelines.md)
- ADR-0018: [apps/web の Storybook を 1 つのカタログにする](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0018-storybook-catalog.md)
- ADR-0019: [カタログをドキュメントサイトと同じ Worker で、develop に入ったときだけ出す](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0019-docs-site-publish.md)
- ADR-0020: [デザインシステムの文書を、原則と手順を持つ DESIGN.md と、トークン、コンポーネント、カタログの文書に分ける](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0020-design-system-topic-documents.md)

トークンとコンポーネントの見た目と使い方は、[カタログ（Storybook）](https://buddy-docs.emon-apps.workers.dev/storybook/)で見る。  
ローカルでは `pnpm --filter @buddy/web storybook` で開く。

## 話題ごとの文書

デザインシステムの文書は、この文書と、次の 3 つの文書でできている。  
**画面とコンポーネントのコードを書く前に、この文書と 3 つの文書を全て読む。** この文書だけを読むと、トークンの使う場面と、コンポーネントの使い方と状態と、DADS から外れる規則を知らないまま書くことになる。

| 文書 | 持つ規則 |
| --- | --- |
| [トークン](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/design/tokens.md) | トークンの層、セマンティックトークンの使う場面、照合の結果の色、チームの色、文字、角丸、影、ブレークポイント |
| [コンポーネント](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/design/components.md) | 画面の枠、コンポーネントの選び方、入力の欄の状態、コンポーネントごとの規則と DADS から外れる理由、パターン |
| [カタログ](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/design/catalog.md) | Storybook のカタログのページ、title の規則、カタログに載せてよいもの |

## 知りたいことごとの参照先

| 知りたいこと | 参照先 |
| --- | --- |
| 色、文字、角丸、影の値 | [`src/tokens/primitive.css`](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/primitive.css) |
| セマンティックトークンの名前と、どのプリミティブトークンを指すか | [`src/tokens/semantic.css`](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/semantic.css) |
| Tailwind のユーティリティの名前 | [`src/tokens/theme.css`](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/theme.css) |
| トークンに置き換える前の apps/web の値が、どのトークンになったか | [置き換える前のテーマとトークンの対応表](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/current-theme-map.md) |
| コンポーネントの props と振る舞い | `src/base/` と `src/case/` のコンポーネントのコードと story |
| 構成の判断と、却下した案 | [ADR の索引のデザインシステムとドキュメントサイト](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/index.md#デザインシステムとドキュメントサイト) |

## 元にしたデザインシステムとの関係

DADS が使う側に任せる値には buddy の選択を、DADS が変えないとする要件には確認の方法を書く。  
DADS の指針から外れる規則は、この表に並べない。その規則の隣に、DADS が求めることと外れる理由を書く。

| 項目 | DADS の扱い | buddy |
| --- | --- | --- |
| 主の色 | 使う側が、同じ色相の階調からキーカラーを選ぶ。主要な背景色と 4.5:1 以上を保つ色にする | `primary` に light-blue の階調を当てる。どの段を指すかは `src/tokens/semantic.css` にある |
| 余白の段 | 絶対の値を決めず、使う側が基準の単位と倍率を決める | Tailwind のデフォルトの段（1 段 4px）で書き、ブロックの間を 8px の倍数にする。規則は原則 `SPACING-SCALE` にある |
| コントラスト | 変えない。WCAG 2.2 の AA を満たす | 確認: 「アクセシビリティ」の文字のコントラストと、文字でないもののコントラストの行 |
| フォーカスの表示 | 変えない。Yellow-300 と黒の 2 重の表示を、どの場合も変えない | `focus-ring` だけを使う。確認: 原則 `FOCUS-ONE` |
| 状態の色相と意味の対応 | 変えない。成功は緑、エラーは赤、警告は黄か橙にする。明るさは、コントラストを保つ範囲で使う側が変えてよい | `success` を緑、`danger` を赤、`warning` を橙の階調に当てる。確認: レビューで、`src/tokens/semantic.css` の状態のトークンが同じ色相を指すかを見る |

- 出典: [DADS の色](https://design.digital.go.jp/dads/foundations/color/)
- 出典: [DADS の余白](https://design.digital.go.jp/dads/foundations/spacing/)

## 画面を作るときの原則

原則には ID を付ける。ID は一度付けたら変えない。  
各原則の「確認」は、守られているかを確認する方法である。  
`pnpm check:design` は、`apps/web/src` と `packages/ui/src` のコードを読み、pre-commit のフックと CI でも流れる。  
トークンの層のファイル（`packages/ui/src/tokens/`）と生成物は、チェックの対象から外している。

- `COLOR-TOKEN`: 色、文字、角丸、影は、`theme.css` のユーティリティだけで書く。
  - 色の値と、プリミティブトークンの名前を、画面のコードに直に書かない。
  - 確認: 色の値（`#hex`、`rgb()` などの色の関数、`text-[#...]` のような任意値の中の色）は、`pnpm check:design` の `scripts/check-raw-values.mjs` が止める。プリミティブトークンの名前も、同じスクリプトが止める。文字の大きさの任意値は、`scripts/check-utilities.mjs` が止める。
  - 確認: 色の名前（`red`、`white`）と、角丸と影の任意値は、チェックが見ない。レビューで、`theme.css` にない値を書いていないかを見る。
- `STATE-NOT-COLOR-ONLY`: 状態を色だけで伝えない。
  - エラー、不一致、注意には、文と印を色と一緒に出す。
  - 確認: レビューで、色を見分けられない人が、エラー、不一致、注意の場所と内容を読み取れるかを見る。
    - 良い例: 入力の誤りの欄に、赤い枠と一緒に誤りの文を出す。
    - 悪い例: 照合の不整合の行を、区分の名前を出さずに赤い文字にするだけにする。
- `TEXT-MIN-SIZE`: 14px より小さい文字を使わない。
  - 本文と操作の文字は 16px にし、14px は補足だけに使う。
  - 確認: `text-xs`、`text-sm` と、文字の大きさの任意値（`text-[10px]`）は、`pnpm check:design` の `scripts/check-utilities.mjs` が止める。
  - 確認: 16px と 14px の使い分けは、レビューで、`text-caption` が補足、エラーの文、時刻の目盛りのような補足の文字にだけ付いているかを見る。
    - 良い例: 入力欄の下の補足の文を `text-caption` にする。
    - 悪い例: ボタンの文字や表のセルを `text-caption` にする。
- `PRIMARY-ACTION-ONE`: 主のボタン（`variant="primary"`）は、1 つの画面かダイアログに 1 つまでにする。
  - 確認: レビューで、画面とダイアログごとに、主の操作が 1 つに決まるかを見る。
    - 良い例: 入力のダイアログで、確定のボタンだけを主にし、「キャンセル」を副にする。
    - 悪い例: 一覧の行ごとに主のボタンを置く。
- `FOCUS-ONE`: フォーカスの表示は `focus-ring` だけを使い、コンポーネントごとに色や太さを変えない。
  - DADS の指針が、フォーカスの表示の変更を禁じている。
  - 確認: `focus-visible:` などの変種の後ろの `ring`、`outline`、`border`、`shadow` は、`pnpm check:design` の `scripts/check-utilities.mjs` が止める。
  - 確認: `focus-ring` の付け忘れは、チェックが見ない。カタログの story で Tab を押し、全ての操作できる要素に `focus-ring` が出るかを見る。
- `TARGET-SIZE`: 押せる領域は 44×44 CSS px 以上にする。
  - 見た目を小さくするときは、見た目の外に押せる領域を広げる。
  - 確認: `packages/ui` のコンポーネントは、コンポーネントのテスト（`pnpm --filter @buddy/ui test`）が、ブラウザで描画した大きさを確認する。
  - 確認: 画面で作る押せる要素は、レビューで、見た目が 44px より小さいときに押せる領域を広げているかを見る。
    - Storybook の a11y のアドオンは、押せる領域を確認しない。axe-core の `target-size` の規則はデフォルトで無効になっていて、基準も 24px である。
- `SPACING-SCALE`: 余白は Tailwind の段（1 段 4px）で書く。
  - ブロックの間は 8px の倍数（`gap-2`、`gap-4`、`gap-6`）にする。
  - 確認: padding、margin、gap、space の任意値（`p-[13px]`）は、`pnpm check:design` の `scripts/check-utilities.mjs` が止める。
  - 確認: 半分の段（`gap-0.5`、`py-1.5`）と、ブロックの間が 8px の倍数かは、チェックが見ない。レビューで見る。
  - 入力の欄と、その見出し、補足の文、誤りの文の間は `gap-3`（12px）にする。`focus-ring` が欄の外へ 6px 広がり、間が狭いと文字に重なる。
    - 確認: `FormField` は、コンポーネントのテスト（`pnpm --filter @buddy/ui test`）が、欄と見出しと補足の文の間を確認する。
    - 確認: `FormField` を使わない欄は、レビューで、欄と近くの文字の間が `gap-3`（12px）以上かを見る。
      - 良い例: 照合の月の欄の見出しと欄を `flex flex-col gap-3` で並べる。
      - 悪い例: 見出しと欄を `gap-1`（4px）で並べ、フォーカスの表示が見出しの文字に重なる。
- `LAYOUT-OVERFLOW`: 幅 768px 以上と未満のどちらでも、ページを横にはみ出させない。長い文字とデータの多い状態でも出さない。
  - 表のように横に長い中身は、その領域の中で横に送り、ページの全体を広げない。
  - 確認: 主な画面のページの全体の幅は、E2E の `packages/e2e/tests/specs/site/layout-overflow.e2e.ts`（`pnpm e2e`）が、幅 390、767、768、1280px で確認する。
  - 確認: 内側の領域で切れた文字とボタンと、見た目の崩れは、チェックが見ない。テストが撮った画像か描画した画面を、レビューで見る。
- `MOTION-TOKEN`: アニメーションと緩急は、Tailwind のデフォルトのユーティリティ（`animate-spin`、`ease-in`）だけで書く。
  - 任意値（`animate-[ping_1s_infinite]`、`ease-[cubic-bezier(...)]`）を書かない。任意値はトークンを通らない値で、どの画面で何が動くかを、ユーティリティの名前で追えなくなる。
  - 確認: `animate-` と `ease-` の任意値は、`pnpm check:design` の `scripts/check-utilities.mjs` が止める。
  - 確認: 時間と遅れの任意値（`duration-[...]`、`delay-[...]`）と、`[animation:...]` のような任意のプロパティは、チェックが見ない。レビューで見る。
  - アニメーションの任意値はテーマ変数を通らないので、`MOTION-REDUCE` の止め方では止まらない。
- `MOTION-REDUCE`: OS で動きを減らす設定（`prefers-reduced-motion: reduce`）にした職員には、位置、大きさ、回転を動かすアニメーションと遷移、滑らかなスクロールを出さない。
  - 画面の動きで、めまいや吐き気を起こす人がいるためである。WCAG 2.2 の AA に無い、AAA の 2.3.3 を選んでいる。
    - 出典: [WCAG 2.2 の 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
    - ADR-0015: [アクセシビリティは WCAG 2.2 の AA を基準にし、自動で確認する](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0015-accessibility.md)
  - 止め方は `theme.css` の末尾の 1 か所に置く。画面とコンポーネントのコードに `motion-reduce:` と `motion-safe:` を書かない。
    - 1 か所に無いと、書き忘れた画面だけが動き続ける。
  - 設定のときに止める動きと残す動きは、次のとおり。

    | 動き | 今使っている場所 | 設定のとき |
    | --- | --- | --- |
    | 色、枠、背景の遷移 | `Button`、`FieldFrame`、`SegmentedControl`、予定のカレンダーの予定の明るさ | 止める。遷移せずに変わる |
    | 押したときに縮める遷移 | `Button` | 止める。遷移せずに縮む |
    | 拡大と点滅のアニメーション（`animate-ping`、`animate-bounce`） | 無い | 止める |
    | 透明度の遷移と、透明度だけのアニメーション（`animate-pulse`） | 無い | 残す。状態が変わったことを伝える短い変化で、位置と大きさを動かさない |
    | 読み込み中の回転（`animate-spin`） | `Loading`、`BusyLabel`、`Button` の `isLoading`、予定の取り込みのプレビュー中 | 残す。止めると、処理が続いていることが伝わらない（2.3.3 の例外） |

  - 確認: E2E の `packages/e2e/tests/specs/site/motion-reduce.e2e.ts`（`pnpm e2e`）が、設定のときに透明度のほかの遷移が無いことと、読み込み中の回転が動くことを確認する。
  - 確認: 新しい動きを足したときは、レビューで、上の表のどの行に当たるかを見る。当たらない動きは、表に行を足してから使う。

### 原則と確認の方法の対応

`pnpm check:design` の 2 つのスクリプトは、違反の行に原則の ID を出す（例: `src/a.tsx:3: COLOR-TOKEN 色の値 #fff`）。  
レビューの指摘も、この ID で原則を引く。

| ID | 確認の方法 | チェックが見ないもの |
| --- | --- | --- |
| `COLOR-TOKEN` | `scripts/check-raw-values.mjs`（`pnpm check:design`） | 色の名前（`red`、`white`）、角丸と影の任意値 |
| `STATE-NOT-COLOR-ONLY` | レビュー | |
| `TEXT-MIN-SIZE` | `scripts/check-utilities.mjs`（`pnpm check:design`） | 16px と 14px の使い分け。クラスの名前を文字列の連結で組み立てた書き方 |
| `PRIMARY-ACTION-ONE` | レビュー | |
| `FOCUS-ONE` | `scripts/check-utilities.mjs`（`pnpm check:design`） | `focus-ring` の付け忘れ。クラスの名前を文字列の連結で組み立てた書き方 |
| `TARGET-SIZE` | `packages/ui` のコンポーネントのテスト（`pnpm --filter @buddy/ui test`） | 画面で作る押せる要素 |
| `SPACING-SCALE` | `scripts/check-utilities.mjs`（`pnpm check:design`） | 半分の段と、ブロックの間が 8px の倍数か。`FormField` を使わない欄の間 |
| `LAYOUT-OVERFLOW` | `packages/e2e/tests/specs/site/layout-overflow.e2e.ts`（`pnpm e2e`） | テストに入れていない画面と、シードに無い長い文字とデータの多い状態。内側の領域で切れた文字とボタン。見た目の崩れ |
| `MOTION-TOKEN` | `scripts/check-utilities.mjs`（`pnpm check:design`） | 時間と遅れの任意値。任意のプロパティ（`[animation:...]`）と、スタイルに直に書いた `animation`。クラスの名前を文字列の連結で組み立てた書き方 |
| `MOTION-REDUCE` | `packages/e2e/tests/specs/site/motion-reduce.e2e.ts`（`pnpm e2e`） | 照合の画面のほかの画面。新しい動きが、止める動きと残す動きの表のどれに当たるか |

## 画面を作るときの手順

画面とコンポーネントのコードを書く人は、この順に進め、受け入れ条件を満たしたら終える。

### 順

1. 参照先の表とカタログから、使うコンポーネントとトークンを探す。合うものがなければ、画面のコードで作らず、packages/ui に足すかを尋ねる。
2. `theme.css` のユーティリティと、packages/ui のコンポーネントだけで書く。
3. 使ったコンポーネントの状態のうち、画面で起きるもの（読み込み中、空、エラー、無効）を作る。
4. 下の「流すコマンド」を、表の順に流す。
5. 描画した画面を、幅 768px 以上と未満で開き、横方向のオーバーフローと見た目の崩れがないかを見る。新しい画面は、`layout-overflow.e2e.ts` の画面の一覧に足す。
6. チェックが通らなければ直し、手順 4 から流し直す。チェックの出力を見て自分で直すのは、2 回までにする。
   - 2 回直しても通らないか、違反の数が減らないときは、直すのをやめて止まる。最後に全てのチェックが通ったコミットに、通らない変更を混ぜない。通らない変更は、コミットせずに差分として報告に添える。
   - 全てのチェックが通ったコミットが無いときは、作業を始めたときのコミットを代わりにし、そのときに既に通らなかった原則の ID を報告に書く。
7. 下の「報告の形」で報告する。止まったときは、最後に通ったコミットの SHA と、通らないまま残った原則の ID を書く。

### 流すコマンド

前のコマンドが失敗したら、後のコマンドは流さずに「見ていない」と報告する。

| コマンド | 見るもの | 原則の ID |
| --- | --- | --- |
| `pnpm check:generated` | `docs/screens/_common/tokens.css` を含む生成物が、元のファイルと合っているか | |
| `pnpm check:contrast` | セマンティックトークンの組のコントラスト比 | |
| `pnpm check:design` | 画面のコードの色の値、プリミティブトークンの名前、原則に反するユーティリティ。`check-utilities.mjs` の規則の ID が、この文書にコードスパンで残っているか（`--doc`） | `COLOR-TOKEN`、`TEXT-MIN-SIZE`、`FOCUS-ONE`、`SPACING-SCALE`、`MOTION-TOKEN` |
| `pnpm --filter @buddy/ui test` | コンポーネントの状態、押せる領域の大きさ、story のアクセシビリティ（axe） | `TARGET-SIZE` |
| `pnpm e2e`（compose を起動してから） | 主な画面の、幅ごとのページの横方向のオーバーフロー。撮った画像はローカルでは `packages/e2e/test-results/` に出て、CI では成果物の `e2e-layout-screens` に残る | `LAYOUT-OVERFLOW` |

### 受け入れ条件

- [ ] 「流すコマンド」が全て終了コード 0 で終わった
- [ ] 確認の方法がレビューの原則を、描画した画面で見た
- [ ] 幅 768px 以上と未満の画面を見た
- [ ] 使ったコンポーネントの状態が、コンポーネントの文書の[「コンポーネントの選び方」](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/design/components.md#コンポーネントの選び方)と[「コンポーネントごとの規則」](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/design/components.md#コンポーネントごとの規則)と合っている
- [ ] 報告に、下の 5 つの状態のどれでもない原則がない
- [ ] 報告に、対象のコミット、コミットしていない変更の有無、デザインシステムの文書のバージョンがある

### 報告の形

原則の ID ごとに、次の 5 つの状態のどれかで報告する。  
チェックの終了コードが 0 でも、レビューの原則が守られたことにはならない。

| 状態 | 意味 |
| --- | --- |
| 通った | チェックが流れ、基準を満たした |
| 通らない | 違反の証拠がある。場所と、出たチェックの出力を添える |
| レビューで見る | 描画した画面かコードはあるが、判断はレビューの人がする |
| 見ていない | 確認の規則、チェック、証拠のどれかが無い。前のコマンドの失敗で流していないものも含む |
| 対象外 | 作業の範囲から外れる。理由を添える |

報告の冒頭に、どのコードと文書を見た結果かを書く。コミットしていない変更があると、コミットの SHA だけでは見たコードを特定できない。

| 項目 | 書くこと |
| --- | --- |
| 対象のコミット | チェックを流したときの `git rev-parse HEAD` の SHA |
| コミットしていない変更 | なし、またはあり。ありのときは、変えたファイルの一覧（`git status --short` の出力） |
| デザインシステムの文書のバージョン | この文書と 3 つの文書のどれかを最後に変えたコミットの SHA（`git log -1 --format=%H -- packages/ui/DESIGN.md packages/ui/design`）。どれかにコミットしていない変更があれば、そのことも書く |

## アクセシビリティ

DADS が参照する WCAG 2.2 の AA を基準にし、DADS の指針の値を使う。  
動きを減らす設定だけは、AA に無い AAA の 2.3.3 を基準にする。  
基準ごとに、自動で確認する方法を決める。自動で確認できないものは、レビューで見るものを書く。

- 出典: [DADS のアクセシビリティ](https://design.digital.go.jp/dads/guidance/accessibility/)
- ADR-0015: [アクセシビリティは WCAG 2.2 の AA を基準にし、自動で確認する](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0015-accessibility.md)

| 項目 | 基準 | 確認の方法 |
| --- | --- | --- |
| 文字のコントラスト | 4.5:1 以上。面の上の状態の色の文字も含む | 全ての story で Storybook の a11y のアドオン（axe）を動かし、違反を `pnpm --filter @buddy/ui test` の失敗にする。セマンティックトークンの組は `pnpm check:contrast` でも計算する |
| 文字でないもののコントラスト | 入力欄と押せるものの枠（`border-field`）と、フォーカスの表示が 3:1 以上 | セマンティックトークンの組を `pnpm check:contrast` で計算する。axe は枠の色を確認しないため |
| フォーカスの見え方 | 全ての操作できる要素で、`:focus-visible` に `focus-ring` を出す | 原則 `FOCUS-ONE` の確認のとおり |
| ターゲットの大きさ | 押せる領域が 44×44 CSS px 以上 | 原則 `TARGET-SIZE` の確認のとおり |
| キーボードの操作 | [コンポーネントの文書](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/design/components.md#コンポーネントの選び方)の「コンポーネントの選び方」の表と、コンポーネントごとの規則のとおりに動く | コンポーネントのテスト（`pnpm --filter @buddy/ui test`）で、キーを押した結果を確認する |
| 入力の誤りの伝え方 | コンポーネントの文書の[「`FormField`、`NumberPicker`、`TextareaField`」](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/design/components.md#formfieldnumberpickertextareafield)の規則のとおりに、欄ごとの誤りの文を欄の説明として伝える | コンポーネントのテスト（`pnpm --filter @buddy/ui test` の `fields.test.tsx`、`FormField.test.tsx`、`useFocusFirstInvalid.test.tsx`）で、誤りの文を欄に結び付けることと、送った後のフォーカスの位置を確認する |
| 動きを減らす設定 | 原則 `MOTION-REDUCE` のとおり。AAA の 2.3.3 | 原則 `MOTION-REDUCE` の確認のとおり |

## トークン

トークンの層と、セマンティックトークン、文字、角丸、影、ブレークポイントの使い方は、[トークンの文書](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/design/tokens.md) にある。

## 決まっていない選択

DADS にも、デザインシステムの文書の規則にもない選択を、選択、案、理由で書く。  
決まったら規則のセクションへ移し、ここから消す。

今は無い。
