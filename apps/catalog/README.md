# @buddy/catalog

apps/web の Storybook（デザインシステムのカタログ）を、Cloudflare Workers の静的なファイルとして公開する。  
カタログは Cloudflare Access で許可した人だけが開ける。カタログの組み方と、公開先を選んだ理由は [ADR-0004](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0004-design-system.md) にある。

| 環境 | URL | 出す契機 |
| --- | --- | --- |
| 本番 | `https://buddy-storybook.fukuemony029.workers.dev` | develop に push したとき |
| プレビュー | pull request ごとの URL。ワークフローが pull request にコメントする | apps/web、packages/ui、apps/catalog を変える pull request |

## 成果物を作る

リポジトリのルートで、次を実行する。apps/web の Storybook をビルドし、`cf build` で `apps/catalog/.cloudflare/output/` に公開する形の成果物を作る。

```sh
pnpm storybook:pages
```

`pnpm --filter @buddy/catalog deploy:dry-run` で、Cloudflare に送らずに成果物を確かめられる。認証は要らない。

## 公開の仕組み

`.github/workflows/catalog.yml` が、Cloudflare の CLI `cf` で出す。

- pull request では `cf previews deploy pr-<番号>` でプレビューを出し、URL を pull request にコメントする。
- develop への push では `cf deploy --prebuilt --mode production` で本番に出す。
- `cloudflare.config.ts` が Worker の名前（`buddy-storybook`）を持つ。静的なファイルの置き場は `wrangler.config.ts` にある。`cf` の 1.0.0-beta は、静的なファイルのビルドを wrangler に任せるためである。
- `cf` は beta なので、バージョンを固定している。上げるときは、pull request のプレビューと `deploy:dry-run` が通ることを確かめる。

## Cloudflare の準備

公開には、利用者が Cloudflare で次を用意する。手順は 2026-10 の Cloudflare のダッシュボードで確かめた。

1. Cloudflare のアカウントを作り、Zero Trust を有効にする（Free のプランでよい）。
2. API トークンを作る。テンプレートは「Edit Cloudflare Workers」で、対象のアカウントを 1 つに絞る。名前は `github-actions-buddy-storybook` にした。
3. GitHub のリポジトリの「Settings → Secrets and variables → Actions」に登録する。
   - Secrets: `CLOUDFLARE_API_TOKEN`（手順 2 のトークン）
   - Variables: `CLOUDFLARE_ACCOUNT_ID`（ダッシュボードの Account ID）
4. 公開の前に、Workers & Pages で Worker `buddy-storybook` を作る（中身は Hello World のままでよい）。
5. Worker の Access のタブで「すべてのトラフィック」を選び、開ける人（メールアドレスかメールのドメイン）を決める。本番とプレビューの URL が、両方とも守られる。

- アカウント全体の Access（Workers & Pages の概要の「Cloudflare Access」のスイッチ）は使わない。同じアカウントの、公開しているほかの Worker も守られて開けなくなるためである。
- Worker の名前を変えると、新しい Worker が Access なしで出る。名前を変えるときは、先に手順 4 と 5 を新しい名前で行う。
- Access で守られているかは、`curl -I https://buddy-storybook.fukuemony029.workers.dev` が `*.cloudflareaccess.com` への 302 を返すことで確かめる。
