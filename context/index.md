# context の目次

作業の中で参照する、このリポジトリの規約と事実。  
変更をマージするまでの手順は [CONTRIBUTING.md](../CONTRIBUTING.md) にある。

- [コードベースの構造](codebase.md) — モジュールの境界、依存してよい向き、状態の保存先、新しいコードの配置先。コードから読み取れる構造は書かない
- [コードと文書の規約](conventions.md) — 命名、コメント、文書と API の定義の書き方のうちこのリポジトリだけの規則、共有の設定、自動チェックの除外。lint で検出できる規則は書かない
- [業務の知識](domain.md) — 用語の定義と、概念ごとの文書の一覧。状態と遷移、不変条件は概念ごとに domain/ に置く
- [事業所の分離](domain/facility.md) — 事業所をまたぐ参照と操作を拒む規則
- [利用者](domain/patient.md) — 利用者の登録、変更、利用の終了、利用の再開の規則と、利用の終了の利用者を予定の候補と職員の退職の確認から外す規則
- [権限](domain/permission.md) — 役職のデフォルトの権限と職員ごとの権限の規則と、予定の閲覧と編集の判定
- [照合](domain/receipt-check.md) — 予定と実績の対の作り方と区分の決め方
- [繰り返しの予定](domain/recurring-schedule.md) — 繰り返しの規則、回、除外する日、回の置き換え、規則の変更の不変条件
- [予定](domain/schedule.md) — 単発の予定の種類、キャンセル、変更の状態と不変条件
- [職員とログイン](domain/staff-login.md) — 職員の登録、変更、休職、復職、退職の規則、ブローカーが上流の IdP のアカウントを職員に結び付ける規則、予定の API が sub で職員を引く規則
- [訪問の情報](domain/visit.md) — 訪問の予定に付く利用者、主訪問者、同行者、サービスコード、訪問の区分の不変条件
- [訪問看護の報酬](domain/visiting-nursing-fee.md) — 照合の規則を読むのに要る、サービスコードの読み方、提供時間の区分、早朝・夜間・深夜の加算の条件、電子カルテの実績の書き方
- [基盤と運用](operations.md) — 環境の種類、デプロイと切り戻しの条件、監視、Google カレンダーの Worker の動かし方、シークレットの配置先の方針、事業所を足すときの Google のサービスアカウントの手順、CI のランナーの切り替え
- [技術スタック](tech-stack.md) — 採用しているツールの役割とバージョンの所在、バージョンの更新の確認、新しいモジュールの作り始め。バージョンそのものと選んだ理由は書かない
- [テスト](testing.md) — テストの種類ごとの責務、実行に要る環境の条件、置き換えの方針、変更に足すテスト
- [E2E のテスト](testing/e2e.md) — Playwright の API とスキルの語の対応、testid の形、lint の規則に渡す値、流すコマンドと project、テストデータとログイン、待つ時間の決め方
- [エビデンス](testing/evidence.md) — エビデンスを付ける変更、元のファイルの配置先と公開の範囲、エビデンスの spec と見本、撮る環境と撮るコマンド、ログインとテストデータ、gh の `--attach` での添付の仕方、検証シナリオの決まり。検証環境の値は検証環境ができてから決める（draft）

## Design Doc

- [buddy Design Doc](../docs/design/DesignDoc.md) — web、予定の API、calendar-worker、照合の API、ID ブローカーの責務と依存、業務の領域とコンテナの対応、コンテナの間の通信、デプロイの要件（draft）
- [E2E のテストのコードの設計](../packages/e2e/DesignDoc.md) — buddy の E2E のテストのコードの、層の依存の向き、配置先の決め方、エビデンスの spec の流れ、禁止する書き方、失敗の読み方、テストの関数と待ちの組み立て。図で示す（draft）
- [buddy のデザインシステム](../packages/ui/DESIGN.md) — packages/ui のトークンとコンポーネントの使い方。画面を作るときの原則と手順と、packages/ui/design/ の 3 つの文書（色と文字のトークン、コンポーネントの選び方と DADS を元にしたコンポーネントごとの規則、Storybook のカタログの組み方）
- [予定の画面](../apps/web/src/features/schedule/DesignDoc.md) — 予定のカレンダー、予定の詳細、予定の作成、予定の編集の画面が、BFF を通して予定の API を読み書きする流れ。呼び出し、ログインが切れたとき、読み込み、予定の一覧の期間と職員の絞り込み、保存
- [ID ブローカー](../services/broker/DesignDoc.md) — Ory Hydra の login and consent app として動くブローカーの責務、Hydra との分担、ログイン、職員の登録、休職、復職、退職、ログアウトの流れ、ローカル環境の構成（draft）
- [レセプトの照合](../services/receipt/DesignDoc.md) — 照合の API のパッケージの構成、予定のデータソース、入力の CSV のカラム、正規化、予定と実績の対の作り方、判定の規則、サービスごとの許容範囲、結果の JSON と画面の表示、元の実装との違い（draft）
- [予定の管理](../services/schedule/DesignDoc.md) — 予定の API のコードの構成、テーブルの構成（ER）、認証から事業所の確認までの流れ、繰り返しの予定、予定の変更とキャンセル
- [職員の管理](../services/schedule/internal/features/staff/DesignDoc.md) — 予定の API での職員の登録、休職、復職、退職の手順と、休職と退職の前の残る一覧、職員の管理で返す 409 のエラー
- [権限](../services/schedule/internal/access/DesignDoc.md) — 権限のレコードとマイグレーション、職員ごとの権限の足し外しとチームの対象の移し替え、予定の認可、照合の API の権限の確認
- [Google カレンダーとの連携](../services/schedule/internal/features/calendar/DesignDoc.md) — 事業所のサービスアカウントでの Calendar API の呼び出し、Google カレンダーの取り込み、書き出し、同期、書き込み、ローカル環境と E2E の Google カレンダー
