---
type: context
title: テスト
description: テストの種類ごとの責務、実行に要る環境の条件、置き換えの方針、変更に足すテスト
status: stable
---

# テスト

## Test Types and Guarantees

| 種類 | 保証すること | 置き場 | 流し方 |
| --- | --- | --- | --- |
| Go の単体テスト（規則） | 値の検証、繰り返しの規則、予定の権限の判定、照合の判定の規則 | 対象のパッケージの隣の `*_test.go`（表駆動） | 各 API で `go test ./...` |
| Go の単体テスト（機能のパッケージ） | 手順、権限の判定、事業所をまたぐ参照の拒否 | `apps/schedule-api/internal/<機能>`、`internal/access`（`internal/inmem` のメモリ上のリポジトリ） | 同上 |
| Go の結合テスト（リポジトリ） | SQL が、マイグレーションとシードを当てた PostgreSQL で期待どおりに動く | `apps/schedule-api/internal/postgres` | 同上（`-short` で飛ばす） |
| Go のトークンの検証のテスト | access token の署名、`iss`、`aud`、期限の検証 | `packages/go/oidc`（テストの中で鍵を作る偽物の発行者） | 同上 |
| Go のハンドラのテスト | 状態コード、応答の本文、認証と事業所の確認 | `apps/schedule-api/internal/httpapi`、`apps/receipt-api/internal/httpapi` | 同上 |
| 照合の互換のテスト | Go の照合が、元の Python の実装と同じ結果を返す | `apps/receipt-api/internal/check/parity_test.go` と `testdata/parity/` | `go test ./...`。期待値の作り直しは `tools/parity/run.sh` |
| web の単体とコンポーネントのテスト | 変換、表示の規則（照合の印と CSV）、コンポーネントの操作 | 対象の隣の `*.test.ts(x)`。コンポーネントは story を `composeStories` で使う | `pnpm --filter @buddy/web test`（jsdom） |
| デザインシステムのテスト | トークンのコントラスト、押せる領域とフォーカスの移り方、story の描画とアクセシビリティ | `packages/ui/src` の `*.test.ts(x)` と story | `pnpm --filter @buddy/ui test`（トークンは node、コンポーネントと story はブラウザ） |
| E2E | ログインから画面の操作までの流れが、compose の全体で動く | `packages/e2e/tests/` | `pnpm e2e`（下の E2E の節） |
| 生成物のそろい | `openapi.yaml` と SQL から生成したコードが最新である | `scripts/check-generated.sh` | `pnpm check:generated` |
| 表の文書のそろい | マイグレーションを当てた PostgreSQL から作った表の文書と ER 図の元が、コミットした `docs/db/` と同じである。全ての表がどれかの viewpoint に入る | `scripts/build-db-docs.sh` | `pnpm generate:db-docs`（Docker が要る）。CI の `db-docs` は、生成した後に `docs/db/` の差分を確かめる |
| OpenAPI の定義の lint | 各 API の `openapi.yaml` が Redocly CLI の `recommended-strict` の規則に合う | `redocly.yaml`、`.redocly.lint-ignore.yaml` | `pnpm lint:openapi` |
| 画面仕様書の点検 | 画面仕様書の名前と構造、モックの `data-testid`、E2E が使う testid、カタログの欄の story がそろう | `scripts/check-screens.mjs` | `pnpm check:screens` |

## Runtime Requirements

- schedule-api の結合テストは Docker が要る。testcontainers-go が PostgreSQL のコンテナを起動し、接続の値はテストの中に固定してある。環境変数は要らない。
- receipt-api のテストと web の Vitest は、外部のネットワークと環境変数を要らない。receipt-api のテストは、偽物の発行者と Calendar API を loopback で立てる。web は `VITE_API_MODE` を指定しなければ偽物の API で動く。
- `packages/ui` のテストは、Playwright の chromium が要る（`pnpm --filter @buddy/ui exec playwright install chromium`）。
- E2E は、ルートの compose の全体（ポートは [CONTRIBUTING.md](../CONTRIBUTING.md) の「手元で全部を動かす」）と、Playwright の chromium が要る。
- 照合の互換のテストの期待値を作り直すときだけ、元の Python の実装のチェックアウトと uv が要る（`apps/receipt-api/tools/parity/README.md`）。

## Mocking and Test Data

| 対象 | 単体とコンポーネントのテスト | E2E |
| --- | --- | --- |
| PostgreSQL | 機能のパッケージのテストはメモリ上の偽物（`inmem`）、リポジトリのテストは testcontainers の本物 | compose の本物 |
| OIDC の発行者 | `oidctest` の偽物（テストの中で鍵を作る） | compose の mock-oauth2-server |
| Google Calendar API | `gcaltest` の偽物 | 予定の API は compose の `fake-google`（`cmd/fakegcal`。予定は `compose/fake-google-calendar.json`）。receipt-api はカレンダーを設定していない |
| web の画面から見た API（`BuddyApi`） | `src/api/fake/` の偽物 | compose の本物 |
| web のサーバーから見た 2 つの API | MSW の handler（`apps/web/src/mocks/`、`src/test/server.ts`） | compose の本物 |

- テストのデータは、架空の値だけを使う。実在の事業所、人、連絡先を入れず、メールは `example.com` にする。
- schedule-api のシードは `apps/schedule-api/db/seed/seed.sql` にあり、結合テストと compose が同じシードを当てる。全ての環境で同じマスタは、シードではなくマイグレーションが入れる。
- 照合の入力の CSV は `apps/receipt-api/testdata/` に、互換のテストのケースは `testdata/parity/<ケース>/` に置く。
- web のテストで HTTP を受けるのは MSW だけにし、fetch を引数で差し替えない。共通の handler は成功の応答だけを返し、異常系はテストごとに `server.use()` で上書きする。handler の無い要求はテストを失敗させる。
  - 送った要求の中身はテストの側で確かめない。上書きした handler が中身を確かめ、合わなければ 400 を返して、テストの結果を変える。
  - API を呼ばないことを確かめるときは、その API の全ての要求に 500 を返す handler（`http.all`）で上書きし、結果が変わらないことを見る。
  - handler は `openapi-msw` で各 API の `openapi.yaml` から生成した型を使い、応答が API の定義からずれると型のチェックで失敗する。
- web の story は、架空のデータだけを使い、本物の API を呼ばない。データは、schedule が `features/schedule/components/storyData.ts`、receipt が偽物の API の `fakeReceiptReport` である。
  - Container の story は、`apps/web/src/storybook/withAppRouter.tsx` の decorator の中で描く。decorator は、アプリと同じ ID の route と、偽物の `BuddyApi`（`src/api/fake/`）を用意する。空、失敗、読み込み中は、同じファイルの偽物の API の変種で作る。1 つの story だけで使う応答（照合の行の誤りなど）は、その story の中で偽物の API を作ってよい。

## Required Tests

| 変えたもの | 足すか流すテスト |
| --- | --- |
| 規則の関数とエンティティの検証、照合の判定 | 表駆動の単体テストにケースを足す |
| SQL、マイグレーション | リポジトリの結合テスト（`-short` を付けずに流す） |
| ハンドラ、認証、事業所の確認 | ハンドラのテスト |
| 照合の正規化と判定 | 互換のテストを流し、結果が変わるなら期待値を作り直した理由を pull request に書く |
| web の変換と表示の規則 | 対象の隣の単体テスト |
| 画面のコンポーネント | story と、操作を確かめるコンポーネントのテスト |
| `packages/ui` のコンポーネント | story（play 関数）とコンポーネントのテスト |
| 画面の流れ、testid | その画面の E2E を流す |
| `openapi.yaml`、SQL | `pnpm check:generated` |
| `openapi.yaml`、`redocly.yaml`、`.redocly.lint-ignore.yaml` | `pnpm lint:openapi` |
| マイグレーション、`apps/schedule-api/.tbls.yml` | `pnpm generate:db-docs` で表の文書を生成し直してコミットする |
| 画面仕様書、モック、story の `title` と export の名前、E2E の testid | `pnpm check:screens` |

取り込む前に、変えたアプリの `test` と `check`（Go は `go test ./...`、`go vet ./...`、`golangci-lint run`）を流す。  
Go のテストと lint は `GOWORK=off` を付けて流す。  
理由は [CONTRIBUTING.md](../CONTRIBUTING.md) の「開発の準備」にある。  
`packages/go` を変えたときは、2 つの API でも流す。

pull request と develop への push では、CI（[ci.yml](../.github/workflows/ci.yml)）が、変えた場所によらず全ての仕事を流す。1 つでも失敗した pull request は取り込まない。

リリースの前に通すテストの一覧は未定である。[証跡](testing/evidence.md) の取り決めと同じ時期に決める。

## E2E

- E2E のテストは `packages/e2e/tests/` に置き、ルートの compose で立てた全体に向けて流す。手順は CONTRIBUTING.md の「E2E のテストを流す」にある。
  - API と IdP は置き換えず、compose の本物を使う。テストのデータは予定の API に作り、消さない。spec は、題名に時刻を入れて自分の作ったデータを見分ける。
  - project は 2 つある。`setup` は compose の IdP にログインした状態を `packages/e2e/.auth/` に保存し、`e2e` はその状態で spec を流す。
  - `setup` は、青木 陽菜（マネージャー）と森 健太（チームリーダー、名前は `dev-mori`）の 2 人のログインの状態を保存する。リーダーで確かめる spec は、`test.use({ storageState: LEADER_STATE })` で切り替える。
  - 環境変数 `E2E_BASE_URL`（既定は `http://localhost:3000`）と `E2E_LOGIN_NAME`（既定は `dev-aoki`）で、向ける画面とログインの名前を変える。
  - schedule-api は初回のログインで `sub` を職員に結び付ける。手元で青木 陽菜に別の名前で入ったことがあれば、`E2E_LOGIN_NAME` をその名前にするか、`docker compose down -v` でデータを消す。
  - シードは空の DB にだけ当たる。`dev-mori` で入れないときや、職員の一覧に佐藤 美咲がいないときは、シードを変える前の DB なので、`docker compose down -v` で作り直す。
- 画面を変える pull request では、その画面の流れの E2E を流す。testid を変えたら、E2E と画面仕様書の両方を直す。
- lint と型のチェックは、`packages/e2e` で `pnpm check` を流す。ESLint の規則（`packages/e2e/eslint/e2e-authoring-rule.mjs`）と、その規則のテスト（`pnpm test:rules`）もここにある。
  - 規則は ESLint の cwd から見た `tests/` だけを見る。ルートやエディタから流すと、違反があっても何も言わずに通る。

人手検証の証跡の取り決めは、[証跡](testing/evidence.md) にある。
