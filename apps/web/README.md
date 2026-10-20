# @buddy/web

予定の管理の画面。TanStack Start で作り、ツールチェーンに Vite+ を使う。  
今はデータを手元の偽物の API（`src/api/fake/`）から取る。ログインはまだない。

## 起動する

リポジトリのルートで依存を入れてから、開発サーバーを起動する。

```sh
pnpm install
pnpm --filter @buddy/web dev
```

開発サーバーは `http://localhost:3000` で待ち受ける。`/` は `/schedule` へ転送する。  
偽物の API はブラウザのメモリにデータを持つため、ページを読み直すと作った予定は消える。

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

## route を足す

route は `src/routes/` のファイルから TanStack Router が生成する。  
生成物の `src/routeTree.gen.ts` は、開発サーバーとビルドが書き直す。開発サーバーを止めたまま型のチェックを通すときは、`pnpm --filter @buddy/web generate-routes` で作り直す。
