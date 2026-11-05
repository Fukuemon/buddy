# @buddy/web

予定の管理とレセプトの照合の画面。  
`VITE_API_MODE` を指定しなければ、データをローカルのフェイクの API（`src/api/fake/`）から取る。

## Configuration

画面が呼ぶ API は、ビルドのときの環境変数 `VITE_API_MODE` で選ぶ。

- `fake`: フェイクの API（`src/api/fake/`）を呼ぶ。デフォルトの値。
  - ログインせず、ダミーの職員として動く。
- `bff`: サーバーの BFF が、セッションの access token を付けて予定の API と照合の API を呼ぶ。
  - ログインを求める。
  - ビルドに、フェイクの実装とダミーデータを入れない。
  - データを読む画面のうち、デバイスの日付や時間帯で描くもの以外を、サーバーで描画する。

コンテナのイメージは `bff` でビルドする。  
`bff` の動きは、リポジトリのルートの compose で確認する。  
手順は [CONTRIBUTING.md](../../CONTRIBUTING.md#running-locally) の Running Locally にある。  
開発サーバーを `bff` で起動すると、トークンの `iss` が compose の API の求める値と合わないので、compose の API には向けない。

## Running

```sh
pnpm --filter @buddy/web dev
```

開発サーバーは `http://localhost:3000` で待ち受ける。  
ルートの compose の web も 3000 を使うので、compose の全体を起動しているときは `docker compose stop web` で止めてから起動する。  
フェイクの API はブラウザのメモリにデータを持つため、ページを読み直すと作った予定は消える。

BFF の処理をローカルの開発サーバーで確認するときは、`dev:msw` で起動する。  
`dev:msw` のログインは、compose の上流の IdP のフェイク（`idp`）を Issuer として直に使い、Hydra とブローカーを通さない。  
セッションは、compose の Valkey に置く。  
2 つの API へのリクエストは、MSW の handler（`src/mocks/`）が受ける。  
Go の API と PostgreSQL は立てない。  
設定は `.env.msw` にある。

```sh
docker compose up -d --wait idp valkey
pnpm --filter @buddy/web dev:msw
```

MSW の handler は決まった予定を返し、作った予定と置き換えた予定を残さない。  
本番のビルドには MSW を含めない（`src/server/runtime.ts`）。

Storybook は、次で開く。

```sh
pnpm --filter @buddy/web storybook
```

## Tests and Checks

| コマンド | 確認すること |
| --- | --- |
| `pnpm --filter @buddy/web build` | 本番向けのビルドが通る |
| `pnpm --filter @buddy/web test` | Vitest のテストが通る |
| `pnpm --filter @buddy/web lint` | Oxlint の指摘がない |
| `pnpm --filter @buddy/web typecheck` | `tsc` の型のチェックが通る |
| `pnpm --filter @buddy/web check` | 整形、lint、型のチェックを Vite+ でまとめて実行する |

`vp check --fix` は整形を直す。

## Code Generation

API の型は、各 API の openapi.yaml から生成し、`src/api/generated/` に置く。  
生成のコマンドは、[CONTRIBUTING.md](../../CONTRIBUTING.md#changing-the-api-definition) の Changing the API Definition にある。

route は、`src/routes/` のファイルから TanStack Router が生成する。  
生成物の `src/routeTree.gen.ts` は、開発サーバーとビルドが書き直す。  
開発サーバーを止めたまま型のチェックを通すときは、`pnpm --filter @buddy/web generate-routes` で作り直す。

## ログインとセッション（BFF）

`bff` では、web が BFF として、Hydra と認可コードフロー（PKCE つき）でやり取りする。  
職員の確認は、Hydra が呼ぶ ID ブローカー（`services/broker`）が行う。

- `/auth/login` は、Hydra の認可のエンドポイントへリダイレクトする。
- `/auth/callback` は、トークンを取り、予定の API の `GET /v1/me` で職員と事業所を引いてセッションを作る。
- セッションは Valkey に置き、ブラウザには署名つきの cookie でセッションの ID だけを渡す。
  - ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにし、職員の身元と停止をブローカーが、権限と業務のデータを予定の API が持つ](../../docs/adr/0001-auth.md)
- 画面の API の呼び出しは、server function（`src/api/bff/serverFns.ts`）を通る。
  - サーバーは、画面が渡した事業所の代わりに、セッションの事業所を使う。
- access token の期限が 1 分を切ったら、refresh token で更新する。
  - 同じセッションの更新は、Valkey のキーで 1 本にまとめる。
  - Hydra が refresh token を拒めば、セッションを消し、画面はログインへ移る。
- ほかのサイトのページからの POST は、TanStack Start の CSRF の middleware で 403 を返す（`src/start.ts`）。
- 画面の引数は、server function で操作ごとの形を確認し、合わなければ 400 を返す。
- 事業所に登録されていない職員には、`/auth/error?reason=forbidden` で案内を出す。

サーバーが読む環境変数は、[全体の Design Doc の環境変数の表](../../docs/design/DesignDoc.md#環境変数) にある。

## 予定の API との変換

`src/api/http/` の実装は、画面の型（`src/api/types.ts`）と API の型（`src/api/generated/`）の間を、`src/api/http/scheduleMapper.ts` で変換する。  
`src/api/http/` の実装は、BFF がサーバーで使う。  
変換のしかたと制限は次のとおり。

- 繰り返しの予定は、`src/api/http/recurrence.ts` で一覧の期間の回に展開し、単発の予定の形で一覧に出す。
  - 回の ID は `recurring-<繰り返しの予定の ID>-<日付>` にする。
  - 除外した日の回は出さない。1 回だけ置き換えた日の回も出さない。
  - 回の ID で予定を保存すると、繰り返しの予定のその回を置き換える（`POST /v1/schedules/recurring/{recurring_schedule_id}/occurrences`）。
- キャンセルした予定は出さない。
  - 画面の予定は、キャンセルの状態を持たない。
- 予定の作成と更新では、予定の種類、サービスコード、訪問の区分を、予定の API のマスタの名前から ID に引く。

照合の API のクライアント（`src/api/http/receiptApi.ts`）も、`src/api/http/` にある。  
BFF の照合の server function（`checkReceiptFn`）が、照合の API のクライアントをサーバーで使う。

## 照合の画面

照合の画面（`/receipt`）と結果の画面（`/receipt/result`）は `src/features/receipt/` にある。  
画面の仕様は `docs/screens/receipt-upload_照合/` と `docs/screens/receipt-result_照合の結果/` にある。

- 結果の表の印（❌、※、許容範囲）と CSV は、`src/features/receipt/lib/reportCells.ts` が作る。
  - 印の付け方と値の引用は、照合の API の `tools/parity/report` と同じにし、同じ期待値のテストで確認する。
  - 行の区切りだけは、Excel で開くために CRLF にした。Go は LF を使う。
- ファイルの合計の上限は、照合の API の `MAX_UPLOAD_BYTES` のデフォルト値（10 MiB）から multipart の分の 64 KiB を引いた値にする。
  - `src/start.ts` は、server function の本文を読む前に、10 MiB を超えるものと長さの分からないものを 413 で拒む。
- フェイクの API（`fake`）の照合は、入力によらず `src/mocks/receiptData.ts` の `mockReceiptReport` を返す。

## Google カレンダーの画面

カレンダーの連携（`/schedule/link`）、予定の取り込み（`/schedule/import`）、確認が必要な予定（`/schedule/review`）の画面は `src/features/calendar/` にある。  
画面の仕様は、画面仕様書の [カレンダーの連携](../../docs/screens/schedule-link_カレンダーの連携/index.md)、[予定の取り込み](../../docs/screens/schedule-import_予定の取り込み/index.md)、[確認が必要な予定](../../docs/screens/schedule-review_確認が必要な予定/index.md) にある。

- 3 つの route は、予定のカレンダーの上に重ならないよう、ファイル名に `_` を付けて `/schedule` の入れ子から外す（`src/routes/schedule_.link.tsx` など）。
- 3 つの画面は、職員の管理の権限を持つ職員だけが使う。
  - ほかの職員には、ヘッダーに「取り込み」と「要確認」を出さない。
  - ほかの職員が URL を開くと、「この画面を開く権限がありません」（`PageForbiddenMessage`）を出す。
- 画面は、予定の API の Google カレンダーの操作を `BuddyApi`（`src/api/BuddyApi.ts`）の `calendars` で呼ぶ。
  - 結び付けたカレンダー、取り込みのプレビューと結果、書き出しの型は、予定の API の型をそのまま使う（`src/api/types.ts`）。
- フェイクの API（`fake`）は、ID の末尾が `@example.com` のカレンダーだけを読めるものとして扱う（`src/api/fake/fakeBuddyApi.ts`）。

## Documentation

- [画面仕様書](../../docs/screens/index.md): 画面ごとの表示と操作、構成要素の `data-testid`
- [全体の Design Doc](../../docs/design/DesignDoc.md): 画面と BFF の責務、認証とセッション
- [デザインシステム](../../packages/ui/DESIGN.md): トークンと、Base と Case のコンポーネント
