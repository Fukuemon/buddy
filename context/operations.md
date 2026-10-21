---
type: context
title: 基盤と運用
description: 環境の種類、デプロイと切り戻しの条件、監視、秘密情報の置き場の方針
status: stable
---

# 基盤と運用

基盤の構成、デプロイの手順、監視のツールは、インフラのリポジトリ（非公開）が持つ。buddy はデプロイ先を知らず、インフラとの約束は [buddy Design Doc のインフラとの約束](../docs/design/DesignDoc.md#インフラとの約束)（イメージ、環境変数、ヘルスチェック、マイグレーション）だけである。ここには、buddy の側が守る取り決めを書く。

## Environments

| 環境 | 用途 | 反映する状態 |
| --- | --- | --- |
| 手元 | 開発と確かめ。ルートの `compose.yml` で全体を動かす | 作業中のブランチ |
| 検証 | リリースの前の確かめと、人手検証の証跡を撮る | `develop` |
| 本番 | 事業所の職員が使う | `main` |

- 検証環境と本番環境は、buddy-infra が作る。
- `develop` から `main` へは、検証環境で確かめた状態をまとめて取り込む（[ADR-0003](../docs/adr/0003-branch-and-release.md)）。

## Deployment Conditions

- デプロイする単位は、アプリごとのイメージである。リリースは、`main` のコミットに付けたアプリごとのタグ（`apps/<アプリ>/vX.Y.Z`）で指す。
- 取り込む前に、変えたアプリのテストとチェック、`pnpm check:generated` が通っている（[テスト](testing.md)）。
- API と画面を一緒に変えたときは、API を先にデプロイする。画面は、デプロイ済みの API が持つ項目だけを使う。
- マイグレーションの当て方と、ヘルスチェックの約束は、[buddy Design Doc のインフラとの約束](../docs/design/DesignDoc.md#インフラとの約束) にある。

## Health and Monitoring

- 正常かは `GET /readyz` で判断する。返す条件は Design Doc の Interfaces にある。
- ログは JSON で書く。schedule-api は標準出力、receipt-api と web は標準エラーに書く。トークン、cookie、DB の接続の設定、利用者の名前、CSV の中身をログに出さない。
- ログとメトリクスを集める先と、通知の条件は buddy-infra が決める。

## Rollback

- 切り戻しは、前のタグのイメージを動かし直す。
- マイグレーションは、`down` で戻さない。前のバージョンのアプリが新しい表の構成のまま動くよう、表と列の削除と名前の変更は、使わなくなったバージョンをデプロイした後の別のマイグレーションで行う。
- 照合はデータを保存しないので、receipt-api の切り戻しで戻すデータは無い。

## Secrets

- 秘密の値は、`OIDC_CLIENT_SECRET`、`SESSION_SECRET`、`DB_PASSWORD`、Google のサービスアカウントの認証情報である。
- 置き場は buddy-infra が決め、実行のときに環境変数（Google の認証情報は Application Default Credentials）で渡す。buddy のアプリは環境変数から読むだけにする。
- buddy のリポジトリ、issue、pull request、ログに、本物の秘密の値を書かない。buddy に置いてよいのは、手元の compose の開発用の値（`compose.yml`、`compose/idp.json`）だけである。
