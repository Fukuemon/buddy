---
type: context
title: コードと文書の規約
description: 命名、コメント、文書の書き方のうちこのリポジトリだけの規則、共有の設定、自動チェックの除外。lint で検出できる規則は書かない
status: stable
---

# コードと文書の規約

## Naming

- web のコンポーネントの名前は、BCD Design の「ドメイン、場面、基本の語」の順に並べる（例 `StaffFilterSidebar`、`ServiceCodeRadioGroup`）。Base と Case か Domain かは、名前の接頭辞ではなく配置先（`packages/ui` か `features/<機能>/components/`）で表す。
- Container は Presentational の名前に `Container` を付ける。対になる Presentational が無い Container（モーダルを開いて閉じるだけのものなど）は、使うコンポーネントの名前に `Container` を付けない別の名前にしてよい。
- query の hook は `use<動詞><対象>`、query options は `<対象>QueryOptions` と名付け、機能の `queries.ts` に置く。
- web の API の実装のファイルは、種類を接頭辞にする（`fakeBuddyApi.ts`、`httpBuddyApi.ts`、`bffBuddyApi.ts`）。照合の API の HTTP の実装（`http/receiptApi.ts`）だけは接頭辞を持たない。
- web の import は `#/` のエイリアスで書く。tsconfig の `@/` は使わない。
- Go のテストのためのフェイクは、`<パッケージ>test` のパッケージに置く（`oidctest`、`gcaltest`）。
- API の operationId は、lowerCamel の「動詞と名詞」にする。動詞は `get`、`list`、`create`、`update`、`cancel`、`change`、`add`、`remove` から選ぶ。
  - `add` と `remove` は、職員に権限を足す、外すのように、リソースの結び付きを足して外す操作に使う（`addUserPolicy`、`removeUserPolicy`）。
- API のパスは `/v1` の下の複数形の snake_case にする。
  - 事業所に属する一覧と作成は `/v1/facilities/{facility_id}/<リソース>`、1 件は `/v1/<リソース>/{<リソース>_id}` に置く。
  - 事業所に属さず全ての環境で同じマスタは、`/v1/<リソース>`（`/v1/policies`、`/v1/schedule_types`）か、まとまりの下（`/v1/visit_infos/service_codes`）に置く。
  - 職員の属性と結び付きは、職員の 1 件の下のサブパス（`/v1/users/{user_id}/position`、`/v1/users/{user_id}/policies`）に置く。
  - 繰り返しの予定は、予定の下の `recurring` に置く。作成は `/v1/facilities/{facility_id}/schedules/recurring`、1 件は `/v1/schedules/recurring/{recurring_schedule_id}` に置く。
    - 繰り返しの予定の 1 回の置き換えは、1 件の下の `/occurrences` に置く。
  - ログインした職員自身は、ID を持たない `/v1/me` で表す。
  - 動作はサブパス（`/cancel`）で表す。
- DB のテーブルは複数形の snake_case にする。buddy が振る ID は ULID の文字列を `text COLLATE "C"` で持つ。ULID の形の CHECK は、テーブルが振る `id` の主キーにだけ付け、外部キーのカラムには主キーを兼ねていても付けない。外部の ID（Google カレンダーの ID、組織の `org_id`、IdP の `sub`）は対象の外である。真偽のカラムは、`is_`、`has_`、`needs_` で始めるか、true のときの動作を動詞で書く（`is_over_time_work`、`needs_target`、`overwrite`）。職員のテーブルの名前は `users` で、Go の側は `staff` と呼ぶ。
- 業務の用語の表記は [業務の知識](domain.md) の用語にそろえる。文書の表記の揺れは `prh.yml` の規則が止める。

## Comments

コメントの書き方は、スキル write-comments に従う。言語は日本語の常体にする。

- Go は、文書コメントの有無を `services/receipt`、`services/schedule`、`services/broker`、`packages/go` の revive（`exported`、`package-comments`）で確かめる。生成物（`// Code generated ... DO NOT EDIT.` のファイル）とテストは、revive が対象にしない。
- TypeScript は、文書コメントの有無を、ルートの `vite.config.ts` の `lint` で確かめる。Oxlint の jsdoc のプラグインに require-jsdoc が無いので、eslint-plugin-jsdoc を `jsPlugins` で読ませる。対象は export する関数、クラス、型で、名前が `Props` で終わる型は除く。Props の型は、コンポーネントの文書コメントが説明するからである。生成物は lint の対象から外してある。呼び出しで包んで作る関数（`createServerFn(...)`、`memo(...)`）と、クラスのメソッドは確かめない。確かめるのは web、ui、e2e の check である。
- Go の文書コメントは、`// Package <名前> は、…。`、`// <名前> は、…。` の形で書く。
- 外部の制約を書く実装のコメントには、出典の URL を添える。

## Documents

文書の書き方は、スキル write-prose と write-design-docs に従う。buddy だけの規則は次のとおり。

- PRD は `docs/PRD.md`、全体の Design Doc は `docs/design/`、ADR は `docs/adr/`、画面仕様書は `docs/screens/` に置き、Zensical のサイトで読む。Design Doc と ADR の配置先は `context/project.yml` の `docs` と同じにする。
- アプリとパッケージの README は、「セットアップ、起動する、テストとチェック、コードの生成、文書」の順に見出しを置き、当てはまらない節は省く。
- 機能ごとの Design Doc は、コードの隣（`services/<API>/DesignDoc.md`、`packages/<パッケージ>/DesignDoc.md`）に置く。サイトには、`docs/design/services/` か `docs/design/packages/` のファイル単位のシンボリックリンクで載せる。リンク先は `zensical.toml` の `watch` にも並べる。
- 機能ごとの Design Doc と ADR から `docs/`、`apps/`、`services/` の文書へのリンクは、GitHub の `develop` の URL で書く。相対リンクは、GitHub とサイトで指す先が変わり、どちらかで切れる。
- 技術用語は、一般的なカタカナ語か英語で書き、和語に言い換えない（テーブル、カラム、マージ、リクエスト、レスポンス、デフォルト、ローカル環境）。業務の機能の名前（予定の取り込み、予定の書き出し、結び付け）は和語のまま書く。言い換えの一覧は `prh.yml` にある。
- 見出しのアンカーは、日本語のまま残す（`zensical.toml` の toc の slugify）。見出しを変えるときは、ほかの文書からのリンクを探して直す。
- 画面仕様書の画面 ID の規則は [画面仕様書の目次](../docs/screens/index.md) の「画面の ID の規則」に、ページの節の規則は [画面仕様書の規約](../docs/screens/rules.md) の「仕様書のページ」にある。
- 文章のチェックは textlint で、業務の用語「照合」「正本」を許す語にしている（`.textlintrc.json`）。

## Shared Configuration

| 対象 | 配置先 | 参照のしかた |
| --- | --- | --- |
| TypeScript の整形と lint（Oxlint） | ルートの `vite.config.ts` の `fmt` と `lint` | 各パッケージの `vp check` と `vp lint` がルートの設定を読む |
| TypeScript の型 | 各パッケージの `tsconfig.json` | 共有の元は無い。`apps/web` と `packages/ui` は同じオプションをコピーして持つ |
| Vitest | 各パッケージの `vite.config.ts` の `test` | web の Storybook は `.storybook/vite.config.ts` に分ける（TanStack Start の plugin が Storybook の中で動かない） |
| E2E の書き方の規則 | `packages/e2e/eslint.config.mjs` | `packages/e2e` で流したときだけ規則が当たる |
| Go の lint と整形 | `services/*/.golangci.yml`、`packages/go/.golangci.yml` | module ごとに置き、ルートには無い |
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
| `services/schedule` の `_test.go` の gosec G101 | golangci-lint | テストの接続の設定は、使い捨てのコンテナの値である |
| `packages/go/healthcheck/healthcheck.go` の gosec | golangci-lint（`//nolint:gosec`） | 宛先を `127.0.0.1` に固定し、環境変数はポートだけを決める。誤検知である |
| `docs/design/` の下のシンボリックリンク、Git で追跡しないもの | textlint（`.textlintignore`） | 同じ文書を 2 回見ないため。元の文書は元の場所で見る |

## E2E

E2E のテストのコード（`packages/e2e/tests/`）の書き方は、スキル write-e2e-test と [E2E のテストのコードの設計](../packages/e2e/DesignDoc.md) に従う。ここには、buddy で決めた値だけを書く。

- testid は、画面仕様書のモック（`docs/screens/<画面 ID>_<画面の名前>/mocks/`）の `data-testid` を正本にする。testid を足すときは、同じ pull request でモックにも足す。E2E が使う testid がモックにあるかは、`pnpm check:screens` が確かめる。
  - 形は、小文字の英語と `-` で、`<画面か部品>-<要素>` にする（例: `receipt-check-submit`）。一覧の行のように同じ要素が並ぶものは、末尾に ID を付ける（例: `staff-filter-staff-{職員の id}`）。区分のように API の値を末尾に付けるときは、値の `_` をそのまま残す（例: `receipt-summary-schedule_only`）。
- 画面 ID の形は、`docs/screens/index.md` の「画面の ID の規則」にある。`packages/e2e/eslint.config.mjs` の `screenIdPattern` は、その表のドメインと種類の組を止める。ドメインか種類を足したら、`screenIdPattern` にも足す。
  - `schedule-calendar` や `receipt-result-table` のように、画面 ID で始まる testid は `widgets/` に直に書けない。`widgets/` を作るときは、testid の接頭辞を引数で受ける。
- 固定の待ちを許すファイルは無い。
- 待つ時間の名前は、`packages/e2e/tests/fixtures/timeouts.ts` に置く。
