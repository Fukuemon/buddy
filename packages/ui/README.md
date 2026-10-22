# @buddy/ui

buddy のデザインシステム。DADS のトークンを元にした意味のトークンと、Base と Case のコンポーネントを持つ。  
apps/web は `@buddy/ui` を `workspace:*` で読み、ビルドせずに TypeScript のまま使う。

## テストとチェック

`component` と `storybook` の project はブラウザで動くので、初めて流すときは Playwright の chromium を入れる。

```sh
pnpm --filter @buddy/ui exec playwright install chromium
```

| コマンド | 確かめること |
| --- | --- |
| `pnpm --filter @buddy/ui test` | Vitest の 3 つの project（トークンの単体、ブラウザでのコンポーネント、story の描画とアクセシビリティ）が通る |
| `pnpm --filter @buddy/ui check` | 整形と lint（Vite+） |
| `pnpm --filter @buddy/ui typecheck` | `tsc` の型のチェック |

## Storybook を開く

```sh
pnpm --filter @buddy/ui storybook
```

画面の Storybook（apps/web）も、このパッケージのコンポーネントを載せる。

## 文書

- [DESIGN.md](DESIGN.md): トークンとコンポーネントの使い方、カタログの組み方
- [ADR-0004](../../docs/adr/0004-design-system.md): トークンの段の分け方とコンポーネントの配置先の判断
