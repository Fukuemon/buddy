# buddy のデザインシステム

buddy の画面を作る人とコーディングエージェントが、画面を作る前に読む文書。  
packages/ui のトークンとコンポーネントの使い方と、アクセシビリティと UI/UX の規則を決める。  
値と規則はデジタル庁デザインシステム（DADS）を元にしたが、規則の正本はこの文書である。DADS の指針のうち buddy が使うものを、buddy の規則として書き、DADS は出典として示す。  
トークンの層の分け方を決めた理由は ADR-0013 に、コンポーネントの配置先は ADR-0014 に、規則の書き方は ADR-0017 に、カタログの組み方は ADR-0018 にある。

- 出典: [デジタル庁デザインシステム](https://design.digital.go.jp/dads/)
- ADR-0013: [デザインシステムのトークンを、buddy に持つプリミティブトークン、セマンティックトークン、テーマ変数の 3 つの層にする](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0013-design-system-primitive-tokens.md)
- ADR-0014: [packages/ui に、ドメインを持たない Base と Case のコンポーネントを置き、DADS の指針から外れる 3 点は理由を DESIGN.md に書く](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0014-ui-components.md)
- ADR-0017: [アクセシビリティと UI/UX の規則は、DADS の指針を元にし、DESIGN.md に buddy の規則として書く](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0017-design-system-guidelines.md)
- ADR-0018: [apps/web の Storybook を 1 つのカタログにする](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0018-storybook-catalog.md)

トークンとコンポーネントの見た目と使い方は、[カタログ（Storybook）](https://buddy-docs.emon-apps.workers.dev/storybook/)で見る。  
ローカルでは `pnpm --filter @buddy/web storybook` で開く。

## 知りたいことごとの参照先

| 知りたいこと | 参照先 |
| --- | --- |
| 色、文字、角丸、影の値 | [`src/tokens/primitive.css`](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/primitive.css) |
| セマンティックトークンの名前と、どのプリミティブトークンを指すか | [`src/tokens/semantic.css`](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/semantic.css) |
| Tailwind のユーティリティの名前 | [`src/tokens/theme.css`](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/theme.css) |
| トークンに置き換える前の apps/web の値が、どのトークンになったか | [置き換える前のテーマとトークンの対応表](https://github.com/Fukuemon/buddy/blob/develop/packages/ui/src/tokens/current-theme-map.md) |
| コンポーネントの props と振る舞い | `src/base/` と `src/case/` のコンポーネントのコードと story |
| 構成の判断と、却下した案 | `docs/adr/` の ADR |

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
    - 良い例: 入力のダイアログで、確定のボタンだけを主にし、閉じるボタンを副にする。
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
| `pnpm check:design` | 画面のコードの色の値、プリミティブトークンの名前、原則に反するユーティリティ。`check-utilities.mjs` の規則の ID が、この文書にコードスパンで残っているか（`--doc`） | `COLOR-TOKEN`、`TEXT-MIN-SIZE`、`FOCUS-ONE`、`SPACING-SCALE` |
| `pnpm --filter @buddy/ui test` | コンポーネントの状態、押せる領域の大きさ、story のアクセシビリティ（axe） | `TARGET-SIZE` |
| `pnpm e2e`（compose を起動してから） | 主な画面の、幅ごとのページの横方向のオーバーフロー。撮った画像はローカルでは `packages/e2e/test-results/` に出て、CI では成果物の `e2e-layout-screens` に残る | `LAYOUT-OVERFLOW` |

### 受け入れ条件

- [ ] 「流すコマンド」が全て終了コード 0 で終わった
- [ ] 確認の方法がレビューの原則を、描画した画面で見た
- [ ] 幅 768px 以上と未満の画面を見た
- [ ] 使ったコンポーネントの状態が、「コンポーネントの選び方」と「コンポーネントごとの規則」と合っている
- [ ] 報告に、下の 5 つの状態のどれでもない原則がない
- [ ] 報告に、対象のコミット、コミットしていない変更の有無、この文書のバージョンがある

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
| この文書のバージョン | この文書を最後に変えたコミットの SHA（`git log -1 --format=%H -- packages/ui/DESIGN.md`）。この文書にコミットしていない変更があれば、そのことも書く |

## トークン

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

### 色

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
| 不整合の区分の区切り、規則に合わない値の印 | `danger` | 区分の名前、印の文字と許容範囲（例は「(20~29)」） |
| 予定のみと実績のみの区分の区切り | `warning` | 区分の名前 |
| 整合のままの注意の印、加算の注意の印 | `warning` | 印の文字「※」 |
| 整合の区分の区切り | `success` | 区分の名前 |
| 片側がない欄の「データなし」 | `text-secondary` | 文字 |

- 出典: [レセプトの照合の Design Doc の、画面が JSON から作る表示](https://github.com/Fukuemon/buddy/blob/develop/services/receipt/DesignDoc.md#画面が-json-から作る表示)

#### チームの色

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

### 文字

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

### 角丸、影、ブレークポイント

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

## 画面の枠

ログインした後の画面は、上端のヘッダー、左端のナビゲーション、画面の中身で組む。  
予定のカレンダーだけ、ナビゲーションと画面の中身の間に左の欄を置く。  
画面の間を移るリンクは、ナビゲーションに置く。  
画面の中の操作の欄（ミニカレンダーと職員の絞り込み）は、左の欄に置く。  
リンクと操作の欄を別の欄に分けるのは、1 つの欄にまとめると、移動と操作の区別が付かなくなるためである。

- 参考: Outlook と Microsoft Teams。左端のナビゲーションに機能のアイコンと名前を並べ、その右に、機能ごとの欄（Outlook ならミニカレンダー）を別に置く。
- 参考: Material Design 3 のナビゲーションレール。開くと見出し付きのリストになり、たたむとアイコンの下に名前を置いた細い列になる。

サイトの枠の要素ごとの決まりは次のとおり。

- ヘッダーは、左にメニューのボタンとサイトの名前を、右にアカウントのボタンを置く。
  - ほかの操作を置かない。
- ナビゲーションは、機能の名前を見出しにして、その下に画面のアイコンと名前を並べる。
  - 見出しと項目の並びと、項目を出す職員は、[職員の一覧の画面仕様書のナビゲーション](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/staff-list_職員の一覧/index.md#ナビゲーション) にある。
  - 今の画面に、面の色の印と `aria-current` を付ける。
- 幅 768px 以上では、メニューのボタンで、ナビゲーションを開いた形（幅 224px）とたたんだレール（幅 80px）に切り替える。
  - レールでは見出しを出さず、アイコンの下に名前を置く。機能の間を区切り線で分ける。
  - 予定のカレンダーはレールで始め、ほかの画面は開いた形で始める。
  - 768px 未満では `Drawer` に入れ、閉じた状態で始める。
- レールの名前は、5 文字以内にする。
  - 14px の文字で、幅 80px のレールに左右の余白を残して収まるのは 5 文字までである。
  - 正式な名前が 6 文字以上の項目には、レールでだけ出す 5 文字以内の短い名前を業務の語から決める。開いた形では正式な名前を出す。
  - 読み上げる名前は、短い名前の後に括弧で正式な名前を続ける（例: 「所属（部署とチーム）」）。音声で操作する人が、見える名前で指せるようにするためである。
  - 名前を 2 行に折り返す形と、レールを広げる形は採らない。項目の高さがそろわなくなり、レールの幅を変えることになるためである。
- 要確認の項目には、確認が必要な予定の件数を印で示す。
  - 0 件では印を出さない。
  - 読み上げる名前に件数を入れる。
- メニューのボタンは、ナビゲーションの形を切り替え、768px 未満ではドロワーを開く。
  - `aria-expanded` と `aria-controls` を付ける。
- 左の欄は、予定のカレンダーだけに置き、画面の中の操作の欄だけを入れる。
  - 幅は 288px にし、内側の余白を 16px 以上取る。
  - カレンダーのツールバーのボタンで開閉する。幅 768px 以上では開いた状態で始め、たたむと画面の中身を広げる。
  - 768px 未満では `Drawer` に入れ、閉じた状態で始める。
- アカウントのボタンは、職員の名前の先頭の 1 文字を入れた丸と、職員の名前を並べる。
  - 768px 未満では丸だけにする。
  - 押すと、名前とログアウトを入れたメニューをボタンの下に開き、外を押すか Esc で閉じる。

## コンポーネントの選び方

コンポーネントは、BCD Design の Base（基本のコンポーネント）と Case（場面を持つコンポーネント）だけを packages/ui に置く。  
`src/icons/` には、packages/ui のコンポーネントが中で使うアイコン（SVG を描くコンポーネント）を置く。  
アイコンは `index.ts` から export せず、カタログにも載せない。  
`src/hooks/` には、コンポーネントの外でも使う hook（外を押すと閉じる `useDismiss`、`desktop:` の幅かを返す `useIsDesktop`）を置き、`index.ts` から export する。  
apps/web の画面だけが使うアイコンは、`apps/web/src/assets/icons/` の SVG を使う。

| コンポーネント | 使う場面 | 使わない場面 | キーボード |
| --- | --- | --- | --- |
| `Button` | 操作を 1 つ実行する。`variant="danger"`（塗りの赤）は、確認のダイアログでデータを失う操作を確定するボタンだけに使う | 画面を移る（`Link` に `buttonClassName` を渡す） | Tab で移り、Enter と Space で押す。押せない間は `aria-disabled` にし、フォーカスは受ける |
| `Modal` | 今の画面の上で、予定の詳細や入力を行い、閉じて元の画面に戻る | 完了の通知、ナビゲーション | 開くとタイトルにフォーカスが移る。Tab はダイアログの中だけを回る。Esc で閉じる要求を出す。閉じると、開いたボタンにフォーカスが戻る |
| `Dialog` | 短い入力を 1 つ受けるか、少ない選択肢から操作を 1 つ選び、元の画面に戻る。入力と確認は、パターンの `InputDialog` と `ConfirmDialog` で組む | 項目の多い入力（`Modal` を使う）、完了の通知 | 開くと最初の押せる要素にフォーカスが移る。Esc と覆いで `onClose` を呼び、送っている間は呼ばない。閉じると、開く前の要素にフォーカスが戻る |
| `RowTable` | 名前と補足の値を持つ対象を並べ、行を押して詳細へ移るか選ぶか、行ごとに操作を置く。幅 768px 未満では 2 行のリストにする | 列を見比べる表（`Table` を使う） | Tab で行の名前のリンクかボタンに移り、Enter で押す。行の操作を置いた行は、操作のボタンに移る |
| `ActionMenu` | 一覧の行に、2 つ以上の操作を「…」のメニューで置く | 操作が 1 つだけ（`Button` を置く）、ナビゲーション | Enter と Space で開き、最初の項目にフォーカスが移る。Esc で閉じ、「…」のボタンにフォーカスが戻る。外を押すと閉じる |
| `HelpToggle` | 見出しの右に ? を置き、見出しが何を指すかを 1〜2 文で補う | 手順の説明（`MoreText` を使う）、エラーと注意 | Enter と Space で開閉し、Esc と外を押すと閉じる。`aria-expanded` で開閉を伝える |
| `MoreText` | 初めてのときだけ要る手順や説明を、「詳しく」で開く | 見出しの短い補い（`HelpToggle` を使う）、操作に欠かせない説明 | Enter と Space で開閉する。`aria-expanded` で開閉を伝える |
| `Drawer` | 幅 768px 未満で、画面の枠のナビゲーションと、予定のカレンダーの左の欄（日付と絞り込み）を、左端から開閉する | 予定の詳細や入力（`Modal` を使う）、幅 768px 以上のナビゲーションと左の欄（画面の枠の中に置く） | 開くとタイトルにフォーカスが移る。Tab はドロワーの中だけを回る。Esc で閉じる要求を出す。閉じると、開いたボタンにフォーカスが戻る。開くボタンには `aria-expanded` と `aria-controls` を付ける |
| `SegmentedControl` | 2 から 4 個の選択肢から 1 つを選び、すぐに表示を切り替える（表示の単位、予定の種類） | 選択肢が 5 個以上、送信するまで反映しない入力 | Tab で選ばれている選択肢に移り、← と → で選び直す |
| `Table` | 同じ項目を持つ行を並べる | 項目名と値の組（`dl` を使う） | コンポーネントの操作はない。見出しのセルは `th` にする |
| `Loading` | 画面全体かダイアログの中身を待つ | ボタンを押した後の待ち（`Button` の `isLoading` を使う）、画面の一部の待ち | 操作はない。`aria-live` で待ちを伝える |
| `DatePicker`、`TimePicker` | 日付と時刻を 1 つ入力する | 生年月日のように遠い日付 | ブラウザの入力欄の操作に従う |
| `MonthPicker` | 照合の対象の月のように、日を問わず月を 1 つ入力する | 日まで決める入力（`DatePicker`） | ブラウザの入力欄の操作に従う |
| `NumberPicker` | 分のような、単位の決まった数を入力する | 電話番号や番号のように、計算しない数字 | ブラウザの入力欄の操作に従う |
| `FormField` | 入力のダイアログの 1 行の入力、選択、ラジオボタンの組に、見出し、補足の文、誤りの文を付ける | 日付と時刻（`DatePicker`、`TimePicker`）、複数行の文（`TextareaField`）、一覧の絞り込み | Tab で欄に移る。誤りの文は `role="alert"` で読み上げる |
| `TextareaField` | 複数行の文を入力する | 1 行で足りる名前やタイトル | Tab で移る。改行は Enter |
| `Select` | 決まった選択肢から 1 つを選ぶ（担当の職員、部署）。標準の矢印を消し、右から 12px に矢印の印を置く | 2 から 4 個の選択肢ですぐに表示を切り替える（`SegmentedControl`）、多い候補から少しを選ぶ（`ChipPicker`） | Tab で移る。上下の矢印キーで選び直す |
| `FileField` | 端末に置いたファイルを 1 つ選んで送る（照合の実績の CSV） | 文や値の入力（`FormField`、`TextareaField`） | Tab で移り、Enter と Space でファイルを選ぶ画面を開く |
| `ChipPicker` | 多い候補から少しを選ぶ（職員の権限の対象の職員）。選んだものだけをチップで並べ、名前で絞った候補から 1 つずつ足す | 1 つだけを選ぶ（`Select`）、候補が数個で全てを見比べる（チェックボックスの組） | Tab で × と足す欄に移る。足す欄で ↓ を押すと候補に移り、↑ と ↓ で移り、Enter で足す。Esc と外を押すと候補を閉じ、Esc は外側のダイアログを閉じない。× で外すと、次の × か足す欄にフォーカスが移る |
| `StatusBadge` | 職員や利用者の状態（有効、休職、退職）を文字の印で示す。名前の先頭の 1 文字の丸（`Avatar`）と、名前の前の色の点（`DotLabel`）も同じファイルに置く | 操作の結果の通知、押して状態を変える操作 | 操作はない。`Avatar` と `DotLabel` の点は読み上げない |
| `ListTools` | 一覧の上に、検索、絞り込みのセレクト（`FilterSelect`）、件数（`ListCount`）を並べる。絞り込みで 0 件のときは、表の代わりに `ListEmpty` を出す | 送信するまで反映しない入力のセレクト（`FormField` の中の `Select` を使う）、2 から 4 個の表示の切り替え（`SegmentedControl` を使う） | Tab で検索欄、絞り込み、絞り込みを外すボタンに移る。件数の変化は `aria-live` で読み上げる |
| `SearchBox` | 一覧を語で絞り込む | 決まった選択肢から選ぶ（`SegmentedControl` か選択肢のカード） | Tab で移る。Esc で語を消す。見えるラベルがないので `aria-label` を渡す |

入力のコンポーネントは、ラベルを入力欄に結び付け、エラーがあれば `aria-invalid` と、エラーの文への `aria-describedby` を付ける。

- 出典: [DADS のコンポーネント](https://design.digital.go.jp/dads/components/)

### 入力の欄の状態

入力の欄の枠と面は、状態ごとに次のようにする。
見た目は DADS のインプットテキストに合わせる。

| 状態 | 枠 | 面と文字 |
| --- | --- | --- |
| デフォルト | 1px の `border-field` | `surface` |
| hover | 1px の `border-field-hover`（黒） | 変えない |
| フォーカス | 枠はそのままにし、外に `focus-ring` を出す | 変えない |
| エラー | 2px の `danger` | 変えない |
| エラーで hover | 2px の `danger-hover`（濃い赤） | 変えない |
| 無効 | 1px の `border-field`。マウスを乗せても変えない | `surface-disabled` と `text-disabled` |

- 枠は `border` で引き、`ring` で引かない。`focus-ring` の黄色の縁は `box-shadow` なので、`ring` の枠と同じ要素に付けると、片方がもう片方を上書きする。
- select は `Select` を使う。input と textarea には `fieldControlClassName`（`FormField` の中では `formFieldControlClassName`）を付ける。
- 中に input を置く枠（`SearchBox` の枠、`DatePicker` の label）には `fieldBoxClassName` を付け、中の input の状態を `:has` で読む。
- 確認: 全ての入力のコンポーネントの hover、無効、エラーの枠は、コンポーネントのテスト（`pnpm --filter @buddy/ui test` の `fieldStates.test.tsx`）が確認する。
- 編集できない値は、欄にせず本文の文字で出す。
- 欄を無効にするのは、送っている間、選択肢を読み込む間、ほかの処理を進める間に限り、終わったら編集できる状態に戻す。
  - DADS のインプットテキストは無効の欄を使わないとしているが、送っている間に欄を編集できると、送った値と画面の値が食い違う。選択肢を読み込む間に `Select` を開けると、空の選択肢が見える。
- エラーの枠は 2px にする。DADS のインプットテキストは 1px の赤だが、1px にすると、デフォルトの枠との違いが色だけになる。太さが違えば、色を見分けにくい人も誤りの欄を見つけられる。
- 出典: [DADS のインプットテキストの CSS](https://github.com/digital-go-jp/design-system-example-components-html/blob/caa50d731cf515cfa5eae0093121f11ac5299235/src/components/input-text/input-text.css)

### コンポーネントごとの規則

上の表に加えて、コンポーネントごとに次の規則に従う。
DADS から外れる規則は、外れることと理由を、その規則に書く。

#### `Button`

- 押せる領域は 44×44 CSS px 以上にする。S のボタンとアイコンのボタンは、見た目の外に押せる領域を広げる。
- ラベルは文字にする。アイコンだけのボタンには、`aria-label` で名前を付ける。
- 操作の重要度の違いを、色だけで示さない。塗りと枠線の違いでも示す。
- 押せない間は `aria-disabled` を付け、押しても実行しない。`Button` は、`disabled` を渡すと `aria-disabled` を付け、クリックと送信を止める。
- 入力が条件を満たさない間に押せなくするボタンは、ボタンのすぐ近くに、押せるようにする条件を文で書き、`aria-describedby` でボタンに結び付ける。ダイアログの確定のボタンは、`InputDialog` と `ConfirmDialog` の `submitHint` に渡す。
- 送っている間と、選択肢やデータを読み込む間は、条件の文を書かずに押せなくする。
  - DADS は押せないボタンの近くに理由を書くとしているが、この 2 つは数秒で終わり、ボタンに回転の印か、送っていることを示す文を出す。理由の文を出しても、読む前に消える。
- 出典: [DADS のボタンの使い方](https://design.digital.go.jp/dads/components/button/usage/)、[DADS のボタンのアクセシビリティ](https://design.digital.go.jp/dads/components/button/accessibility/)

#### `Modal`、`Dialog`

- ボタンを押したときだけ開く。押していないのに開くと、閉じたときにフォーカスを戻す先が無くなる。
- 処理の完了と状態の変化の通知、ナビゲーションには使わない。
- データを失う操作の確認と、ダイアログの中で完結する短い入力に `Dialog` を使う。
- 予定の作成と編集は、URL を持つ `Modal` に入力のコンポーネントを置いて行う。DADS はモーダルのダイアログにフォームを入れないとしているが、カレンダーの上で予定を作り、閉じてカレンダーに戻る流れを画面仕様が決めている。
- 出典: [DADS のモーダルダイアログ](https://design.digital.go.jp/dads/components/modal-dialog/)

#### `Drawer`

- モーダルとして扱い、開いている間は後ろを覆い、ドロワーの外を操作できなくする。
- 画面の枠のメニューのボタンか、左の欄を開くボタンから開く。
- 閉じるボタンを置く。
- 出典: [DADS のドロワーの使い方](https://design.digital.go.jp/dads/components/drawer/usage/)

#### `SegmentedControl`、`Select`

- 選択肢から 1 つだけを選ぶ。複数を選ぶ入力には使わない。
- 選択肢が少ないときは、`Select` を使わない。2 から 4 個ですぐ表示を切り替えるなら `SegmentedControl` にする。
- `Select` の開いた一覧は、ブラウザと OS の標準の表示のままにする。
- 出典: [DADS のラジオボタンの使い方](https://design.digital.go.jp/dads/components/radio/usage/)、[DADS のセレクトボックスの使い方](https://design.digital.go.jp/dads/components/select/usage/)

#### `Table`、`RowTable`

- 表は、同じ項目を持つ行の比較に使う。名前と値の組は `dl` にし、画面の配置に表を使わない。
- 1 つの対象を 1 行にし、セルを結合しない。
- 出典: [DADS のテーブルの使い方](https://design.digital.go.jp/dads/components/table/usage/)

#### `Loading`

- 回転する表示は、画面全体の待ちと、ダイアログの中身の待ちに使う。画面の一部の待ちには使わない。一部が動き続けると、ほかの部分が読みにくくなる。
- DADS は回転する表示を画面全体の待ちに限るが、ダイアログを開いている間はほかを操作できず、画面全体の待ちと同じになるので、ダイアログの中身の待ちにも使う。
- 出典: [DADS のプログレスインジケーター](https://design.digital.go.jp/dads/components/progress-indicator/)

#### `DatePicker`、`TimePicker`、`MonthPicker`

- カレンダーから選ぶ入力は、近い日付に使う。生年月日のように分かっている遠い日付には使わない。
- ブラウザの `type="date"`、`type="time"`、`type="month"` を使う。DADS は年、月、日を分けた入力欄を勧め、`input type="date"` の使う場面を限るとしているが、予定の日付は近い日を選ぶことが多く、ブラウザのカレンダーから選ぶ方が手数が少ない。
- 出典: [DADS の日付ピッカーの使い方](https://design.digital.go.jp/dads/components/date-picker/usage/)、[DADS の日付ピッカーのアクセシビリティ](https://design.digital.go.jp/dads/components/date-picker/accessibility/)

#### `FormField`、`NumberPicker`、`TextareaField`

- 見出しは欄の上に左寄せで置く。
- 誤りの文には、何が誤りかと、どう直すかを書く。
- 補足の文と誤りの文は、`aria-describedby` で欄に結び付ける。
- 誤りの文に `role="alert"` と `aria-live` を付けない。送ったときに誤りが複数あると、全ての文が割り込みで読み上げられ、どの欄の誤りかを聞き分けにくい。
- 送った後に誤りがあれば、`useFocusFirstInvalid` で最初の誤りの欄へフォーカスを移す。欄にフォーカスが移ると、結び付けた誤りの文が欄の説明として読み上げられる。
  - 予定のフォームのように、誤りの欄が閉じた編集の欄にあるときは、誤りを出す項目のボタンに `data-invalid` を付け、そのボタンへフォーカスを移す。
  - ラジオボタンの組は、組の要素へフォーカスを移し、組に結び付けた誤りの文を読み上げさせる。`FormField` の `isGroup` は、誤りがあれば組の要素に `tabIndex={-1}` を渡す。
  - 入力するたびに誤りを出す欄は、フォーカスが欄にあるので移さない。
- 送れなかったときの文と、画面の読み込みの失敗の文は、欄の誤りの文ではないので `role="alert"` で読み上げる。
- `TextareaField` に文字数の上限があるときは、見出しか補足の文に上限を書く。
- 出典: [DADS のインプットテキストの使い方](https://design.digital.go.jp/dads/components/input-text/usage/)、[DADS のインプットテキストのアクセシビリティ](https://design.digital.go.jp/dads/components/input-text/accessibility/)、[DADS のテキストエリアの使い方](https://design.digital.go.jp/dads/components/textarea/usage/)

#### `FileField`

- ファイルを選ぶボタンを置く。ドラッグとドロップだけで選ばせない。
- 出典: [DADS のファイルアップロードの使い方](https://design.digital.go.jp/dads/components/file-upload/usage/)

#### `ChipPicker`

- 選んだものだけをチップで並べ、チップの × で 1 つずつ外す。
- 多い候補から少しを選ぶ入力に使う。DADS は複数の選択にチェックボックスの組を使うとしているが、職員の権限の対象のように候補が数十人になると、チェックボックスで全てを並べたときに選んだものを読み取れなくなる。
- 出典: [DADS のチェックボックスの使い方](https://design.digital.go.jp/dads/components/checkbox/usage/)、[DADS のチップタグ](https://design.digital.go.jp/dads/components/chip-tag/)

#### `StatusBadge`

- 状態を、色だけでなく文字で示す。
- 出典: [DADS のチップラベル](https://design.digital.go.jp/dads/components/chip-label/)

#### `HelpToggle`、`MoreText`

- 開かないと操作できない情報を入れない。閉じたままでも、画面の本文だけで操作できるようにする。
- キーボードだけで開閉でき、`aria-expanded` で開閉を伝える。
- `HelpToggle` は、見出しの意味を補う説明を見出しの下に重ねて出すコンポーネントで、ディスクロージャーではない。開閉のアイコンを見出しの左に置かず、見出しの右に ? のボタンを置く。
  - DADS のディスクロージャーは、タイトルの左の開閉のアイコンを必須にする。`HelpToggle` はタイトルと本文を持たず、説明は画面の流れを押し下げない。見出しの左にアイコンを置くと、`HelpToggle` を置く見出しと置かない見出しで、文字の位置がずれる。
- `MoreText` は、文の下の「詳しく」で続きの説明を画面の流れの中に開く。
  - 出典: [DADS のディスクロージャーの使い方](https://design.digital.go.jp/dads/components/disclosure/usage/)

## Storybook のカタログ

### カタログのページ

| ページ | 書くこと | 配置先 |
| --- | --- | --- |
| はじめに | 原則、アクセシビリティの基準 | `packages/ui/src/docs/*.mdx` |
| トークン | 色の階調とセマンティックトークン（`ColorPalette`）、文字（`Typeset`）、余白、角丸、影 | `packages/ui/src/tokens/*.mdx` |
| コンポーネント | コンポーネントごとの MDX。使う場面、使わない場面、Do と Don't、状態、キーボードの操作 | `packages/ui/src/base/<コンポーネント>/`、`packages/ui/src/case/<コンポーネント>/` |
| パターン | コンポーネントを組み合わせた形（入力のダイアログの `InputDialog`、確認のダイアログの `ConfirmDialog`） | `packages/ui/src/patterns/` |
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

### カタログに載せてよいもの

カタログは、ドキュメントサイトで誰でも開ける。  
story と MDX には、コンポーネントとダミーデータだけを載せる。

- 利用者と職員の名前、事業所、予定は、`青木 一郎` のようなダミーの値にする。実際の画面やデータベースからコピーしない。
- API を呼ぶ story を作らない。データは story の中か、ダミーデータのファイルから渡す。
- story と MDX に、URL、ホスト名、シークレットを書かない。
  - この規則は story と MDX だけに当てはまる。この文書と画面仕様書からカタログへのリンクは、カタログの URL で書く。
