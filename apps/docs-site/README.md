# @buddy/docs-site

文書のサイト（Zensical）と、apps/web の Storybook（デザインシステムのカタログ）を、1 つの Cloudflare Worker（`buddy-docs`）の静的なファイルとして公開する。  
サイトは Cloudflare Access で許可した人だけが開ける。カタログの組み方と、公開先を選んだ理由は [ADR-0004](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0004-design-system.md) にある。

| 環境 | 文書のサイト | カタログ | 出す契機 |
| --- | --- | --- | --- |
| 本番 | `https://buddy-docs.fukuemony029.workers.dev` | 同じ URL の `/storybook/` | develop に push したとき |
| プレビュー | pull request ごとの URL。ワークフローが pull request にコメントする | 同じ URL の `/storybook/` | pull request を作るか、push したとき |

## 成果物を作る

リポジトリのルートで、次を実行する。

```sh
pnpm site:build
```

次の順に動く。

1. `uv run zensical build --clean` で、文書のサイトを `site/` に作る。
2. `pnpm --filter @buddy/web build-storybook` で、Storybook を `apps/web/storybook-static/` に作る。
3. `scripts/build-docs-site.mjs` で、2 つを `apps/docs-site/public/` に並べる。`/` に文書、`/storybook/` にカタログを置く。
4. `cf build --mode production` で、公開する形の成果物を `apps/docs-site/.cloudflare/output/` に作る。

`pnpm --filter @buddy/docs-site deploy:dry-run` で、Cloudflare に送らずに成果物を確かめられる。認証は要らない。

文書のサイトのリンクは相対の URL なので、カタログを下のパスに置いても行き来できる。文書のトップのカタログへのリンク（`storybook/`）は、手元の `zensical serve` では開けない。

## 公開の仕組み

`.github/workflows/docs-site.yml` が、Cloudflare の CLI `cf` で出す。

- pull request では `cf previews deploy pr-<番号>` でプレビューを出し、URL を pull request にコメントする。
- develop への push では `cf deploy --prebuilt --mode production` で本番に出す。
- 文書の元は docs/ のほか、各アプリの Design Doc にも散るので、変えた場所で絞らずに全ての pull request で動かす。
- `cloudflare.config.ts` が Worker の名前（`buddy-docs`）と、workers.dev とプレビューの URL を有効にする設定を持つ。静的なファイルの置き場は `wrangler.config.ts` にある。`cf` の 1.0.0-beta は、静的なファイルのビルドを wrangler に任せるためである。
- `cf` は beta なので、バージョンを固定している。上げるときは、pull request のプレビューと `deploy:dry-run` が通ることを確かめる。

## Cloudflare の準備

公開には、利用者が Cloudflare で次を用意する。手順は 2026-10 の Cloudflare のダッシュボードで確かめた。

1. Cloudflare のアカウントを作り、Zero Trust を有効にする（Free のプランでよい）。
2. API トークンを作る。テンプレートは「Edit Cloudflare Workers」で、対象のアカウントを 1 つに絞る。名前は `github-actions-buddy-storybook` にした。
3. GitHub のリポジトリの「Settings → Secrets and variables → Actions」に登録する。
   - Secrets: `CLOUDFLARE_API_TOKEN`（手順 2 のトークン）
   - Variables: `CLOUDFLARE_ACCOUNT_ID`（ダッシュボードの Account ID）
4. 公開の前に、Workers & Pages で Worker `buddy-docs` を作る（中身は Hello World のままでよい）。
5. Worker の Access のタブで「すべてのトラフィック」を選び、開ける人（メールアドレスかメールのドメイン）を決める。本番とプレビューの URL が、両方とも守られる。
6. Worker の「設定」の「ドメインとルート」で、プレビュー URL を有効にする。無効のままだと、`cf previews deploy` はプレビューを上げるが URL を返さない。

- アカウント全体の Access（Workers & Pages の概要の「Cloudflare Access」のスイッチ）は使わない。同じアカウントの、公開しているほかの Worker も守られて開けなくなるためである。
- Worker の名前を変えると、新しい Worker が Access なしで出る。名前を変えるときは、先に手順 4 から 6 を新しい名前で行う。
- Access で守られているかは、`curl -I https://buddy-docs.fukuemony029.workers.dev` が `*.cloudflareaccess.com` への 302 を返すことで確かめる。
