# @buddy/docs-site

ドキュメントサイト（Zensical）、apps/web の Storybook（デザインシステムのカタログ）、予定の管理の ER 図（Liam ERD）を公開する。  
3 つは、1 つの Cloudflare Worker（`buddy-docs`）の静的なファイルである。  
サイトは Cloudflare Access で許可した人だけが開ける。カタログの組み方と、公開先を選んだ理由は [ADR-0004](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0004-design-system.md) にある。

| 環境 | ドキュメントサイト | カタログ | ER 図 | 出す契機 |
| --- | --- | --- | --- | --- |
| 本番 | `https://buddy-docs.emon-apps.workers.dev` | 同じ URL の `/storybook/` | 同じ URL の `/erd/` | develop に push したとき |

## 成果物を作る

リポジトリのルートで、次を実行する。

```sh
pnpm site:build
```

`scripts/build-docs-site.mjs --build` が、`context/project.yml` の `docs_site.parts` に並べたものを作り、`apps/docs-site/public/` に並べる。  
`cf build` が、それを公開する形にする。

並べるものを足すときは、`docs_site.parts` に足す。  
次の 3 つは、agent-harness のパッケージ docs-site のスクリプトを写したものである。組み立ての `scripts/build-docs-site.mjs`、値を読む `scripts/read-docs-site-config.mjs`、保護を確認する `scripts/check-docs-site-protection.mjs`。  
パッケージを上げたら、`node .claude/skills/setup-agent-harness/scripts/setup.mjs --diff` で差分を見て取り込む。

`pnpm --filter @buddy/docs-site deploy:dry-run` で、Cloudflare に送らずに成果物を確認できる。認証は要らない。

ドキュメントサイトのリンクは相対の URL なので、カタログを下のパスに置いても行き来できる。文書のトップのカタログへのリンク（`storybook/`）と ER 図へのリンク（`erd/`）は、ローカルの `zensical serve` では開けない。

## デプロイの構成

`.github/workflows/docs-site.yml` が、Cloudflare の CLI `cf` でデプロイする。

- pull request では、サイトを組み立てるだけにする。pull request ごとのプレビューは出さない（[ADR-0019](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0019-docs-site-publish-and-contrast-check.md)）。
- develop への push では、`cf deploy --prebuilt --mode production` で本番にデプロイし、Access の保護を確認する。
- トークンは、GitHub の environment `docs-site` の secret にある。environment にデプロイできるブランチは develop だけにしてある。
  - ワークフローの条件だけで develop に絞ると、条件を外したワークフローを別のブランチへ push してトークンを読める。
  - トークンの範囲は Worker `buddy-docs` の Editor に絞り、漏れたときに書き換えられるものを、このサイトの中身と設定に限る。Access の設定はトークンで変えられない。
- 文書の元は docs/ のほか、services/ と packages/ の Design Doc にもあるので、変えた場所で絞らずに全ての pull request で組み立てる。
- `cloudflare.config.ts` が Worker の名前（`buddy-docs`）と、workers.dev の URL を有効にしてプレビューの URL を無効にする設定を持つ。静的なファイルの配置先は `wrangler.config.ts` にある。`cf` の 1.0.0-beta は、静的なファイルのビルドを wrangler に任せるためである。
- `cf` は beta なので、バージョンを固定している。上げるときは、`deploy:dry-run` が通ることを確認し、develop に入った後の本番の公開と保護の確認を見る。

## Cloudflare のセットアップ

公開には、利用者が Cloudflare で次を用意する。手順は 2026-10 の Cloudflare のダッシュボードで確認した。

1. Cloudflare のアカウントを作り、Zero Trust を有効にする（Free のプランでよい）。
2. Workers & Pages で Worker `buddy-docs` を作る（中身は Hello World のままでよい）。手順 3 のトークンは Worker を作れないため、先に作る。
3. 「Manage Account → Account API Tokens」で、アカウントのトークンを Custom token で作る。名前は `github-actions-buddy-docs` にした。
   - 権限は 1 つだけにする。製品は Workers、範囲は Specified Workers の `buddy-docs`、役割は Editor。
   - Editor は Worker の中身と設定を書き換えて出せるが、Worker を消せない。ほかの Worker と Access の設定には届かない。
   - 送り元の IP は絞らない。GitHub Actions の runner の IP は決まっていない。
4. GitHub のリポジトリの「Settings → Environments」で、environment `docs-site` を作る。
   - 「Deployment branches and tags」で「Selected branches and tags」を選び、`develop` だけを足す。
   - Secrets: `CLOUDFLARE_API_TOKEN`（手順 3 のトークン）
   - Variables: 次の 4 つ
     - `CLOUDFLARE_ACCOUNT_ID`: ダッシュボードの Account ID
     - `DOCS_SITE_URL`: 本番の URL
     - `DOCS_SITE_MARKER`: トップのページにだけある文字列
     - `DOCS_SITE_AUTH_HOST`: `cloudflareaccess.com`
5. Worker の Access のタブで「すべてのトラフィック」を選び、開ける人（メールアドレスかメールのドメイン）を決める。workers.dev の URL が守られる。

- アカウント全体の Access（Workers & Pages の概要の「Cloudflare Access」のスイッチ）は使わない。同じアカウントの、公開しているほかの Worker も守られて開けなくなるためである。
- Worker の名前を変えると、新しい Worker が Access なしで出る。名前を変えるときは、先に手順 2、3、5 を新しい名前で行う。
- Access で守られているかは、ワークフローが本番に出すたびに、`scripts/check-docs-site-protection.mjs` で URL ごとに確認する。
  - ローカルで本番の文書を確認するときは、次を流す。

    ```sh
    node scripts/check-docs-site-protection.mjs https://buddy-docs.emon-apps.workers.dev/ "予定の管理とレセプトの照合の設計書" cloudflareaccess.com
    ```
