# @buddy/ui

buddy のデザインシステム。DADS のトークンを元にした意味のトークンと、Base と Case のコンポーネントを持つ。  
apps/web は `@buddy/ui` を `workspace:*` で読み、ビルドせずに TypeScript のまま使う。

## Running

Storybook は、次で開く。

```sh
pnpm --filter @buddy/ui storybook
```

画面の Storybook（apps/web）も、このパッケージのコンポーネントを載せる。

## Tests and Checks

`component` と `storybook` の project はブラウザで動くので、初めて流すときは Playwright の chromium を入れる。

```sh
pnpm --filter @buddy/ui exec playwright install chromium
```

| コマンド | 確認すること |
| --- | --- |
| `pnpm --filter @buddy/ui test` | Vitest の 2 つの project（ブラウザでのコンポーネント、story の描画とアクセシビリティ）が通る |
| `pnpm check:contrast`（ルートで実行する） | 意味のトークンの組が、WCAG 2.2 のコントラスト比の基準に届く |
| `pnpm --filter @buddy/ui check` | 整形と lint（Vite+） |
| `pnpm --filter @buddy/ui typecheck` | `tsc` の型のチェック |

## Documentation

- [DESIGN.md](DESIGN.md): トークンとコンポーネントの使い方、カタログの組み方
- [ADR-0004](../../docs/adr/0004-design-system.md): トークンの段の分け方とコンポーネントの配置先の判断
