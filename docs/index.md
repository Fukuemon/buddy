# buddy の設計書

訪問看護の事業所の職員が使う、予定の管理とレセプトの照合の設計書。

- [PRD](PRD.md) — 誰のどの課題を、どの機能で解決するか
- [Design Doc](design/DesignDoc.md) — 構成要素の責務と、要素の間の依存
  - 機能ごとの Design Doc — [予定の管理](design/services/schedule.md)、[レセプトの照合](design/services/receipt.md)、[E2E のテストのコード](design/packages/e2e.md)、[エビデンスの録画](design/packages/e2e-recording.md)、[デザインシステムの使い方](design/packages/ui.md)
- [画面仕様書](screens/index.md) — 画面ごとに、何を表示し、何ができるか
- API の仕様 — <a href="api/schedule-api.html">予定の API</a>、<a href="api/receipt-api.html">照合の API</a>。各 API の `openapi.yaml` を描く
- DB の設計 — [テーブルの一覧](db/schedule-api/README.md)と業務のまとまりごとの ER 図、<a href="erd/">テーブルを選んで関係をたどれる ER 図</a>（Liam ERD。公開したサイトだけで開ける）
- <a href="storybook/">デザインシステムのカタログ</a> — トークンとコンポーネントの使い方と、画面のコンポーネントの Storybook。公開したサイトだけで開ける（ローカルの `zensical serve` には無い）
- ADR — 決めた判断と理由
  - [認証の方式](adr/0001-auth.md)
  - [権限の方式](adr/0002-pbac.md)
  - [ブランチとリリースの方式](adr/0003-branch-and-release.md)
  - [デザインシステムのトークンとコンポーネントの配置先](adr/0004-design-system.md)
  - [schedule-api のパッケージの構成](adr/0005-schedule-api-packages.md)
  - [職員の管理の権限](adr/0006-staff-manage-policy.md)
  - [Go の共有の module](adr/0007-go-shared-module.md)
  - [web の画面の型とダミーデータ](adr/0008-web-view-types.md)
  - [Google カレンダーとの段階の同期](adr/0009-google-calendar-sync.md)
  - [予定の API の usecase の境界](adr/0010-schedule-api-usecase-boundaries.md)
  - [予定の API の PostgreSQL への移行](adr/0011-schedule-api-postgresql.md)
  - [事業所ごとの Google カレンダーのサービスアカウント](adr/0012-google-calendar-facility-service-accounts.md)
  - [API の services/ への配置](adr/0013-services-directory.md)
