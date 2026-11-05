---
type: context
title: テスト
description: テストの種類ごとの責務、実行に要る環境の条件、置き換えの方針、変更に足すテスト
status: stable
---

# テスト

## Test Types and Guarantees

| 種類 | 保証すること | 配置先 | 流し方 |
| --- | --- | --- | --- |
| Go の単体テスト（規則） | 値の検証、繰り返しの規則、予定の権限の判定、照合の判定の規則 | 対象のパッケージの隣の `*_test.go`（テーブル駆動） | 各 API で `go test ./...` |
| Go の単体テスト（機能のパッケージ） | 手順、権限の判定、事業所をまたぐ参照の拒否 | `services/schedule/internal/<機能>`、`internal/access`（`internal/inmem` のメモリ上のリポジトリ） | 同上 |
| Go の結合テスト（リポジトリ） | SQL が、マイグレーションとシードを適用した PostgreSQL で期待どおりに動く | `services/schedule/internal/postgres` | 同上（`-short` で飛ばす） |
| Go のトークンの検証のテスト | access token の署名、`iss`、`aud`、期限の検証 | `packages/go/oidc`（テストの中で鍵を作るフェイクの Issuer） | 同上 |
| Go のハンドラのテスト | 状態コード、レスポンスの本文、認証と事業所の確認 | `services/schedule/internal/httpapi`、`services/receipt/internal/httpapi` | 同上 |
| 照合の互換のテスト | Go の照合が、元の Python の実装と同じ結果を返す | `services/receipt/internal/check/parity_test.go` と `testdata/parity/` | `go test ./...`。期待値の作り直しは `tools/parity/run.sh` |
| web の単体とコンポーネントのテスト | 変換、表示の規則（照合の印と CSV）、コンポーネントの操作 | 対象の隣の `*.test.ts(x)`。コンポーネントは story を `composeStories` で使う | `pnpm --filter @buddy/web test`（jsdom） |
| デザインシステムのテスト | 押せる領域とフォーカスの移り方、story の描画とアクセシビリティ | `packages/ui/src` の `*.test.tsx` と story | `pnpm --filter @buddy/ui test`（ブラウザ） |
| トークンのコントラスト | 意味のトークンの組が WCAG 2.2 のコントラスト比の基準に届く | `scripts/check-contrast.mjs` | `pnpm check:contrast` |
| 画面のコードの書き方 | 画面とコンポーネントのコードに、色の値、DADS の変数の名前、14px より小さい文字、`focus-ring` 以外のフォーカスの表示、余白の任意値がない | `scripts/check-raw-values.mjs`、`scripts/check-utilities.mjs` | `pnpm check:design` |
| E2E | ログインから画面の操作までの流れが、compose の全体で動く | `packages/e2e/tests/` | `pnpm e2e`（[E2E のテスト](testing/e2e.md)） |
| 生成物のそろい | `openapi.yaml` と SQL から生成したコードが最新である | `scripts/check-generated.sh` | `pnpm check:generated` |
| テーブル定義書のそろい | マイグレーションを適用した PostgreSQL から作ったテーブル定義書と ER 図の元が、コミットした `docs/db/` と同じである。全てのテーブルがどれかの viewpoint に入る | `scripts/build-db-docs.sh` | `pnpm generate:db-docs`（Docker が要る）。CI の `db-docs` は、生成した後に `docs/db/` の差分を確認する |
| OpenAPI の定義の lint | 各 API の `openapi.yaml` が Redocly CLI の `recommended-strict` の規則に合う | `redocly.yaml`、`.redocly.lint-ignore.yaml` | `pnpm lint:openapi` |
| 画面仕様書の点検 | 画面仕様書の名前と構造、モックの `data-testid`、E2E が使う testid、カタログの欄の story がそろう | `scripts/check-screens.mjs` | `pnpm check:screens` |

## Runtime Requirements

- 予定の API の結合テストは Docker が要る。環境変数は要らない。
  - testcontainers-go が PostgreSQL のコンテナを起動し、接続の値はテストの中に固定してある。
- 照合の API のテストと web の Vitest は、外部のネットワークと環境変数を要らない。
  - 照合の API のテストは、フェイクの Issuer と Calendar API を loopback で立てる。
  - web は `VITE_API_MODE` を指定しなければフェイクの API で動く。
- `packages/ui` のテストは、Playwright の chromium が要る（`pnpm --filter @buddy/ui exec playwright install chromium`）。
- E2E は、ルートの compose の全体（ポートは [CONTRIBUTING.md](../CONTRIBUTING.md) の Running Locally）と、Playwright の chromium が要る。
- 照合の互換のテストの期待値を作り直すときだけ、元の Python の実装のチェックアウトと uv が要る（`services/receipt/tools/parity/README.md`）。

## Mocking and Test Data

| 対象 | 単体とコンポーネントのテスト | E2E |
| --- | --- | --- |
| PostgreSQL | 機能のパッケージのテストはメモリ上のフェイク（`inmem`）、リポジトリのテストは testcontainers の本物 | compose の本物 |
| OIDC の Issuer | `oidctest` のフェイク（テストの中で鍵を作る） | compose の Hydra とブローカーと、上流の IdP のフェイク（mock-oauth2-server） |
| Google Calendar API | `gcaltest` のフェイク。書き込みは `If-Match` を比べて 412 を返し、`Failures` でエラーを返せる | compose の calendarpit |
| web の画面から見た API（`BuddyApi`） | `src/api/fake/` のフェイク | compose の本物 |
| web のサーバーから見た 2 つの API | MSW の handler（`apps/web/src/mocks/`、`src/test/server.ts`） | compose の本物 |

E2E の Google Calendar API の置き換えでの、calendarpit の使い方は次のとおり。

- 予定の API は、calendarpit の予定を読み書きする。
  - 最初の予定は `compose/calendarpit/fixture.json` にある。
  - 書いた予定と token は volume に残り、`docker compose down -v` で消える。
  - 予定は calendarpit の管理の画面で見る。
- E2E は、calendarpit の管理の API で予定を読んで直す。
  - 中継の `gcalhold` が、Google の変更を予定の API に渡さないようにする。
- 照合の API は、同じ calendarpit の森のカレンダー（`compose/receipt-calendars.json`）を、`gcalhold` を通さずに読む。

- テストのデータは、ダミーデータだけを使う。
  - 実在の事業所、人、連絡先を入れず、メールは `example.com` にする。
- 予定の API のシードは `services/schedule/db/seed/seed.sql` にあり、結合テストと compose が同じシードを適用する。
  - 全ての環境で同じマスタは、シードではなくマイグレーションが入れる。
- 照合の入力の CSV は `services/receipt/testdata/` に、互換のテストのケースは `testdata/parity/<ケース>/` に置く。
- web のテストで HTTP を受けるのは MSW だけにし、fetch を引数で差し替えない。
  - 共通の handler は成功のレスポンスだけを返し、異常系はテストごとに `server.use()` で上書きする。
  - handler の無いリクエストはテストを失敗させる。
  - 送ったリクエストの中身はテストの側で確認しない。上書きした handler が中身を確認し、合わなければ 400 を返して、テストの結果を変える。
  - API を呼ばないことを確認するときは、その API の全てのリクエストに 500 を返す handler（`http.all`）で上書きし、結果が変わらないことを見る。
  - handler は `openapi-msw` で各 API の `openapi.yaml` から生成した型を使い、レスポンスが API の定義からずれると型のチェックで失敗する。
- web の story は、ダミーデータだけを使い、本物の API を呼ばない。
  - データは、schedule が `features/schedule/components/storyData.ts`、receipt が `src/mocks/receiptData.ts` の `mockReceiptReport` である。
  - Container の story は、`apps/web/src/storybook/withAppRouter.tsx` の decorator の中で描く。decorator は、アプリと同じ ID の route と、フェイクの `BuddyApi`（`src/api/fake/`）を用意する。
  - 空、失敗、読み込み中は、`withAppRouter.tsx` のフェイクの API の変種で作る。
  - 1 つの story だけで使うレスポンス（照合の行のエラーなど）は、その story の中でフェイクの API を作ってよい。

## Required Tests

| 変えたもの | 足すか流すテスト |
| --- | --- |
| 規則の関数とエンティティの検証、照合の判定 | テーブル駆動の単体テストにケースを足す |
| SQL、マイグレーション | リポジトリの結合テスト（`-short` を付けずに流す） |
| ハンドラ、認証、事業所の確認 | ハンドラのテスト |
| 照合の正規化と判定 | 互換のテストを流し、結果が変わるなら期待値を作り直した理由を pull request に書く |
| web の変換と表示の規則 | 対象の隣の単体テスト |
| 画面のコンポーネント | story と、操作を確認するコンポーネントのテスト |
| `packages/ui` のコンポーネント | story（play 関数）とコンポーネントのテスト |
| 画面と `packages/ui` のコンポーネントのクラスとスタイル | `pnpm check:design` |
| 画面の流れ、testid | その画面の E2E を流す |
| `openapi.yaml`、SQL | `pnpm check:generated` |
| `openapi.yaml`、`redocly.yaml`、`.redocly.lint-ignore.yaml` | `pnpm lint:openapi` |
| マイグレーション、`services/schedule/.tbls.yml` | `pnpm generate:db-docs` でテーブル定義書を生成し直してコミットする |
| 画面仕様書、モック、story の `title` と export の名前、E2E の testid | `pnpm check:screens` |

マージする前に、変えたアプリの `test` と `check`（Go は `go test ./...`、`go vet ./...`、`golangci-lint run`）を流す。  
Go のテストと lint の流し方（`GOWORK=off`、`packages/go` を変えたとき）は、[CONTRIBUTING.md の Go のモジュール](../CONTRIBUTING.md#go-のモジュール) にある。

develop への push では、CI（[ci.yml](../.github/workflows/ci.yml)）が `e2e` を除くジョブを流す。  
develop の `e2e` は、`schedule` で 1 日 1 回流す。  
pull request では、文書だけを変えたときは `e2e` と `go` のジョブを飛ばし、それ以外のときは全てのジョブを流す。  
飛ばす条件と理由は [CONTRIBUTING.md の CI](../CONTRIBUTING.md#ci) にある。

リリースの前に通すテストの一覧は未定である。[エビデンス](testing/evidence.md) の取り決めと同じ時期に決める。

## E2E

- E2E のテストのツールでの書き方、流すコマンド、project、環境変数、テストデータとログインは、[E2E のテスト](testing/e2e.md) にある。
- 画面を変える pull request では、その画面の流れの E2E を流す。testid を変えたら、E2E と画面仕様書の両方を直す。

手動検証のエビデンスの取り決めは、[エビデンス](testing/evidence.md) にある。
