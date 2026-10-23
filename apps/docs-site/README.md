# @buddy/docs-site

文書のサイト（Zensical）、apps/web の Storybook（デザインシステムのカタログ）、予定の管理の ER 図（Liam ERD）を公開する。  
3 つは、1 つの Cloudflare Worker（`buddy-docs`）の静的なファイルである。  
サイトは Cloudflare Access で許可した人だけが開ける。カタログの組み方と、公開先を選んだ理由は [ADR-0004](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0004-design-system.md) にある。

| 環境 | 文書のサイト | カタログ | ER 図 | 出す契機 |
| --- | --- | --- | --- | --- |
| 本番 | `https://buddy-docs.emon-apps.workers.dev` | 同じ URL の `/storybook/` | 同じ URL の `/erd/` | develop に push したとき |
| プレビュー | pull request ごとの URL。ワークフローが pull request にコメントする | 同じ URL の `/storybook/` | 同じ URL の `/erd/` | pull request を作るか、push したとき |

## 成果物を作る

リポジトリのルートで、次を実行する。

```sh
pnpm site:build
```

次の順に動く。

1. `uv run zensical build --clean` で、文書のサイトを `site/` に作る。
2. `pnpm --filter @buddy/web build-storybook` で、Storybook を `apps/web/storybook-static/` に作る。
3. `pnpm build:erd`（`scripts/build-erd.mjs`）で、tbls の `docs/db/schedule/schema.json` から、Liam ERD の ER 図のサイトを `erd/` に作る。
4. `scripts/build-docs-site.mjs` で、3 つを `apps/docs-site/public/` に並べる。`/` に文書、`/storybook/` にカタログ、`/erd/` に ER 図を置く。
5. `cf build --mode production` で、公開する形の成果物を `apps/docs-site/.cloudflare/output/` に作る。

`pnpm --filter @buddy/docs-site deploy:dry-run` で、Cloudflare に送らずに成果物を確認できる。認証は要らない。

文書のサイトのリンクは相対の URL なので、カタログを下のパスに置いても行き来できる。文書のトップのカタログへのリンク（`storybook/`）と ER 図へのリンク（`erd/`）は、ローカルの `zensical serve` では開けない。

ER 図のサイトは、Liam ERD の CLI が出す静的なファイルで、リソースを相対のパスで読むので `/erd/` の下で動く。Liam ERD のライセンスは Apache-2.0 である（[liam-hq/liam](https://github.com/liam-hq/liam)）。開くと Google Fonts から字形を読む。届かなくても、ER 図は代わりの字形で描かれる。

## デプロイの構成

`.github/workflows/docs-site.yml` が、Cloudflare の CLI `cf` でデプロイする。

- pull request では `cf previews deploy pr-<番号>` でプレビューを出し、URL を pull request にコメントする。
- develop への push では `cf deploy --prebuilt --mode production` で本番にデプロイする。
- プレビューの手順は pull request のコードを実行し、そこへ Cloudflare のトークンを渡す。同じリポジトリの pull request には GitHub が secret を渡すため、書き込みの権限を持つ人はワークフローを書き換えてトークンを読める。
  - トークンの範囲を Worker `buddy-docs` の Editor に絞り、漏れたときに書き換えられるものを、このサイトの中身と設定に限る。Access の設定はトークンで変えられない。
  - fork と Dependabot の pull request には GitHub が secret を渡さないため、ワークフローはサイトをビルドするだけで、プレビューとコメントの手順を飛ばす。
- 文書の元は docs/ のほか、services/ と packages/ の Design Doc にもあるので、変えた場所で絞らずに全ての pull request で実行する。
- `cloudflare.config.ts` が Worker の名前（`buddy-docs`）と、workers.dev とプレビューの URL を有効にする設定を持つ。静的なファイルの配置先は `wrangler.config.ts` にある。`cf` の 1.0.0-beta は、静的なファイルのビルドを wrangler に任せるためである。
- `cf` は beta なので、バージョンを固定している。上げるときは、pull request のプレビューと `deploy:dry-run` が通ることを確認する。

## Cloudflare のセットアップ

公開には、利用者が Cloudflare で次を用意する。手順は 2026-10 の Cloudflare のダッシュボードで確認した。

1. Cloudflare のアカウントを作り、Zero Trust を有効にする（Free のプランでよい）。
2. Workers & Pages で Worker `buddy-docs` を作る（中身は Hello World のままでよい）。手順 3 のトークンは Worker を作れないため、先に作る。
3. 「Manage Account → Account API Tokens」で、アカウントのトークンを Custom token で作る。名前は `github-actions-buddy-docs` にした。
   - 権限は 1 つだけにする。製品は Workers、範囲は Specified Workers の `buddy-docs`、役割は Editor。
   - Editor は Worker の中身と設定を書き換えて出せるが、Worker を消せない。ほかの Worker と Access の設定には届かない。
   - 送り元の IP は絞らない。GitHub Actions の runner の IP は決まっていない。
4. GitHub のリポジトリの「Settings → Secrets and variables → Actions」に登録する。
   - Secrets: `CLOUDFLARE_API_TOKEN`（手順 3 のトークン）
   - Variables: `CLOUDFLARE_ACCOUNT_ID`（ダッシュボードの Account ID）
5. Worker の Access のタブで「すべてのトラフィック」を選び、開ける人（メールアドレスかメールのドメイン）を決める。本番とプレビューの URL が、両方とも守られる。
6. Worker の「設定」の「ドメインとルート」で、プレビュー URL を有効にする。無効のままだと、`cf previews deploy` はプレビューを上げるが URL を返さない。

- アカウント全体の Access（Workers & Pages の概要の「Cloudflare Access」のスイッチ）は使わない。同じアカウントの、公開しているほかの Worker も守られて開けなくなるためである。
- Worker の名前を変えると、新しい Worker が Access なしで出る。名前を変えるときは、先に手順 2、3、5、6 を新しい名前で行う。
- Access で守られているかは、`curl -I https://buddy-docs.emon-apps.workers.dev` が `*.cloudflareaccess.com` への 302 を返すことで確認する。
