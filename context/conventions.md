---
type: context
title: コードと文書の規約
description: 命名、コメント、文書と API の定義の書き方のうちこのリポジトリだけの規則、共有の設定、自動チェックの除外。lint で検出できる規則は書かない
status: stable
---

# コードと文書の規約

## Naming

- web のコンポーネントの名前は、BCD Design の「ドメイン、場面、基本の語」の順に並べる（例 `StaffFilterSidebar`、`ServiceCodeRadioGroup`）。
  - Base と Case か Domain かは、名前の接頭辞ではなく配置先（`packages/ui` か `features/<機能>/components/`）で表す。
- Container は Presentational の名前に `Container` を付ける。
  - 対になる Presentational が無い Container（モーダルを開いて閉じるだけのものなど）は、使うコンポーネントの名前に `Container` を付けない別の名前にしてよい。
- query の hook は `use<動詞><対象>`、query options は `<対象>QueryOptions` と名付け、機能の `queries.ts` に置く。
- web の API の実装のファイルは、種類を接頭辞にする（`fakeBuddyApi.ts`、`httpBuddyApi.ts`、`bffBuddyApi.ts`）。
  - `http/` の中で `BuddyApi` を実装しないファイル（照合の API の `receiptApi.ts`、`GET /v1/me` の `meApi.ts`）は、接頭辞を持たない。
- web の import は、同じ機能か同じディレクトリの中では相対のパスで書き、それをまたぐときは `#/` のエイリアスで書く。
  - tsconfig の `@/` は使わない。
- Go のテストのためのフェイクは、`<パッケージ>test` のパッケージに置く（`oidctest`、`gcaltest`）。
- API の operationId は、lowerCamel の「動詞と名詞」にする。動詞は `get`、`list`、`create`、`update`、`cancel`、`change`、`add`、`remove`、`start`、`end`、`resume`、`retire`、`reinstate` から選ぶ。
  - `add` と `remove` は、職員に権限を足す、外すのように、リソースの結び付きを足して外す操作に使う（`addUserPolicy`、`removeUserPolicy`）。
- API のパスは `/v1` の下の複数形の snake_case にする。
  - 事業所に属する一覧と作成は `/v1/facilities/{facility_id}/<リソース>`、1 件は `/v1/<リソース>/{<リソース>_id}` に置く。
  - 事業所に属さず全ての環境で同じマスタは、`/v1/<リソース>`（`/v1/policies`、`/v1/schedule_types`）か、まとまりの下（`/v1/visit_infos/service_codes`）に置く。
  - 職員の属性と結び付きは、職員の 1 件の下のサブパス（`/v1/users/{user_id}/position`、`/v1/users/{user_id}/policies`）に置く。
  - 繰り返しの予定は、予定の下の `recurring` に置く。作成は `/v1/facilities/{facility_id}/schedules/recurring`、1 件は `/v1/schedules/recurring/{recurring_schedule_id}` に置く。
    - 繰り返しの予定の 1 回の置き換えは、1 件の下の `/occurrences` に置く。
  - ログインした職員自身は、ID を持たない `/v1/me` で表す。
  - 動作はサブパス（`/cancel`）で表す。
- DB のテーブルは複数形の snake_case にする。
- buddy が振る ID は、ULID の文字列を `text COLLATE "C"` で持つ。
  - ULID の形の CHECK は、テーブルが振る `id` の主キーにだけ付ける。外部キーのカラムには、主キーを兼ねていても付けない。
  - 外部の ID（Google カレンダーの ID、組織の `org_id`、IdP の `sub`）は、ULID の規則の対象の外である。
- 真偽のカラムは、`is_`、`has_`、`needs_` で始めるか、true のときの動作を動詞で書く（`is_over_time_work`、`needs_target`、`overwrite`）。
- 業務の用語の表記は [業務の知識](domain.md) の用語にそろえる。
- Go と TypeScript で同じ業務のものを表す型は、同じ名前にする（`Staff`、`Patient`、`Schedule`）。

### 関数とメソッドの動詞

Go と TypeScript の関数とメソッドは、次の操作には表の動詞を使う。  
真偽値を返す関数は「真偽値」のセクションの規則に従う。  
API の操作を呼ぶ関数とリポジトリのメソッドは、operationId と同じ動詞にする。

| 操作 | 動詞 | 例 | 書き込みか読み取りか |
| --- | --- | --- | --- |
| 保存された状態を変える | operationId の動詞（`create`、`update`、`cancel`、`change`、`add`、`remove`、`start`、`end`、`resume`、`retire`、`reinstate`） | `CreateTeam`、`Retire` | 書き込み |
| ID で 1 件を取る | `get` | `GetFacility`、`getSchedule` | 読み取り |
| 一覧を取る | `list` | `ListDepartments`、`listRecords` | 読み取り |
| ID 以外の値で探し、見つからないことがある | `find` | `FindByEmail`、`findCalendar` | 読み取り |
| 設定とファイルを起動のときに読む | `load` | `LoadAccounts`、`loadServerConfig` | 読み取り |
| 値を作る | Go は `New`、TypeScript は `create` | `NewHandler`、`createHttpBuddyApi` | 状態を読み書きしない |
| 同じものを別の型に変える | `to<変換先>` | `toEventBody`、`toDateKey` | 状態を読み書きしない |
| API の型を画面の型に変える | `fromApi<型>`（TypeScript） | `fromApiStaff` | 状態を読み書きしない |
| 文字列を値に変える | `parse` | `ParseDate`、`parseOccurrenceId` | 状態を読み書きしない |
| 値を画面に出す文字列に変える | `format` | `formatDateTime` | 状態を読み書きしない |
| リクエストとフォームの値の形と範囲を確認し、誤りを返す | `validate` | `validateEmail`、`validatePatientForm` | 状態を読み書きしない |
| 職員の権限を確認し、無ければ失敗にする | `require` | `RequireStaffManage`、`requirePermission` | 読み取り |
| 保存された状態と設定の前提（事業所、職員の状態、アカウント）を確認し、満たさなければ失敗にする | Go は `require`、TypeScript は `assert` | `requireAccounts`、`assertFacility` | 読み取り |
| 入力から一部の値か判定を取り出す | `<取り出すもの>Of` | `timeBandOf`、`statusOf` | 状態を読み書きしない |
| 画面のイベントを受ける | props は `on<イベント>`、コンポーネントの中の関数は `handle<イベント>` | `onSubmit`、`handleSubmit` | 状態を読み書きしない |

- 書き込みと読み取りは、動詞だけで区別する。読み取りの DB と、その同期は持たない。
  - ADR-0024: [Go の API のパッケージをフラットに保ち、ファイルの名前の末尾の語で役割を表す](../docs/adr/0024-go-file-names.md)

- `fetch`、`build`、`make`、`convert` は使わない。HTTP で取るときも `get` と `list` にする。
  - Fetch API の `fetch` を包む関数（`fetchWithAccessToken`）は、包む関数の名前を残す。
- E2E のテストのコードの関数（`prepare`、`expect`）の名前は、スキル write-e2e-test に従う。
- 照合（`check`）のように業務の語が動詞を兼ねるときは、業務の語を使う。
  - 入力の値の確認に `check` を使わないのは、照合と間違えないためである。
- Go の、フィールドを返すメソッド（getter）には `Get` を付けない（`Status()`、`URL()`）。
- Go のリポジトリのメソッドと API を呼ぶ関数のうち、値を取るものは、DB と HTTP を呼ぶときも表の動詞を使う。
  - Google Go Style は `Get` を避け、リモートの呼び出しには `Fetch` を勧める。
  - buddy が `Get` と `List` を使うのは、sqlc の生成物（`GetAuthor`、`ListAuthors`）と operationId の動詞にそろえ、ハンドラからリポジトリと SQL まで同じ動詞で追えるようにするためである。
  - 出典: [Google Go Style Decisions の Getters](https://google.github.io/styleguide/go/decisions#getters)
  - 出典: [Effective Go の Getters](https://go.dev/doc/effective_go#Getters)
  - 出典: [sqlc の Getting started with PostgreSQL](https://docs.sqlc.dev/en/latest/tutorials/getting-started-postgresql.html)

### 真偽値

- Go の判定の関数とメソッドは、`Is`、`Has`、`Can` で始める（`IsVisitTitle`、`CanEdit`）。
  - 標準のライブラリの `time.Time.IsZero`、`os.FileInfo.IsDir`、`strings.HasPrefix` に合わせる。
  - 状態を変えてから結果を返す関数（`Limiter.Allow`）は、判定の関数ではないので対象の外である。
  - 標準のライブラリの型のメソッドと同じ意味のメソッドは、`Is` を付けず、標準のライブラリと同じ名前にする。
    - `civil` の `Date.Before`、`Date.After`、`Time.Before` と、`calendar` と `servicecode` の `Range.Contains` が当たる。
- Go の真偽値の変数とフィールドは、状態の形容詞か過去分詞（`Ended`、`Pending`）か、三人称単数の動詞の句（`EndsNextDay`）にし、`Is` を付けない。
  - DB のカラムと API の項目と対になるフィールドは、その名前に合わせる（`IsOverTimeWork`、`NeedsTarget`）。
  - `ok` の慣用の名前は、この規則の対象の外である。
- TypeScript の真偽値は、`is`、`has`、`can`、`needs` で始めるか、三人称単数の動詞の句（`endsNextDay`、`opensDialog`）にする。
  - `is` は状態、`can` は操作できるか、`has` は持っているかに使う。
  - DOM と ARIA の属性と同じ名前の props（`disabled`、`checked`、`expanded`、`defaultOpen`）と、API の項目（`ends_next_day`）は、その名前に合わせる。
  - 結果の型の `ok` は、この規則の対象の外である。

### 一覧、単位、略語

- 一覧の変数とフィールドは複数形にし、`List` を付けない。
  - 単数と複数が同じ形の語（`staff`）だけは、`<語>List` にする（`staffList`）。
  - Go の関数の中で、返す一覧を集めるローカルの変数は、慣用の名前の `out` にしてよい。
  - 外部の API と JSON の項目に合わせるフィールド（Hydra の `GrantScope`、Google カレンダーの `Recurrence`）は、その名前に合わせる。
- 数の値は、名前の末尾に単位を付ける（`LeaseSeconds`、`startMinutes`、`DAY_MS`、`HOUR_HEIGHT_PX`、`ImportedCount`）。
  - Go の `time.Duration` は、型が単位を持つので、単位を付けない（`SyncInterval`）。
- Go の略語は、全て大文字か全て小文字にする（`orgID`、`HydraAdminURL`、`WriteJSON`）。
  - revive の `var-naming` で確認する。IdP は Identity Provider の略の書き方のまま残す。
- TypeScript の略語は、先頭だけを大文字にする（`facilityId`、`baseUrl`、`BuddyApi`）。
  - 定数の UPPER_SNAKE_CASE は全て大文字にする（`MOCK_FACILITY_ID`）。
  - 外部のライブラリの名前（Playwright の `toHaveURL`、`baseURL`）は、そのまま使う。

## Comments

実装のコメントは最小限にして理由を名前、型、関数の分け方で表し、godoc と JSDoc は export するもの全てに契約（何を受け、何を返し、何を変え、どのエラーを返すか）を書く。  
コメントの書き方は、スキル write-comments に従う。  
言語は日本語の常体にする。

- Go は、ドキュメントコメントの有無を revive（`exported`、`package-comments`）で確認する。
  - 対象は `services/receipt`、`services/schedule`、`services/broker`、`packages/go` である。
  - 生成物（`// Code generated ... DO NOT EDIT.` のファイル）とテストは、revive が対象にしない。
- TypeScript は、ドキュメントコメントの有無を、ルートの `vite.config.ts` の `lint` で確認する。
  - 確認するのは web、ui、e2e の check である。
  - 対象は export する関数、クラス、型である。
    - 名前が `Props` で終わる型は除く。Props の型は、コンポーネントのドキュメントコメントが説明するためである。
  - 呼び出しで包んで作る関数（`createServerFn(...)`、`memo(...)`）と、クラスのメソッドは確認しない。
- Go のドキュメントコメントは、`// Package <名前> は、…。`、`// <名前> は、…。` の形で書く。
- 外部の制約を書く実装のコメントには、出典の URL を添える。

## Documents

文書の書き方は、スキル write-prose と write-design-docs に従う。  
buddy だけの規則は次のとおり。

- PRD は `docs/PRD.md`、全体の Design Doc は `docs/design/`、ADR は `docs/adr/`、画面仕様書は `docs/screens/` に置き、Zensical のサイトで読む。
  - Design Doc と ADR の配置先は、`context/project.yml` の `docs` と同じにする。
- アプリとパッケージの README の見出しは、Setup、Configuration、Running、Tests and Checks、Code Generation、Documentation の順に置く。当てはまらないセクションは省く。
- 機能ごとの Design Doc は、コードの隣に置く。
  - 配置先は、`services/<API>/DesignDoc.md`、`packages/<パッケージ>/DesignDoc.md`、`apps/<アプリ>/src/features/<機能>/DesignDoc.md` である。
  - サイトには、`docs/design/services/`、`docs/design/packages/`、`docs/design/apps/` のファイル単位のシンボリックリンクで載せる。リンク先は `zensical.toml` の `watch` にも並べる。
- 機能ごとの Design Doc と ADR から `docs/`、`apps/`、`services/` の文書へのリンクは、GitHub の `develop` の URL で書く。
  - 相対リンクは、GitHub とサイトで指す先が変わり、どちらかで切れる。
- 見出しには比喩と擬人化を使わず、セクションが扱う物と操作の名詞で書く。
  - 例: 「インフラとの約束」は「デプロイの要件」、「コンテナの間の契約」は「コンテナの間の通信」と書く。
  - 見出しの語は、アンカーとリンクの文に写り、ほかの文書に広がるためである。
- 見出しのアンカーは、日本語のまま残す（`zensical.toml` の toc の slugify）。
  - 見出しを変えるときは、ほかの文書からのリンクを探して直す。
- 画面仕様書の画面 ID の規則は [画面仕様書の目次](../docs/screens/index.md) の「画面の ID の規則」に、ページのセクションの規則は [画面仕様書の規約](../docs/screens/rules.md) の「仕様書のページ」にある。

## API Definitions

- 定義の書き方は、Redocly CLI の `recommended-strict` の規則で確認する（`pnpm lint:openapi`）。
  - 規則を外す箇所は `.redocly.lint-ignore.yaml` に理由と一緒に書き、規則ごと外すものは `redocly.yaml` に書く。
- null を許す項目は、`type` と `nullable: true` を同じ階層に置き、参照する型は `allOf` で包む。
  - OpenAPI 3.0 は `type` の無い `nullable` を無視するためである。
  - サーバーが使う kin-openapi は、外側の `nullable` を見て、`allOf` の中を確認する前に null を通す。

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
| `routeTree.gen.ts`、`src/api/generated/**` | 整形、lint | 生成物である。生成のし直しで差分を確認する（`pnpm check:generated`） |
| `**/*.md` | 整形（`vp fmt`） | 文書は textlint で確認する |
| `packages/ui/src/tokens/`、`apps/web/src/api/generated/` | `pnpm check:design` | トークンの段のファイルとトークンのカタログのページは、色の値とプリミティブトークンの名前を持つ。生成物は画面のコードではない |
| `dist`、`storybook-static` | lint | ビルドの出力である |
| Go の生成物 | golangci-lint（`exclusions.generated: lax`） | 生成物である |
| `services/schedule` の `_test.go` の gosec G101 | golangci-lint | テストの接続の設定は、使い捨てのコンテナの値である |
| `packages/go/healthcheck/healthcheck.go` の gosec | golangci-lint（`//nolint:gosec`） | 宛先を `127.0.0.1` に固定し、環境変数はポートだけを決める。誤検知である |
| `docs/design/` の下のシンボリックリンク、Git で追跡しないもの | textlint（`.textlintignore`） | 同じ文書を 2 回見ないため。元の文書は元の場所で見る |

## E2E

E2E のテストのコード（`packages/e2e/tests/`）の書き方は、スキル write-e2e-test と [E2E のテストのコードの設計](../packages/e2e/DesignDoc.md) に従う。  
testid の形、画面 ID の形、lint の規則に渡す値、待つ時間の名前のファイルは、[E2E のテスト](testing/e2e.md) にある。
