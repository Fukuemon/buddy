---
type: context
title: 基盤と運用
description: 環境の種類、デプロイと切り戻しの条件、監視、ログインとトークンの発行の障害の監視と復旧、Google カレンダーの Worker の動かし方、DB の分け方と権限、Hydra の DB と期限の切れた行の扱い、シークレットの配置先の方針、事業所を足す手順、CI のランナーの切り替え
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
  - ログインとトークンの発行の監視の項目と、アラートの条件の推奨の値は、[Login and Token Failures](#login-and-token-failures) にある。

## Login and Token Failures

ブローカーは、Hydra の `oauth2.token_hook` で、トークンを発行するたびに職員が有効かを確認する。  
ブローカーかその DB が止まると hook が答えず、Hydra が止まるとトークンのエンドポイントに届かないので、トークンは発行されない。  
決めた理由は [ADR-0044](../docs/adr/0044-token-hook-fail-closed.md) に、故障を入れて測った結果は [token_hook と ID ブローカーの障害のときの動きを測った結果](../docs/verification/877-token-hook-failures/README.md) にある。

障害の間は、次のとおりになる。

- 新しいログインはできない。
- 発行済みの access token は、期限（5 分）まで API で通る。API と同じ DB が止まったときは除く。access token が切れた職員は、refresh できないので操作が止まる。
  - web は、1 回の表示で refresh を 1 度だけ試し、失敗したら「buddy を一時的に使えません」の画面を出す。Hydra を待つ上限の 5 秒を過ぎたときも同じである。
  - 一時的に失敗した後の 10 秒は、同じセッションの refresh を試さない。この間はログも出ない。
  - 開いている画面で読み込みか保存が refresh で失敗したときは、画面の読み込みの失敗か保存の失敗の文を出す。取り直さない。
- refresh token と web のセッションは残る。復旧すれば、職員はログインし直さずに使い続けられる。
  - hook が設定の誤りで 403 を返したときは、web のセッションが消え、職員はログインし直す。
- 止めた職員は、障害の間もトークンを取れない。

### 冗長化の要件

- ブローカーと Hydra は、2 台以上で動かす。どちらも状態を DB に持つので、並べて動かせる。
- DB は、自動のフェイルオーバーと、ポイントインタイムの復元ができる構成にする。
- 予定の API と照合の API は、Hydra の discovery を読めなくても起動を続け、読めるまで 5 秒ごとに読み直す。
  - 読めるまでは、`/readyz` が 503 を、access token の付いたリクエストが 503（`auth_unavailable`）を返す。
  - discovery の文書が設定と合わないとき（`issuer` が `OIDC_ISSUER` と違うか、`jwks_uri` が無い）も、終了せずに読み直し続ける。原因は WARN のログ `oidc discovery failed` の `error` に出る。
  - `/healthz` は 200 のままなので、`/healthz` で再起動を決めても、Hydra を待つ間に起動し直さない。

### 監視の項目とアラートの条件

閾値は推奨の値である。本番の量を見て、インフラのリポジトリで見直す。

| 見るもの | 出すところ | アラートの条件（推奨） |
| --- | --- | --- |
| トークンのエンドポイント（`/oauth2/token`）の 5xx の率 | Hydra のアクセスのログ | トークンの要求の 5 分で 1% を超える |
| トークンのエンドポイントの 401 `invalid_client` の率 | Hydra のアクセスのログ | 5 分で 1% を超える。PostgreSQL の全体が止まると、5xx ではなくこの値になる |
| hook の呼び直しの打ち切り（`giving up after`） | Hydra のログ | トークンの要求の 5 分で 1% を超える。1 回のトークンの要求で hook を 3 回まで呼ぶ |
| hook の 5xx の率と所要の時間 | ブローカーのログ（`token_hook の結果` の `status` と `duration_ms`） | 5xx が hook の呼び出しの 5 分で 1% を超える |
| hook の 403 の数 | ブローカーのログ（`token_hook の結果` の `result` が `denied`） | 普段の 10 倍を超える。設定の誤りで有効な職員を拒んでいるおそれがある |
| ログインの失敗の数（`login failed` の reason ごと） | web のログ | `failed` が普段の 10 倍を超える |
| refresh の失敗の率 | web のログ（`session refresh failed` の `reason` が `rejected` 以外の行と、`session refreshed` の行） | refresh の 5 分で 1% を超える |
| ブローカーと Hydra の `/readyz` と `/health/ready` | ヘルスチェック | 1 分続けて 503 か応答が無い |

- ブローカーは、hook の呼び出しごとに、メッセージ `token_hook の結果` のログを 1 行出す。
  - `result` は、204 で `allowed`、403 で `denied`、それ以外で `failed` である。`status` は返した状態コード、`duration_ms` は所要の時間（ミリ秒）である。
  - レベルは、`allowed` が INFO、`denied` が WARN、`failed` の 5xx が ERROR、`failed` の 4xx（鍵の誤りと本文の誤り）が WARN である。
  - hook の 5xx の率は `status` が 500 以上の行を、hook の 403 の数は `result` が `denied` の行を数える。
  - 職員を DB から読むのは 2 秒で打ち切り、500 を返す。DB が答えないときは、`duration_ms` が 2000 前後の `failed` が、1 回のトークンの要求で 3 行出る。
- web は、refresh のたびに 1 行のログを出す。
  - 通ったときは INFO でメッセージ `session refreshed`、失敗したときは WARN でメッセージ `session refresh failed` を出す。トークンとセッションの ID は出さない。
  - 失敗の行の `reason` は、失敗の種類である。
    - `rejected`: Hydra が `invalid_grant` か `access_denied` で拒んだ。セッションを消す
    - `hydra_error`: Hydra がそのほかのエラーを返した
    - `timeout`: Hydra を待つ上限の 5 秒を過ぎた
    - `unreachable`: Hydra に届かない
    - `other`: それ以外
  - `error` は Hydra が返した OAuth のエラーの値、`status` は Hydra が返した HTTP の状態コードである。Hydra が返さなかったときは出さない。
  - 失敗の率は、`reason` が `rejected` 以外の失敗の行を、それと `session refreshed` の行の和で割る。`rejected` は止めた職員と 12 時間を過ぎたログインで起き、障害ではない。
  - ブローカーが止まると `hydra_error` の `server_error`（`status` は 500）が、ブローカーが答えないと `timeout` が出る。

### 復旧の手順

1. DB を戻す。
2. Hydra を起動し、`/health/ready` が 200 を返すのを待つ。
3. ブローカーを起動し、`/readyz` が 200 を返すのを待つ。
4. 予定の API、照合の API、web のうち、止まっているものを起動する。予定の API と照合の API は、Hydra が答えるまで `/readyz` が 503 のままで、Hydra が答えてから約 15 秒以内に 200 になる。読み直しの間隔の 5 秒と、1 回の読み込みの上限の 10 秒の和である。
5. トークンのエンドポイントの 5xx と、hook の呼び直しの打ち切りのログが止まったことを確認する。

hook の 403 でセッションが消えた職員を除いて、職員の操作は要らない。refresh token と web のセッションが残るので、次の表示で refresh が通る。

### 故障を入れる仕組み

故障を入れる仕組みは、本番のコードに足さない。  
compose の override と、hook に故障を入れるテスト用のスタブを、`packages/e2e/faults/` に置く。  
上の障害の間の動き、監視の項目、復旧の手順を変えたときは、この測定を流して、結果が変わらないかを確認する。

```sh
pnpm --filter @buddy/e2e faults           # 全ての項目。compose の起動を除き約 4 分
pnpm --filter @buddy/e2e faults --quick   # 答えない hook（約 93 秒）を外す
```

- worktree の `.env` の `COMPOSE_PROJECT_NAME` の compose に、`packages/e2e/faults/compose.faults.yml` を重ねて起動し直してから流す。main の checkout の compose（`buddy`）には流さない。
  - override は、hook を受けるスタブ `hook-stub` を足し、Hydra の `oauth2.token_hook.url` を環境変数でスタブに向ける。スタブは、答え方を切り替えるまでブローカーへ素通しする。
  - スタブの答え方は `docker exec` で切り替える。ホストのポートは開けない。
- 終わったら、失敗しても、入れた故障を戻し、スタブを外した compose に起動し直す。`--keep` を付けると、スタブを重ねたままにする。
- 測った値は、故障ごとの表で `packages/e2e/faults/results/<実行の時刻>.md` に書く。Git で追跡しない。
  - 各行の「比べる元」は、`#877` が [#877 の測った結果](../docs/verification/877-token-hook-failures/README.md)、`ADR` が ADR-0044 とこのセクション、`記録だけ` が期待で判定しない値である。
  - 期待と合わない値があると、その測定が失敗する。

故障の入れ方は次のとおり。結果は [故障を入れる測定を繰り返せる形にした後の結果](../docs/verification/1020-token-hook-faults/README.md) にある。

| 故障 | 入れ方 |
| --- | --- |
| hook の 500、403、501、遅れ、答えない | スタブの答え方を切り替える |
| ブローカーの停止 | `docker stop` |
| ブローカーの DB の停止 | `broker` のデータベースへの接続を禁じ、張られた接続を切る |
| ブローカーの DB が答えない | 別の接続で、ブローカーの `staff` のテーブルを排他のロックで握る |
| Hydra の停止 | `docker stop`。止めた間に予定の API を再起動する |
| Hydra の DB の停止 | `hydra` のデータベースへの接続を禁じ、張られた接続を切る |
| 止めた職員 | 予定の API で休職にするか、ブローカーの DB の職員の状態だけを `suspended` にする |

## Calendar Worker

Google カレンダーの書き出しと同期は、予定の API と同じイメージの `calendar-worker` が、役割ごとのプロセスで動かす。  
ADR-0032: [Google カレンダーの書き出しと同期を、予定の API と同じイメージの Worker のコマンドで役割ごとに動かし、繰り返しを Worker のコマンドに集める](../docs/adr/0032-calendar-worker.md)

- 役割は `calendar-worker export`（書き出し）と `calendar-worker sync`（同期）で、1 つのプロセスは 1 つの役割だけを持つ。
- 常駐で動かすか、`--once` を付けて定期的に起動するかは、インフラのリポジトリが決める。
- 同じ役割の Worker を 2 つ以上動かしてもよい。
  - 待ちとカレンダーは、リースで 1 つの Worker だけが取る。
- 止めるときは停止の合図（SIGTERM）を送る。
  - Worker は新しく取るのをやめ、取ったものの結果を書いてから終わる。
- 異常終了で結果を書けなかった待ちとカレンダーは、リースが切れた後に取り直される。
  - 復旧のために DB を直す必要はない。
- 同期の Worker は、予定を Google カレンダーで管理している事業所（`google_primary`）のカレンダーだけを取る。
  - 予定を buddy で管理している事業所（`buddy_primary`）のカレンダーは読まない。
  - ADR-0029: [Google カレンダーとの連携を、事業所ごとの予定の管理先で分ける](../docs/adr/0029-google-calendar-sync.md)
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
  - 同期では、書き出しの処理を待って読み直すカレンダーと、同期の途中で外れたカレンダーと、同期の途中で事業所の予定の管理先が変わったカレンダーを数える。
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

## Databases

Hydra、ブローカー、予定の API は、それぞれ自分のデータベースを持つ。  
web は、セッションを PostgreSQL に置くときだけ、自分のデータベースを持つ。  
検証環境と本番環境では、これらのデータベースを同じ PostgreSQL のインスタンスに置き、アプリごとに DB のロールを分ける。  
calendar-worker は、予定の API と同じデータベースとロールを使う。  
ADR-0047: [web のセッションを、web 用の PostgreSQL のデータベースに暗号化して置けるようにし、期限の切れた行を web が消す](../docs/adr/0047-web-session-postgres.md)

- アプリのロールが CONNECT できるのは、自分のデータベースだけにする。
  - 1 つのアプリの資格が漏れたときに、ほかのアプリのデータベースを読めないようにするためである。
  - PostgreSQL は、新しいデータベースの CONNECT を `PUBLIC` に許す。データベースを作ったら、`PUBLIC` の CONNECT を外し、そのアプリのロールにだけ許す。
- アプリのロールに、`SUPERUSER` と、ロールを作る権限（`CREATEROLE`）を与えない。
  - マイグレーションがテーブルを作るので、自分のデータベースでテーブルを作る権限は与える。
- アプリは、`sslmode=require` 以上で DB につなぐ。
  - Hydra は、`DSN` の `sslmode` で指定する。
  - 予定の API、calendar-worker、ブローカーには、`sslmode` を渡す環境変数が無い。DB のドライバー（pgx）が読む `PGSSLMODE` で指定する。
  - web は、`SESSION_STORE_URL` の `sslmode` で指定する。
- 同じインスタンスでは、PostgreSQL の管理者の権限とインスタンスのバックアップが、全てのアプリのデータに届く。管理者の権限とバックアップに触れられる人を絞る。
- 次のときは、インスタンスを分ける。
  - 規制や監査で、物理的な分離を求められたとき
  - DB の管理者をアプリごとに分けるとき
  - Hydra が求める PostgreSQL のバージョンが、業務の DB と合わないとき
- web の接続の数は、web のインスタンスの数に `SESSION_STORE_MAX_CONNS`（デフォルト 5）を掛けた数まで増える。ほかのアプリの接続のプールと足して、DB の接続の数の上限に収める。
  - web は、使っていない接続を 30 秒で閉じる。
- web は、期限の切れたセッションの行を、10 分ごとに自分で消す。インフラのジョブは要らない。
  - 消すのに失敗すると、警告のログ（`msg` が `session purge failed`）を書く。期限の切れた行は読まれないので、続いても動きは変わらないが、行が増える。
- ローカル環境の compose は、1 つの DB のロールで全てのデータベースにつなぐ。開発用の構成なので、この要件の対象外である。

### Hydra の DB を失ったとき

Hydra の DB を失うと、次のものが無くなり、全ての職員のログインが切れる。

- ログインのセッション
- access token と refresh token
- 署名の鍵（ID token と access token の JWT を署名する鍵）
- OAuth のクライアントの登録（web と予定の API のクライアント）

職員と上流の IdP のアカウントの結び付けはブローカーの DB に、業務のデータは予定の API の DB にあるので、Hydra の DB を失っても残る。  
Hydra は、署名の鍵が無ければ新しく作る。  
OAuth のクライアントを前と同じ ID とシークレットで登録し直せば、職員はログインし直して使える。

OAuth のクライアントの登録を、インフラの側で毎回作り直す形にするかは、インフラのリポジトリが決める。  
作り直す形にすれば、Hydra の DB のバックアップは、業務の DB のバックアップより重要度が低くなる。

## Hydra Janitor

Hydra は、期限の切れたトークンと、終わらなかったログインの要求を自分では消さない。  
インフラのリポジトリは、`hydra janitor` を 1 日 1 回流すジョブを作る。  
access token の期限が 5 分なので、ログインしている職員 1 人につき 5 分ごとに refresh token が回転し、回転する前の refresh token の行が残るためである。  
100 人が 1 日 8 時間使うと、refresh token だけで 1 日に約 1 万行になる。

```sh
hydra janitor -c <hydra serve の設定ファイル> -e --tokens --requests --grants --limit 100000
```

- イメージは、`hydra serve` と同じバージョンの `oryd/hydra` を使う。
- DB は、Hydra と同じ DB のロールで、環境変数 `DSN` で渡す（`-e`）。
- `-c` に、`hydra serve` と同じ設定ファイルを渡す。
  - janitor は、設定の `ttl` を残す期間に使う。設定を渡さないと、Hydra のデフォルトの期間を使う。
  - `--access-lifespan`、`--refresh-lifespan`、`--consent-request-lifespan` は渡さない。設定より短い値を渡すと、まだ使えるトークンを消す。
- `--limit` は、1 回に消す行の数の上限で、対象ごとに数える。
  - デフォルトの 10000 では、1 日に増える refresh token の行を消しきれないことがあるので、100000 にする。

消す対象と残す期間は、次のとおり。  
残す期間は、行を作った時刻から数える。

| フラグ | 消すもの | 残す期間 |
| --- | --- | --- |
| `--tokens` | access token と refresh token の行。回転する前の refresh token も含む | access token は `ttl.access_token`（buddy は 5 分）、refresh token は `ttl.refresh_token`（buddy は設定せず、デフォルトの 720 時間） |
| `--requests` | 終わらなかったか、拒んだログインと同意の要求 | `ttl.login_consent_request`（buddy は設定せず、デフォルトの 30 分） |
| `--grants` | JWT Bearer の信頼の関係のうち、期限の切れたもの。buddy は使わない | 期限まで |

- janitor は、ログインのセッション、認可コード、トークンを発行し終えたログインの要求の行を消さない。
  - これらはログインの回数だけ増えるので、refresh token の行より少ない。
- v26.2.0 のローカル環境では、終わらなかったログインの要求と、ブローカーが拒んだログインの要求は、DB に行を作らなかった。`--requests` が消すのは、行が作られた要求だけである。
- janitor は、Hydra を動かしたまま流せる。行を少しずつ消すので、テーブルを長く占有しない。
- 出典: [hydra janitor](https://www.ory.sh/docs/hydra/cli/hydra-janitor)

## Rollback

- 切り戻しは、前のタグのイメージを起動し直す。
- マイグレーションは、`down` で戻さない。
  - 前のバージョンのアプリが新しいテーブルの構成のまま動くようにする。そのため、テーブルとカラムの削除と名前の変更は、使わなくなったバージョンをデプロイした後の別のマイグレーションで行う。
- 照合はデータを保存しないので、照合の API の切り戻しで戻すデータは無い。

## Secrets

- シークレットは、`OIDC_CLIENT_SECRET`、`SESSION_SECRET`、`DB_PASSWORD`、Google の Workload Identity Federation の外部アカウントの設定である。
  - web のセッションを PostgreSQL に置くときは、パスワードを含む `SESSION_STORE_URL` もシークレットである。
  - web は、PostgreSQL に置くセッションの値を、`SESSION_SECRET` から導いた鍵で暗号化する。`SESSION_SECRET` を替えると、置いたセッションが全て読めなくなり、全ての職員のログインが切れる。
  - ブローカーでは、上流の IdP の client secret のファイル（`UPSTREAM_IDP_CLIENT_SECRETS_FILE`）と、token_hook のヘッダーの値（`TOKEN_HOOK_KEY`）もシークレットである。
  - ブローカーの、ログインの途中の cookie に署名する鍵（`LOGIN_COOKIE_KEYS`）もシークレットである。
    - `LOGIN_COOKIE_KEYS` は、カンマで区切った 32 バイト以上の鍵である。ブローカーは先頭の鍵で署名し、全ての鍵で検証する。
    - 鍵を替えるときは、新しい鍵を一覧の先頭に足し、古い鍵を 10 分より長く残してから外す。上流の IdP でログインしている間の職員のログインが切れないようにするためである。
    - 初めて鍵を入れるデプロイでは、その時に上流の IdP にいた職員のログインが 1 度失敗する。前の cookie に署名が無いためである。
  - 予定の API と運営用の CLI では、ブローカーを呼ぶ Hydra のクライアントの secret（`BROKER_CLIENT_SECRET`）もシークレットである。
    - 運営用の CLI の値は、運営用のクライアント（`schedule-ops`）の secret で、予定の API の値と分ける。CLI を流すジョブにだけ渡す。
    - 予定の API と運営用の CLI は、secret を Basic 認証のヘッダーで送る。Hydra のクライアントは、`token_endpoint_auth_method` を `client_secret_basic`（Hydra のデフォルト）で登録する。
  - Hydra では、設定の `secrets.system` もシークレットである。
    - Hydra は、この値で、DB に置く署名の鍵を暗号化し、refresh token と認可コードの署名を作る。
    - 値を変えるときは、新しい値を一覧の先頭に足し、古い値を一覧に残す。古い値を外すと、古い値で暗号化した署名の鍵と、古い値で署名した refresh token が使えなくなる。
    - 出典: [Secrets and key rotation](https://www.ory.sh/docs/hydra/self-hosted/secrets-key-rotation)
- Google のサービスアカウントのキーは作らず、どこにも置かない。
  - API は、Application Default Credentials で認証し、事業所のサービスアカウントの権限を借用する。
  - ADR-0030: [職員のカレンダーを、事業所ごとのサービスアカウントへの共有で読み書きする](../docs/adr/0030-google-calendar-service-accounts.md)
- 組織とサービスアカウントの対応のファイル（`GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE`）は、buddy のリポジトリに置かない。
  - シークレットではないが、サービスアカウントのメールアドレスを持つためである。
  - 照合の対象のカレンダーのファイル（`GOOGLE_CALENDARS_FILE`）も、職員のカレンダー ID を持つので同じ扱いにする。
- 配置先はインフラのリポジトリが決め、実行のときに環境変数（Google の認証情報は Application Default Credentials）で渡す。
  - buddy のアプリは環境変数から読むだけにする。
- buddy のリポジトリ、issue、pull request、ログに、本物のシークレットを書かない。
  - buddy に置いてよいのは、ローカルの compose の開発用の値（`compose.yml` と `compose/` の下のファイル）だけである。

## Adding a Facility

運営側は、事業所を足すときに、次の順で事業所と最初のマネージャーを登録する。

1. 事業所の上流の IdP の設定をブローカーに足し、ブローカーをデプロイし直す。
   - 組織の ID、issuer、client ID は `UPSTREAM_IDPS_FILE` のファイルに、client secret は `UPSTREAM_IDP_CLIENT_SECRETS_FILE` のファイルに足す。
   - 事業所が Google Workspace を使うなら、組織のプライマリドメインを `allowed_hosted_domains` に足す。ID token の `hd` が合わないログインは拒まれる。形と比べ方は [ID ブローカーの Design Doc の Google の hd の確認](../services/broker/DesignDoc.md#google-の-hd-の確認) にある。
   - 既にある事業所に `allowed_hosted_domains` を足すと、個人のアカウントで結び付けた職員はログインできなくなる。結び付けを外す手段は退職のほかに無く、その職員をどう戻すかは未決で、#1065 で扱う。足す前に、事業所の管理者と確認する。
2. 予定の API のイメージの `ops` を entrypoint にしたジョブを、内部のネットワークで、書き込まずに内容を表示するモード（`--dry-run`）で流す。
   - ジョブに渡す環境変数は、DB の接続の値と、運営用のクライアントの値（`BROKER_URL`、`BROKER_TOKEN_URL`、`BROKER_CLIENT_ID`、`BROKER_CLIENT_SECRET`）である。
   - 運営用のクライアントの secret は、予定の API の secret と分け、ジョブにだけ渡す。
   - 最初のマネージャーのメールは引数で渡し、リポジトリと設定のファイルに書かない。

   ```sh
   ops onboard-facility --org-id <組織の ID> --facility-name <事業所の名前> --department <部署の名前> --team <チームの名前> \
     --manager-name <マネージャーの名前> --manager-email <マネージャーのメール> --operator <運営者の ID> --dry-run
   ```

3. 出力の JSON の事業所、役職、部署、チームの名前と、作るかどうかを確認する。
   - 出力は、メールと職員の名前を含まない。メールは、自分で渡した引数を読み直して確認する。
4. 同じ引数から `--dry-run` を外して流す。
   - 登録の記録は、予定の API の DB の監査の記録（`permission_audits`）に、登録と同じトランザクションで書かれる（ADR-0042）。出力の JSON の行は同じ記録で、操作の種類、運営者の ID、事業所、対象の役職か職員の ID、相関 ID を持つ。
   - 失敗したときは、予定の API には何も書かれていない。ブローカーに登録の途中の職員が残ることがあるが、ログインできず、同じ引数で流し直すと同じ職員にまとまる。
   - 上流の IdP の設定に無い組織と、ほかの事業所に同じメールの職員がいることは、`--dry-run` では分からず、この手順で失敗して分かる。
5. 最初のマネージャーに、上流の IdP のアカウントでログインしてもらう。
   - 上流の IdP が確認したメールが、登録したメールと同じときだけ結び付く。

既にある事業所には、CLI はマネージャーを足さない。同じ引数での流し直しは、何も書かずに成功する。  
事業所のマネージャーが操作できなくなった事業所を戻すときだけ、`--allow-additional-manager` を付けて流す。

運営用のクライアントを止めるときは、Hydra の admin API で `schedule-ops` のクライアントを消す。  
消すと、Hydra はそのクライアントに access token を発行しない。発行済みの access token は、期限の 5 分までブローカーの内部の API に通る。

- ADR-0043: [事業所と最初のマネージャーを予定の API の運営用の CLI で登録し、ブローカーは運営用のクライアントに職員の登録だけを許す](../docs/adr/0043-facility-onboarding-cli.md)

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
   - ADR-0030: [職員のカレンダーを、事業所ごとのサービスアカウントへの共有で読み書きする](../docs/adr/0030-google-calendar-service-accounts.md)

事業所のアカウントに切り替える前の 1 つのアカウントに共有したカレンダーは、切り替えると読めなくなる。  
職員が事業所のアカウントに共有し直した後に、運営側は前のアカウントへの共有を外してもらい、前のアカウントを止める。

## Switching a Facility to buddy

`google_primary` の事業所の予定の管理を buddy に移すときは、事業所のマネージャーが、予定の管理を buddy に移す画面（`/schedule/link/cutover`）で次の順に進める。  
手順の規則は [Google カレンダーとの連携の Design Doc の予定の管理の移行](../services/schedule/internal/features/calendar/DesignDoc.md#予定の管理の移行) にある。

移行は、業務時間外の 1 回の作業で、始めてから完了まで終える。  
その日のうちに完了できなければ、移行を「やめる」で終え、別の日に始めからやり直す。  
移行の間は、職員が buddy から予定を作成、変更、取り消しできないためである。  
予定の API は、`open` の移行を自動の期限で止めないので、マネージャーが完了するか、やめるまで移行は続く。  
ADR-0031: [事業所の予定の管理先を、期間のある移行の記録で Google カレンダーから buddy へ移す](../docs/adr/0031-calendar-cutover.md)

1. 始める前に、事業所の職員に、移行が終わるまで Google カレンダーと buddy で予定を作成、変更しないよう頼む。
   - 業務時間外の始める日時と、その日のうちの終わる見込みの日時を伝える。
   - 移行の間も、予定のカレンダーの画面は Google カレンダーの予定を出し、移行中であることを示す。buddy からの予定の作成、変更、取り消しは拒まれる。
   - 頼んだ後に Google カレンダーで変えた予定は、完了するときに見つかり、取り込み直すまで完了できない。
2. 移行の画面で、全ての職員のカレンダーの最後の同期が成功していることを見てから、移行を始める。
   - 同期が失敗している職員がいれば始められない。同期の Worker のログ（`calendar sync failed`）とカレンダーの共有を見て、同期が成功するまで待つ。
   - buddy から Google カレンダーに書いた結果がまだ分からない予定があれば始められない（`google_write_pending`）。同期の読み戻しが結果を決めるまで、時間をおいてから始め直す。
3. 職員ごとに予定を取り込む。
   - 確認が必要な予定は、利用者を選ぶか、通常の予定にするか、取り込まないかを決める。
   - 繰り返しの規則を buddy に写せない予定は、職員に Google カレンダーで規則を直してもらって取り込み直すか、取り込まないと決める。
4. 全ての職員を取り込んだら、同期の間隔（`GOOGLE_CALENDAR_SYNC_INTERVAL`）が過ぎるのを待ってから完了する。
   - 完了できないときは、画面の一覧の職員を取り込み直す。Google で変わった予定は、取り込み直すと Google の内容で上書きする。
   - その日のうちに完了できなければ、移行をやめる。
5. 完了したら、職員に、これからは予定を buddy で作成、変更するよう伝える。
   - Google カレンダーには buddy の予定を書き出す。
   - Google カレンダーで変えた予定は buddy に取り込まず、書き出しで buddy の内容に戻る。

移行をやめると、取り込んだ予定を buddy から消し、事業所は予定を Google カレンダーで管理したままになる。  
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
  - CI の E2E は portless を使わず、`http://localhost:<ポート>` で動く。ブラウザが開く URL（`*_ORIGIN`）と `SESSION_COOKIE_SECURE=false` も、同じジョブが渡す（ADR-0036）。
- self-hosted runner は、E2E のジョブの後に、タグの無い Docker のイメージと 7 日より古いビルドのキャッシュを消す。
  - Docker は runner の機械のローカル環境と共有なので、ローカル環境のものも消える。
- self-hosted runner は、runner の `.env` で Go、pnpm、mise、Playwright のキャッシュの配置先を `~/actions-runner/_cache` に分ける。
  - `.path` では、PATH を Homebrew とシステムのディレクトリに絞る。
  - ローカル環境のツールとキャッシュを CI と共有しないためである。runner を作り直すときも、同じ設定にする。
- self-hosted runner は、private のリポジトリだけに使う。
  - public のリポジトリでは、外部の人の pull request のコードが runner の機械で流れる。
