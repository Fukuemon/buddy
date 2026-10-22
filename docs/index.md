# buddy の設計書

訪問看護の事業所の職員が使う、予定の管理とレセプトの照合のアプリの設計書。  
すべての文書は、左のサイドバーから開ける。

## 読み始める場所

- 何を作るかを知る — [PRD](PRD.md)
- web と 2 つの API の責務と依存を知る — [Design Doc](design/DesignDoc.md)
- 画面を作る、直す — [画面仕様書](screens/index.md)、[デザインシステムの使い方](design/packages/ui.md)
- API とテーブルを変える — <a href="api/schedule-api.html">予定の API</a>、<a href="api/receipt-api.html">照合の API</a>、[テーブルの一覧](db/schedule-api/README.md)

サイドバーの「ER 図（Liam ERD）」と「カタログ（Storybook）」は、公開したサイトとプレビューだけで開ける。ローカルの `zensical serve` では開けない。
