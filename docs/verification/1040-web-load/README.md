# #1040 web の負荷の検証（ローカルの compose）

[#1040](https://github.com/Fukuemon/buddy/issues/1040) の受け入れ条件のうち、ローカルの compose の回の条件と結果。  
想定の利用の量と合否の基準は、[ADR-0047](../../adr/0047-web-session-postgres.md) にある。  
web のセッションの保存先だけを測った回は、[#1032 の負荷の検証の結果](../1032-session-store-load/README.md) にある。

検証環境の回は、検証環境ができてから、この文書に足す。  
BFF の呼び出しの基準と CPU の判定の仕方は、検証環境の回で決める。ローカルの回は記録だけにする。

## 結果

アプリの接続のプールの上限を絞った回では、100 人と 300 人の両方で、CPU の 1 回の値の最大を除く基準を満たした。  
CPU は、1 回の値の最大では満たさず、1 分の平均の最大では満たした。

| 基準 | 合格の値 | 100 人 | 300 人 |
| --- | --- | --- | --- |
| セッションの読み取りの時間 | p95 が 10 ms 以下 | 平均 0.055 ms | 平均 0.049 ms |
| DB の接続の数の最大 | 上限 25 の 80%（20）以下 | 13 | 15 |
| DB の CPU の最大（1 回の値） | 50% 以下 | 96.52% | 101.35% |
| DB の CPU の 1 分の平均の最大 | 基準に無い。参考 | 19.89% | 34.16% |
| BFF の呼び出しの p95 | 500 ms 以下（検証環境の回で判定する） | 25.22 ms | 193.37 ms |
| BFF の呼び出しの失敗の率 | 1% 未満（検証環境の回で判定する） | 0% | 0% |

- セッションの読み取りの時間は、PostgreSQL の `pg_stat_statements` の平均である。p95 ではない。
  - DB の中で SQL を実行した時間で、web と DB の往復を含まない。#1032 の p95（往復を含む）とは比べられない。
  - 最大は、100 人の回で 16.41 ms、300 人の回で 55.64 ms だった。
- CPU が 50% を超えた記録は、100 人の回で 66 回のうち 1 回、300 人の回で 66 回のうち 3 回だった。どれも前後の記録より高い、短い山である。
  - 山の原因は未確認である。PostgreSQL のログには、山の時刻の出来事が無い。
  - 300 人の回の CPU の中央は 16.25% だった。
- 1 分の平均は、5 秒ごとの記録の 9 回分の移動平均である。
- 300 人の回の BFF の呼び出しの p99 は 1.25 s、最大は 2.94 s だった。原因は未確認である。予定の API の接続のプールの上限を 5 にしたので、その待ちが含まれることがある。

## 接続のプールの上限を絞らなかった回

最初の回は、アプリの接続のプールの上限を compose のデフォルトのまま流した。300 人の回で、DB の接続の数が上限に達し、ほかのアプリが DB につなげなくなった。

| 基準 | 100 人 | 300 人 |
| --- | --- | --- |
| セッションの読み取りの時間（平均） | 0.051 ms | 0.131 ms |
| DB の接続の数の最大 | 14 | 25（上限）。4 分半、上限に張り付いた |
| DB の CPU の最大（1 回の値） | 15.13% | 131.36% |
| BFF の呼び出しの p95 | 23.29 ms | 561.49 ms |
| BFF の呼び出しの失敗の率 | 0% | 2.79%（37876 回のうち 1055 回） |

- アプリの接続のプールの上限の合計が、DB の接続の数の上限の 25 を超えていた。
  - 予定の API は 25（`DB_MAX_CONNS` のデフォルト）で、2 つの calendar-worker も同じデータベースにつなぐ。
  - ブローカーは 10 に固定で、環境変数で変えられない（[#1061](https://github.com/Fukuemon/buddy/issues/1061)）。
  - web は 5（`SESSION_STORE_MAX_CONNS` のデフォルト）。
  - Hydra は DSN で接続の数を指定していなかった。Hydra のデフォルトの上限は未確認である。
- 上限に張り付いたのは、ログインを終えた職員が 138 人になったときだった。
- 予定の API は、DB につなげず 545 回失敗した。
- ログインの失敗が 3 回、トークンの更新の失敗が 18 回あった。
  - Hydra は、DB に届かないとき、refresh に 401 の `invalid_client` を返す。Hydra のログに、DB の `too many clients` と `invalid_client` が並んで出た。
  - web は、`invalid_client` を refresh token の拒否（`invalid_grant`、`access_denied`）として扱わない。この失敗では、セッションを消さない。
- BFF の失敗の 1055 回のうち、予定の API の失敗の 545 回を除いた約 510 回の理由は未確認である。この回の筋書きは、失敗を status ごとに数えていなかった。
- 回の間に DB を作り直さなかった。300 人の回は、前の回の職員が残った DB で流れ、1 つ目の事業所の職員は回の後で 473 人だった。
- 本番環境と検証環境の各アプリの接続の数の上限は、インフラの側で、この結果を見て決める。

## 測った環境

- 接続のプールの上限を絞った回は `60de32f9`、最初の回は `a7c410a2` で測った。
- ローカルの compose に、`compose/load.yml` を重ねて起動した。
  - PostgreSQL は、CPU を 1 つ分、メモリを 1 GiB、`max_connections` を 25 に制限した。Hydra、ブローカー、予定の API、web のデータベースが、同じインスタンスにある。
  - web は 1 台で、セッションを PostgreSQL に置いた。
  - 絞った回のアプリの接続のプールの上限は、ブローカー 10、予定の API 5、calendar-worker 1 ずつ、Hydra 3、web 3 で、合計 23 である。
- 負荷を作る k6 は、同じ機械（macOS、Docker Desktop）から、portless の https の URL を通して web を呼んだ。
  - ブローカーは、送信元の IP アドレスごとにログインの回数を数える。1 つのアドレスから流すと、21 人目からログインが 429 で止まる。負荷の回だけ、ブローカーに `CLIENT_IP_HEADER` を渡し、k6 が職員ごとに違うアドレスをそのヘッダーに書いた。
- DB の接続の数は、5 秒ごとに `pg_stat_activity` で、データベースごとに数えた。測るための 1 本の接続は数えていない。
- CPU の値は `docker stats` の値で、CPU 1 つ分を 100% とする。1 回の値は短い時間の値なので、100% を超えることがある。

## 流した利用

| 項目 | 値 |
| --- | --- |
| 同時にログインしている職員 | 100 人と 300 人。流す前に、負荷用の職員を予定の API に登録した |
| 流した時間 | 最初のログインから 420 秒 |
| ログイン | 最初の 300 秒に、全員が等しい間隔でログインする。web の `/auth/login` から、Hydra、ブローカー、開発用の IdP を通り、web の `/auth/callback` まで HTTP で通る |
| 画面の操作 | ログインした職員が、平均 2 秒（1〜3 秒）に 1 回、予定の画面が送る 5 つの BFF の呼び出し（事業所、チーム、職員、利用者、予定の一覧）を順に送る |
| トークンの更新 | 筋書きでは起こさない。web は、access token の期限（5 分）の 60 秒前を過ぎた呼び出しで更新する。絞った回では 100 人で 60 回、300 人で 180 回の更新があり、失敗は 0 回だった |
| ログアウト | 420 秒で、全員が web の `/auth/logout` を呼ぶ。Hydra とブローカーのログアウトには進まない |

## 操作ごとの時間

接続のプールの上限を絞った回。単位はミリ秒。

| 操作 | 人数 | 回数 | p50 | p95 | p99 | 最大 |
| --- | --- | --- | --- | --- | --- | --- |
| BFF の呼び出し | 100 | 13545 | 8.39 | 25.22 | 73.83 | 837.28 |
| BFF の呼び出し | 300 | 39558 | 8.20 | 193.37 | 1253.39 | 2939.62 |
| ログイン | 100 | 100 | 137 | 327.20 | 533.55 | 786 |
| ログイン | 300 | 300 | 119 | 509.10 | 1586.54 | 2720 |

- ログインは、web の `/auth/login` から予定の画面に着くまでの、全てのリダイレクトを 1 回として測った。

## 流し方

```sh
set -a; . ./.env; set +a
portless compose -f compose.yml -f compose/load.yml down -v --remove-orphans
WEB_SESSION_STORE_URL='postgres://buddy:buddy-dev@postgres:5432/web?sslmode=disable' \
  BROKER_CLIENT_IP_HEADER=X-Load-Client-IP \
  portless compose -f compose.yml -f compose/load.yml up -d --wait
apps/web/scripts/load-sample.sh "$COMPOSE_PROJECT_NAME-postgres-1" <記録を置くディレクトリ> &
LOAD_CLIENT_IP_HEADER=X-Load-Client-IP LOAD_USERS=100 \
  LOAD_WEB_URL=$WEB_ORIGIN LOAD_HYDRA_URL=$HYDRA_PUBLIC_ORIGIN LOAD_SCHEDULE_URL=$E2E_SCHEDULE_URL \
  k6 run --insecure-skip-tls-verify apps/web/scripts/web-load.k6.js
kill %1
```

- `apps/web/scripts/web-load.k6.js` が筋書きで、`apps/web/scripts/load-sample.sh` が DB の接続の数と CPU を記録する。止めると、最大の値と、セッションの読み取りの回数と平均を書く。
- k6 は、portless の CA を読めないので、`--insecure-skip-tls-verify` で流す。
- 回ごとに `down -v` で DB を作り直す。負荷用の職員は、回ごとに登録し、消さない。
- 人数、流す時間、間隔は、環境変数で変えられる。一覧は筋書きの先頭にある。
- k6 のまとめの `bff_failed_<status>` が、BFF の失敗を、BFF が返した status ごとに数える。`unauthorized_staff` は、BFF が 1 回でも 401 を返した職員の数である。
