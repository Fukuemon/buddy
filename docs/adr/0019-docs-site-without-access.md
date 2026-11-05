# ADR-0019: ドキュメントサイトを Cloudflare Access で守らず、誰でも開けるようにする

## Status

承認

## Context

ドキュメントサイト（Worker `buddy-docs`）は、文書、Storybook のカタログ、表の ER 図を 1 つの URL で出している。  
この ADR は、次の 2 つの判断を置き換える。

- [ADR-0004](0004-design-system.md) の、カタログを Cloudflare Access で許可した人だけが開けるようにする判断
- [ADR-0018](0018-docs-site-publish-and-contrast-check.md) の、公開の後に文書、カタログ、ER 図の保護を確認する判断

ADR-0004 の時点では、リポジトリは private で、Access は private のリポジトリの中身を許可した人にだけ見せるために使った。  
リポジトリは 2026-10-22 に public にした。サイトに並べるものは、どれもリポジトリの文書とコードから組み立てるので、Access を外しても、新しく見えるようになる中身はない。

Access を残すと、次の手間が続く。

- 読む人は、Cloudflare のログインを通らないと文書を開けない。リポジトリの Markdown へのリンクは誰でも開けるのに、サイトへのリンクだけが開けない。
- 保守する人は、Access の許可の設定と、公開のたびの保護の確認を保つ。Worker の名前を変えると、新しい Worker が Access なしで出るので、名前を変える前に Access を掛け直す。

## Decision

- ドキュメントサイトは Access で守らず、誰でも開けるようにする。
  - リポジトリを public にしたので、サイトの中身はすでに誰でも読める。
- ワークフローは、本番に出した後に、ログインなしで文書、カタログ、ER 図を開けることを確認する。保護の確認のスクリプト `scripts/check-docs-site-protection.mjs` は消す。
  - 確認は、リダイレクトをたどらずに取った応答に、それぞれの中身にだけある文字列があるかで行う。Access を掛け直したときや、公開した中身が欠けたときに失敗する。
- カタログに載せるのは、コンポーネントとダミーデータだけにする規則（ADR-0004）は残す。
  - サイトを誰でも開けるので、実際のデータを載せない理由は強くなる。
- Cloudflare のトークンを develop に限った environment に置く判断（ADR-0018）は残す。
  - トークンは、Access と関係なく、Worker の中身を書き換えられるためである。

## Considered Options

| 選択肢 | 強み | 弱み |
| --- | --- | --- |
| **採用:** Access を外し、ログインなしで開けることを確認する | 誰でもログインなしで文書を読める。Access の設定と保護の確認を保たなくてよい | サイトの URL が検索に載りうる。リポジトリを private に戻すときは、Access を掛け直す |
| Access を残す | 開ける人を絞れる | 中身はリポジトリで誰でも読めるので、絞っても隠せるものがない。読む人にログインを求め続ける |
| サイトをやめ、リポジトリの Markdown だけを読ませる | Cloudflare のアカウントとトークンが要らない | カタログと ER 図は組み立てた成果物で、リポジトリでは読めない。文書の検索と目次がなくなる |

## Consequences

### Positive

- 誰でもログインなしで、文書、カタログ、ER 図を読める。
- Cloudflare の Access の許可の設定と、environment の Variables の `DOCS_SITE_AUTH_HOST` が要らなくなる。

### Negative

- サイトの URL が検索に載りうる。
- リポジトリを private に戻すときは、Worker に Access を掛け直し、ワークフローの確認を保護の確認に戻す。
