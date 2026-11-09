# ADR-0018: apps/web の Storybook を 1 つのカタログにする

## Status

承認

## Context

デザインシステムと画面のカタログの組み方を決める必要がある。

- packages/ui には、ドメインを持たない Base と Case のコンポーネントを置く。Domain のコンポーネントは apps/web に置く。
  - ADR-0014: [packages/ui に、ドメインを持たない Base と Case のコンポーネントを置き、DADS の指針から外れる 3 点は理由を DESIGN.md に書く](0014-ui-components.md)
- アクセシビリティは、Storybook の a11y のアドオンと story の play 関数で確認する。
  - ADR-0015: [アクセシビリティは WCAG 2.2 の AA を基準にし、自動で確認する](0015-accessibility.md)

## Decision

カタログは apps/web の Storybook で組み、packages/ui の MDX と story も読み込む。  
apps/web は packages/ui に依存するので、依存の向きを変えずに 1 つのサイドバーと検索で全てを読める。

- packages/ui は自分の Storybook も持つ。コンポーネントを単独で開発し、`pnpm --filter @buddy/ui build-storybook` と story のテストを packages/ui の中で完結させるためである。
- a11y のアドオンの設定と decorator は packages/ui の `.storybook/preview` に置き、apps/web の preview はそれを読み込む。2 つの Storybook で確認する基準が分かれないようにするためである。
- カタログのページは、はじめに、トークン、コンポーネント、パターン、画面の 5 つに分ける。DADS のサイトと SmartHR Design System のように、原則とトークンとコンポーネントの使い方を読めるサイトにする。
  - 出典: [SmartHR Design System](https://smarthr.design/)
- title は、ファイルの配置先から機械的に決める。規則は DESIGN.md にある。
- カタログに載せるのは、コンポーネントとダミーデータだけにする。サイトを開ける人の範囲は変わりうるので、実際のデータを載せない。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** apps/web の Storybook に packages/ui の MDX と story も読ませる | 1 回のビルドで 1 つのサイトになる。原則から画面までを 1 つのサイドバーと検索でたどれる | packages/ui の story を 2 つの Storybook でビルドする |
| Storybook の refs で、apps/web から packages/ui の Storybook を合成する | 2 つの Storybook を独立にビルドできる | 2 つのビルドと公開先を揃える必要がある。refs の URL は開発の時と公開先とで違う。相対の URL で動くかは未確認 |
| 2 つの Storybook を別々に公開し、一覧のページから 2 つへリンクする | 公開の仕組みが単純になる | 原則とトークンとコンポーネントのサイトと、画面のサイトが分かれ、行き来できない |
| packages/ui の Storybook に apps/web の story も読ませる | packages/ui の中でカタログが完結する | packages/ui が apps/web の import のエイリアスと plugin に依存し、依存の向きが逆になる |

## Consequences

### Positive

- 原則、トークン、コンポーネント、画面を 1 つのカタログで読める。

### Negative

- story のデータを作る人が、ダミーデータに限る規則を守る必要がある。
