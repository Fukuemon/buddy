# context の目次

作業の中で参照する、このリポジトリの規約と事実。変更を取り込むまでの手順は [CONTRIBUTING.md](../CONTRIBUTING.md) にある。

- [コードベースの構造](codebase.md) — モジュールの境界、依存してよい向き、状態の置き場、新しいコードの置き場。コードから読み取れる構造は書かない（draft）
- [コードと文書の規約](conventions.md) — 命名、コメント、文書の書き方のうちこのリポジトリだけの規則、共有の設定、自動チェックの除外。lint で検出できる規則は書かない（draft）
- [業務の知識](domain.md) — 用語の定義と、概念ごとの文書の一覧。状態と遷移、不変条件は概念ごとに domain/ に置く（draft）
- [基盤と運用](operations.md) — 環境の種類、デプロイと切り戻しの条件、監視、秘密情報の置き場の方針（draft）
- [技術スタック](tech-stack.md) — 採用しているツールの役割とバージョンの所在、バージョンの更新の確認、新しいモジュールの作り始め。バージョンそのものと選んだ理由は書かない（draft）
- [テスト](testing.md) — テストの種類ごとの責務、実行に要る環境の条件、置き換えの方針、変更に足すテスト（draft）

## Design Doc

- [buddy Design Doc](../docs/design/DesignDoc.md) — web と schedule-api と receipt-api の責務と依存、認証と事業所の分離、インフラとの約束（draft）
- [予定の管理](../apps/schedule-api/DesignDoc.md) — schedule-api の表の構成（ER）、認証から認可までの流れ、繰り返しの予定の展開（draft）
- [E2E のテストのコードの設計](../packages/e2e/DesignDoc.md) — packages/e2e の層、配置先、名前、待ち方、確かめ方、禁止する書き方、タイムアウト（draft）
- [証跡の録画](../packages/e2e/kit/recording/DesignDoc.md) — 人手検証の証跡を撮る録画の処理と置き場（draft）
- [レセプトの照合](../apps/receipt-api/DesignDoc.md) — receipt-api のパッケージの構成、予定の取得元、入力の CSV の列、正規化、予定と実績の対の作り方、判定の規則、サービスごとの許容範囲、結果の JSON と画面の表示、元の実装との違い（draft）
