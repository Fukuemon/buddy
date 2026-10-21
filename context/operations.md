---
type: context
title: 基盤と運用
description: 環境の種類、デプロイと切り戻しの条件、監視、シークレットの配置先の方針
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

- デプロイする単位は、アプリごとのイメージである。リリースは、`main` のコミットに付けたアプリごとのタグ（`apps/<アプリ>/vX.Y.Z`）で指す。
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

- シークレットは、`OIDC_CLIENT_SECRET`、`SESSION_SECRET`、`DB_PASSWORD`、Google のサービスアカウントの認証情報である。
- 配置先は インフラのリポジトリが決め、実行のときに環境変数（Google の認証情報は Application Default Credentials）で渡す。buddy のアプリは環境変数から読むだけにする。
- buddy のリポジトリ、issue、pull request、ログに、本物のシークレットを書かない。buddy に置いてよいのは、ローカルの compose の開発用の値（`compose.yml`、`compose/idp.json`）だけである。
