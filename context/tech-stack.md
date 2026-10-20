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
| web と packages のランタイム | Node | `mise.toml`、`apps/web/Dockerfile` |
| JavaScript のパッケージ管理 | pnpm | `mise.toml` と `package.json` の `packageManager`（同じバージョンにする） |
| 2 つの API のランタイム | Go | `mise.toml`、`apps/*/go.mod`、`apps/*/Dockerfile` |
| ビルド、開発サーバー、整形、lint、Vitest | Vite+（`vp`） | `pnpm-workspace.yaml` の catalog |
| 型のチェック | TypeScript | 各パッケージの `package.json` |
| 画面 | TanStack Start、Router、Query、React、Tailwind CSS | `apps/web/package.json` |
| デザインシステムのトークン | `@digital-go-jp/design-tokens` | `packages/ui/package.json` |
| コンポーネントのカタログ | Storybook | `apps/web/package.json`、`packages/ui/package.json` |
| E2E とブラウザのテスト | Playwright | `packages/e2e/package.json`、`packages/ui/package.json`（同じバージョンにする） |
| E2E の書き方の規則 | ESLint | `packages/e2e/package.json` |
| 予定の API の HTTP | gin | `apps/schedule-api/go.mod` |
| API のサーバーの生成 | oapi-codegen（`go tool`） | 各 `go.mod` の `tool` |
| 画面の API の型の生成 | openapi-typescript | `apps/web/package.json` |
| SQL からの Go の生成 | sqlc | `mise.toml` |
| マイグレーション | golang-migrate | `mise.toml`（CLI）、`apps/schedule-api/go.mod`（ライブラリ） |
| Go の lint と整形 | golangci-lint | `mise.toml`、設定は `apps/*/.golangci.yml` |
| 文書のサイト | Zensical（uv で動かす） | `pyproject.toml`、`uv.lock`、uv は `mise.toml` |
| 文章のチェック | textlint | `package.json` |
| Git のフック、コミットの形式 | lefthook、commitlint | `package.json` |
| スキルとフックの配置 | apm | `mise.toml`、パッケージは `apm.yml` と `apm.lock.yaml` |
| 手元の全体の起動 | Docker Compose（MySQL、Valkey、mock-oauth2-server） | `compose.yml` のイメージのタグ |
| 実行のイメージ | distroless（API）、`node:24-slim`（web） | `apps/*/Dockerfile` |

- パッケージマネージャーが管理しないツールは、mise（`mise.toml`）、Go の `tool`（`go.mod`）、Docker のイメージのタグ（`compose.yml`、`Dockerfile`）の 3 か所で固定する。
- 録画に要る `ffmpeg` と `ffprobe` は、どこでも固定していない。各自が入れる。

## Upgrade Checks

- 生成のツール（oapi-codegen、sqlc、openapi-typescript）を上げたら、`pnpm check:generated` で生成し直し、差分を読んでからコミットする。oapi-codegen は、`apps/schedule-api/oapi-codegen.yaml` の型の置き換え（日付とメールを文字列にする）が生成物に反映されているかを見る。
- Go を上げるときは、`mise.toml`、2 つの `go.mod`、2 つの `Dockerfile` の 5 か所をそろえる。
- Playwright は、`packages/e2e` と `packages/ui` を同じバージョンにし、`pnpm-lock.yaml` に 1 つのバージョンだけがあることを確かめる。Vite+ も Playwright を peer で取り込むので、Vite+ を上げたときも確かめる。
- Vite+ は、`pnpm-workspace.yaml` の catalog の `vite-plus` と `vite`（`@voidzero-dev/vite-plus-core` への別名）を一緒に上げる。
- TanStack の Router、Query、Start は、`apps/web/package.json` に厳密なバージョンで書いてある。上げたら、`pnpm --filter @buddy/web check`、`test`、`build` と、compose での画面の確かめ（`pnpm e2e`）を流す。
- `@digital-go-jp/design-tokens` は、ADR-0004 の決めたとおり、上げる前にトークンの名前と値の差分を読み、`pnpm --filter @buddy/ui test` でコントラストのテストを流す。
- MySQL、Valkey、IdP のイメージを上げたら、`docker compose up --build --wait` と `pnpm e2e` を流す。schedule-api のテストの MySQL は `apps/schedule-api/internal/infrastructure/mysql/main_test.go` にもタグがある。

## Scaffolding

公式の雛形のコマンドは使わず、既存のモジュールを写して始める。

- DB を持たない Go の API は `apps/receipt-api`、DB と層を持つ Go の API は `apps/schedule-api` を写す。写した後に次をそろえる。
  - `go.mod` のモジュールのパス（`github.com/Fukuemon/buddy/apps/<名前>`）と、`.golangci.yml` の goimports の `local-prefixes`
  - `openapi.yaml`、`oapi-codegen.yaml`、`generate.go` の `go:generate`
  - `/healthz`、`/readyz`、`api healthcheck` のサブコマンド（compose のヘルスチェックが使う）
  - ルートの `compose.yml` のサービス、`scripts/check-generated.sh` の生成と対象
- pnpm のパッケージは、UI のライブラリなら `packages/ui`、テストのコードと kit なら `packages/e2e` を写す。名前は `@buddy/<名前>`、`"private": true`、`"type": "module"` にし、依存は `workspace:*` で指す。整形と lint の設定は、ルートの `vite.config.ts` を使う。
- 新しいアプリを足したら、README を「準備、動かす、テストとチェック、コードの生成、文書」の見出しで書き、機能の Design Doc を隣に置く（[CONTRIBUTING.md](../CONTRIBUTING.md) の「文書を直すとき」）。
