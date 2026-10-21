# buddy

訪問看護の事業所の職員が、予定の管理とレセプトの照合を、1 回のログインで同じ画面から行うためのアプリ。  
照合は、Google カレンダーの予定と電子カルテの実績の CSV を比べ、食い違いの一覧を返す。

## 構成

| ディレクトリ | 中身 |
| --- | --- |
| [apps/web](apps/web) | 画面と BFF（TanStack Start）。ブラウザと話すのは web だけである |
| [apps/schedule-api](apps/schedule-api) | 事業所、職員、利用者、予定、権限を持つ API（Go、MySQL） |
| [apps/receipt-api](apps/receipt-api) | 予定と実績を照合する API（Go）。データを保存しない |
| [apps/docs-site](apps/docs-site) | 文書のサイト、apps/web の Storybook（デザインシステムのカタログ）、予定の管理の表の ER 図を Cloudflare に公開する |
| [packages/ui](packages/ui) | デザインシステムのトークンと、Base と Case のコンポーネント |
| [packages/e2e](packages/e2e) | E2E のテストと、人手検証の証跡を撮る仕組み |
| [docs](docs) | PRD、全体の Design Doc、ADR、画面仕様書、API の仕様のページ、表の文書。Zensical のサイトとして読む |
| [context](context) | 機能をまたぐ規約と事実 |

各 API の定義は `openapi.yaml` にあり、サーバーの Go のコードと画面の型を、そこから生成する。

## 手元で動かす

mise と Docker を入れてから、次を実行する。

```sh
mise install
pnpm install
docker compose up --build --wait
```

`http://localhost:3000` を開き、IdP のログインの画面で名前に `dev-aoki` を入れる。ポート、ログイン、データの消し方は、[CONTRIBUTING.md](CONTRIBUTING.md) の「手元で全部を動かす」にある。

## 文書

- 何のためのアプリか: [PRD](docs/PRD.md)
- 構成要素の責務と依存: [Design Doc](docs/design/DesignDoc.md)。アプリごとの設計は、各アプリの `DesignDoc.md` にある
- 画面ごとの表示と操作: [画面仕様書](docs/screens/index.md)
- API の要求と応答: 各 API の `openapi.yaml`（[予定の API](apps/schedule-api/openapi.yaml)、[照合の API](apps/receipt-api/openapi.yaml)）。文書のサイトの [「API の仕様」](https://buddy-docs.emon-apps.workers.dev/api/schedule-api.html) のページで読める
- 予定の管理の表の構成: [表の一覧](docs/db/schedule-api/README.md)。操作できる ER 図は、文書のサイトの [`/erd/`](https://buddy-docs.emon-apps.workers.dev/erd/) にある
- 公開した文書のサイト: [buddy-docs](https://buddy-docs.emon-apps.workers.dev)。デザインシステムのカタログは同じサイトの [`/storybook/`](https://buddy-docs.emon-apps.workers.dev/storybook/) にある。Cloudflare Access で許可した人だけが開ける。公開の仕組みは [apps/docs-site](apps/docs-site/README.md) にある
- 決めた判断と理由: [ADR](docs/adr)
- 変更を取り込むまでの手順: [CONTRIBUTING.md](CONTRIBUTING.md)
- 規約と事実の目次: [context/index.md](context/index.md)
