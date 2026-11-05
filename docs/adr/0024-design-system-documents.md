# ADR-0024: デザインシステムの文書を、使う側の DESIGN.md と、保守の判断の ADR に分ける

## Status

承認

## Context

デザインシステムの使い方と、packages/ui の構成を変える判断を、どの文書に書くかを決める必要がある。

## Decision

`packages/ui/DESIGN.md` は、画面を作る人とコーディングエージェントが読む。原則、トークンの使い分け、コンポーネントの選び方、Storybook の title の規則を書く。  
トークンの値とコンポーネントの振る舞いはコードを参照先にし、DESIGN.md には値を書き写さない。  
packages/ui の構成を変える判断は ADR に書く。

mitame-ai/design-system（Tezawari）の DESIGN.md と DESIGN.local.md の分け方は採らない。  
mitame-ai/design-system は、パッケージとして配る DESIGN.md と、配らない保守の資料を分けている。packages/ui は外に配らず、保守の判断はこのリポジトリの規則で ADR に書くため、2 つ目の文書を持つ理由がない。  
mitame-ai/design-system の DESIGN.md から、知りたいことごとに参照するファイルを示す表だけを採る。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** 使う側の DESIGN.md と、保守の判断の ADR | 使う側は 1 つの文書を読めばよい。判断の経緯は ADR の規則で残る | DESIGN.md に経緯を書かない規則を、書く人が守る必要がある |
| mitame-ai/design-system と同じく DESIGN.md と DESIGN.local.md に分ける | 保守の資料を自由に書ける | 配らないパッケージでは分ける境界がない。ADR と保守の資料に同じ判断が並ぶ |

## Consequences

### Positive

- 使う側は 1 つの文書を読めばよい。判断の経緯は ADR の規則で残る。

### Negative

- DESIGN.md に経緯を書かない規則を、書く人が守る必要がある。
