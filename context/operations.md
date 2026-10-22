---
type: context
title: 基盤と運用
description: 環境の種類、デプロイと切り戻しの条件、監視、シークレットの配置先の方針、事業所を足すときの Google のサービスアカウントの手順
status: stable
---

# 基盤と運用

基盤の構成、デプロイの手順、監視のツールは、インフラのリポジトリ（非公開）が持つ。buddy はデプロイ先を知らず、インフラとの約束は [buddy Design Doc のインフラとの約束](../docs/design/DesignDoc.md#インフラとの約束)（イメージ、環境変数、ヘルスチェック、マイグレーション）だけである。ここには、buddy の側が守る取り決めを書く。

## Environments

| 環境 | 用途 | 反映する状態 |
| --- | --- | --- |
| ローカル | 開発と確かめ。ルートの `compose.yml` で全体を起動する | 作業中のブランチ |
| 検証 | リリースの前の確かめと、手動検証のエビデンスを撮る | `develop` |
| 本番 | 事業所の職員が使う | `main` |

- 検証環境と本番環境は、インフラのリポジトリが作る。
- `develop` から `main` へは、検証環境で確かめた状態をまとめてマージする（[ADR-0003](../docs/adr/0003-branch-and-release.md)）。

## Deployment Conditions

- デプロイする単位は、アプリごとのイメージである。リリースは、`main` のコミットに付けたアプリごとのタグ（`<ディレクトリ>/vX.Y.Z`。`apps/web/v1.0.0`、`services/schedule/v1.0.0` など）で指す。
- マージする前に、変えたアプリのテストとチェック、`pnpm check:generated` が通っている（[テスト](testing.md)）。
- API と画面を一緒に変えたときは、API を先にデプロイする。画面は、デプロイ済みの API が持つ項目だけを使う。
- マイグレーションの適用のしかたと、ヘルスチェックの約束は、[buddy Design Doc のインフラとの約束](../docs/design/DesignDoc.md#インフラとの約束) にある。

## Health and Monitoring

- 正常かは `GET /readyz` で判断する。返す条件は Design Doc の Interfaces にある。
- ログは JSON で書く。schedule-api は標準出力、receipt-api と web は標準エラーに書く。トークン、cookie、DB の接続の設定、利用者の名前、CSV の中身をログに出さない。
- ログとメトリクスを集める先と、通知の条件は インフラのリポジトリが決める。

## Rollback

- 切り戻しは、前のタグのイメージを起動し直す。
- マイグレーションは、`down` で戻さない。前のバージョンのアプリが新しいテーブルの構成のまま動くよう、テーブルとカラムの削除と名前の変更は、使わなくなったバージョンをデプロイした後の別のマイグレーションで行う。
- 照合はデータを保存しないので、receipt-api の切り戻しで戻すデータは無い。

## Secrets

- シークレットは、`OIDC_CLIENT_SECRET`、`SESSION_SECRET`、`DB_PASSWORD`、Google の Workload Identity Federation の外部アカウントの設定である。
  - Google のサービスアカウントのキーは作らず、どこにも置かない。API は、Application Default Credentials で認証し、事業所のサービスアカウントになりすます。
  - ADR-0012: [Google カレンダーのサービスアカウントを事業所ごとに分け、buddy は IAM の権限借用で切り替える](../docs/adr/0012-google-calendar-facility-service-accounts.md)
- 組織とサービスアカウントの対応のファイル（`GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE`）は、buddy のリポジトリに置かない。
  - シークレットではないが、サービスアカウントのメールアドレスを持つためである。照合の対象のカレンダーのファイル（`GOOGLE_CALENDARS_FILE`）も、職員のカレンダー ID を持つので同じ扱いにする。
- 配置先は インフラのリポジトリが決め、実行のときに環境変数（Google の認証情報は Application Default Credentials）で渡す。buddy のアプリは環境変数から読むだけにする。
- buddy のリポジトリ、issue、pull request、ログに、本物のシークレットを書かない。buddy に置いてよいのは、ローカルの compose の開発用の値（`compose.yml` と `compose/` の下のファイル）だけである。

## Adding a Facility

運営側は、事業所を足すたびに、Google カレンダーのサービスアカウントを次の順で用意する。

1. 運営側の GCP のプロジェクトに、事業所のサービスアカウントを作る。
   - プロジェクトでは、IAM Service Account Credentials API を有効にしておく。権限借用の短い期間の token を作るのに要る。
2. Application Default Credentials で認証する主体に、事業所のサービスアカウントのトークン作成者のロールを付ける。プロジェクトの全体には付けない。
   - 主体は、Workload Identity Federation のプールの主体か、中間のサービスアカウントである。
3. 事業所の組織の ID とサービスアカウントのメールアドレスの対応を、`GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE` のファイルに足し、予定の API と照合の API に渡す。
4. 事業所の職員に、事業所のサービスアカウントのメールアドレスを伝え、自分のカレンダーを「予定の変更」の権限で共有してもらう。メールアドレスと共有の手順は、カレンダーの連携の画面にも出る。
   - 予定の API と照合の API は、同じ事業所のサービスアカウントで読み書きするので、職員の共有は 1 つでよい。予定の API が予定を書き出すので、閲覧だけの権限では足りない。
   - 「予定の変更」の共有だけで、ドメイン全体の委任なしに予定を書けるかは、未確認である。確かめるまで、本番で書き出しを有効にしない。
   - ADR-0012: [Google カレンダーのサービスアカウントを事業所ごとに分け、buddy は IAM の権限借用で切り替える](../docs/adr/0012-google-calendar-facility-service-accounts.md)

事業所のアカウントに切り替える前の 1 つのアカウントに共有したカレンダーは、切り替えると読めなくなる。  
職員が事業所のアカウントに共有し直した後に、運営側は前のアカウントへの共有を外してもらい、前のアカウントを止める。
