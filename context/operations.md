---
type: context
title: 基盤と運用
description: 環境の種類、デプロイと切り戻しの条件、監視、Google カレンダーの Worker の動かし方、シークレットの配置先の方針、事業所を足すときの Google のサービスアカウントの手順、CI のランナーの切り替え
status: stable
---

# 基盤と運用

基盤の構成、デプロイの手順、監視のツールは、インフラのリポジトリ（非公開）が持つ。  
buddy のコードと設定は、特定のデプロイ先を前提にしない。  
インフラのリポジトリが buddy に依存するのは、コンテナのイメージ、環境変数、ヘルスチェック、マイグレーションだけである。  
4 つの要件は、[buddy Design Doc のデプロイの要件](../docs/design/DesignDoc.md#デプロイの要件) にある。

## Environments

| 環境 | 用途 | 反映する状態 |
| --- | --- | --- |
| ローカル | 開発と確認。ルートの `compose.yml` で全体を起動する | 作業中のブランチ |
| 検証 | リリースの前の確認と、手動検証のエビデンスを撮る | `develop` |
| 本番 | 事業所の職員が使う | `main` |

- 検証環境と本番環境は、インフラのリポジトリが作る。
- `develop` から `main` へのマージとリリースの手順は、[CONTRIBUTING.md](../CONTRIBUTING.md) の Branches and Releases にある。

## Deployment Conditions

- デプロイする単位は、アプリごとのイメージである。
- リリースは、`main` のコミットに付けたアプリごとのタグで指す。
- マージする前に、変えたアプリのテストとチェック、`pnpm check:generated` が通っている（[テスト](testing.md)）。
- API と画面を一緒に変えたときは、API を先にデプロイする。
  - 画面は、デプロイ済みの API が持つ項目だけを使う。
- マイグレーションの適用のしかたと、ヘルスチェックの要件は、[buddy Design Doc のデプロイの要件](../docs/design/DesignDoc.md#デプロイの要件) にある。

## Health and Monitoring

- 正常かは `GET /readyz` で判断する。
  - 返す条件は Design Doc の Interfaces にある。
- ログは JSON で書く。
  - 予定の API は標準出力、照合の API と web は標準エラーに書く。
  - トークン、cookie、DB の接続の設定、利用者の名前、CSV の中身をログに出さない。
- ログとメトリクスを集める先と、通知の条件は、インフラのリポジトリが決める。

## Calendar Worker

Google カレンダーの書き出しと同期は、予定の API と同じイメージの `calendar-worker` が、役割ごとのプロセスで動かす。  
ADR-0029: [Google カレンダーの書き出しと同期を、予定の API と同じイメージの Worker のコマンドで役割ごとに動かし、繰り返しを Worker のコマンドに集める](../docs/adr/0029-calendar-worker.md)

- 役割は `calendar-worker export`（書き出し）と `calendar-worker sync`（同期）で、1 つのプロセスは 1 つの役割だけを持つ。
- 常駐で動かすか、`--once` を付けて定期的に起動するかは、インフラのリポジトリが決める。
- 同じ役割の Worker を 2 つ以上動かしてもよい。
  - 待ちとカレンダーは、リースで 1 つの Worker だけが取る。
- 止めるときは停止の合図（SIGTERM）を送る。
  - Worker は新しく取るのをやめ、取ったものの結果を書いてから終わる。
- 異常終了で結果を書けなかった待ちとカレンダーは、リースが切れた後に取り直される。
  - 復旧のために DB を直す必要はない。
- 同期の Worker は、Google カレンダーを予定の正本にする事業所（`google_primary`）のカレンダーだけを取る。
  - buddy を正本にする事業所（`buddy_primary`）のカレンダーは読まない。
  - ADR-0026: [Google カレンダーとの連携を、事業所ごとの正本のモードで分ける](../docs/adr/0026-google-calendar-sync.md)
- 処理の回数、成功と失敗、滞留は、Worker のログ（`component` が `calendar-export` か `calendar-sync`）から見る。
  - メトリクスは、インフラの側でこのログから作る。

### Worker のログ

Worker は、待ちかカレンダーを取って処理する 1 回（バッチ）ごとに、要約のログを 1 行書く。  
取るものが無かったバッチの要約は、常駐の間隔ごとに続くので、`debug` の水準で書く。  
バッチの後に、滞留の件数と時間を `info` の水準で書く。  
停止の合図を受けた後のバッチでは、滞留を数えない。

要約の `msg` は、書き出しが `calendar export batch`、同期が `calendar sync batch` である。  
同期の Worker は、書く期限を過ぎた保留の版の読み戻しの要約も、`calendar pending readback batch` に書く。読み戻しでは、取った数は Google カレンダーに書いた予定の記録の数になる。  
項目は次のとおり。

- `claimed_count`: 取った待ちかカレンダーの数
  - 残りの 4 つの項目の和は、`claimed_count` と同じになる。
- `succeeded_count`: 書けた待ちか、変更を当て終えたカレンダーの数
- `failed_count`: 書けなかった待ちか、読めなかったか当てられなかったカレンダーの数
  - 一時的なエラーで後から書き直す待ちも、失敗に数える。
- `held_count`: 書かずに置いた待ちか、当てずに置いたカレンダーの数
  - 書き出しでは、Google カレンダーで変わっていて確認が必要にした待ち（`conflict`）を数える。
  - 同期では、書き出しの処理を待って読み直すカレンダーと、同期の途中で外れたカレンダーと、同期の途中で事業所の正本のモードが変わったカレンダーを数える。
- `requeued_count`: 停止の合図で結果を書かずに、取り直せるように戻した数
- `duration_ms`: 取ってから全ての結果を書くまでのミリ秒

書き出しの滞留の `msg` は `calendar export backlog` で、項目は次のとおり。

- `pending_count`: 書いていない待ち（`pending`）の数
  - 書き直しの時刻を待っている待ちも含む。
  - 確認が必要な待ち（`conflict` と `failed`）は、職員が選ぶまで書かないので数えない。確認が必要な待ちは、カレンダーの連携の画面で見る。
- `oldest_pending_age_seconds`: 書いていない待ちのうち、最も古いものを積んでからの秒数
  - 待ちが無ければ 0 になる。
  - 同じ予定の待ちを積み直しても、最初に積んだ時刻から数える。

同期の滞留の `msg` は `calendar sync backlog` で、項目は次のとおり。

- `overdue_count`: 同期が読む事業所（`google_primary`）の外していないカレンダーのうち、次に読む時刻を過ぎたものの数
- `oldest_success_age_seconds`: 同期が読む事業所の外していないカレンダーのうち、最後の成功が最も古いものの、最後の成功からの秒数
  - 1 回も成功していないカレンダーは、同期を始めた時刻から数える。
  - カレンダーが無ければ 0 になる。

予定のタイトル、利用者名、カレンダーの ID のメールは、どのログにも書かない。  
1 つの待ちやカレンダーの失敗は、要約とは別に、`calendar export failed` と `calendar sync failed` の行に書く。  
失敗の行には、待ちの ID（`export_id`）か、事業所の ID（`facility_id`）と buddy のカレンダーの ID（`external_calendar_id`）を付ける。  
日時を読めずに参照のモデル（Projection）に写さなかった予定は、`calendar projection skipped` の行に、事業所、カレンダー、Google の予定の ID（`event_id`）を付けて書く。  
保留の版を読み戻せなかった記録は、`calendar pending readback failed` の行に、事業所、カレンダー、Google の予定の ID を付けて書く。

## Rollback

- 切り戻しは、前のタグのイメージを起動し直す。
- マイグレーションは、`down` で戻さない。
  - 前のバージョンのアプリが新しいテーブルの構成のまま動くようにする。そのため、テーブルとカラムの削除と名前の変更は、使わなくなったバージョンをデプロイした後の別のマイグレーションで行う。
- 照合はデータを保存しないので、照合の API の切り戻しで戻すデータは無い。

## Secrets

- シークレットは、`OIDC_CLIENT_SECRET`、`SESSION_SECRET`、`DB_PASSWORD`、Google の Workload Identity Federation の外部アカウントの設定である。
  - ブローカーでは、上流の IdP の client secret のファイル（`UPSTREAM_IDP_CLIENT_SECRETS_FILE`）と、token_hook のヘッダーの値（`TOKEN_HOOK_KEY`）もシークレットである。
- Google のサービスアカウントのキーは作らず、どこにも置かない。
  - API は、Application Default Credentials で認証し、事業所のサービスアカウントの権限を借用する。
  - ADR-0027: [職員のカレンダーを、事業所ごとのサービスアカウントへの共有で読み書きする](../docs/adr/0027-google-calendar-service-accounts.md)
- 組織とサービスアカウントの対応のファイル（`GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE`）は、buddy のリポジトリに置かない。
  - シークレットではないが、サービスアカウントのメールアドレスを持つためである。
  - 照合の対象のカレンダーのファイル（`GOOGLE_CALENDARS_FILE`）も、職員のカレンダー ID を持つので同じ扱いにする。
- 配置先はインフラのリポジトリが決め、実行のときに環境変数（Google の認証情報は Application Default Credentials）で渡す。
  - buddy のアプリは環境変数から読むだけにする。
- buddy のリポジトリ、issue、pull request、ログに、本物のシークレットを書かない。
  - buddy に置いてよいのは、ローカルの compose の開発用の値（`compose.yml` と `compose/` の下のファイル）だけである。

## Adding a Facility

運営側の GCP のプロジェクトでは、最初の事業所を足す前に 1 回だけ、IAM Service Account Credentials API を有効にする。  
この API は、権限借用の短い期間の token を作るのに要る。  
運営側は、事業所を足すたびに、Google カレンダーのサービスアカウントを次の順で用意する。

1. 運営側の GCP のプロジェクトに、事業所のサービスアカウントを作る。
2. Application Default Credentials で認証する主体に、事業所のサービスアカウントのトークン作成者のロールを付ける。
   - ロールは、プロジェクトの全体には付けない。
   - 主体は、Workload Identity Federation のプールの主体か、中間のサービスアカウントである。
3. 事業所の組織の ID とサービスアカウントのメールアドレスの対応を、`GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE` のファイルに足し、予定の API と照合の API に渡す。
4. 事業所の職員に、事業所のサービスアカウントのメールアドレスを伝え、自分のカレンダーを「予定の変更」の権限で共有してもらう。
   - メールアドレスと共有の手順は、カレンダーの連携の画面にも出る。
   - 予定の API と照合の API は、同じ事業所のサービスアカウントで読み書きするので、職員の共有は 1 つでよい。
   - 予定の API が予定を書き出すので、閲覧だけの権限では足りない。
   - 「予定の変更」の共有だけで、ドメイン全体の委任なしに予定を書けるかは、未確認である。PRD の [Open Questions](../docs/PRD.md#open-questions) にある。
     - 確認するまで、本番で書き出しを有効にしない。
   - ADR-0027: [職員のカレンダーを、事業所ごとのサービスアカウントへの共有で読み書きする](../docs/adr/0027-google-calendar-service-accounts.md)

事業所のアカウントに切り替える前の 1 つのアカウントに共有したカレンダーは、切り替えると読めなくなる。  
職員が事業所のアカウントに共有し直した後に、運営側は前のアカウントへの共有を外してもらい、前のアカウントを止める。

## Switching a Facility to buddy

Google カレンダーを予定の正本にする事業所（`google_primary`）を buddy の正本に切り替えるときは、事業所のマネージャーが、予定の正本の切り替えの画面（`/schedule/link/cutover`）で次の順に進める。  
手順の規則は [Google カレンダーとの連携の Design Doc の予定の正本の切り替え](../services/schedule/internal/features/calendar/DesignDoc.md#予定の正本の切り替え) にある。

切り替えは、業務時間外の 1 回の作業で、始めてから完了まで終える。  
その日のうちに完了できなければ、切り替えを「やめる」で終え、別の日に始めからやり直す。  
切り替えの間は、職員が buddy から予定を作成、変更、取り消しできないためである。  
予定の API は、`open` の切り替えを自動の期限で止めないので、マネージャーが完了するか、やめるまで切り替えは続く。  
ADR-0028: [事業所の予定の正本を、期間のある切り替えの記録で Google カレンダーから buddy へ移す](../docs/adr/0028-calendar-cutover.md)

1. 始める前に、事業所の職員に、切り替えが終わるまで Google カレンダーと buddy で予定を作成、変更しないよう頼む。
   - 業務時間外の始める日時と、その日のうちの終わる見込みの日時を伝える。
   - 切り替えの間も、予定のカレンダーの画面は Google カレンダーの予定を出し、切り替え中であることを示す。buddy からの予定の作成、変更、取り消しは拒まれる。
   - 頼んだ後に Google カレンダーで変えた予定は、完了するときに見つかり、取り込み直すまで完了できない。
2. 切り替えの画面で、全ての職員のカレンダーの最後の同期が成功していることを見てから、切り替えを始める。
   - 同期が失敗している職員がいれば始められない。同期の Worker のログ（`calendar sync failed`）とカレンダーの共有を見て、同期が成功するまで待つ。
   - buddy から Google カレンダーに書いた結果がまだ分からない予定があれば始められない（`google_write_pending`）。同期の読み戻しが結果を決めるまで、時間をおいてから始め直す。
3. 職員ごとに予定を取り込む。
   - 確認が必要な予定は、利用者を選ぶか、通常の予定にするか、取り込まないかを決める。
   - 繰り返しの規則を buddy に写せない予定は、職員に Google カレンダーで規則を直してもらって取り込み直すか、取り込まないと決める。
4. 全ての職員を取り込んだら、同期の間隔（`GOOGLE_CALENDAR_SYNC_INTERVAL`）が過ぎるのを待ってから完了する。
   - 完了できないときは、画面の一覧の職員を取り込み直す。Google で変わった予定は、取り込み直すと Google の内容で上書きする。
   - その日のうちに完了できなければ、切り替えをやめる。
5. 完了したら、職員に、これからは予定を buddy で作成、変更するよう伝える。
   - Google カレンダーには buddy の予定を書き出す。
   - Google カレンダーで変えた予定は buddy に取り込まず、書き出しで buddy の内容に戻る。

切り替えをやめると、取り込んだ予定を buddy から消し、事業所は Google カレンダーを正本にしたままになる。  
やめた後は、職員に Google カレンダーでの編集を再開してよいと伝える。

## CI Runners

ワークフローのジョブは、リポジトリの変数 `RUNS_ON` が指すランナーで流れる。  
変数が無ければ GitHub のランナー（`ubuntu-latest`）で流れる。  
メンテナーの self-hosted runner で流すときは、変数にラベルの JSON の配列を入れる。

```sh
gh variable set RUNS_ON -R Fukuemon/buddy --body '["self-hosted","macOS","ARM64"]'
```

GitHub のランナーに戻すときは、`gh variable delete RUNS_ON -R Fukuemon/buddy` で変数を消す。

- self-hosted runner の機械では、ローカル環境の compose が動いていることがある。
  - CI の E2E は、compose のプロジェクトの名前を `buddy-ci` にし、ポートを全てずらして起動する。ずらしたポートは `.github/workflows/ci.yml` の `e2e` のジョブにある。
- self-hosted runner は、E2E のジョブの後に、タグの無い Docker のイメージと 7 日より古いビルドのキャッシュを消す。
  - Docker は runner の機械のローカル環境と共有なので、ローカル環境のものも消える。
- self-hosted runner は、runner の `.env` で Go、pnpm、mise、Playwright のキャッシュの配置先を `~/actions-runner/_cache` に分ける。
  - `.path` では、PATH を Homebrew とシステムのディレクトリに絞る。
  - ローカル環境のツールとキャッシュを CI と共有しないためである。runner を作り直すときも、同じ設定にする。
- self-hosted runner は、private のリポジトリだけに使う。
  - public のリポジトリでは、外部の人の pull request のコードが runner の機械で流れる。
