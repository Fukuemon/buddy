---
type: context
title: コードベースの構造
description: モジュールの境界、依存してよい向き、状態の置き場、新しいコードの置き場。コードから読み取れる構造は書かない
status: stable
---

# コードベースの構造

## Module Boundaries

実行の単位の責務と、その間の約束は [buddy Design Doc](../docs/design/DesignDoc.md) にある。ここには、境界をまたぐときの取り決めだけを書く。

- `apps/` の 3 つのアプリは、HTTP だけでつながる。web と API の間の型は、各 API の `openapi.yaml` から生成し、手で書かない。
- 業務の規則と認可は API が持つ。web は、画面の表示の規則（照合の印と CSV の書き出しを含む）だけを持ち、拒否の判断を API に任せる。
- `packages/ui` は、BCD Design の Base と Case のコンポーネントとトークンだけを持つ。業務の名前（予定、照合など）を持つ Domain のコンポーネントは、`apps/web` の `features/<機能>/components/` に置く（[ADR-0004](../docs/adr/0004-design-system.md)）。
- `packages/e2e` の `kit/` は、別のリポジトリ（非公開）から写したもので、buddy の画面の名前を持たない。buddy の画面に依存するコードは `tests/` に置く。
- schedule-api は、規則と手順を機能ごとのパッケージ（`organization`、`staff`、`patient`、`visit`、`schedule`）に置く。DB と HTTP のアダプタ（`postgres`、`httpapi`）は 1 つずつ置く（[ADR-0005](../docs/adr/0005-schedule-api-packages.md)）。機能のパッケージの中は、手順（`Usecase`）、規則の関数、集約の単位のリポジトリに分ける（[ADR-0010](../docs/adr/0010-schedule-api-usecase-boundaries.md)）。receipt-api は、照合の段（読み込み、正規化、対の作成、判定）ごとにパッケージを分ける。

## Dependency Rules

- apps 同士はコードで依存しない。Go の API 同士の import と、web から Go のコードの参照は無い。
  - 2 つの Go の API が共有するコードは、別の module の `packages/go` にだけ置き、`go.mod` の `replace` で読む（[ADR-0007](../docs/adr/0007-go-shared-module.md)）。`packages/go` は、トークンの検証（`oidc`、`oidc/oidctest`）、ヘルスチェック（`healthcheck`）、Google カレンダーの題名の解釈（`gcaltitle`）を持ち、`apps/` を import しない。`gcaltitle` は、サービス内容と利用者名の表記のそろえ方も持つ。
- web は `@buddy/ui` に依存してよい。`packages/ui` から `apps/` へは依存しない。
- web の `features/<機能>/` の間は import しない。2 つの機能が使うものは、`components/site/`（サイト共通のコンポーネント）か `@buddy/ui` に置く。
- schedule-api の依存は、アダプタ（`httpapi`、`postgres`）、`access`、機能のパッケージ、共通のパッケージ（`apperr`、`tx`、`kernel`、`civil`）の 1 方向に限る。
  - 共通のパッケージは、標準ライブラリと、共通のパッケージの間（`kernel` から `apperr`）だけに依存する。
  - 機能のパッケージの間は、`organization`、`staff`、`visit`、`patient`、`schedule`、`calendar` の順にだけ import する。`principal` は `organization` と `staff` に依存し、`schedule`、`calendar`、`access`、`httpapi`、`cmd` から使う。
  - 機能のパッケージは、自分の集約のリポジトリのインターフェイスと、使う側で定義した小さなインターフェイス（`kernel.Finder` か 1〜2 のメソッド）だけに依存する。ほかの機能のリポジトリのインターフェイスは import しない。トランザクションは `tx.Transactor` で受ける。アダプタを import しない。`access` は機能のパッケージではないので、この規則の対象の外にする。
  - `config` は DB のアダプタを import しない。`cmd` が `config` の値をアダプタの設定に写す。
  - `postgres`、`oidc`、`ulid`、`gcal` は機能のパッケージのインターフェイスを実装する。`httpapi` から `postgres` と `oidc` を import するのは、テストのファイルだけにする。`httpapi` は、パスの ID の形の確認に `ulid` を使う。
  - `inmem` を import するのは、テストのファイルだけにする。
- receipt-api の依存は、`record` と `civil` を末端にして、読み込み、正規化、対の作成、判定、つなぐ段（`check`）、取得元、HTTP の順の 1 方向に限る。判定はサービスの規則（`servicerule`）を、取得元は Google カレンダー（`gcal`）を使う。
- 依存の向きを確かめる lint は入れていない。レビューで確かめる。E2E の層の向きだけは、`packages/e2e/eslint/e2e-authoring-rule.mjs` が止める。

## State Ownership

| 状態 | 置き場 | 持ち主 |
| --- | --- | --- |
| 事業所、職員、利用者、予定、権限 | PostgreSQL | schedule-api だけ。一覧と作成は事業所の ID で絞り、1 件を指す要求は資源の事業所を確かめる |
| ログインのセッションとトークン | Valkey | web の BFF。ブラウザには署名した cookie でセッションの ID だけを渡す |
| 照合の入力の CSV と結果 | 保存しない | receipt-api は 1 回の要求で返し、web は query の cache にだけ置く。画面を読み直すと消える |
| 画面の表示の条件（表示の単位、日付、絞り込みの職員） | URL の search params | web の route。zod で検証し、既定の値は URL に書かない |
| API から取ったデータ | TanStack Query の cache | web。query の key は機能ごとの `queries.ts` に置き、変更したら invalidate する |
| 偽物の API のデータ | ブラウザのメモリ | `VITE_API_MODE=fake` の web。読み直すと消える |

## Placement Rules

- web の機能のコードは `src/features/<機能>/` に置き、中を `components/`、`lib/`、`schema/`、`constants/`、`queries.ts` に分ける。
  - 画面のコンポーネントは、表示だけを持つ Presentational（`<名前>.tsx`）と、query と router を読んで渡す Container（`<名前>Container.tsx`）を同じディレクトリに並べる。route のファイルは Container を呼ぶ。
  - テストと story は対象の隣に置く（コロケーション）。
- web の API の呼び出しは `src/api/` に置く。生成した型は `generated/` に置く。`VITE_API_MODE` で、ブラウザのメモリで動く偽物（`fake/`）と、BFF の server function を呼ぶ実装（`bff/`）を切り替える。`http/` は、サーバーから API を呼ぶ実装で、`src/server/` から使う。サーバーだけで動く処理は `src/server/` に置く。
- `packages/ui` へ移すのは、業務の名前を持たず、2 つ以上の画面で同じ形で使うコンポーネントだけにする。移すときは Base か Case かを [DESIGN.md](../packages/ui/DESIGN.md) の基準で決める。
- schedule-api のハンドラは `internal/httpapi` に、生成したインターフェイスのメソッドとして書く。クエリは `db/queries`、マイグレーションは `db/migrations`、シードは `db/seed` に置く。
- receipt-api に照合の段を足すときは、段ごとに `internal/` の下にパッケージを作り、`check` でつなぐ。
- E2E のコードの置き場は、[E2E のテストのコードの設計](../packages/e2e/DesignDoc.md) の判断の流れに従う。
- 機能ごとの Design Doc は、対象のコードの隣に `DesignDoc.md` として置く。
