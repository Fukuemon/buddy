# @buddy/web

予定の管理の画面。TanStack Start で作り、ツールチェーンに Vite+ を使う。  
既定ではデータを手元の偽物の API（`src/api/fake/`）から取る。予定の API に切り替えられる（「API を切り替える」）。ログインはまだない。

## 起動する

リポジトリのルートで依存を入れてから、開発サーバーを起動する。

```sh
pnpm install
pnpm --filter @buddy/web dev
```

開発サーバーは `http://localhost:3000` で待ち受ける。`/` は `/schedule` へ転送する。  
偽物の API はブラウザのメモリにデータを持つため、ページを読み直すと作った予定は消える。

## API を切り替える

画面が呼ぶ API は、`apps/web/.env.local` などの環境変数で選ぶ。

| 環境変数 | 意味 |
| --- | --- |
| `VITE_API_MODE` | `fake` は偽物の API（`src/api/fake/`）、`http` は予定の API（`src/api/http/`）。既定は `fake` |
| `VITE_SCHEDULE_API_URL` | `http` のときに呼ぶ予定の API の URL。既定は `http://localhost:8080` |
| `VITE_FACILITY_ID` | `http` のときの事業所の ID（ULID）。ログインを入れるまでの代わりで、`http` では必須 |

```sh
VITE_API_MODE=http VITE_FACILITY_ID=<事業所の ID> pnpm --filter @buddy/web dev
```

`http` の実装は、画面の型（`src/api/types.ts`）と API の型（`src/api/generated/`）の違いを `src/api/http/scheduleMapper.ts` で変換する。予定の API にまだ無い操作と、変換の制限は次のとおり。

- 予定の更新は、予定の API に無いので、status が 501 の `ApiError` になる。
- 繰り返しの予定は、回に展開していないので一覧に出ない。キャンセルした予定も出さない。
- 予定の作成では、予定の種類、サービスコード、訪問の区分を、予定の API のマスタの名前から ID に引く。

今の `http` の実装は、ブラウザとサーバーの両方から API を直に呼び、トークンを付けない。認証を入れるときに、BFF の server function を通して呼ぶ形に替える。

照合の API のクライアント（`src/api/http/receiptApi.ts`）もここにある。照合の画面はまだ無いので、呼ぶところは無い。

## 確かめる

| コマンド | 確かめること |
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

## API の型を生成する

API の型は、各 API の openapi.yaml から openapi-typescript で生成し、`src/api/generated/` に置く。生成物はコミットする。

| 生成物 | 元の定義 |
| --- | --- |
| `src/api/generated/schedule.ts` | `apps/schedule-api/openapi.yaml`（予定の API） |
| `src/api/generated/receipt.ts` | `apps/receipt-api/openapi.yaml`（照合の API） |

openapi.yaml が変わったら、生成し直す。

```sh
pnpm --filter @buddy/web generate:api
```

生成物は整形と lint の対象から外してある（ルートの `vite.config.ts` の `ignorePatterns`）。

## route を足す

route は `src/routes/` のファイルから TanStack Router が生成する。  
生成物の `src/routeTree.gen.ts` は、開発サーバーとビルドが書き直す。開発サーバーを止めたまま型のチェックを通すときは、`pnpm --filter @buddy/web generate-routes` で作り直す。
