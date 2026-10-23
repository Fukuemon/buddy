# buddy

訪問看護の事業所の職員が、予定の管理とレセプトの照合を、1 回のログインで同じ画面から行うためのアプリ。  
照合は、Google カレンダーの予定と電子カルテの実績の CSV を比べ、食い違いの一覧を返す。

## セットアップ

mise と Docker を入れてから、次を実行する。

```sh
mise install
pnpm install
docker compose up --build --wait
```

`http://localhost:3000` を開き、ブローカーのログインの画面でメールに `hina.aoki@example.com` を入れ、上流の IdP のフェイクの画面で同じメールを確認済みのクレームにして入る。ポート、ログイン、データの消し方は、[CONTRIBUTING.md](CONTRIBUTING.md) の「ローカル環境で全体を起動する」にある。

## 文書

設計書（PRD、Design Doc、ADR、画面仕様書、API と DB の仕様）は [docs](docs) にある。  
ルートで `uv run zensical serve` を実行すると、文書のサイトとして `http://localhost:8000` で読める。

## 貢献

今は、外部からの pull request を受け付けていない。  
不具合と要望は、issue テンプレートから報告できる。  
セキュリティの問題は issue に書かず、[SECURITY.md](SECURITY.md) の手順で届ける。  
メンテナーが変更をマージするまでの手順は、[CONTRIBUTING.md](CONTRIBUTING.md) にある。

## ライセンス

[MIT License](LICENSE) で公開する。
