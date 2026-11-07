# ADR-0020: デザインシステムの文書を、原則と手順を持つ DESIGN.md と、トークン、コンポーネント、カタログの文書に分ける

## Status

承認

## Context

デザインシステムの使い方の規則を、どの文書にどう分けて書くかを決める必要がある。

- 使う側の規則は、画面を作る人、レビューする人、コーディングエージェントが読む。保守の判断（層の分け方、却下した案）は、このリポジトリの規則で ADR に書く。
- 規則の正本は、DADS の指針ではなく buddy の文書である。DADS から外れる規則は、外れることと理由をその規則に書く。
  - ADR-0014: [packages/ui に、ドメインを持たない Base と Case のコンポーネントを置き、DADS の指針から外れる 3 点は理由を DESIGN.md に書く](0014-ui-components.md)
  - ADR-0017: [アクセシビリティと UI/UX の規則は、DADS の指針を元にし、DESIGN.md に buddy の規則として書く](0017-design-system-guidelines.md)
- `packages/ui/DESIGN.md` は 535 行の 1 つの文書で、ドキュメントサイトでは原則、手順、トークン、コンポーネント、カタログの規則が 1 つのページに並ぶ。
- `pnpm check:design` の `scripts/check-utilities.mjs` は、`--doc` に渡した 1 つのファイルに原則の ID があるかを見る。
- パッケージ design-system は、0.2.0 で、デザインシステムの文書の骨組みを、DESIGN.md と、トークン、コンポーネントとパターン、カタログの 3 つの文書に分けた。buddy は今 0.1.6 を使い、0.2.0 へは文書を分けるときに上げる。
  - 出典: [design-system-v0.2.0](https://github.com/Fukuemon/agent-harness/releases/tag/design-system-v0.2.0)

## Decision

デザインシステムの文書を、次の 4 つのファイルに分ける。分け方は、パッケージ design-system の骨組みに合わせる。

| ファイル | 持つ規則 |
| --- | --- |
| `packages/ui/DESIGN.md` | 話題ごとの文書へのリンク、知りたいことごとの参照先、画面を作るときの原則、原則と確認の方法の対応、画面を作るときの手順 |
| `packages/ui/design/tokens.md` | セマンティックトークンの使う場面、文字、角丸、影、ブレークポイント |
| `packages/ui/design/components.md` | 画面の枠、コンポーネントの選び方、コンポーネントごとの規則 |
| `packages/ui/design/catalog.md` | カタログのページ、title の規則、カタログに載せてよいもの |

ドキュメントサイトで、人が話題ごとにページを開けるようにするためである。公開されているデザインシステムの人が読むサイトは、どれも基盤とコンポーネントを別のページにしている。

- 出典: [DADS](https://design.digital.go.jp/dads/)、[GOV.UK Design System の Button](https://design-system.service.gov.uk/components/button/)、[Primer の Button](https://primer.style/product/components/button/)、[Material Design 3 の Buttons](https://m3.material.io/components/buttons/overview)、[Carbon の Button](https://carbondesignsystem.com/building-blocks/core/components/button)、[Atlassian の Button](https://atlassian.design/components/button/examples)

分けた文書の扱いは次のとおり。

- 原則の ID は DESIGN.md にだけ置く。`--doc` には DESIGN.md の 1 つのファイルを渡せばよく、チェックのスクリプトは変えない。
- DESIGN.md の冒頭に、画面とコンポーネントのコードを書く前に 4 つのファイルを全て読むことを書く。コーディングエージェントが DESIGN.md だけを読み、コンポーネントの規則を読み落とすのを防ぐためである。パッケージ design-system の 0.2.0 のスキル write-design-system も、「始める前に読むもの」で同じことを求める。
- ADR-0014 の「理由を DESIGN.md に書く」と、ADR-0017 の「規則の正本は DESIGN.md」は、4 つのファイルを合わせたデザインシステムの文書を指す。
- 値と振る舞いは書き写さず、コードを参照先にする。DESIGN.md の冒頭に、知りたいことごとに参照するファイルの表を置く。コピーした値は、コードとずれても見つけられないためである。
- 保守の判断は、4 つのファイルに書かず ADR に書く。配らない保守の資料（DESIGN.local.md）は持たない。packages/ui は外に配らず、保守の判断を ADR に書くので、2 つ目の保守の資料を持つ理由がない。
  - 出典: [mitame-ai/design-system](https://github.com/mitame-ai/design-system)

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** DESIGN.md と、トークン、コンポーネント、カタログの文書に分ける | ドキュメントサイトで話題ごとにページを開ける。パッケージ design-system の骨組みと同じ分け方になる | エージェントの読み落としを、DESIGN.md とスキルの文で防ぐ必要がある。ページの中の検索は、そのページしか探さない |
| 1 つの DESIGN.md のまま、リンクだけを足す | 1 回の読み込みで全ての規則を読める | ドキュメントサイトで、535 行が 1 つのページに並ぶ。パッケージ design-system の骨組みと形が違う |
| 規則をコンポーネントごとの JSON にし、MCP で作業に要る分だけを渡す（mitame-ai/skills の build-design-harness の形） | エージェントの読む量が減る | 人が読むドキュメントサイトの形と、配る仕組みの両方を作る必要がある。今はその仕組みを持たない |
| DESIGN.md と、配らない保守の資料の DESIGN.local.md に分ける | 保守の資料を自由に書ける | 配らないパッケージでは分ける境界がない。ADR と保守の資料に同じ判断が並ぶ |

- 出典: [build-design-harness の成果物](https://github.com/mitame-ai/skills/blob/ad34906628c0823b4cbce41490baad873d9663e6/build-design-harness/SKILL.md#L26-L39)
- 出典: [Atlassian の DESIGN.md の測定](https://www.atlassian.com/blog/how-we-build/atlassians-design-md-is-here-what-we-learned-testing-portable-design-context-in-practice)

## Consequences

### Positive

- 画面を作る人とレビューする人が、ドキュメントサイトでトークン、コンポーネント、カタログの規則を別のページで開ける。
- 原則の ID と、チェックとレビューの対応は DESIGN.md に残るので、`pnpm check:design` とレビューの指摘の引き方は変わらない。

### Negative

- 画面を作る前に読むファイルが 4 つになる。DESIGN.md だけを読んで画面を作ると、コンポーネントの規則を読み落とす。
- DESIGN.md のセクションを名前で指していたコードのコメントと文書を、移した先のファイルを指すように直す必要がある。
