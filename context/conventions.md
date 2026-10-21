---
type: context
title: コードと文書の規約
description: 命名、コメント、文書の書き方のうちこのリポジトリだけの規則、共有の設定、自動チェックの除外。lint で検出できる規則は書かない
status: stable
---

# コードと文書の規約

## Naming

- web のコンポーネントの名前は、BCD Design の「ドメイン、場面、基本の語」の順に並べる（例 `StaffFilterSidebar`、`ServiceCodeRadioGroup`）。Base と Case か Domain かは、名前の接頭辞ではなく置き場（`packages/ui` か `features/<機能>/components/`）で表す。
- Container は Presentational の名前に `Container` を付ける。対になる Presentational が無い Container（モーダルを開いて閉じるだけのものなど）は、使うコンポーネントの名前に `Container` を付けない別の名前にしてよい。
- query の hook は `use<動詞><対象>`、query options は `<対象>QueryOptions` と名付け、機能の `queries.ts` に置く。
- web の API の実装のファイルは、種類を接頭辞にする（`fakeBuddyApi.ts`、`httpBuddyApi.ts`、`bffBuddyApi.ts`）。照合の API の HTTP の実装（`http/receiptApi.ts`）だけは接頭辞を持たない。
- web の import は `#/` の別名で書く。tsconfig の `@/` は使わない。
- Go のテストのための偽物は、`<パッケージ>test` のパッケージに置く（`oidctest`、`gcaltest`）。
- API の operationId は、lowerCamel の「動詞と名詞」にする。動詞は `get`、`list`、`create`、`update`、`cancel`、`change` から選ぶ。パスは `/v1` の下の複数形の snake_case で、事業所に属する一覧と作成は `/v1/facilities/{facility_id}/<資源>`、1 件は `/v1/<資源>/{<資源>_id}` に置く。動作はサブパス（`/cancel`）で表す。
- DB の表は複数形の snake_case、ID は ULID の `CHAR(26)`、真偽の列は `is_` で始める。職員の表の名前は `users` で、Go の側は `staff` と呼ぶ。
- 業務の用語の表記は [業務の知識](domain.md) の用語にそろえる。文書の表記の揺れは `prh.yml` の規則が止める。

## Comments

コメントの書き方は、スキル write-comments に従う。言語は日本語の常体にする。

- Go は、文書コメントの有無を receipt-api と schedule-api の revive（`exported`、`package-comments`）で確かめる。生成物（`// Code generated ... DO NOT EDIT.` のファイル）とテストは、revive が対象にしない。
- TypeScript は、文書コメントの有無をレビューで確かめる。Oxlint（1.88.0）の jsdoc のプラグインに、eslint-plugin-jsdoc の require-jsdoc に当たる規則が無いからである。
- Go の文書コメントは、`// Package <名前> は、…。`、`// <名前> は、…。` の形で書く。
- 外部の制約を書く実装のコメントには、出典の URL を添える。

## Documents

文書の書き方は、スキル write-prose と write-design-docs に従う。buddy だけの規則は次のとおり。

- PRD は `docs/PRD.md`、全体の Design Doc は `docs/design/`、ADR は `docs/adr/`、画面仕様書は `docs/screens/` に置き、Zensical のサイトで読む。Design Doc と ADR の置き場は `context/project.yml` の `docs` と同じにする。
- 機能ごとの Design Doc は、コードの隣（`apps/<アプリ>/DesignDoc.md`、`packages/<パッケージ>/DesignDoc.md`）に置く。サイトには、`docs/design/apps/` か `docs/design/packages/` のファイル単位のシンボリックリンクで載せる。リンク先は `zensical.toml` の `watch` にも並べる。
- 機能ごとの Design Doc と ADR から `docs/` と `apps/` の文書へのリンクは、GitHub の `develop` の URL で書く。相対リンクは、GitHub とサイトで指す先が変わり、どちらかで切れる。
- 見出しのアンカーは、日本語のまま残す（`zensical.toml` の toc の slugify）。見出しを変えるときは、ほかの文書からのリンクを探して直す。
- 画面仕様書の画面 ID と節の規則は、[画面仕様書の目次](../docs/screens/index.md) にある。
- 文章のチェックは textlint で、業務の用語「照合」「正本」を許す語にしている（`.textlintrc.json`）。

## Shared Configuration

| 対象 | 置き場 | 参照のしかた |
| --- | --- | --- |
| TypeScript の整形と lint（Oxlint） | ルートの `vite.config.ts` の `fmt` と `lint` | 各パッケージの `vp check` と `vp lint` がルートの設定を読む |
| TypeScript の型 | 各パッケージの `tsconfig.json` | 共有の元は無い。`apps/web` と `packages/ui` は同じオプションを写して持つ |
| Vitest | 各パッケージの `vite.config.ts` の `test` | web の Storybook は `.storybook/vite.config.ts` に分ける（TanStack Start の plugin が Storybook の中で動かない） |
| E2E の書き方の規則 | `packages/e2e/eslint.config.mjs` | `packages/e2e` で流したときだけ規則が当たる |
| Go の lint と整形 | `.golangci.yml` | ルートに 1 つ置き、2 つの API に当てる |
| 文章 | `.textlintrc.json`、`prh.yml`、`.textlintignore` | ルートで `pnpm exec textlint` |
| コミットの形式 | `commitlint.config.mjs` | lefthook の commit-msg |
| Vite+ と vite のバージョン | `pnpm-workspace.yaml` の catalog | 各パッケージは `catalog:` で指す |

## Check Exclusions

| 除外しているもの | チェック | 理由 |
| --- | --- | --- |
| `routeTree.gen.ts`、`src/api/generated/**` | 整形、lint | 生成物である。生成のし直しで差分を確かめる（`pnpm check:generated`） |
| `**/*.md` | 整形（`vp fmt`） | 文書は textlint で確かめる |
| `dist`、`storybook-static` | lint | ビルドの出力である |
| Go の生成物 | golangci-lint（`exclusions.generated: lax`） | 生成物である |
| schedule-api の `_test.go` の gosec G101 | golangci-lint | テストの接続の設定は、使い捨てのコンテナの値である |
| 両方の API の `cmd/api/healthcheck.go` の gosec | golangci-lint（`//nolint:gosec`） | 宛先を `127.0.0.1` に固定し、環境変数はポートだけを決める。誤検知である |
| `docs/design/` の下のシンボリックリンク、Git で追跡しないもの | textlint（`.textlintignore`） | 同じ文書を 2 回見ないため。元の文書は元の場所で見る |

## E2E

E2E のテストのコード（`packages/e2e/tests/`）の書き方は、スキル write-e2e-test と [E2E のテストのコードの設計](../packages/e2e/DesignDoc.md) に従う。ここには、buddy で決めた値だけを書く。

- testid は、画面仕様書のモック（`docs/screens/<画面 ID>_<画面の名前>/mocks/`）の `data-testid` を正本にする。testid を足すときは、同じ pull request でモックにも足す。E2E が使う testid がモックにあるかは、`pnpm check:screens` が確かめる。
  - 形は、小文字の英語と `-` で、`<画面か部品>-<要素>` にする（例: `receipt-check-submit`）。一覧の行のように同じ要素が並ぶものは、末尾に ID を付ける（例: `staff-filter-staff-{職員の id}`）。区分のように API の値を末尾に付けるときは、値の `_` をそのまま残す（例: `receipt-summary-schedule_only`）。
- 画面 ID の形は、`docs/screens/index.md` の「画面の ID の規則」にある。`packages/e2e/eslint.config.mjs` の `screenIdPattern` は、その表のドメインと種類の組を止める。ドメインか種類を足したら、`screenIdPattern` にも足す。
  - `schedule-calendar` や `receipt-result-table` のように、画面 ID で始まる testid は `widgets/` に直に書けない。`widgets/` を作るときは、testid の接頭辞を引数で受ける。
- 固定の待ちを許すファイルは無い。
- 待つ時間の名前は、`packages/e2e/tests/fixtures/timeouts.ts` に置く。
