# buddy

訪問看護の事業所の職員が、予定の管理とレセプトの照合を、1 回のログインで同じ画面から行うためのアプリ。  
照合は、Google カレンダーの予定と電子カルテの実績の CSV を比べ、食い違いの一覧を返す。

## 構成

| ディレクトリ | 中身 |
| --- | --- |
| [apps/web](apps/web) | 画面と BFF（TanStack Start）。ブラウザと話すのは web だけである |
| [services/schedule](services/schedule) | 事業所、職員、利用者、予定、権限を持つ API（Go、PostgreSQL） |
| [services/receipt](services/receipt) | 予定と実績を照合する API（Go）。データを保存しない |
| [apps/docs-site](apps/docs-site) | 文書のサイト、apps/web の Storybook（デザインシステムのカタログ）、予定の管理の ER 図を Cloudflare に公開する |
| [packages/ui](packages/ui) | デザインシステムのトークンと、Base と Case のコンポーネント |
| [packages/e2e](packages/e2e) | E2E のテストと、手動検証のエビデンスを撮る仕組み |
| [docs](docs) | PRD、全体の Design Doc、ADR、画面仕様書、API の仕様のページ、テーブル定義書。Zensical のサイトとして読む |
| [context](context) | 機能をまたぐ規約と事実 |

各 API の定義は `openapi.yaml` にあり、サーバーの Go のコードと画面の型を、そこから生成する。

## セットアップ

mise と Docker を入れてから、次を実行する。

```sh
mise install
pnpm install
docker compose up --build --wait
```

`http://localhost:3000` を開き、IdP のログインの画面で名前に `dev-aoki` を入れる。ポート、ログイン、データの消し方は、[CONTRIBUTING.md](CONTRIBUTING.md) の「ローカル環境で全体を起動する」にある。

## 文書

- 何のためのアプリか: [PRD](docs/PRD.md)
- 構成要素の責務と依存: [Design Doc](docs/design/DesignDoc.md)。機能ごとの設計は、各 API とパッケージの `DesignDoc.md` にある
- 画面ごとの表示と操作: [画面仕様書](docs/screens/index.md)
- API のリクエストとレスポンス: 各 API の `openapi.yaml`（[予定の API](services/schedule/openapi.yaml)、[照合の API](services/receipt/openapi.yaml)）。ローカルの文書のサイトの「API の仕様」のページでも読める
- 予定の管理のテーブルの構成: [テーブルの一覧](docs/db/schedule-api/README.md)。操作できる ER 図は、ルートで `pnpm build:erd` を実行するとローカルで作れる。開き方は [CONTRIBUTING.md](CONTRIBUTING.md) の「公開した文書のサイトとカタログを確かめる」にある
- 文書のサイト: ルートで `uv run zensical serve` を実行すると、`http://localhost:8000` で読める
  - デザインシステムのカタログ（Storybook）は、`pnpm --filter @buddy/web storybook` でローカルに開く。
  - ルートで `pnpm site:build` を実行すると、文書のサイト、カタログ、ER 図をまとめた成果物をローカルでビルドできる。
  - 公開した [buddy-docs](https://buddy-docs.emon-apps.workers.dev) は Cloudflare Access で許可した人だけが開け、外部の人は開けない。デプロイの構成は [apps/docs-site](apps/docs-site/README.md) にある。
- 決めた判断と理由: [ADR](docs/adr)
- 変更をマージするまでの手順: [CONTRIBUTING.md](CONTRIBUTING.md)
- 規約と事実の目次: [context/index.md](context/index.md)

## 貢献

今は、外部からの pull request を受け付けていない。  
不具合と要望は、issue テンプレートから報告できる。  
セキュリティの問題は issue に書かず、[SECURITY.md](SECURITY.md) の手順で届ける。  
[CONTRIBUTING.md](CONTRIBUTING.md) は、メンテナーが変更をマージするまでの運用を書いた文書である。

## ライセンス

[MIT License](LICENSE) で公開する。
