# @buddy/web

予定の管理の画面。TanStack Start で作り、ツールチェーンに Vite+ を使う。  
既定ではデータを手元の偽物の API（`src/api/fake/`）から取る。BFF を通して予定の API を呼ぶように切り替えられる（「API を切り替える」）。

## 起動する

リポジトリのルートで依存を入れてから、開発サーバーを起動する。

```sh
pnpm install
pnpm --filter @buddy/web dev
```

開発サーバーは `http://localhost:3000` で待ち受ける。`/` は `/schedule` へ転送する。  
偽物の API はブラウザのメモリにデータを持つため、ページを読み直すと作った予定は消える。

## API を切り替える

画面が呼ぶ API は、ビルドのときの環境変数 `VITE_API_MODE` で選ぶ。

| 値 | 動き |
| --- | --- |
| `fake`（既定） | 偽物の API（`src/api/fake/`）を呼ぶ。ログインせず、架空の職員として動く |
| `bff` | サーバーの BFF が、セッションの access token を付けて予定の API を呼ぶ。ログインを求める |

コンテナのイメージは `bff` でビルドする。`bff` の動きは、リポジトリのルートの compose で確かめる（CONTRIBUTING.md の「手元で全部を動かす」）。  
開発サーバーを `bff` で動かすと、トークンの `iss` が compose の API の求める値と合わないので、手元の開発サーバーは `fake` で使う。

## ログインとセッション（BFF）

`bff` では、web が BFF としてブローカーと認可コードフロー（PKCE つき）でやり取りする。

- `/auth/login` は、ブローカーの認可の画面へ転送する。`/auth/callback` は、トークンを取り、予定の API の `GET /v1/me` で職員と事業所を引いてセッションを作る。
- セッションは Valkey に置き、ブラウザには署名つきの cookie でセッションの ID だけを渡す。cookie は HttpOnly、SameSite=Lax、Secure で、Secure は `SESSION_COOKIE_SECURE=false` のときだけ外す。
- 画面の API の呼び出しは、server function（`src/api/bff/serverFns.ts`）を通る。サーバーは、画面が渡した事業所の代わりにセッションの事業所を使う。
- access token の期限が 1 分を切ったら、refresh token で取り直す。同じセッションの取り直しは、Valkey の鍵で 1 本にまとめる。ブローカーが refresh token を拒めばセッションを消し、画面はログインへ移る。
- ほかのサイトのページからの POST は、TanStack Start の CSRF の middleware で 403 を返す（`src/start.ts`）。
- 画面の引数は、server function で操作ごとの形を確かめ、合わなければ 400 を返す。
- 事業所に登録されていない職員は、`/auth/error?reason=forbidden` に案内を出す。

サーバーが読む環境変数は、設計書の環境変数の表にある。手元の compose のように、ブラウザと web から届く IdP の URL が違うときは、`OIDC_AUTHORIZATION_ENDPOINT` でブラウザを転送する認可の URL を渡す。

`/healthz` は応答できれば 200 を、`/readyz` は Valkey に届けば 200、届かなければ 503 を返す。

## 予定の API との変換

`src/api/http/` の実装は、画面の型（`src/api/types.ts`）と API の型（`src/api/generated/`）の違いを `src/api/http/scheduleMapper.ts` で変換する。BFF がサーバーで使う。変換の制限は次のとおり。

- 繰り返しの予定は、回に展開していないので一覧に出ない。キャンセルした予定も出さない。
- 予定の作成と更新では、予定の種類、サービスコード、訪問の区分を、予定の API のマスタの名前から ID に引く。

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
