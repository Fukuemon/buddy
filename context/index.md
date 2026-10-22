# context の目次

作業の中で参照する、このリポジトリの規約と事実。変更をマージするまでの手順は [CONTRIBUTING.md](../CONTRIBUTING.md) にある。

- [コードベースの構造](codebase.md) — モジュールの境界、依存してよい向き、状態の保存先、新しいコードの配置先。コードから読み取れる構造は書かない
- [コードと文書の規約](conventions.md) — 命名、コメント、文書の書き方のうちこのリポジトリだけの規則、共有の設定、自動チェックの除外。lint で検出できる規則は書かない
- [業務の知識](domain.md) — 用語の定義と、概念ごとの文書の一覧。状態と遷移、不変条件は概念ごとに domain/ に置く
- [事業所の分離](domain/facility.md) — 事業所をまたぐ参照と操作を拒む規則
- [権限](domain/permission.md) — 役職のデフォルトの権限と職員ごとの権限の規則と、予定の閲覧と編集の判定
- [照合](domain/receipt-check.md) — 予定と実績の対の作り方と区分の決め方
- [繰り返しの予定](domain/recurring-schedule.md) — 繰り返しの規則、回、除外する日、回の置き換えの不変条件
- [予定](domain/schedule.md) — 単発の予定の種類、キャンセル、変更の状態と不変条件
- [職員とログイン](domain/staff-login.md) — 初回のログインで認証の基盤の sub を職員に結び付ける規則
- [訪問の情報](domain/visit.md) — 訪問の予定に付く利用者、主訪問者、同行者、サービスコード、訪問の区分の不変条件
- [基盤と運用](operations.md) — 環境の種類、デプロイと切り戻しの条件、監視、シークレットの配置先の方針
- [技術スタック](tech-stack.md) — 採用しているツールの役割とバージョンの所在、バージョンの更新の確認、新しいモジュールの作り始め。バージョンそのものと選んだ理由は書かない
- [テスト](testing.md) — テストの種類ごとの責務、実行に要る環境の条件、置き換えの方針、変更に足すテスト
- [エビデンス](testing/evidence.md) — エビデンスを付ける変更、格納先（pull request と issue への添付）、手動検証のエビデンスの配置先と撮り方の値。手動検証の値は検証環境ができてから決める（draft）

## Design Doc

- [レセプトの照合](../apps/receipt-api/DesignDoc.md) — receipt-api のパッケージの構成、予定のデータソース、入力の CSV のカラム、正規化、予定と実績の対の作り方、判定の規則、サービスごとの許容範囲、結果の JSON と画面の表示、元の実装との違い（draft）
- [予定の管理](../apps/schedule-api/DesignDoc.md) — schedule-api のコードの層、テーブルの構成（ER）、認証から事業所の確認までの流れ、繰り返しの予定、予定の変更とキャンセル、Google カレンダーの取り込みと書き出し
- [buddy Design Doc](../docs/design/DesignDoc.md) — web と schedule-api と receipt-api の責務と依存、業務の区切りとコンテナの対応、コンテナの間の契約、インフラとの約束（draft）
- [E2E のテストのコードの設計](../packages/e2e/DesignDoc.md) — buddy の E2E のテストのコード（packages/e2e）を、層、配置先、名前、待ち方、確かめ方、禁止する書き方、タイムアウトで組み立てる考え方。図で示す（draft）
- [エビデンスの録画](../packages/e2e/kit/recording/DesignDoc.md) — 手動検証のエビデンスを撮る録画の処理(recordEvidence、字幕、カーソル、書き出し)とエビデンスの配置先の構成、1 本を撮る流れ、配置先と名前、プロダクトから呼ぶ形（draft）
