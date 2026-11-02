---
type: context
title: 技術スタック
description: 採用しているツールの役割とバージョンの所在、バージョンの更新の確認、新しいモジュールの作り始め。バージョンそのものと選んだ理由は書かない
status: stable
---

# 技術スタック

## Toolchain

| 役割 | ツール | バージョンの所在 |
| --- | --- | --- |
| ランタイムとツールの管理 | mise | `mise.toml` |
| web と packages のランタイム | Node | `mise.toml`、`apps/web/Dockerfile`、`.github/workflows/ci.yml` と `.github/workflows/docs-site.yml` の `node-version`（同じメジャーバージョンにする） |
| JavaScript のパッケージ管理 | pnpm | `mise.toml` と `package.json` の `packageManager`（同じバージョンにする） |
| 2 つの API とブローカーのランタイム | Go | `mise.toml`、`services/*/go.mod`、`packages/go/go.mod`、`services/*/Dockerfile` |
| ビルド、開発サーバー、整形、lint、Vitest | Vite+（`vp`） | `pnpm-workspace.yaml` の catalog |
| 型のチェック | TypeScript | 各パッケージの `package.json` |
| 画面 | TanStack Start、Router、Query、React、Tailwind CSS | `apps/web/package.json`、`apps/broker/package.json`（ID ブローカーの画面の生成） |
| デザインシステムのトークン | `@digital-go-jp/design-tokens` | `packages/ui/package.json` |
| コンポーネントのカタログ | Storybook | `apps/web/package.json`、`packages/ui/package.json` |
| E2E とブラウザのテスト | Playwright | `packages/e2e/package.json`、`packages/ui/package.json`（同じバージョンにする） |
| E2E の書き方の規則 | ESLint | `packages/e2e/package.json` |
| 予定の API の HTTP | gin | `services/schedule/go.mod` |
| 予定の API とブローカーの DB のドライバー | pgx/v5 | `services/schedule/go.mod`、`services/broker/go.mod` |
| 予定の API とブローカーの結合テストの PostgreSQL のコンテナ | testcontainers-go | `services/schedule/go.mod`、`services/broker/go.mod` |
| API のサーバーの生成 | oapi-codegen（`go tool`） | 各 `go.mod` の `tool` |
| 画面の API の型の生成 | openapi-typescript | `apps/web/package.json` |
| web のサーバーから見た API のフェイク（テストと `dev:msw`） | MSW、openapi-msw | `apps/web/package.json` |
| OpenAPI の定義の lint | Redocly CLI | `package.json`、規則は `redocly.yaml` |
| API の仕様のページ | Scalar（jsDelivr から読む） | `docs/api/reference.js` の import の URL |
| SQL からの Go の生成 | sqlc | `mise.toml` |
| マイグレーション | golang-migrate | `mise.toml`（CLI）、`services/schedule/go.mod` と `services/broker/go.mod`（ライブラリ） |
| Go の lint と整形 | golangci-lint | `mise.toml`、設定は `services/*/.golangci.yml` と `packages/go/.golangci.yml` |
| テーブル定義書と ER 図の元（`schema.json`）の生成 | tbls | `mise.toml` |
| 操作できる ER 図のサイト | Liam ERD CLI | `package.json` |
| ドキュメントサイト | Zensical（uv で実行する） | `pyproject.toml`、`uv.lock`、uv は `mise.toml` と `.github/workflows/docs-site.yml` の setup-uv（同じバージョンにする） |
| ドキュメントサイトの公開 | cf、wrangler | `apps/docs-site/package.json` |
| 文章のチェック | textlint | `package.json` |
| Git のフック、コミットの形式 | lefthook、commitlint | `package.json` |
| スキルとフックの配置 | apm | `mise.toml`、パッケージは `apm.yml` と `apm.lock.yaml` |
| エビデンスの動画の添付 | gh | `mise.toml`。CI のワークフローは、GitHub のランナーではランナーの gh を使い、self-hosted runner では mise で入れる |
| ローカル環境の全体の起動 | Docker Compose（PostgreSQL、Valkey、Ory Hydra、mock-oauth2-server、calendarpit） | `compose.yml` のイメージのタグ |
| 実行のイメージ | distroless（API、ブローカー）、`node:24-slim`（web） | `services/*/Dockerfile` |

録画に要る `ffmpeg` と `ffprobe` は、どこでもバージョンを固定していない。  
各自が入れる。

## Upgrade Checks

- 生成のツール（oapi-codegen、sqlc、openapi-typescript）を上げたら、`pnpm check:generated` で生成し直し、差分を読んでからコミットする。
  - oapi-codegen は、`services/schedule/oapi-codegen.yaml` の型の置き換え（日付とメールを文字列にする）が生成物に反映されているかを見る。
- Go を上げるときは、`mise.toml`、4 つの `go.mod`、3 つの `Dockerfile` の 8 か所をそろえる。
  - API とブローカーごとに上げてもよい。ただし、`packages/go` の `go.mod` の Go のバージョンは、2 つの API とブローカーのうち最も低いもの以下にする。
- Playwright は、`packages/e2e` と `packages/ui` を同じバージョンにし、`pnpm-lock.yaml` に 1 つのバージョンだけがあることを確認する。
  - Vite+ も Playwright を peer で取り込むので、Vite+ を上げたときも確認する。
- Vite+ は、`pnpm-workspace.yaml` の catalog の `vite-plus` と `vite`（`@voidzero-dev/vite-plus-core` へのエイリアス）を一緒に上げる。
- TanStack の Router、Query、Start は、`apps/web/package.json` に厳密なバージョンで書いてある。
  - 上げたら、`pnpm --filter @buddy/web check`、`test`、`build` と、compose での画面の確認（`pnpm e2e`）を流す。
- `@digital-go-jp/design-tokens` は、ADR-0004 の決めたとおり、上げる前にトークンの名前と値の差分を読み、`pnpm check:contrast` でコントラストのチェックを流す。
- PostgreSQL、Valkey、IdP、calendarpit のイメージを上げたら、`docker compose up --build --wait` と `pnpm e2e` を流す。
  - PostgreSQL のタグは同じタグにそろえる。タグがあるのは次の 5 か所。
    - `compose.yml`
    - `services/schedule/internal/postgres/main_test.go`
    - `services/broker/internal/postgres/postgres_test.go`
    - `scripts/build-db-docs.sh`
    - `services/schedule/README.md` の手順
  - calendarpit のタグは同じバージョンにそろえる。タグがあるのは次の場所。
    - `compose.yml` の `calendarpit` と `calendarpit-authorize`（バージョンと digest）
    - `services/schedule/README.md` の手順（バージョンだけ）
  - `scripts/build-db-docs.sh` は、テーブル定義書に PostgreSQL のバージョンが入るので、パッチバージョンまで固定している。
    - 上げたら `pnpm generate:db-docs` でテーブル定義書を生成し直し、コミットする。
- uv を上げたら、`mise.toml` と `.github/workflows/docs-site.yml` の setup-uv の `version` をそろえる。
- tbls か Liam ERD CLI を上げたら、`pnpm generate:db-docs` と `pnpm build:erd` を流す。
  - `scripts/build-erd.mjs` は、Liam ERD が tbls の viewpoint の `id` を拒むので、`id` を外してから渡している。上げた後もこの処理が要るかを確認する。

## Scaffolding

公式のテンプレートのコマンドは使わず、既存のモジュールをコピーして始める。

- DB を持たない Go の API は `services/receipt`、DB と層を持つ Go の API は `services/schedule` をコピーする。コピーした後に次をそろえる。
  - `go.mod` のモジュールのパス（`github.com/Fukuemon/buddy/services/<名前>`）と、`packages/go` の `require` と `replace`
  - `.golangci.yml` の goimports の `local-prefixes`
  - `Dockerfile` と `Dockerfile.dockerignore` のアプリのパス（ビルドの文脈はリポジトリの直下）
  - `openapi.yaml`、`oapi-codegen.yaml`、`generate.go` の `go:generate`
  - `/healthz`、`/readyz`、`api healthcheck` のサブコマンド（compose のヘルスチェックが使う）
  - ルートの `compose.yml` のサービス、`scripts/check-generated.sh` の生成と対象
- pnpm のパッケージは、UI のライブラリなら `packages/ui`、テストのコードと kit なら `packages/e2e` をコピーする。
  - 名前は `@buddy/<名前>`、`"private": true`、`"type": "module"` にし、依存は `workspace:*` で指す。
  - 整形と lint の設定は、ルートの `vite.config.ts` を使う。
- 新しいアプリを足したら、README を [コードと文書の規約](conventions.md#documents) の見出しの順で書き、機能の Design Doc を隣に置く。
