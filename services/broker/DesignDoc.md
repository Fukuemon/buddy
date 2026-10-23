---
type: feature-design
title: 認証のブローカー
description: Ory Hydra の login and consent app として動くブローカーの責務、Hydra との分担、ログイン、職員の登録と停止、ログアウトの流れ、ローカル環境の構成
status: draft
governs: services/broker
verified_commit: 39f46f1
---

# 認証のブローカー

## Overview

ブローカーは、事業所ごとに違う上流の IdP の前に立ち、職員の身元を持つ。トークンを発行するのは Ory Hydra で、ブローカーは Hydra の login and consent app として、ログインと同意とログアウトを判断する。web と 2 つの API から見える Issuer は Hydra だけである。

- 全体の責務と依存は [buddy Design Doc](https://github.com/Fukuemon/buddy/blob/develop/docs/design/DesignDoc.md) にある。
- ADR-0016: [OIDC のブローカーを、Ory Hydra と、自作の login and consent app で作る](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0016-id-broker-hydra.md)
- ADR-0017: [職員の身元をブローカーが持ち、権限と業務のデータは予定の API が持つ](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0017-identity-boundary.md)

## Scope

| 部分 | 持つ者 |
| --- | --- |
| 事業所の組織の ID と、上流の IdP の設定 | ブローカー（設定はインフラからファイルで受ける） |
| 職員の ID、メール、所属の事業所、有効か停止か、上流のアカウント（`iss` と `sub`） | ブローカー |
| ログイン、同意、ログアウトの画面と判断。上流の IdP への RP の処理 | ブローカー |
| 認可コード、トークンの発行、JWKS、refresh token の回転、失効、ログインのセッション | Hydra |
| 職員の名前、役職、チーム、権限と、権限の判定 | 予定の API |

ブローカーは、権限を持たず、職員のパスワードを持たない。

## Design

### 構成

ブローカーと Hydra と上流の IdP の関係を示す。

```mermaid
flowchart TB
  web["web（BFF）"]
  hydra["Hydra<br/>public API と admin API"]
  broker["ブローカー<br/>login and consent app"]
  upstream["事業所の上流の IdP"]
  api["予定の API、照合の API"]
  web -->|認可コードフロー、PKCE| hydra
  hydra -->|login_challenge、consent_challenge、logout_challenge| broker
  broker -->|OIDC の RP| upstream
  broker -->|accept、reject、セッションの取り消し| hydra
  hydra -->|token_hook| broker
  web -->|access token| api
  api -->|JWKS で検証| hydra
  api -->|職員の登録と停止| broker
```

- ブローカーの DB は、ブローカーの職員と上流のアカウントを持つ。Hydra の DB とは分ける。
- access token は JWT で、期限は 5 分である。`org_id` は `oauth2.allowed_top_level_claims` で JWT の top level に出す。
- Hydra の web のクライアントは `skip_consent` を持ち、許す audience は `schedule` と `receipt` である。

### 職員の身元のテーブル

ブローカーの DB のテーブルを示す。名前、役職、権限などの業務のデータは予定の API が持ち、ここには置かない（ADR-0017）。

```mermaid
erDiagram
  staff ||--o| upstream_accounts : "結び付ける"
  staff {
    text id PK "ULID。予定の API の users.sub に入る"
    varchar org_id "所属の事業所の組織の ID"
    varchar email "小文字にそろえる。事業所の中で一意"
    text status "active か suspended"
  }
  upstream_accounts {
    text staff_id PK "staff.id"
    text iss "上流の IdP の issuer"
    text sub "iss と組で一意"
  }
```

- 職員の ID は、ブローカーが登録のときに発行する。
- 事業所のテーブルは持たない。`org_id` は、上流の IdP の設定のファイルの `org_id` と同じ値で、access token の `org_id` にもなる。
- メールは小文字にそろえて入れ、事業所の中で一意にする。予定の API の職員のメールと同じ規則である。
- 1 人の職員は、上流のアカウントを 1 つだけ持つ。同じ `iss` と `sub` を 2 人の職員に結び付けられない。

### ログイン

職員が初めてログインするときの流れを示す。2 回目からは、上流のアカウントの `iss` と `sub` で職員を探し、結び付けの手順を通らない。

```mermaid
sequenceDiagram
  autonumber
  participant B as ブラウザ
  participant W as web（BFF）
  participant H as Hydra
  participant K as ブローカー
  participant U as 上流の IdP
  B->>W: GET /auth/login
  W-->>B: Hydra の認可の画面へ転送
  B->>H: GET /oauth2/auth
  H-->>B: ブローカーのログインの画面へ転送（login_challenge）
  B->>K: メールを入れる
  K->>K: 登録した職員のメールから事業所を引く
  K-->>B: 事業所の上流の IdP へ転送
  B->>U: ログイン
  U-->>B: ブローカーへ転送（認可コード）
  B->>K: GET コールバック
  K->>U: 認可コードを ID token に替える
  K->>K: メールが確認済みで登録と同じなら、上流の iss と sub を職員に結び付ける
  K->>H: ログインの accept（subject は職員の ID）
  H-->>B: ブローカーの同意へ転送（consent_challenge）
  B->>K: 同意
  K->>H: 同意の accept（aud、org_id）
  H-->>B: web のコールバックへ転送
  B->>W: GET /auth/callback
  W->>H: 認可コードをトークンに替える
```

- 登録されていないメール、止めた職員、2 つの事業所に同じメールがある職員は、上流の IdP へ転送せずにログインの reject で返す。web はログインの失敗の画面を出すので、事業所を示さず、ログインの失敗と同じ文言になる。
- メールを受けたら、職員を引く前に、Hydra の admin API で `login_challenge` のログインの要求を読む。読めなければ、職員を引かずにログインの失敗の画面を出す。
- メールの有無を確かめる試行は、送り手のアドレスごとと、入れたメールごとに数える。超えた試行は reject で返す。数えるのはプロセスの中だけである。
  - 送り手のアドレスごとには、続けて 20 回、以後は 10 秒に 1 回までにする。
  - メールごとには、続けて 10 回、以後は 30 秒に 1 回までにする。送り手のアドレスを替えて 1 つのメールを試す操作を止める。その代わり、他人がそのメールを入れ続けると、その職員も上限まで待たされる。
  - 送り手のアドレスは、デフォルトでは接続の相手のアドレスである。前段のプロキシの後ろに置くと、全ての利用者がプロキシのアドレスで 1 つの上限を共有する。
  - 前段のプロキシの後ろに置くときは、`CLIENT_IP_HEADER` に、プロキシが送り手のアドレスを書くヘッダーの名前を渡す。ブローカーは、そのヘッダーの最後の値を送り手とみなす。`X-Forwarded-For` のように値を足していくヘッダーでも、最後の値はプロキシが足した値で、ブラウザが書いた値ではない。
  - `CLIENT_IP_HEADER` は、ブローカーにプロキシを通らずに届かない構成でだけ渡す。直接届くと、ブラウザがヘッダーを書いて上限を外せる。
- `POST /login` は、ほかのサイトから送られたものを 403 で拒む。`Sec-Fetch-Site` が `same-origin` でないか、`Sec-Fetch-Site` が無く `Origin` がブローカーの origin（`Host` か `PUBLIC_URL`）と違えば拒む。どちらのヘッダーも無いリクエスト（ブラウザでないクライアント）は受ける。
- ブローカーの画面は `Content-Security-Policy: frame-ancestors 'none'` を返し、ほかのサイトの frame に入らない。
- 上流のメールが確認済みでない職員、登録のメールと上流のメールが違う職員、結び付けた上流のアカウントと違うアカウントで入った職員は、ログインの reject で返す。
- 同じ上流のアカウントで同時に初めてログインすると、先に結び付けたログインのほかは、結び付けが一意の制約で失敗する。ブローカーは職員を読み直し、同じ上流のアカウントが結び付いていれば accept する。
- 上流の IdP の認可レスポンスに `iss` のパラメーター（RFC 9207）があれば、認可コードを替える前に、事業所の上流の IdP の設定の issuer と比べる。違えば reject で返す。
- 上流の IdP の discovery の文書は、事業所ごとに初めて使うときに読み、覚える。1 つの事業所の IdP が応答しなくても、ほかの事業所のログインは待たない。読めなかった事業所は、その失敗を 30 秒覚えて返し、過ぎてから読み直す。
- 上流の IdP へ転送している間の値（ログインの要求、職員の ID、state、nonce、PKCE の code verifier）は、ブラウザの cookie に置き、コールバックの `state` と照らす。
  - cookie は署名しない。書き換えられるのはブラウザの利用者だけで、事業所と上流の IdP は職員の ID から DB で引き直すので、別のメールを入れたのと同じ結果にしかならない。
- ブローカーの画面の文言は、web のログインの失敗の画面と同じにする。コールバックの値がこのブラウザで始めたログインのものと確かめられないときは、Hydra へ返さずにブローカーがログインの失敗の画面を出す。
- 同意の accept は、web のクライアントに許した audience を `aud` に、職員の事業所の組織の ID を `org_id` に入れる。Hydra は `skip_consent` のクライアントでも同意の画面を呼ぶので、ブローカーは画面を出さずに accept する。
  - 画面を出さずに accept するのは、`AUTO_CONSENT_CLIENTS` に挙げたクライアント（デフォルトは `web`）だけである。ほかのクライアントの同意は reject で返す。ブローカーは同意の画面を持たない。
- Hydra のログインのセッションは、12 時間で切れる。ログアウトで Hydra のログインのセッションを消せるようになるまで、ブローカーはログインの accept でセッションを覚えさせない。覚えると、web のセッションを消した後に、ログインの画面を通らずに入り直せる。

### トークンの発行の確かめ

Hydra は、トークンを発行するたびに `oauth2.token_hook` でブローカーを呼ぶ。ブローカーは、職員が止まっているときと、上流でのログインから 12 時間を過ぎたときに拒む。拒まれた refresh は `invalid_grant` になり、web の BFF はセッションを消す。

### 職員の登録と停止

予定の API が職員の管理の権限を確かめてから、ブローカーの内部の API を呼ぶ。内部の API は、Hydra の client credentials のトークン（`aud` は `broker`）だけを受ける。

- 登録: ブローカーが職員の ID を発行し、予定の API はその ID を `users.sub` に入れて業務のデータを作る。
- 停止: ブローカーは職員を止め、Hydra の admin API で、その職員のログインのセッション、同意、refresh token を取り消す。

### ログアウト

web は BFF のセッションを消した後に、ブラウザを Hydra の RP-Initiated Logout へ、ID token を添えて転送する。Hydra はブローカーのログアウトの画面を呼び、ブローカーが accept すると、Hydra のログインのセッションが消える。上流の IdP のセッションは消さない。

### ローカル環境

compose は、開発用の IdP（mock-oauth2-server）を、上流の IdP のフェイクとして置く。mock-oauth2-server はパスの最初の部分を issuer にするので、1 つのコンテナで 2 つの事業所の IdP（`/office-a`、`/office-b`）を立てる。

- Hydra は、同じ PostgreSQL の別のデータベースを使う。
- 初期化のコンテナが、Hydra に web と予定の API のクライアントを登録する。
- 上流の IdP ごとの違い（署名の方式、Google の `hd`）は、フェイクで確かめず、ブローカーの単体のテストで確かめる。
- フェイクは、ログインの画面で入れた名前を `sub` に、クレームの欄の JSON を ID token のクレームにする。
- コンテナは、Hydra の discovery の文書と上流の IdP の discovery の文書を、コンテナの間の名前（`hydra`、`idp`）で読む。
  - ブラウザはこの名前を引けない。Hydra は、認可のエンドポイントを `urls.self.public` のローカルのポートで示す。
  - ブローカーは、上流の IdP の認可の画面の origin を `UPSTREAM_IDP_BROWSER_ORIGIN` に替えて転送する。
- ブローカーと予定の API のシードは、同じ職員の ID を持つ。2 つの事業所（`org-sample`、`org-sample-b`）の職員がいる。

## Interface

- 置く場所: `services/broker`
- 読む設定
  - Hydra の admin API の URL（`HYDRA_ADMIN_URL`）
  - ブラウザが開くブローカーの URL（`PUBLIC_URL`）。上流の IdP のコールバックの URL を作る
  - 事業所の組織の ID と、上流の IdP の issuer と client ID の対応のファイル（`UPSTREAM_IDPS_FILE`）
  - 組織の ID と、上流の IdP の client secret の対応のファイル（`UPSTREAM_IDP_CLIENT_SECRETS_FILE`）。シークレットとして渡す
  - 前段のプロキシが送り手のアドレスを書くヘッダーの名前（`CLIENT_IP_HEADER`）。前段のプロキシの後ろに置くときだけ渡す
  - 同意の画面を出さずに accept するクライアントの ID（`AUTO_CONSENT_CLIENTS`）
  - ブローカーの DB の接続先（`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`）
  - 2 つのファイルに必須の値が無いか、client secret の無い上流の IdP があれば、ブローカーは起動しない。値の一覧と形は [README](https://github.com/Fukuemon/buddy/blob/develop/services/broker/README.md#起動する) にある。
- ヘルスチェック: `GET /healthz`（依存先を確かめない）、`GET /readyz`（DB に届かなければ 503）、`broker healthcheck` のサブコマンド
- 公開する画面: ログイン（`GET` と `POST /login`）、上流の IdP のコールバック（`GET /login/callback`）、同意（`GET /consent`）、ログアウト（未実装）
- 内部の API: 職員の登録、職員の停止、Hydra の `oauth2.token_hook`（未実装）
- マイグレーションとシード: `migrate up`、`migrate down [N]`、`migrate seed`。シードは職員がいない DB にだけ入る
