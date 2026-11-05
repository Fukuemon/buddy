# ADR-0019: ドキュメントサイトのプレビューをやめ、トークンの組のコントラストを pnpm check:contrast で確認する

## Status

承認

## Context

ドキュメントサイトの組み立てとトークンの生成を、agent-harness のパッケージ docs-site と design-system のスクリプトに置き換える（#292）。  
この ADR は、次の 3 つの判断を置き換える。

- [ADR-0004](0004-design-system.md) の、pull request ごとにドキュメントサイトのプレビューを出す判断
- [ADR-0004](0004-design-system.md) の、文字でないもののコントラストを Vitest のテストで計算する判断
- [ADR-0015](0015-key-color-and-canvas.md) の、canvas の上の組を `contrast.test.ts` で確認する判断

プレビューの手順は、pull request のコードに Cloudflare のトークンを渡す。  
同じリポジトリの pull request には GitHub が secret を渡すので、書き込みの権限を持つ人は、ワークフローを書き換えてトークンを読める。  
トークンはリポジトリの単位の secret にあり、どのブランチの実行からも読める。

パッケージ design-system は、意味のトークンの組のコントラスト比を計算するスクリプト `check-contrast.mjs` を配る。  
buddy の `contrast.test.ts` と同じ 44 組を、同じ結果で確認できる。

## Decision

- ドキュメントサイトは、develop に入ったときだけ本番に出す。pull request ごとのプレビューは出さない。
  - トークンを、pull request のコードから読めないようにするためである。
- Cloudflare のトークンは、GitHub の environment `docs-site` の secret に置き、environment にデプロイできるブランチを develop だけにする。
  - ワークフローの条件だけで develop に絞ると、条件を外したワークフローを別のブランチへ push してトークンを読める。environment のブランチの制限は、ワークフローを書き換えても外せない。
- ワークフローは、パッケージ docs-site のテンプレートを元にし、公開の後に文書、カタログ、ER 図の保護を確認する。
  - 保護の確認について、この判断は [ADR-0020](0020-docs-site-without-access.md) で置き換えた。
- 意味のトークンの組のコントラストは、ルートの `pnpm check:contrast`（`scripts/check-contrast.mjs`）で計算し、CI で流す。Vitest のテスト `contrast.test.ts` は消す。
  - 計算の直しが agent-harness から届くようにするためである。組は `scripts/check-contrast.mjs` の冒頭に置く。

## Considered Options

### プレビューとトークン

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** プレビューをやめ、トークンを develop に限った environment に置く | pull request のコードと別のブランチの実行から、トークンを読めない | 文書の見た目は、マージする前にローカルの `pnpm site:build` か `zensical serve` で確認する |
| プレビューを残し、トークンをリポジトリの単位の secret に置く | マージする前に、公開した形で確認できる | 書き込みの権限を持つ人が、ワークフローを書き換えてトークンを読める |

### コントラストの確認

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** パッケージのスクリプト（`pnpm check:contrast`） | 計算の直しがパッケージから届く。条件つきのブロックと解けない値を報告する | パッケージを上げたときに、写したスクリプトとの差分を取り込む手間がある |
| Vitest のテスト（`contrast.test.ts`） | packages/ui のテストと一緒に流れる | 計算を buddy で保守する |

## Consequences

### Positive

- Cloudflare のトークンを読めるのは、develop の実行だけになる。
- コントラストの計算と、トークンの CSS の生成と、サイトの組み立てを、同じパッケージの手順で更新できる。

### Negative

- pull request の段階で、公開した形のサイトを確認できない。
- コントラストのチェックは `pnpm --filter @buddy/ui test` では流れない。トークンを変えたら `pnpm check:contrast` を流す。
