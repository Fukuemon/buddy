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
| Go の単体テスト（domain） | 値の検証、繰り返しの規則、照合の判定の規則 | 対象のパッケージの隣の `*_test.go`（表駆動） | 各 API で `go test ./...` |
| Go の単体テスト（機能のパッケージ） | 手順、権限の判定、事業所をまたぐ参照の拒否 | `apps/schedule-api/internal/<機能>`、`internal/access`（`internal/inmem` のメモリ上のリポジトリ） | 同上 |
| Go の結合テスト（リポジトリ） | SQL が、マイグレーションとシードを当てた MySQL で期待どおりに動く | `apps/schedule-api/internal/mysql` | 同上（`-short` で飛ばす） |
| Go のトークンの検証のテスト | access token の署名、`iss`、`aud`、期限の検証 | `packages/go/oidc`（テストの中で鍵を作る偽物の発行者） | 同上 |
| Go のハンドラのテスト | 状態コード、応答の本文、認証と事業所の確認 | `apps/schedule-api/internal/httpapi`、`apps/receipt-api/internal/httpapi` | 同上 |
| 照合の互換のテスト | Go の照合が、元の Python の実装と同じ結果を返す | `apps/receipt-api/internal/check/parity_test.go` と `testdata/parity/` | `go test ./...`。期待値の作り直しは `tools/parity/run.sh` |
| web の単体とコンポーネントのテスト | 変換、表示の規則（照合の印と CSV）、コンポーネントの操作 | 対象の隣の `*.test.ts(x)`。コンポーネントは story を `composeStories` で使う | `pnpm --filter @buddy/web test`（jsdom） |
| デザインシステムのテスト | トークンのコントラスト、押せる領域とフォーカスの移り方、story の描画とアクセシビリティ | `packages/ui/src` の `*.test.ts(x)` と story | `pnpm --filter @buddy/ui test`（トークンは node、コンポーネントと story はブラウザ） |
| E2E | ログインから画面の操作までの流れが、compose の全体で動く | `packages/e2e/tests/` | `pnpm e2e`（下の E2E の節） |
| 生成物のそろい | `openapi.yaml` と SQL から生成したコードが最新である | `scripts/check-generated.sh` | `pnpm check:generated` |

## Runtime Requirements

- schedule-api の結合テストは Docker が要る。testcontainers-go が MySQL のコンテナを起動し、接続の値はテストの中に固定してある。環境変数は要らない。
- receipt-api のテストと web の Vitest は、外部のネットワークと環境変数を要らない。receipt-api のテストは、偽物の発行者と Calendar API を loopback で立てる。web は `VITE_API_MODE` を指定しなければ偽物の API で動く。
- `packages/ui` のテストは、Playwright の chromium が要る（`pnpm --filter @buddy/ui exec playwright install chromium`）。
- E2E は、ルートの compose の全体（ポートは [CONTRIBUTING.md](../CONTRIBUTING.md) の「手元で全部を動かす」）と、Playwright の chromium が要る。
- 照合の互換のテストの期待値を作り直すときだけ、元の Python の実装のチェックアウトと uv が要る（`apps/receipt-api/tools/parity/README.md`）。

## Mocking and Test Data

| 対象 | 単体とコンポーネントのテスト | E2E |
| --- | --- | --- |
| MySQL | 機能のパッケージのテストはメモリ上の偽物（`inmem`）、リポジトリのテストは testcontainers の本物 | compose の本物 |
| OIDC の発行者 | `oidctest` の偽物（テストの中で鍵を作る） | compose の mock-oauth2-server |
| Google Calendar API | `gcaltest` の偽物 | 使わない（compose の receipt-api はカレンダーを設定していない） |
| web の画面から見た API（`BuddyApi`） | `src/api/fake/` の偽物 | compose の本物 |
| web のサーバーから見た 2 つの API | MSW の handler（`apps/web/src/mocks/`、`src/test/server.ts`） | compose の本物 |

- テストのデータは、架空の値だけを使う。実在の事業所、人、連絡先を入れず、メールは `example.com` にする。
- schedule-api のシードは `apps/schedule-api/db/seed/seed.sql` にあり、結合テストと compose が同じシードを当てる。全ての環境で同じマスタは、シードではなくマイグレーションが入れる。
- 照合の入力の CSV は `apps/receipt-api/testdata/` に、互換のテストのケースは `testdata/parity/<ケース>/` に置く。
- web のテストで HTTP を受けるのは MSW だけにし、fetch を引数で差し替えない。共通の handler は成功の応答だけを返し、異常系はテストごとに `server.use()` で上書きする。handler の無い要求はテストを失敗させる。
  - 送った要求の中身はテストの側で確かめない。上書きした handler が中身を確かめ、合わなければ 400 を返して、テストの結果を変える。
  - handler は `openapi-msw` で各 API の `openapi.yaml` から生成した型を使い、応答が API の定義からずれると型のチェックで失敗する。
- web の story は、架空のデータだけを使い、API を呼ぶ story は作らない。データは、schedule が `features/schedule/components/storyData.ts`、receipt が偽物の API の `fakeReceiptReport` である。

## Required Tests

| 変えたもの | 足すか流すテスト |
| --- | --- |
| domain の規則、照合の判定 | 表駆動の単体テストにケースを足す |
| SQL、マイグレーション | リポジトリの結合テスト（`-short` を付けずに流す） |
| ハンドラ、認証、事業所の確認 | ハンドラのテスト |
| 照合の正規化と判定 | 互換のテストを流し、結果が変わるなら期待値を作り直した理由を pull request に書く |
| web の変換と表示の規則 | 対象の隣の単体テスト |
| 画面のコンポーネント | story と、操作を確かめるコンポーネントのテスト |
| `packages/ui` のコンポーネント | story（play 関数）とコンポーネントのテスト |
| 画面の流れ、testid | その画面の E2E を流す |
| `openapi.yaml`、SQL | `pnpm check:generated` |

取り込む前に、変えたアプリの `test` と `check`（Go は `go test ./...`、`go vet ./...`、`golangci-lint run`）を流す。`packages/go` を変えたときは、2 つの API でも流す。CI は無く、リリースの前に通すテストの一覧は、検証環境ができてから決める（[証跡](testing/evidence.md) と同じ時期）。

## E2E

- E2E のテストは `packages/e2e/tests/` に置き、ルートの compose で立てた全体に向けて流す。手順は CONTRIBUTING.md の「E2E のテストを流す」にある。
  - API と IdP は置き換えず、compose の本物を使う。テストのデータは予定の API に作り、消さない。spec は、題名に時刻を入れて自分の作ったデータを見分ける。
  - project は 2 つある。`setup` は compose の IdP にログインした状態を `packages/e2e/.auth/` に保存し、`e2e` はその状態で spec を流す。
  - 環境変数 `E2E_BASE_URL`（既定は `http://localhost:3000`）と `E2E_LOGIN_NAME`（既定は `dev-aoki`）で、向ける画面とログインの名前を変える。
  - schedule-api は初回のログインで `sub` を職員に結び付ける。手元で青木 陽菜に別の名前で入ったことがあれば、`E2E_LOGIN_NAME` をその名前にするか、`docker compose down -v` でデータを消す。
- 画面を変える pull request では、その画面の流れの E2E を流す。testid を変えたら、E2E と画面仕様書の両方を直す。
- lint と型のチェックは、`packages/e2e` で `pnpm check` を流す。ESLint の規則（`packages/e2e/eslint/e2e-authoring-rule.mjs`）と、その規則のテスト（`pnpm test:rules`）もここにある。
  - 規則は ESLint の cwd から見た `tests/` だけを見る。ルートやエディタから流すと、違反があっても何も言わずに通る。

人手検証の証跡の取り決めは、[証跡](testing/evidence.md) にある。
