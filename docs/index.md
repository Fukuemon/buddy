# buddy の設計書

訪問看護の事業所の職員が使う、予定の管理とレセプトの照合の設計書。

- [PRD](PRD.md) — 誰のどの課題を、どの機能で解決するか
- [Design Doc](design/DesignDoc.md) — 構成要素の責務と、要素の間の依存
- [画面仕様書](screens/index.md) — 画面ごとに、何を表示し、何ができるか
- API の仕様 — <a href="api/schedule-api.html">予定の API</a>、<a href="api/receipt-api.html">照合の API</a>。各アプリの `openapi.yaml` を描く
- <a href="storybook/">デザインシステムのカタログ</a> — トークンとコンポーネントの使い方と、画面のコンポーネントの Storybook。公開したサイトだけで開ける（手元の `zensical serve` には無い）

- ADR — [認証の方式](adr/0001-auth.md)、[権限の方式](adr/0002-pbac.md)、[ブランチとリリースの方式](adr/0003-branch-and-release.md)、[デザインシステムのトークンとコンポーネントの置き場](adr/0004-design-system.md)、[schedule-api のパッケージの構成](adr/0005-schedule-api-packages.md)、[職員の管理の権限](adr/0006-staff-manage-policy.md)、[Go の共有の module](adr/0007-go-shared-module.md)、[web の画面の型と架空のデータ](adr/0008-web-view-types.md)
