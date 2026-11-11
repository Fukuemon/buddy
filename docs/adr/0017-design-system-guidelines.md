# ADR-0017: アクセシビリティと UI/UX の規則は、DADS の指針を元にし、DESIGN.md に buddy の規則として書く

## Status

承認

## Context

画面を作る人とコーディングエージェントが読むアクセシビリティと UI/UX の規則を、どこに何として書くかを決める必要がある。

- buddy のデザインシステムは、デジタル庁デザインシステム（DADS）の値と指針を元にした。
  - 出典: [デジタル庁デザインシステム](https://design.digital.go.jp/dads/)
- DESIGN.md は、使う側が画面を作る前に読む文書である。
  - ADR-0016: [デザインシステムの文書を、使う側の DESIGN.md と、保守の判断の ADR に分ける](0016-design-system-documents.md)
- DESIGN.md は「DADS の指針に基づき」と書き、DADS から外れる 5 点だけを表にしている。表に無い指針は DADS のサイトにだけあり、画面を作るエージェントは読まない。
- buddy の画面は、DADS のキーカラーを当て直し、DADS に無い背景の色を持ち、DADS の指針から 5 点で外れている。buddy 独自の UI になりつつある。

## Decision

- アクセシビリティの基準とコンポーネントの使い方は、引き続き DADS の指針を元にする。DADS は WCAG 2.2 の AA を参照し、コンポーネントごとの指針と実装例を公開している。
  - 出典: [DADS のアクセシビリティ](https://design.digital.go.jp/dads/guidance/accessibility/)
- DESIGN.md には、DADS に従う前提を残さない。DADS の指針のうち buddy が使うものを、コンポーネントのセクションに buddy の規則として書く。規則の元は DESIGN.md である。
- DADS は、規則の直後に出典として示す。
- DADS の指針から外れる規則は、表に分けず、その規則の本文に書き、外れる理由を隣に書く。
- DADS の指針が変わっても、DESIGN.md の規則は自動では変わらない。取り込むときは、DADS の変更を読み、DESIGN.md の規則を直す。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** DADS の指針を元に、buddy が使う規則を DESIGN.md に書き、DADS を出典にする | 画面を作る人とエージェントが、DESIGN.md だけで規則を読める。外れる規則と理由が、同じ場所にある | DADS の指針の変更を、自分で読んで取り込む。DESIGN.md が長くなる |
| 「DADS の指針に基づき」と書き、外れる点だけを表にする | DESIGN.md が短い。DADS の変更が、読む人には自動で届く | 表に無い指針を読むには DADS のサイトを読む必要があり、エージェントは読まない |
| DADS の指針のページを DESIGN.md に丸ごとコピーする | DADS のサイトを読まずに済む | buddy が使わない指針が大半になる。buddy の規則と DADS の規則の区別がつかない |
| DADS を元にせず、規則を一から作る | buddy の画面に合わせて決められる | 公開され検証された指針を捨て、アクセシビリティの基準を自分で組み立て直す |

## Consequences

### Positive

- 画面を作るエージェントが、DADS のサイトを読まずに、buddy が使う指針を読める。
- DADS から外れる規則の理由を、規則と同じ場所で読める。

### Negative

- DADS の指針の修正を、自分で読んで取り込む必要がある。
- DESIGN.md が長くなる。
