---
type: context
title: コードベースの構造
description: モジュールの境界、依存してよい向き、状態の保存先、新しいコードの配置先。コードから読み取れる構造は書かない
status: stable
---

# コードベースの構造

## Module Boundaries

実行の単位の責務と、実行の単位の間の通信は [buddy Design Doc](../docs/design/DesignDoc.md) にある。

- 画面と BFF（web）とドキュメントサイトは `apps/`、Go の API は `services/`、共有のコードは `packages/` に置く。
  - ADR-0011: [2 つの API を services/ に置き、画面と API をトップのディレクトリで分ける](../docs/adr/0011-services-directory.md)
- ID ブローカーのログインの画面のソースは `apps/broker`（`@buddy/broker`）に置く。
  - `apps/broker` はコンテナを持たず、生成したテンプレートと CSS を `services/broker/internal/login/pages/` に書き出す。ID ブローカーはそれを埋め込んで配信する。
  - ADR-0018: [ID ブローカーのログインの画面のソースを apps/broker に置き、@buddy/ui から生成したテンプレートを ID ブローカーが埋め込んで配信する](../docs/adr/0018-broker-login-pages-source.md)
- API のディレクトリは機能の名前（`schedule`、`receipt`）にする。
  - コンテナ、サービス、`aud`、テーブル定義書の出力先の名前も、ディレクトリと同じにする。
  - ADR-0012: [2 つの API のサービスの名前とトークンの aud を、ディレクトリの名前にそろえる](../docs/adr/0012-service-names.md)
- web と 2 つの API は、HTTP だけでつながる。
  - web と API の間の型は、各 API の `openapi.yaml` から生成し、手で書かない。
- 業務の規則と認可は API が持つ。
  - web は、画面の表示の規則（照合の印と CSV の書き出しを含む）だけを持ち、拒否の判断を API に任せる。
- `packages/ui` は、BCD Design の Base と Case のコンポーネントとトークンだけを持つ。
  - 業務の名前（予定、照合など）を持つ Domain のコンポーネントは、`apps/web` に置く。配置先は [Placement Rules](#placement-rules) の表で決める。
  - ADR-0004: [デザインシステムのトークンを DADS の基本、buddy の意味、Tailwind のテーマの 3 段にし、カタログをドキュメントサイトと同じ Worker で誰でも開けるように出す](../docs/adr/0004-design-system.md)
- `services/schedule` では、規則と手順を機能ごとのパッケージに置く。
  - 機能は次の 11 である。
    - 組織と人: `organization`、`staff`、`patient`
    - 訪問と予定: `servicecode`、`visit`、`schedule`、`scheduleview`
    - 外部のカレンダー: `calendar`、`calendarimport`、`calendarsync`、`calendarexport`
  - DB と HTTP のアダプタ（`postgres`、`httpapi`）は 1 つずつ置く。
  - ADR-0005: [予定の API を機能ごとのパッケージに分け、Go の API の操作を使う依存だけを持つ型にし、ファイルの名前の末尾の語で役割を表す](../docs/adr/0005-schedule-api-packages.md)
  - 機能のパッケージは `internal/features/` に置く。
    - アダプタ、共通のパッケージ、`access`、`principal`、`config`、`assemble` は `internal/` の直下に置く。
  - `internal/` の直下のパッケージは次のとおり。
    - アダプタ: `httpapi`（HTTP）、`postgres`（DB）、`gcal`（Google カレンダー）、`broker`（ID ブローカーの内部の API）、`ulid`（ID の発行）
    - 共通のパッケージ: `apperr`、`tx`、`kernel`、`civil`
    - 認証と認可: `access`、`principal`
    - 設定: `config`
    - 組み立て: `assemble`
    - テストのためのメモリ上の実装: `inmem`
    - 機能のパッケージ: `features/`（予定の API の 11 の機能）
  - OIDC の ID トークンの検証は、`packages/go/oidc` を使う。
  - 機能のパッケージの中は、手順（操作ごとの型）、規則の関数、集約の単位のリポジトリに分ける。
  - ADR-0005: [予定の API を機能ごとのパッケージに分け、Go の API の操作を使う依存だけを持つ型にし、ファイルの名前の末尾の語で役割を表す](../docs/adr/0005-schedule-api-packages.md)
- `services/receipt` では、照合の段（読み込み、正規化、対の作成、判定）ごとにパッケージを分ける。

## Dependency Rules

- web と 2 つの API は、コードで依存しない。
  - Go の API 同士の import と、web から Go のコードの参照は無い。
  - 2 つの Go の API が共有するコードは、別の module の `packages/go` にだけ置き、`go.mod` の `replace` で読む。
  - ADR-0007: [2 つの Go の API が共有するコードを、別の module にまとめる](../docs/adr/0007-go-shared-module.md)
  - `packages/go` は `services/` を import しない。
  - サービスコードの表記と提供時間の範囲は、`packages/go/servicecode` に置く。照合の API と予定の API は、この表を写さない。
    - 照合だけの規則（予定の終了時間の調整、予定と実績のサービス内容の対応）は、照合の API の `servicerule` に置く。
    - ADR-0020: [サービスの規則を packages/go/servicecode に置き、予定の API のサービスコードを visit から servicecode の機能に分ける](../docs/adr/0020-service-code-rules.md)
- web は `@buddy/ui` に依存してよい。
  - `packages/ui` から `apps/` へは依存しない。
- web は `@buddy/broker` の `AuthCard` と `loginFailedMessage` だけに依存してよい。`apps/broker` は `@buddy/ui` に依存し、web には依存しない。
- web の `features/<機能>/` の間は import しない。
  - 2 つの機能が使うものは、`src/components/`、`src/api/`、`@buddy/ui` に置く。
    - API のデータを絞るだけの関数（`activePatients`）は `src/api/` に置く。
  - `src/components/` は `features/` を import しない。
- web の画面のコード（`features/`、`src/components/`）は、`src/server/` を import しない。
- web の画面のコードは、`api/fake/` と `api/http/` を import せず、API のクライアントを `useBuddyApi` から受け取る。
  - テスト、story、story のデータ（`storyData.ts`）だけは、`api/fake/` と `api/http/` を import してよい。
- `services/schedule` の依存は、アダプタ（`httpapi`、`postgres`）、`access`、機能のパッケージ、共通のパッケージ（`apperr`、`tx`、`kernel`、`civil`）の 1 方向に限る。
  - 共通のパッケージは、標準ライブラリと、共通のパッケージの間（`kernel` から `apperr`）だけに依存する。
  - 機能のパッケージの間は、`organization`、`staff`、`servicecode`、`patient`、`visit`、`schedule`、`scheduleview`、`calendar` の順にだけ import する。
    - サービスコードは `servicecode` に、訪問の区分は `visit` に置く。`visit` は利用者を `patient` から受ける。
    - `scheduleview` は `schedule` まで import してよい。`calendarsync` は、Projection を書くために `scheduleview` を import してよい。
    - ADR-0009: [Google カレンダーとの連携を事業所ごとの正本のモードで分け、職員のカレンダーを事業所ごとのサービスアカウントへの共有で読み書きする](../docs/adr/0009-google-calendar-sync.md)
    - `calendarimport`、`calendarsync`、`calendarexport` は `calendar` まで import してよく、3 つの間では import しない。
    - ADR-0005: [予定の API を機能ごとのパッケージに分け、Go の API の操作を使う依存だけを持つ型にし、ファイルの名前の末尾の語で役割を表す](../docs/adr/0005-schedule-api-packages.md)
  - `principal` は `organization` と `staff` に依存し、`schedule`、`scheduleview`、`calendarimport`、`access`、`httpapi`、`assemble` から使う。
  - 機能のパッケージは、自分の集約のリポジトリのインターフェースと、使う側で定義したインターフェースだけに依存する。
    - ほかの機能のデータを読むだけなら、`kernel.Finder` か 1〜2 のメソッドにする。
    - ほかの機能の集約を 1 つのトランザクションで書くかロックするなら（`calendarsync` の `reconcileApplier`、各機能の `FacilityLock`）、使うメソッドだけを並べた 1 つのインターフェースにする。
      - ADR-0005: [予定の API を機能ごとのパッケージに分け、Go の API の操作を使う依存だけを持つ型にし、ファイルの名前の末尾の語で役割を表す](../docs/adr/0005-schedule-api-packages.md)
    - ほかの機能のリポジトリのインターフェースは import しない。
    - トランザクションは `tx.Transactor` で受ける。
    - アダプタを import しない。
    - `access` は機能のパッケージではないので、機能のパッケージの依存の規則の対象の外にする。
    - `access` は機能のパッケージを直接 import しない。`principal` を通した `organization` と `staff` への依存は除く。
      - パスの ID が指すリソースの事業所は、各リポジトリの `GetFacilityID` で事業所の ID だけを読む。
      - 職員は、認可に要る項目だけを持つ `principal.Staff` で読む。
  - `config` は DB のアダプタを import しない。
    - `assemble` と `cmd/migrate` が `config` の値をアダプタの設定にコピーする。
  - `postgres`、`ulid`、`gcal`、`broker` は、機能のパッケージと `access` のインターフェースを実装する。
  - `packages/go/oidc` の ID トークンの検証は、`assemble` が `httpapi` の `TokenVerifier` に包んで渡す。
    - `httpapi` から `postgres` と `packages/go/oidc` を import するのは、テストのファイルだけにする。
    - `httpapi` は、パスの ID の形の確認に `ulid` を使う。
  - `inmem` を import するのは、テストのファイルだけにする。
  - 全ての機能のパッケージとアダプタを import してよいのは、`assemble` だけにする。
    - `assemble` を import するのは `cmd` だけにする。
    - `cmd/api` と `cmd/calendar-worker` は、機能のパッケージ、アダプタ、`access`、`principal` を import しない。`assemble` が作った値で、`cmd/api` はサーバーを、`cmd/calendar-worker` は書き出しか同期の処理を起動する。
    - プロセスの寿命（設定の読み込み、シグナル、DB とサーバーの開始と停止）は `cmd` が持つ。`assemble` は依存のグラフを作る部分だけを持つ。
      - `assemble` のファイルは、API と Worker が共有するもの（`assemble.go`）、API だけが使うもの（`api.go`）、Worker だけが使うもの（`worker.go`）に分ける。
    - 照合の API と ID ブローカーには、`assemble` に当たるパッケージを作らない。組み立てを共有する別の実行の単位が無いためである。組み立ては `main` のパッケージの中で、責務ごとのファイルに分ける。
    - ADR-0005: [予定の API を機能ごとのパッケージに分け、Go の API の操作を使う依存だけを持つ型にし、ファイルの名前の末尾の語で役割を表す](../docs/adr/0005-schedule-api-packages.md)
- `services/receipt` の依存は、`record`、`civil`、`servicerule` を末端にして、読み込み（`csvio`）、正規化、対の作成、判定、つなぐ段（`check`）、データソース、HTTP の順の 1 方向に限る。
  - 正規化と判定はサービスの規則（`servicerule` と `packages/go/servicecode`）を、データソースは Google カレンダー（`gcal`）を使う。
  - 照合の権限の確認（`permission`）は、HTTP と同じ段に置き、`httpapi` から使う。
- `services/broker` の職員の型、状態、規則、番兵のエラーは `staff` に置き、`login`、`internalapi`、`postgres` が読む。
  - `staff`、`hydra`、`upstream`、`config` は、ブローカーのほかの内部のパッケージを import しない。
  - `postgres` は `login` と `internalapi` を import しない。
  - `login` と `internalapi` は、互いと `postgres` を import しない。DB はそれぞれが定義したインターフェースで受ける。
- 2 つの Go の API と ID ブローカーの次の規則は、golangci-lint の depguard が止める。設定は各サービスの `.golangci.yml` にある。
  - 予定の API の機能のパッケージの間の順と、機能のパッケージから `principal`（`schedule`、`scheduleview`、`calendarimport` を除く）、アダプタ、`access`、`config` への import
  - 予定の API の共通のパッケージから、標準ライブラリと共通のパッケージ以外（外のモジュールを含む）への import
  - 予定の API の `access` から機能のパッケージへの import
  - 予定の API の `httpapi` と `config` から `postgres` への import、`httpapi` から `packages/go/oidc` への import、テストのファイル以外から `inmem` への import
  - 予定の API の `cmd/api` と `cmd/calendar-worker` から機能のパッケージ、アダプタ、`access`、`principal` への import と、`cmd` 以外から `assemble` への import
  - 照合の API の段の順
  - ID ブローカーの `staff`、`postgres`、`login`、`internalapi` の向き
- depguard は、テストのファイルを対象の外にする。
  - ID ブローカーでは、外部のテストのパッケージ（`hydra_test` など）が、テストする自分のパッケージを import するためである。
- 循環する import は、depguard より先に Go のコンパイラが止める。
- web の画面のコードの 4 つの規則（機能の間、`src/components/` から機能、`src/server/`、`api/fake/` と `api/http/`）は、Oxlint の `no-restricted-imports` が止める。
  - 設定はルートの `vite.config.ts` の `lint.overrides` にあり、`features/` の下のディレクトリから機能ごとの override を作る。
    - 機能を足したときに、設定を直さなくてよい。
  - import の文字列を正規表現で照合するので、`#/` と相対のパスの両方を止める。
  - Oxlint の組み込みの規則で書けるので、依存を増やす ESLint のプラグイン（eslint-plugin-boundaries）は使わない。
  - 出典: [Apply configuration by file pattern](https://oxc.rs/docs/guide/usage/linter/config.html#apply-configuration-by-file-pattern)、[no-restricted-imports](https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports.html#patterns)
- web の `src/routes/` には、`no-restricted-imports` の 4 つの規則を当てない。
  - `auth.*.ts` と `readyz.ts` はサーバーで動く route で、`src/server/` を使う。
- 次の規則は lint で確認せず、レビューで確認する。
  - 機能のパッケージが、ほかの機能のリポジトリのインターフェースを import しないこと
  - ほかの機能の集約を書くインターフェースが、1 つのトランザクションの中で使うメソッドだけを並べていること
- E2E の層の向きは、kit の ESLint の規則（`@fukuemon/e2e-kit/eslint`）が止める。

## State Ownership

| 状態 | 保存先 | オーナー |
| --- | --- | --- |
| 事業所、職員、利用者、予定、権限 | PostgreSQL | 予定の API だけ。一覧と作成は事業所の ID で絞り、1 件を指すリクエストはリソースの事業所を確認する |
| ログインのセッションとトークン | Valkey | web の BFF。ブラウザには署名した cookie でセッションの ID だけを渡す |
| 照合の入力の CSV と結果 | 保存しない | 照合の API は 1 回のリクエストで返し、web は query の cache にだけ置く。画面を読み直すと消える |
| 画面の表示の条件（表示の単位、日付、絞り込みの職員） | URL の search params | web の route。zod で検証し、デフォルト値は URL に書かない |
| API から取ったデータ | TanStack Query の cache | web。query の key は `api/queryKeys.ts` に、queryOptions と mutation は機能ごとの `queries.ts` に置く。変更したら、機能をまたぐ invalidate も `queryKeys` から key を作る |
| フェイクの API のデータ | ブラウザのメモリ | `VITE_API_MODE=fake` の web。読み直すと消える |

## Placement Rules

- web の機能のコードは `src/features/<機能>/` に置き、中を `components/`、`lib/`、`schema/`、`constants/`、`queries.ts` に分ける。
  - 画面のコンポーネントは、表示だけを持つ Presentational（`<名前>.tsx`）と、query と router を読んで渡す Container（`<名前>Container.tsx`）を同じディレクトリに並べる。
  - Container を並べて 1 つの画面にするだけのコンポーネントは、`<名前>Page`（`ReceiptCheckPage`）か `<名前>PageLayout`（`SchedulePageLayout`）と名付ける。query と router を読まない。
  - テストと story は対象の隣に置く（コロケーション）。
- web の route のファイル（`src/routes/`）は、URL と Container か機能の画面のコンポーネントを結び、search params の検証、SSR の有無、loader の prefetch だけを持つ。
  - 画面の枠（ヘッダー、ナビゲーション、照合待ちのバッジ、余白を付けた `main`）は、`routes/__root.tsx` の component が包む。route のファイルは枠を描かない。
    - 左の欄を持つ画面（予定の画面）は、route の `staticData` の `ownsSiteLayout` を true にし、機能の Layout が `SiteLayoutContainer` を使う。
    - ADR-0019: [web の画面の枠を root の route の component で包み、左の欄を持つ画面だけを staticData で外す](../docs/adr/0019-web-site-frame-in-root-route.md)
  - 見出しとリード文は、機能のコンポーネントに置く。
  - 画面のコードは `features/<機能>/` に置く。URL の階層と機能の境界が一致しないためである。
    - たとえば `/schedule/import`、`/schedule/link`、`/schedule/review` の画面は、calendar の機能にある。
  - データを読む画面の route は、`ssr` に `RENDER_DATA_ON_SERVER` を渡し、loader で Container の query を prefetch する。
      - bff ではサーバーで描画し、fake ではブラウザでだけ描画する。
  - デバイスの日付や時間帯で描く画面の route は `ssr: false` にし、理由を注釈に書く。
  - route のファイルは `src/routes/` に flat に並べる。
    - 1 つの URL の階層の下が 10 ファイルを超えたら、その階層をディレクトリに分ける。
    - ディレクトリは URL の階層で分け、機能の境界では分けない。
- route の context（QueryClient と API の実装）は `src/appContext.ts` で作る。
- web の API の呼び出しは `src/api/` に置く。
  - 画面が使う API の操作の interface（`BuddyApi`、`ReceiptApi`）と `ApiError` は `BuddyApi.ts` に置く。
    - 画面とサーバーの両方が使う値（照合の入力の上限のバイト数など）も、ここに置く。
  - 生成した型は `generated/` に置く。
  - `VITE_API_MODE` で、ブラウザのメモリで動くフェイク（`fake/`）と、BFF の server function を呼ぶ実装（`bff/`）を切り替える。
    - 画面のコードは、story とテストのデータを除き、切り替える実装（`fake/`、`bff/`、`http/`）を直接 import しない。
    - フェイクは `loadFake.ts` の `import()` で読み、bff のビルドに、フェイクの実装とダミーデータを入れない。
  - `http/` は、サーバーから API を呼ぶ実装で、`src/server/` から使う。
    - `GET /v1/me` の呼び出し（`meApi.ts`）と、ログインした職員への変換（`scheduleMapper.ts`）もここに置く。
- サーバーだけで動く web の処理は `src/server/` に置く。
  - `runtime.ts` は、プロセスで 1 つの依存（設定、セッションの保存先、OIDC のクライアント）と MSW の起動だけを持つ。
  - `auth.ts` はログインとログアウト、`session.ts` はセッションの読み取りと更新を持つ。
- web のダミーデータの正本と MSW の handler は `src/mocks/` に置く。
  - ADR-0008: [web の画面の型を API の型と分けて持ち、ダミーデータを API の形で 1 か所に置く](../docs/adr/0008-web-view-types.md)
- ライブラリの開発用のコンポーネント（TanStack Query の devtools など）は `src/integrations/` に置く。
- Storybook の decorator は `src/storybook/`、テストの setup と MSW のサーバーは `src/test/` に置く。
- web のコンポーネントの配置先は、業務の名前を持つか、引数とキーボードの操作が汎用の形か、使う機能の数で決める。

  | 業務の名前 | 引数とキーボードの操作 | 使う機能の数 | 配置先 |
  | --- | --- | --- | --- |
  | 持たない | 汎用の形 | 問わない | `@buddy/ui` |
  | 持たない | 使う画面に合わせた形 | 2 つ以上 | `apps/web/src/components/` |
  | 持つ | 問わない | 2 つ以上 | `apps/web/src/components/` |
  | 持つか、使う画面に合わせた形 | 問わない | 1 つ | `apps/web/src/features/<機能>/components/` |

  - 汎用の形のものは、今は 1 つの機能だけが使っていても `@buddy/ui` に置く。
    - 後から使う機能が増えたときに、移さずに済む。
  - `@buddy/ui` に置くときは、Base か Case かを [DESIGN.md](../packages/ui/DESIGN.md) の基準で決める。
  - `src/components/` の中は、役割でディレクトリを分ける。
    - `layout/` は画面の枠（ヘッダー、ナビゲーション）、`page/` はページの本文に置く定型のもの（リード文、エラーと権限が無いときの文）を置く。
    - ディレクトリは、同じ役割のものが 3 つ以上あるときだけ作る。1〜2 個で作ると、後から入るものでディレクトリの意味がずれる。
    - 役割のまとまりが無いものは、`src/components/` の直下に置く（チームの色の `teamColor.ts`）。
- web の権限の確認は、段ごとに次の場所に置く。拒む判断は API が持ち、web の確認は画面の出し分けだけにする。
  - ADR-0017: [web の画面の権限の確認を、route の beforeLoad と PermissionGuard で宣言し、1 つの関数で評価する](../docs/adr/0017-web-permission-checks.md)
  - 認証は `routes/__root.tsx` の `beforeLoad` に置く。
  - 画面の段は、各 route の `beforeLoad` で `requirePermission` を呼んで宣言する。権限の要らない画面も `requirePermission('none')` と宣言する。
  - 画面の中のボタンとダイアログは `PermissionGuard` で出し分け、Container に権限の三項演算子を書かない。
  - 権限のキー、`hasPermission`、`requirePermission` は `src/api/permissions.ts` に、`PermissionGuard` は `src/components/` に置く。
  - 予定の 7 つの権限による予定ごとの判定は、機能のコードに置く。
- デザインシステムの文書は `packages/ui/DESIGN.md` にある。
  - 画面とコンポーネントのコード（`apps/web/src`、`apps/broker/src`、`packages/ui/src`）を書く前に読む。
- ID ブローカーの画面は `apps/broker/src/pages.tsx` に書き、`pnpm --filter @buddy/broker generate` で生成し直して、生成物を同じコミットに入れる。
  - 画面の HTML と CSS を `services/broker` に手で書かない。
- `services/schedule` のハンドラは `internal/httpapi` に、生成したインターフェースのメソッドとして書く。
  - クエリは `db/queries`、マイグレーションは `db/migrations`、シードは `db/seed` に置く。
- `services/schedule` に機能を足すときは、`internal/features/<機能>/` にパッケージを作る。
- Go の 3 つの API のパッケージはフラットに保ち、ファイルの名前の末尾に付ける役割の語で、そのファイルが持つものの役割を表す。
  - 操作（書き込みと読み取り）は、操作の型の名前を snake_case にした `<動詞>_<対象>.go`（`cancel.go`、`retire.go`、`list_departments.go`）に 1 つずつ置く。
    - 対象がパッケージの集約のときは、操作の型の名前と同じく対象を省く。
    - 書き込みか読み取りかは、[コードと文書の規約](conventions.md#関数とメソッドの動詞) の動詞で表す。
    - 1 つの操作だけが使う補助は、その操作のファイルに置く。
    - 操作の数と大きさによらず、全ての機能で、公開の操作を操作のファイルに分ける。
  - 集約、エンティティ、値オブジェクト、読み取りのモデルは `<集約>.go` に置く。
  - リポジトリのインターフェースは `<集約>_repository.go`（`staff_repository.go`）に置く。
  - 集約をまたぐ規則（ドメインサービス）は `<規則>_service.go`（`assignable_service.go`）に置く。
  - 操作は、使う依存だけをフィールドに持つ操作ごとの型（`type Leave struct`）にし、機能のパッケージに `App` と `Deps` を置かない。
    - コンストラクタは `New<操作>` にし、使う依存を引数で受けて値を返す。
    - 実行のメソッドは `Do` にする。
    - 操作の型の名前が集約や読み取りのモデルの型と重なるときは、集約や読み取りのモデルの型を名詞に改める。
    - 全ての依存を知るのは、組み立ての場所（`internal/assemble`）だけにする。
      - `assemble` は、`httpapi` の `<機能>App` ごとに、その束を作る関数を 1 つ置く。
      - 操作の型は `httpapi` に依存しないので、API と Worker のどちらの実行単位でも作れる。
    - 操作を束ねるのは、使う側の `httpapi` の `<機能>App`（`StaffApp`）で、操作の `Do` のメソッド値を関数のフィールドに持つ。
  - 複数の操作が使う補助は、使う依存を引数で受けるパッケージの関数にし、`<まとまり>_app.go`（`status_change_app.go`）に置く。
    - 自分の依存をフィールドに持つ補助の型（`calendarsync` の `reconcileApplier`）は型のまま残し、使う操作の型と常駐の処理がフィールドに持つ。
  - ADR-0005: [予定の API を機能ごとのパッケージに分け、Go の API の操作を使う依存だけを持つ型にし、ファイルの名前の末尾の語で役割を表す](../docs/adr/0005-schedule-api-packages.md)
  - ほかの機能と外部のシステムのインターフェースは、使う側のパッケージの `<相手>_port.go`（`identity_port.go`）に置く。
    - `<相手>` は、ほかの機能の名前（`staff_port.go`、`schedule_port.go`）か、外部のシステムの名前（`google_calendar_port.go`、`identity_port.go`）にする。
    - 1 つの相手のインターフェースは、1 つのファイルにまとめる。
    - 複数の機能のデータをまとめて読むインターフェースは、読むものの名前（`staff` の `assignment_port.go`）にする。
  - HTTP のハンドラは `<機能>_handler.go`（`staff_handler.go`）に置く。
  - 役割の語（`repository`、`service`、`app`、`port`、`handler`）は GOOS と GOARCH の値に当たらないので、末尾に付けてもビルドの条件にならない。
  - 役割が 1 つのパッケージ（照合の API の段、ID ブローカーの `hydra`）は、役割の語を付けず、パッケージの名前のファイルの 1 つにする。
  - アダプタのパッケージ（`httpapi`、`login`、`internalapi`、`postgres`）は、`Config` と `NewHandler` の組み立てをパッケージの名前のファイルに置く。
    - ID ブローカーの `login` と `internalapi` は、ハンドラが手順を持つので、パスごとのハンドラを操作の型として扱う。
      - ハンドラの型は、使う依存だけを持ち、パッケージの外に出さない（`submitEmail`、`register`）。`http.Handler` を実装する。
    - 照合の API と予定の API の `httpapi` は、生成した `StrictServerInterface` を 1 つの型で実装するので、ハンドラを型に分けない。
  - パッケージのドキュメントコメントと、複数の集約が使う定数は、パッケージの名前のファイル（`organization.go`、`visit.go`）に置く。
  - 常駐の処理と、操作の型のほかに操作を持つ型は、同じ機能のパッケージに、型の名前のファイル（`exporter.go`、`syncer.go`、`visit` の `writer.go`）で置く。
    - 常駐の処理の型は、1 回の取得と処理（`ExportDue`、`SyncDue`）だけを持つ。次のバッチをいつ呼ぶか（常駐と 1 回の繰り返し）は、`cmd/calendar-worker` の `loop.go` に置く。
    - ADR-0022: [Worker の常駐と 1 回の繰り返しを cmd/calendar-worker に集め、機能のパッケージは 1 回の処理だけを持つ](../docs/adr/0022-calendar-worker-loop.md)
  - テストは、確認する対象のファイルの名前に `_test` を付けたファイルに置く。
    - 複数の操作を 1 つの観点でまとめて確認するテストは、観点の名前のファイル（`calendar` の `accounts_test.go`、`schedule` の `authorization_test.go`）に置く。
    - 観点に名前が付かないものは `app_test.go` に置く。
  - ADR-0005: [予定の API を機能ごとのパッケージに分け、Go の API の操作を使う依存だけを持つ型にし、ファイルの名前の末尾の語で役割を表す](../docs/adr/0005-schedule-api-packages.md)
- 新しい Go の API で機能が 2 つ以上あるときは、機能のパッケージを `internal/features/<機能>/` に置く。
  - 機能が 1 つの API（照合の API、ID ブローカー）は、`features/` を作らない。
- `services/receipt` に照合の段を足すときは、段ごとに `internal/` の下にパッケージを作り、`check` でつなぐ。
- E2E のコードの配置先は、[E2E のテストのコードの設計](../packages/e2e/DesignDoc.md) の判断の流れに従う。
