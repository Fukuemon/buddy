# ADR-0015: アクセシビリティは WCAG 2.2 の AA を基準にし、自動で確認する

## Status

承認

## Context

アクセシビリティの基準と、確認の方法を決める必要がある。

- receipt-front からコピーしたもとの画面のテーマには、白の上で 4.5:1 に届かない文字の色と、文字でないものの基準の 3:1 に届かない入力欄の枠があった。フォーカスの表示はコンポーネントごとに違い、色相を人数で等分した職員の色は、色相によって白の文字が読めなかった。
- パッケージ design-system は、意味のトークンの組のコントラスト比を計算するスクリプト `check-contrast.mjs` を配る。
- 画面とコンポーネントの色は、意味のトークンで決める。
  - ADR-0013: [デザインシステムのトークンを、buddy に持つプリミティブトークン、セマンティックトークン、テーマ変数の 3 つの層にする](0013-design-system-primitive-tokens.md)

## Decision

DADS が参照する WCAG 2.2 の AA を基準にし、DADS の指針の値を使う。

- 出典: [DADS のアクセシビリティ](https://design.digital.go.jp/dads/guidance/accessibility/)

| 項目 | 基準 | 確認の方法 |
| --- | --- | --- |
| 文字のコントラスト | 4.5:1 以上。面の上の状態の色の文字も含む | Storybook の a11y のアドオン（axe）を全ての story で実行し、違反をテストの失敗にする |
| 文字でないもののコントラスト | 入力欄と押せる枠の境界、フォーカスの表示が 3:1 以上 | 意味のトークンの組のコントラストを、ルートの `pnpm check:contrast`（`scripts/check-contrast.mjs`）で計算し、CI で流す。axe は枠の色を確認しないため |
| フォーカスの見え方 | 全ての操作できる要素で `focus-ring` を `:focus-visible` に出す | story の play 関数で Tab キーを押し、フォーカスの位置を確認する |
| ターゲットの大きさ | ボタンは 44×44 CSS px 以上。S のボタンとアイコンのボタンは、見た目の外に押せる領域を広げる | コンポーネントの Vitest のテストで、押せる領域の大きさを確認する |
| キーボードの操作 | コンポーネントごとの操作を DESIGN.md のコンポーネントのセクションに書き、その通りに動く | story の play 関数と Vitest で、キーを押した結果を確認する |

- 出典: [DADS の色](https://design.digital.go.jp/dads/foundations/color/)
- 出典: [DADS のボタンのアクセシビリティ](https://design.digital.go.jp/dads/components/button/accessibility/)
- コントラストの計算は、パッケージ design-system のスクリプトを使い、計算の直しが agent-harness から届くようにする。組は `scripts/check-contrast.mjs` の冒頭に置く。
- story をテストとして実行するのは、Storybook の Vitest のアドオンにする。`pnpm --filter @buddy/ui test` が、コンポーネントの単体テストと story のテストの両方を実行する。

### 動きを減らす設定

AA に加えて、AAA の 2.3.3（Animation from Interactions）を基準にする。  
画面の動きで、めまいや吐き気を起こす人がいるためである。

- 出典: [WCAG 2.2 の 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

| 項目 | 基準 | 確認の方法 |
| --- | --- | --- |
| 動きを減らす設定 | OS で動きを減らす設定にした職員には、位置、大きさ、回転を動かすアニメーションと遷移、滑らかなスクロールを出さない。透明度の変化と、読み込み中の回転は残す | E2E で、設定のときに透明度のほかの遷移が無いことと、読み込み中の回転が動くことを確認する |

- 読み込み中の回転は、止めると処理が続いていることが伝わらないので残す。2.3.3 が、機能や情報に欠かせない動きとして除くものに当たる。
- 止め方は、`packages/ui/src/tokens/theme.css` の 1 か所に置き、画面とコンポーネントのコードに設定ごとの条件を書かない。
- 止める動きと残す動きの一覧は、DESIGN.md の原則 `MOTION-REDUCE` に書く。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** パッケージのスクリプト（`pnpm check:contrast`） | 計算の直しがパッケージから届く。条件つきのブロックと解けない値を報告する | パッケージを上げたときに、写したスクリプトとの差分を取り込む手間がある |
| Vitest のテスト（`contrast.test.ts`） | packages/ui のテストと一緒に流れる | 計算を buddy で保守する |

## Consequences

### Positive

- 画面の全ての文字が白の面で 4.5:1 以上、入力欄の枠とフォーカスの表示が 3:1 以上になる。主の色も、白の文字で 4.5:1 以上を保つ。
- コントラストの計算を、パッケージの手順で更新できる。
- 動きを減らす設定にした職員は、画面の操作で位置と大きさが動く表示を見ない。

### Negative

- コントラストのチェックは `pnpm --filter @buddy/ui test` では流れない。トークンを変えたら `pnpm check:contrast` を流す。
- 設定のときは、色の遷移も止まり、ボタンの色は遷移せずに変わる。遷移の対象を透明度だけに絞る止め方は、色と位置を分けないためである。
