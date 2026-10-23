# @buddy/web

予定の管理とレセプトの照合の画面。TanStack Start で作り、ツールチェーンに Vite+ を使う。  
`VITE_API_MODE` を指定しなければ、データをローカルのフェイクの API（`src/api/fake/`）から取る。BFF を通して予定の API と照合の API を呼ぶように切り替えられる（「API を切り替える」）。

## 起動する

リポジトリのルートで依存を入れてから、開発サーバーを起動する。

```sh
pnpm install
pnpm --filter @buddy/web dev
```

開発サーバーは `http://localhost:3000` で待ち受ける。`/` は `/schedule` へ転送する。  
ルートの compose の web も 3000 を使うので、compose の全体を起動しているときは `docker compose stop web` で止めてから起動する。  
フェイクの API はブラウザのメモリにデータを持つため、ページを読み直すと作った予定は消える。

## API を切り替える

画面が呼ぶ API は、ビルドのときの環境変数 `VITE_API_MODE` で選ぶ。

| 値 | 動き |
| --- | --- |
| `fake`（デフォルト） | フェイクの API（`src/api/fake/`）を呼ぶ。ログインせず、ダミーの職員として動く |
| `bff` | サーバーの BFF が、セッションの access token を付けて予定の API と照合の API を呼ぶ。ログインを求める |

コンテナのイメージは `bff` でビルドする。`bff` の動きは、リポジトリのルートの compose で確認する（CONTRIBUTING.md の「ローカル環境で全体を起動する」）。  
開発サーバーを `bff` で起動すると、トークンの `iss` が compose の API の求める値と合わないので、compose の API には向けない。

BFF の処理をローカルの開発サーバーで確認するときは、`dev:msw` で起動する。ログインは compose の上流の IdP のフェイク（`idp`）を Issuer として直に使い、Hydra とブローカーを通さない。セッションは compose の Valkey に置き、2 つの API へのリクエストは MSW のフェイクの handler（`src/mocks/`）が受ける。Go の API と PostgreSQL は立てない。設定は `.env.msw` にある。

```sh
docker compose up -d --wait idp valkey
pnpm --filter @buddy/web dev:msw
```

フェイクの handler は決まった予定を返し、作った予定と置き換えた予定を残さない。本番のビルドには MSW を含めない（`src/server/runtime.ts`）。

## テストとチェック

| コマンド | 確認すること |
| --- | --- |
| `pnpm --filter @buddy/web build` | 本番向けのビルドが通る |
| `pnpm --filter @buddy/web test` | Vitest のテストが通る |
| `pnpm --filter @buddy/web lint` | Oxlint の指摘がない |
| `pnpm --filter @buddy/web typecheck` | `tsc` の型のチェックが通る |
| `pnpm --filter @buddy/web check` | 整形、lint、型のチェックを Vite+ でまとめて実行する |

`vp check --fix` は整形を直す。整形と lint の設定は、ルートの `vite.config.ts` にある。

## Storybook を開く

```sh
pnpm --filter @buddy/web storybook
```

Storybook は `.storybook/vite.config.ts` で動く。アプリの `vite.config.ts` は TanStack Start の plugin を持ち、Storybook の中では動かないため、設定を分けている。

## コードの生成

API の型は、各 API の openapi.yaml から openapi-typescript で生成し、`src/api/generated/` に置く。生成物はコミットする。

| 生成物 | 元の定義 |
| --- | --- |
| `src/api/generated/schedule.ts` | `services/schedule/openapi.yaml`（予定の API） |
| `src/api/generated/receipt.ts` | `services/receipt/openapi.yaml`（照合の API） |

openapi.yaml が変わったら、生成し直す。

```sh
pnpm --filter @buddy/web generate:api
```

生成物は整形と lint の対象から外してある（ルートの `vite.config.ts` の `ignorePatterns`）。

## route を足す

route は `src/routes/` のファイルから TanStack Router が生成する。  
生成物の `src/routeTree.gen.ts` は、開発サーバーとビルドが書き直す。開発サーバーを止めたまま型のチェックを通すときは、`pnpm --filter @buddy/web generate-routes` で作り直す。

## ログインとセッション（BFF）

`bff` では、web が BFF としてブローカーと認可コードフロー（PKCE つき）でやり取りする。

- `/auth/login` は、ブローカーの認可の画面へ転送する。`/auth/callback` は、トークンを取り、予定の API の `GET /v1/me` で職員と事業所を引いてセッションを作る。
- セッションは Valkey に置き、ブラウザには署名つきの cookie でセッションの ID だけを渡す。cookie は HttpOnly、SameSite=Lax、Secure で、Secure は `SESSION_COOKIE_SECURE=false` のときだけ外す。
- 画面の API の呼び出しは、server function（`src/api/bff/serverFns.ts`）を通る。サーバーは、画面が渡した事業所の代わりにセッションの事業所を使う。
- access token の期限が 1 分を切ったら、refresh token で取り直す。同じセッションの取り直しは、Valkey のキーで 1 本にまとめる。ブローカーが refresh token を拒めばセッションを消し、画面はログインへ移る。
- ほかのサイトのページからの POST は、TanStack Start の CSRF の middleware で 403 を返す（`src/start.ts`）。
- 画面の引数は、server function で操作ごとの形を確認し、合わなければ 400 を返す。
- 事業所に登録されていない職員は、`/auth/error?reason=forbidden` に案内を出す。

サーバーが読む環境変数は、[全体の Design Doc の環境変数の表](../../docs/design/DesignDoc.md#環境変数) にある。ブラウザと web から届く Issuer の URL が違い、discovery の文書の認可のエンドポイントにブラウザが届かないときは、`OIDC_AUTHORIZATION_ENDPOINT` でブラウザを転送する認可の URL を渡す。ブラウザが Issuer の URL に届かないときは、`OIDC_END_SESSION_ENDPOINT` でログアウトの転送の先の URL も渡す。

`/healthz` はプロセスが動いていれば 200 を、`/readyz` は Valkey に届けば 200、届かなければ 503 を返す。

## 予定の API との変換

`src/api/http/` の実装は、画面の型（`src/api/types.ts`）と API の型（`src/api/generated/`）の違いを `src/api/http/scheduleMapper.ts` で変換する。BFF がサーバーで使う。変換のしかたと制限は次のとおり。

- 繰り返しの予定は、`src/api/http/recurrence.ts` で一覧の期間の回に展開し、単発の予定の形で一覧に出す。
  - 回の ID は `recurring-<繰り返しの予定の ID>-<日付>` にする。除外した日の回（1 回だけ置き換えた日を含む）は出さない。
  - 回の ID で予定を保存すると、繰り返しの予定のその回を置き換える（`POST /v1/schedules/recurring/{recurring_schedule_id}/occurrences`）。
- キャンセルした予定は出さない。画面の予定はキャンセルの状態を持たない。
- 予定の作成と更新では、予定の種類、サービスコード、訪問の区分を、予定の API のマスタの名前から ID に引く。

照合の API のクライアント（`src/api/http/receiptApi.ts`）もここにある。BFF の照合の server function（`checkReceiptFn`）がサーバーで使う。

## 照合の画面

照合の画面（`/receipt`）と結果の画面（`/receipt/result`）は `src/features/receipt/` にある。画面の仕様は `docs/screens/receipt-upload_照合/` と `docs/screens/receipt-result_照合の結果/` にある。

- 照合の API は判定の JSON だけを返す。結果の表の印（❌、※、許容範囲）と CSV は、画面の `src/features/receipt/lib/reportCells.ts` が作る。
  - 印の付け方と値の引用は、照合の API の `tools/parity/report` と同じにし、同じ期待値のテストで確認する。行の区切りだけは、Excel で開くために CRLF にした（Go は LF）。
- 照合の結果は保存せず、query の cache にだけ置く。結果の画面を読み直すと消える。
- ファイルの合計の上限は、照合の API の `MAX_UPLOAD_BYTES` のデフォルト値（10 MiB）から multipart の分の 64 KiB を引いた値にする。server function の本文は、読む前に `src/start.ts` が 10 MiB を超えるものと長さの分からないものを 413 で拒む。
- フェイクの API（`fake`）の照合は、入力によらず `src/api/fake/fakeReceiptApi.ts` の結果を返す。

## Google カレンダーの画面

カレンダーの連携（`/schedule/link`）、予定の取り込み（`/schedule/import`）、確かめが要る予定（`/schedule/review`）の画面は `src/features/calendar/` にある。画面の仕様は、画面仕様書の [カレンダーの連携](../../docs/screens/schedule-link_カレンダーの連携/index.md)、[予定の取り込み](../../docs/screens/schedule-import_予定の取り込み/index.md)、[確かめが要る予定](../../docs/screens/schedule-review_確かめが要る予定/index.md) にある。

- 3 つの route は、予定のカレンダーの上に重ならないよう、ファイル名に `_` を付けて `/schedule` の入れ子から外す（`src/routes/schedule_.link.tsx` など）。
- 3 つの画面は、職員の管理の権限を持つ職員だけが使う。ほかの職員には、ヘッダーに「取り込み」と「要確認」を出さず、URL を開くと「この画面を開く権限がありません」（`PageForbiddenMessage`）を出す。
- 画面は、予定の API の Google カレンダーの操作を `BuddyApi`（`src/api/client.ts`）の `calendars` で呼ぶ。結び付けたカレンダー、取り込みのプレビューと結果、書き出しの型は、予定の API の型をそのまま使う（`src/api/types.ts`）。
- フェイクの API（`fake`）は、ID の末尾が `@example.com` のカレンダーだけを読めるものとして扱う（`src/api/fake/fakeBuddyApi.ts`）。

## 文書

- [画面仕様書](../../docs/screens/index.md): 画面ごとの表示と操作、構成要素の `data-testid`
- [全体の Design Doc](../../docs/design/DesignDoc.md): 画面と BFF の責務、認証とセッション
- [デザインシステム](../../packages/ui/DESIGN.md): トークンと、Base と Case のコンポーネント
