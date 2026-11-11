---
type: feature-design
title: ID ブローカー
description: Ory Hydra の login and consent app として動くブローカーの責務、Hydra との分担、ログイン、職員の登録、休職、復職、退職、ログアウトの流れ、ローカル環境の構成
status: draft
governs: services/broker
verified_commit: 71728ae
---

# ID ブローカー

## Overview

ID ブローカー（`services/broker`、以下ブローカー）は、Hydra と、事業所ごとに違う上流の IdP の間で動き、職員の身元を持つ。  
トークンを発行するのは Ory Hydra で、ブローカーは Hydra の login and consent app として、ログインと同意とログアウトを判断する。  
web と 2 つの API から見える Issuer は Hydra だけである。

- 全体の責務と依存は [buddy Design Doc](https://github.com/Fukuemon/buddy/blob/develop/docs/design/DesignDoc.md) にある。
- ADR-0002: [OIDC のブローカーを、Ory Hydra と、自作の login and consent app で作る](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0002-id-broker-hydra.md)
- ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにし、職員の身元をブローカーが、権限と業務のデータを予定の API が持つ](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0001-auth.md)

## Scope

| 部分 | 持つ者 |
| --- | --- |
| 事業所の組織の ID と、上流の IdP の設定 | ブローカー（設定はインフラからファイルで受ける） |
| 職員の ID、メール、所属の事業所、有効か休職か退職か、上流のアカウント（`iss` と `sub`） | ブローカー |
| ログイン、同意、ログアウトの画面と判断。上流の IdP への RP の処理 | ブローカー |
| 認可コード、トークンの発行、JWKS、refresh token のローテーション、失効、ログインのセッション | Hydra |
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
  schedule["予定の API"]
  receipt["照合の API"]
  web -->|認可コードフロー、PKCE| hydra
  hydra -->|login_challenge、consent_challenge、logout_challenge| broker
  broker -->|OIDC の RP| upstream
  broker -->|accept、reject、セッションの取り消し| hydra
  broker -->|内部の API のトークンを JWKS で検証| hydra
  hydra -->|token_hook| broker
  web -->|access token| schedule
  web -->|access token| receipt
  schedule -->|JWKS で検証、client credentials でトークンを取る| hydra
  receipt -->|JWKS で検証| hydra
  schedule -->|職員の登録、休職、復職、退職| broker
  ops["予定の API の運営用の CLI"]
  ops -->|client credentials でトークンを取る| hydra
  ops -->|職員の登録、有効化、削除| broker
```

- ブローカーの内部の API を呼ぶのは、予定の API と、予定の API の運営用の CLI だけである。
  - 運営用の CLI は、事業所と最初のマネージャーの登録に、職員の登録、有効化、登録の途中の職員の削除だけを呼ぶ。
  - 照合の API は、ブローカーを呼ばない。
- ブローカーの DB は、ブローカーの職員と上流のアカウントを持つ。
  - Hydra の DB とは分ける。
- access token は JWT で、期限は 5 分である。
  - `org_id` は `oauth2.allowed_top_level_claims` で JWT の top level に出す。
- Hydra の web のクライアントは `skip_consent` を持ち、許す audience は `schedule` と `receipt` である。

#### パッケージの構成

ブローカーは機能が 1 つで、ハンドラの処理が少ない。  
そのため、パッケージは機能ごとに分けず、役割ごとに `internal/` の直下に置く。

| パッケージ | 責務 |
| --- | --- |
| `staff` | 職員の型、状態、規則（ログインを許すか、メールのそろえ方と形、セッションの長さ）、番兵のエラーとその code |
| `login` | ログイン、同意、ログアウトの画面と、送信元とメールごとの試行の上限 |
| `internalapi` | 内部の API と token_hook。`staff` の番兵のエラーを、状態コードと code に 1 か所で対応させる |
| `postgres` | 職員と上流のアカウントの読み書き。`login` と `internalapi` が定義したインターフェースを満たす |
| `hydra` | Hydra の admin API の呼び出し |
| `upstream` | 上流の IdP の RP の処理 |
| `config` | 環境変数からの設定の読み込み |
| `httpapi` | ヘルスチェックと、2 つのポートで受けるハンドラの組み立てと、panic のときの 500。画面のパスは `login.Paths` から、500 の本文は `internalapi` の形で書く |

各パッケージが import するパッケージを、矢印で示す。

```mermaid
flowchart LR
  cmd["cmd/broker"]
  httpapi
  login
  internalapi
  postgres
  staff
  hydra
  upstream
  config
  cmd --> httpapi & login & internalapi & postgres & hydra & upstream & config
  httpapi --> login & internalapi
  login --> staff & hydra & upstream
  internalapi --> staff
  postgres --> staff
```

- 状態の確認と書き込みは、`postgres` の条件付きの 1 文の UPDATE で原子的に行う。
  - `staff` は状態の移り方を持たない。
- 依存の向きの規則は [コードベースの構造](https://github.com/Fukuemon/buddy/blob/develop/context/codebase.md#dependency-rules) にある。

### 職員の身元のテーブル

ブローカーの DB のテーブルを示す。  
名前、役職、権限などの業務のデータは予定の API が持ち、ここには置かない（ADR-0001）。

```mermaid
erDiagram
  staff ||--o| upstream_accounts : "結び付ける"
  staff {
    text id PK "ULID。予定の API の users.sub に入る"
    varchar org_id "所属の事業所の組織の ID"
    varchar email "小文字にそろえる。全ての事業所で一意。退職した職員では NULL"
    text status "pending、active、suspended、retired のどれか"
  }
  upstream_accounts {
    text staff_id PK "staff.id"
    text iss "上流の IdP の issuer"
    text sub "iss と組で一意"
  }
```

- 事業所のテーブルは持たない。
  - `org_id` は、上流の IdP の設定のファイルの `org_id` と同じ値で、access token の `org_id` にもなる。
- メールを全ての事業所で一意にする。
  - 事業所の中だけで一意にすると、ほかの事業所の管理者が同じメールの職員を登録でき、ログインで事業所を 1 つに決められなくなる。もとの職員もログインできなくなる。
- 職員の状態の意味と移り方、メールと上流のアカウントの不変条件は、[職員とログイン](https://github.com/Fukuemon/buddy/blob/develop/context/domain/staff-login.md) にある。
  - ADR-0001: [認証を OIDC のブローカーと BFF のサーバー側のセッションにし、職員の身元をブローカーが、権限と業務のデータを予定の API が持つ](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0001-auth.md)
  - ADR-0004: [職員の停止を、戻せる休職と、戻せない退職に分ける](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0004-staff-leave-and-retirement.md)

### ログイン

職員が初めてログインするときの流れを、ブローカーのログインと結び付け、web のトークンの交換の 2 つの図で示す。  
2 回目からは、結び付けた `iss` と `sub` が上流の ID token と同じかを比べ、結び付けの手順を通らない。

ブローカーのログインと結び付けでは、ブローカーがメールで職員を引き、上流の IdP の ID token で職員を確認してから、Hydra へ accept か reject を返す。

```mermaid
sequenceDiagram
  autonumber
  participant B as ブラウザ
  participant H as Hydra
  participant K as ブローカー
  participant U as 上流の IdP
  Note over B,H: web の /auth/login から、Hydra の認可の画面へ来る
  B->>H: GET /oauth2/auth
  H-->>B: ブローカーのログインの画面へリダイレクト（login_challenge）
  B->>K: メールを入れる
  break 送信元の IP アドレスの試行の上限、本文が大きすぎる、メールの形が正しくない
    K-->>B: ブローカーのログインの失敗の画面
  end
  K->>H: ログインの要求を読む（login_challenge）
  H-->>K: ログインの要求
  K->>K: 登録した職員のメールから事業所を引く
  break 登録していないメール、有効でない職員、メールの試行の上限
    K->>H: ログインの reject
    H-->>K: リダイレクト先
    K-->>B: Hydra へリダイレクト（web のログインの失敗の画面になる）
  end
  K-->>B: 事業所の上流の IdP へリダイレクト
  B->>U: ログイン
  U-->>B: ブローカーへリダイレクト（認可コード）
  B->>K: GET コールバック
  K->>U: 認可コードを ID token と交換する
  U-->>K: ID token
  break メールが確認済みでないか登録と違う、結び付けたアカウントと違う
    K->>H: ログインの reject
    H-->>K: リダイレクト先
    K-->>B: Hydra へリダイレクト（web のログインの失敗の画面になる）
  end
  K->>K: 上流の iss と sub を職員に結び付ける
  K->>H: ログインの accept（subject は職員の ID）
  H-->>K: リダイレクト先
  K-->>B: Hydra へリダイレクト
  B->>H: GET /oauth2/auth
  H-->>B: ブローカーの同意へリダイレクト（consent_challenge）
  B->>K: 同意
  alt 自動で同意するクライアントで、職員が有効
    K->>H: 同意の accept（aud、org_id）
  else
    K->>H: 同意の reject
  end
  H-->>K: リダイレクト先
  K-->>B: Hydra へリダイレクト
  B->>H: GET /oauth2/auth
  H-->>B: web のコールバックへリダイレクト
```

web のトークンの交換では、web が認可コードをトークンと交換し、予定の API で職員と事業所を引いてからセッションを作る。

```mermaid
sequenceDiagram
  autonumber
  participant B as ブラウザ
  participant W as web（BFF）
  participant H as Hydra
  participant K as ブローカー
  participant A as 予定の API
  B->>W: GET /auth/login
  W-->>B: Hydra の認可の画面へリダイレクト
  Note over B,K: ブローカーのログインと結び付け（前の図）
  B->>W: GET /auth/callback
  break state が合わないか、値が無い
    W-->>B: /auth/error?reason=interrupted へリダイレクト
  end
  break ブローカーが reject した（error がある）
    W-->>B: error に合う reason の /auth/error へリダイレクト
  end
  W->>H: 認可コードをトークンと交換する
  H->>K: token_hook（職員が有効か）
  K-->>H: 204（有効でなければ 403）
  break トークンと交換できない
    H-->>W: エラー
    W-->>B: /auth/error?reason=failed へリダイレクト
  end
  H-->>W: access token、refresh token、ID token
  W->>A: GET /v1/me
  A-->>W: 職員と事業所か、エラー
  alt 職員と事業所を引けた
    W->>W: 前のセッションを消し、セッションを作る
    W-->>B: 戻る先へリダイレクト
  else 403（事業所に登録されていない）
    W-->>B: /auth/error?reason=forbidden へリダイレクト
  else ほかの失敗
    W-->>B: /auth/error?reason=failed へリダイレクト
  end
```

web は、`/auth/login` で state、nonce、PKCE の code verifier、戻る先を Valkey に 10 分置き、署名した state だけを cookie に入れる。  
`/auth/callback` は、state が合わないか、値が無ければ `reason=interrupted` へリダイレクトする。  
ブローカーが reject したログインでは、Hydra が reject の `error` を `/auth/callback` に渡す。  
web は、トークンと交換せずに、`error` を下の表の `reason` に読み替えてリダイレクトする。  
トークンと交換できないときと、予定の API が 403 以外の失敗を返したときは `reason=failed` へリダイレクトする。  
図の token_hook は、[トークンの発行の確認](#トークンの発行の確認) にある。

#### ログインを拒む条件

ブローカーは、次のログインを Hydra へのログインの reject で拒み、web がログインの失敗の画面（account-error）を出す。  
reject の `error` は、本人を上流の IdP で確認する前か後か、障害かで分ける。

| 拒むログイン | reject の `error` | web の `reason` |
| --- | --- | --- |
| 登録されていないメール、有効でない職員（休職、退職、登録の途中）、メールに当たる有効な職員が 2 人以上いる | `access_denied` | `denied` |
| ログインの途中に休職か退職になった職員、Hydra に保たせたログインのセッションの有効でない職員 | `access_denied` | `denied` |
| 上流のメールが確認済みでないか登録のメールと違う、結び付けた上流のアカウントと違う、上流のアカウントが別の職員に結び付いている | `account_mismatch` | `account_mismatch` |
| メールの有無を確認する試行が、メールごとの上限を超えた | `temporarily_unavailable` | `too_many_attempts` |
| 上流の IdP がログインを終えずにコールバックへ戻した（`error` のあるコールバック） | `login_interrupted` | `interrupted` |
| 上流の IdP の ID token を検証できない、コールバックで職員を DB から引けない（職員がいないときを含む）、Hydra に保たせたログインのセッションと同意で職員を DB から引けない、上流のアカウントを結び付けられない | `server_error` | `failed` |

- 登録されていないメールと有効でない職員は、上流の IdP へリダイレクトせずに拒む。
  - メールを入れた時点では、入れた人が本人か分からない。理由を分けると、メールを入れるだけで、ある人がどの事業所の職員か、休職しているかを調べられる。
  - 登録されていないメール、休職、退職、登録の途中、メールに当たる有効な職員が 2 人以上いるときの 5 つは、同じ `access_denied` の reject を返し、同じ 303 で Hydra へリダイレクトする。web は事業所の管理者に登録のメールアドレスを確認するよう伝える 1 つの文を出す。
  - メールに当たる有効な職員が 2 人以上いるとき（2 つの事業所に同じメールがあるとき）は、どちらの上流の IdP へリダイレクトするかを決められないので拒む。DB はメールを全ての事業所で一意にする（`000002_staff_email_pending`）ので、今の登録の手順ではこの状態は作れず、守りの分岐として残す。
  - ログインの途中に休職か退職になった職員にも、同じ reject を返す。休職と退職の職員に状態を伝えない（2026-11-10 に決めた）。
- コールバックでは、上流の IdP の ID token を検証する前に、cookie の職員の状態を見る。
  - cookie（`broker_login`）はブローカーが署名するので、ブラウザの利用者は職員の ID を書き換えられない。署名は [上流の IdP へのリダイレクトと結び付け](#上流の-idp-へのリダイレクトと結び付け) にある。
  - 有効でない職員（休職、退職、登録の途中）は、ID token と照合せずに `access_denied` で拒む。メールを入れた時点で有効でない職員を、本人の確認の前に拒むのと同じ扱いである（2026-11-10 に決めた）。
  - 退職はメールと上流のアカウントの結び付けを消すので、退職した職員は ID token と照合できない。状態を照合の前に見るので、休職と同じ reject になる。
  - 署名が合わない cookie と、署名の無い cookie は、Hydra へ reject を返さず、ブローカーのログインを続けられない画面（400）で拒む。Hydra の `login_interrupted` の reject にはしない（2026-11-10 に決めた）。
    - 署名が合わない cookie の中の `login_challenge` は信用できないので、Hydra へ返す先が無い。
- `account_mismatch` と `login_interrupted` は OAuth 2.0 の定めた値でない。Hydra は reject の `error` をそのまま redirect_uri に渡す（Hydra v26.2.0 で確認した）。
- 上流の IdP の認可レスポンスに `iss` のパラメーター（RFC 9207）があり、事業所の上流の IdP の設定の issuer と違うログインは、ID token を検証できないログインとして拒む。
  - 認可コードを交換する前に比べる。
- web は、知らない `error` を `failed` に読み替える。
- 時間をおいて試すよう伝えるのは、`failed` だけである。

#### メールの入力と試行の上限

ブローカーは、ログイン、上流の IdP のコールバック、同意、ログアウトの画面で Hydra の admin API を呼ぶ回数と職員を引く回数を、送信元ごとの上限より増やさない。  
`POST /login` では、メールを受けると次の順に確認する。

1. 送信元の IP アドレスごとの試行の上限を確認する。
   - 超えていれば、Hydra を呼ばずに、ブローカーのログインの失敗の画面を 429 で出す。
2. 本文を 4 KB まで読む。
   - 超えていれば、ログインの失敗の画面を 413 で出す。
   - `login_challenge` が無ければ、ログインの失敗の画面を 400 で出す。
3. メールが職員のメールの形（`@` の前後が空でなく、320 バイト以下）かを確認する。
   - 形が違えば、メールごとの上限で数えずに、ログインの失敗の画面を 400 で出す。
   - 形の確認には、内部の API の職員の登録と同じ関数（`staff.IsValidEmail`）を使う。
4. Hydra の admin API で `login_challenge` のログインの要求を読む。
   - 読めなければ、職員を引かずにログインの失敗の画面を出す。
5. メールごとの試行の上限を確認する。
   - 超えていれば、ほかの理由と分けた reject（`hydra.TooManyAttempts`。OAuth 2.0 の `error` は `temporarily_unavailable`）で返す。
   - Hydra は `error` を web の `/auth/callback` に渡し、web はログインの失敗の画面に、待つ長さを伝える文を出す。
6. メールで職員を引く。

次の 4 つの画面も、Hydra の admin API と DB を呼ぶ前に、`POST /login` と同じ送信元の IP アドレスごとの上限で数える。

- ログインの画面を開く `GET /login`
- 上流の IdP のコールバックの `GET /login/callback`
- 同意の `GET /consent`
- ログアウトの `GET /logout`

超えていれば、ログアウトはログアウトの失敗の画面を、ほかはログインの失敗の画面を 429 で出す。  
コールバックでは、送る側が、前に受け取った署名済みの cookie と、それに合うクエリの `state` を、発行から 10 分の間は送り直せる。  
上限で数えないと、認証の無いリクエストで Hydra の reject と職員の読み出しを増やせる。  
1 回のログインは、`GET /login`、`POST /login`、コールバック、同意の 4 回を数える。  
数えるのはプロセスの中だけである。  
2 つの上限は、メールで職員を引く前に確認するので、上限を超えたことを分けて返しても、登録の有無は伝わらない。

- 送信元の IP アドレスごとには、続けて 80 回、以後は 2.5 秒に 1 回までにする。
  - ログインの回数では、続けて 20 回、以後は 10 秒に 1 回になる。1 つの IP アドレスの後ろにいる事業所の職員が、続けてログインできるようにするためである。
  - IPv6 のアドレスは、/64 のプレフィックスごとに数える。/64 を持つ相手が、その中でアドレスを替えて上限を外せないようにするためである。
- メールごとには、続けて 10 回、以後は 30 秒に 1 回までにする。
  - 送信元の IP アドレスを替えて 1 つのメールを試す操作を、メールごとの上限で止める。その代わり、他人がそのメールを入れ続けると、その職員も上限まで待たされる。

送信元の IP アドレスごとの上限を超えたときは、Hydra へ reject で返さず、ブローカーのログインの失敗の画面を 429 で出す。  
この画面も、web のログインの失敗の画面と同じく、待つ長さを伝える文を出す。

送信元の IP アドレスは、デフォルトでは接続の相手のアドレスである。  
リバースプロキシの後ろに置くと、全ての利用者がプロキシのアドレスで 1 つの上限を共有する。  
リバースプロキシの後ろに置くときは、`CLIENT_IP_HEADER` に、プロキシが送信元の IP アドレスを書くヘッダーの名前を渡す。  
ブローカーは、そのヘッダーの最後の値を送信元とみなす。  
`X-Forwarded-For` のように値を足していくヘッダーでも、最後の値はプロキシが足した値で、ブラウザが書いた値ではない。

`CLIENT_IP_HEADER` は、ブローカーにプロキシを通らずに届かない構成でだけ渡す。  
直接届くと、ブラウザがヘッダーを書いて上限を外せる。

#### 上流の IdP へのリダイレクトと結び付け

上流の IdP の discovery の文書は、事業所ごとに初めて使うときに読み、キャッシュする。  
1 つの事業所の IdP が応答しなくても、ほかの事業所のログインは待たない。  
読めなかった事業所は、その失敗を 30 秒キャッシュして返し、過ぎてから読み直す。

上流の IdP へリダイレクトしている間の値（ログインの要求、職員の ID、state、nonce、PKCE の code verifier、発行の時刻）は、ブラウザの cookie に置き、コールバックの `state` と照合する。  
ブローカーは、cookie の値に `LOGIN_COOKIE_KEYS` の鍵で HMAC-SHA256 の署名を付ける。  
値は、JSON を base64url で書いたものと、その署名の base64url を `.` でつないだものである。  
コールバックは、署名を検証してから値を読む。

- 先頭の鍵で署名し、全ての鍵で検証する。
  - 鍵を替えるときは、新しい鍵を先頭に足してデプロイし、古い鍵を cookie の期限の 10 分より長く残してから外す。上流の IdP へ行っている職員のログインが切れないようにするためである。
- 署名が合わない値、署名の無い値、発行から 10 分を過ぎた値、発行の時刻が今より後の値は、職員を DB で引かず、Hydra も呼ばずに、ブローカーのログインを続けられない画面（400）で拒む。
  - 署名を入れる前のデプロイで発行した cookie は署名が無いので、デプロイの時に上流の IdP にいた職員は 1 度ログインし直す。
  - cookie の期限（`Max-Age`）はブラウザが守るだけなので、送り直した cookie を、署名した発行の時刻で拒む。
- 値は暗号化しない。ブラウザの利用者は、職員の ID と state を読める。
- 方式に HMAC-SHA256 を選んだのは、Go の標準のライブラリで書け、鍵が 1 つの共有の値で済むためである。値を読ませない必要は無く、暗号化は issue の範囲外である。

結び付けは、職員の行を `FOR SHARE` で読み、有効な職員にだけ書く。  
ログインの途中に休職か退職になった職員には結び付けない。  
退職で消した上流のアカウントが、退職した職員に戻らないためである。

同じ上流のアカウントで同時に初めてログインすると、先に結び付けたログインのほかは、結び付けが一意の制約で失敗する。  
ブローカーは職員を読み直し、同じ上流のアカウントが結び付いていれば accept する。

#### ほかのサイトからの送信

`POST /login` は、ほかのサイトから送られたものを 403 で拒み、ログインの失敗の画面を出す。  
判定には Go の `http.CrossOriginProtection` を使い、`PUBLIC_URL` の origin を信頼する origin に足す。

- `Origin` が `PUBLIC_URL` の origin なら受ける。
  - リバースプロキシの後ろで `Host` がブラウザの開いた origin と違っても受けるためである。
- `Sec-Fetch-Site` が `same-origin` か `none`（利用者が直接始めた遷移）なら受け、ほかの値なら拒む。
- `Sec-Fetch-Site` が無ければ、`Origin` の host を `Host` と比べ、違えば拒む。
  - scheme は比べない。
- どちらのヘッダーも無いリクエスト（ブラウザでないクライアント）は受ける。

ブローカーの画面は `Content-Security-Policy: frame-ancestors 'none'` を返し、ほかのサイトの frame に表示させない。

#### ブローカーのログインの失敗の画面

ブローカーは、Hydra へ結果を返さずに終えるときに、自分のログインの失敗の画面（account-login の 3 つの失敗の状態）を出す。  
この画面には、もう一度ログインするリンクが無い。  
画面の文は、ステータスで次の 3 つに分ける。

| ステータス | 状態 | 伝えること |
| --- | --- | --- |
| 429 | 試行の回数の上限を超えた | 待つ長さ。web のログインの失敗の画面の `too_many_attempts` と同じ文 |
| 5xx | 障害でログインできない | 時間をおいて試すこと。web のログインの失敗の画面の `failed` と同じ文 |
| ほかの 4xx | ログインを続けられない | buddy を開き直すこと |

画面を出すのは次のとき。

- `login_challenge` か `consent_challenge` が無いか、Hydra の admin API が 4xx を返して読めないとき（400）
  - 読めないときは、`GET /login`、`POST /login`、同意のどれでも 400 にする。
  - 使い終えたか期限の切れた challenge を、challenge が無いときと同じに扱うためである。
- Hydra の admin API に届かないか、5xx を返して challenge を読めないとき（502）
- コールバックの値が、このブラウザで始めたログインのものと確認できないとき（400）
  - cookie が無いとき、署名が合わないか無いとき、発行から 10 分を過ぎたか発行の時刻が今より後のとき、クエリの `state` が cookie と違うときである。
- `POST /login` の本文が大きすぎるとき（413）と、メールの形が正しくないとき（400）
- ほかのサイトから `POST /login` が送られたとき（403）
- 送信元の IP アドレスごとの試行の上限を超えたとき（429）
- 上流の IdP の discovery の文書を読めず、リダイレクト先を作れないとき（502）
- `POST /login` で、メールから職員を DB で引けないとき（500）
  - コールバック、保ったセッション、同意で職員を引けないときは、`server_error` の reject で返す。
- `POST /login` で、ログインの途中の値を cookie に書けないとき（500）
- Hydra へ accept か reject を返せないとき（502）

ブローカーの画面のソースは `apps/broker`（`@buddy/broker`）にあり、web と同じ `packages/ui` のコンポーネントとトークンで書く。  
画面の背景の中央に白いカード（`AuthCard`）を置き、上端にロゴを出す。  
web のログインの失敗の画面も、同じカードを使う。  
2 つの画面が同じ文を出す 2 つの状態の文言は、`apps/broker` の定数（`loginFailedMessage`、`tooManyAttemptsMessage`）にあり、ブローカーの画面と web の画面が同じ定数を読む。

- ADR-0003: [ID ブローカーのログインの画面のソースを apps/broker に置き、@buddy/ui から生成したテンプレートを ID ブローカーが埋め込んで配信する](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0003-broker-login-pages-source.md)

`apps/broker` の `pnpm generate` が、画面を React で静的な HTML に書き出し、`packages/ui` の `theme.css` を読む Tailwind で CSS を生成する。  
書き出したテンプレートと CSS は `internal/login/pages/` に置いてコミットし、ブローカーは `go:embed` で読む。  
ブローカーのビルドに Node.js は要らない。  
テンプレートの `{{css}}` に CSS を、ログインの画面の `{{.Challenge}}` に `login_challenge` を、ブローカーが `html/template` で埋める。  
`pnpm check:generated` が、画面のソースと `packages/ui` との食い違いを見つける。  
書体は Noto Sans JP を名指すだけで、ブローカーは書体のファイルを配らない。  
入っていない端末では、ブラウザの sans-serif で出る。

#### 同意

同意の accept は、web のクライアントに許した audience を `aud` に、職員の事業所の組織の ID を `org_id` に入れる。  
Hydra は `skip_consent` のクライアントでも同意の画面を呼ぶので、ブローカーは画面を出さずに accept する。  
画面を出さずに accept するのは、`AUTO_CONSENT_CLIENTS` に挙げたクライアント（デフォルトは `web`）だけである。  
ほかのクライアントの同意は reject で返す。  
ブローカーは同意の画面を持たない。

同意の要求の `subject` の職員がいないか、有効でなければ、同意を reject で返す。  
ログインの accept の後に休職か退職にした職員に、トークンを出さないためである。

#### ログインのセッション

ブローカーは、ログインの accept で、Hydra にログインのセッションを 12 時間保たせる（`remember`、`remember_for` は 43200 秒）。  
保っている間、Hydra はブローカーのログインの画面を出させずに accept させる（SSO）。  
web のログアウトは、Hydra のログインのセッションを消す。  
ログアウトの後のログインは、ブローカーのメールの入力の画面を通る。

Hydra は、web がトークンを受け取れなかったログイン（事業所に登録されていない職員）のセッションも保つ。  
web のログインの失敗の画面は、`prompt=login` を付けて入り直させ、Hydra にブローカーのログインの画面を出させる。

### トークンの発行の確認

Hydra は、トークンを発行するたびに `oauth2.token_hook` でブローカーの `POST /internal/token-hook` を呼ぶ。  
ブローカーは、職員が有効でないとき（休職と退職の職員と登録の途中の職員）と、上流でのログインから 12 時間を過ぎたときに 403 を返し、Hydra はトークンの要求に `access_denied` を返す。  
発行してよいときは 204 を返す。

- 上流でのログインの時刻には、Hydra が本文の `session.id_token.id_token_claims.auth_time` に入れる値を使う。
  - ブローカーは時刻を DB に持たない。
  - `auth_time` は、Hydra がログインの accept を受けた時刻である。ブローカーは上流の IdP の ID token を受けた直後に accept するので、上流でのログインの時刻と同じとみなせる。
  - refresh でも、Hydra は最初のログインのセッションを読み直すので、`auth_time` は変わらない。ログインのたびに別の `auth_time` を持つので、ログインのセッションごとに 12 時間を数えられる。
  - ログインのセッションを保たせると、Hydra は保ったセッションのログインの時刻を `auth_time` に入れる。保ったセッションも 12 時間で切れるので、上流でのログインから 12 時間の判定は変わらない。
- 職員の ID は `session.id_token.subject` で読む。
  - `auth_time` か職員の ID が無いトークンは拒む。
- client credentials のトークン（`request.grant_types` が `client_credentials` だけ）は、職員のものでないので、職員を見ない。
  - `request.client_id` が内部の API を呼んでよいクライアント（`INTERNAL_API_CLIENTS` と `INTERNAL_API_ONBOARDING_CLIENTS`）にあれば 204 を、無ければ 403 を返す。
- 200 を返すと、Hydra は access token の追加のクレームを本文の値で置き換え、同意で入れた `org_id` が消える。
  - ブローカーは 200 を返さない。
- Hydra は、token_hook の設定のヘッダー `Token-Hook-Key` に、ブローカーと共有する値（`TOKEN_HOOK_KEY`）を入れて呼ぶ。
  - 値が違えば 401 を返す。
- 職員を DB から読むのは 2 秒で打ち切り、読めなければ 500 を返す（ADR-0044）。
  - Hydra は 500 の hook を呼び直すが、トークンは発行しない。
  - hook の呼び出しごとに、結果と所要の時間をログに出す。項目は [基盤と運用](https://github.com/Fukuemon/buddy/blob/develop/context/operations.md#監視の項目とアラートの条件) にある。
- 休職と退職の職員の refresh token は、休職と退職のときに取り消すので、token_hook より前に `invalid_grant` で拒まれる。
  - web の BFF は、`invalid_grant` と `access_denied` のどちらでもセッションを消す。

### 職員の登録、休職、復職、退職

予定の API が職員の管理の権限を確認してから、ブローカーの内部の API を呼ぶ（ADR-0001）。

- 内部の API と token_hook は、ログインの画面（`PORT`）と別のポート（`INTERNAL_PORT`、デフォルトは 8081）で待ち受ける。
  - ログインの画面のポートは `/internal/` の下に 404 を返す。
  - 内部のポートは、ブラウザとリバースプロキシに開かず、予定の API、予定の API の運営用の CLI のジョブ、Hydra だけが届くようにする。
- 内部の API は、Hydra の client credentials の access token（`aud` は `broker`）だけを受け、Hydra の JWKS で検証する。
  - トークンが無いか検証できなければ 401 を返す。
- 検証できても、トークンの `sub`（client credentials ではクライアントの ID）が、呼んだ操作を許したクライアントに無いか、トークンが `org_id` を持てば 403 を返す。
  - `org_id` は同意で職員のトークンにだけ入る。
  - `INTERNAL_API_CLIENTS`（デフォルトは `schedule`）のクライアントには、全ての操作を許す。
  - `INTERNAL_API_ONBOARDING_CLIENTS`（デフォルトは `schedule-ops`）のクライアントには、職員の登録、有効化、登録の途中の職員の削除だけを許す。予定の API の運営用の CLI が、事業所と最初のマネージャーの登録に使う。
  - ADR-0043: [事業所と最初のマネージャーを予定の API の運営用の CLI で登録し、ブローカーは運営用のクライアントに職員の登録だけを許す](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0043-facility-onboarding-cli.md)

| パス | 働き | 主な応答 |
| --- | --- | --- |
| `POST /internal/staff` | 組織の ID とメールで、登録の途中の職員を登録し、職員の ID を発行する。同じ事業所に同じメールの職員がいれば、作らずにその職員を返す | 作れば 201、いれば 200、その職員が休職していれば 409（`suspended`）、ほかの事業所にいれば 409（`email_taken`）、上流の IdP の設定に無い組織は 400。退職した職員はメールを持たないので、同じメールで新しい職員を作る |
| `POST /internal/staff/{id}/activate` | 登録の途中の職員を有効にする。有効な職員を有効にしても成功する | 204、いなければ 404、休職の職員なら 409（`suspended`）、退職した職員なら 409（`retired`） |
| `DELETE /internal/staff/{id}` | 登録の途中の職員を消す。予定の API が登録を戻すときに使う | 204、いなければ 404、登録の途中でなければ 409 |
| `POST /internal/staff/{id}/suspend` | 職員を休職にし、Hydra の admin API でログインのセッションと、全てのクライアントへの同意を取り消す。同意を取り消すと、Hydra はその同意から発行した access token と refresh token も取り消す。休職の職員を休職にしても成功する | 204、いなければ 404、退職した職員なら 409（`retired`）、休職にしたが取り消しに失敗すれば 502（`revoke_failed`） |
| `POST /internal/staff/{id}/resume` | 休職の職員を有効に戻す。上流のアカウントの結び付けは残すので、職員は同じ上流のアカウントでログインできる。有効な職員を戻しても成功する | 204、いなければ 404、退職した職員なら 409（`retired`）、登録の途中の職員なら 409（`not_suspended`） |
| `POST /internal/staff/{id}/retire` | 職員を退職にし、メールと上流のアカウントを消してから、`suspend` と同じく取り消す。退職した職員を退職にしても成功し、取り消しをやり直す | 204、いなければ 404、退職にしたが取り消しに失敗すれば 502（`revoke_failed`） |

予定の API の職員の登録、休職、復職、退職は、ブローカーと予定の API の DB の 2 か所に書く。  
1 つのトランザクションにできないので、片方だけが書けたときに、ログインできる職員が予定の API で有効でない状態に残らない順に書く。  
ログインを許す書き込み（登録の有効化、復職）は最後にし、ログインを止める書き込み（休職、退職）はブローカーを先にする。  
登録では、ブローカーの職員を登録の途中の状態で作り、予定の API が書き終えてから有効にする。

```mermaid
sequenceDiagram
  autonumber
  participant W as web（職員の登録）
  participant A as 予定の API
  participant K as ブローカー
  participant DB as 予定の API の DB
  W->>A: POST .../users
  A->>A: 職員の管理の権限と入力を確認する
  break 事業所に組織の ID が無い
    A-->>W: 400（ブローカーを呼ばない）
  end
  A->>K: POST /internal/staff（組織の ID、メール）
  break 休職中の同じメール、ほかの事業所の同じメール、入力の誤り
    K-->>A: 409（suspended か email_taken）か 400
    A-->>W: 409 か 400
  end
  K-->>A: 201 か 200（職員の ID、登録の途中か）
  A->>DB: users.sub に職員の ID を入れて職員を書く
  alt 書けなかった
    opt この呼び出しでブローカーの職員を作っていた
      A->>DB: その ID の職員がいないことを確認する
      A->>K: DELETE /internal/staff/{id}
      K-->>A: 204
    end
    A-->>W: 409 か 500
  else 書けた
    A->>K: POST /internal/staff/{id}/activate
    alt 有効にできた
      K-->>A: 204
      A-->>W: 201（職員）
    else 有効にできなかった
      K-->>A: エラー
      A-->>W: 500
    end
  end
```

- 登録の途中の職員は、ログインの画面と token_hook で拒まれる。
  - 予定の API に書けずにブローカーにだけ残った職員は、ログインできず、照合の API も使えない。
- 登録は、同じ事業所の同じメールで送り直しても、ブローカーの職員が 1 人にまとまる。
  - 予定の API の書き込みに失敗したら、同じ本文で送り直せる。
  - ブローカーにだけ残った登録の途中の職員は、送り直すと、その ID で予定の API に書いてから有効にする。
  - 予定の API に書いた後に有効にできなかったときは、予定の API は 500 を返す。送り直すと、予定の API に同じ ID の職員がいるので、書かずに有効にしてから返す。
- 予定の API に書けなかったときは、この呼び出しでブローカーの職員を作っていて、その ID の職員が予定の API にまだいなければ、ブローカーの職員を消す。
  - 消せなくても、職員は登録の途中のままでログインできない。
- ほかの事業所に同じメールの職員がいるときは、予定の API は事業所を示さない 409 を返す。
  - メールが登録済みかを試す手段になるが、事業所の名前と職員は示さない。
- 同じメールの登録を同時に受けたときの戻しの競合は、登録の途中の状態で害が無くなる。
  - ブローカーは登録の途中の職員だけを消す。ほかの登録が書き終えて有効にした職員は、戻しで消えない。
  - 戻しが、予定の API にその ID の職員がいないことを確認してから消すまでの間に、ほかの登録が書くと、ほかの登録の有効化は 404 で失敗し、予定の API は 500 を返す。
  - このとき予定の API に書いた職員は、ブローカーにいないのでログインできない。ほかの職員として入る手段はできない。

休職と退職の流れを示す。  
予定の API は、事業所の行をロックしたトランザクションの中で、確認からブローカーの書き込みと予定の API の書き込みまでを行う。

```mermaid
sequenceDiagram
  autonumber
  participant W as web（職員の詳細）
  participant A as 予定の API
  participant DB as 予定の API の DB
  participant K as ブローカー
  W->>A: POST .../leave か retire
  A->>A: 権限と、自分でないことを確認する
  break 権限が無いか、自分
    A-->>W: 403 か 409
  end
  rect rgba(128, 128, 128, 0.1)
    Note over A,DB: 事業所の行をロックしたトランザクション
    A->>DB: 職員を読み直す
    A->>DB: 有効な管理者と、残る予定と担当を読む
    DB-->>A: 有効な管理者と、残る一覧
    break 最後の有効な管理者か、退職した職員の休職か、予定と担当が残る退職
      A-->>W: 409
    end
    A->>K: POST .../suspend か retire
    break ブローカーで退職した職員の休職
      K-->>A: 409（retired）
      A-->>W: 409
    end
    alt 職員がいない
      K-->>A: 404
    else 職員を止めた
      K->>K: Hydra でログインのセッションと同意を取り消す
      K-->>A: 204 か 502（revoke_failed）
    end
    A->>DB: 休職か退職を書く
    opt 退職
      A->>DB: メールと電話番号を消し、Google カレンダーを外す
    end
  end
  alt revoke_failed を受けた
    A-->>W: 500
  else
    A-->>W: 200（休職は残る一覧を返す）
  end
```

- 休職と退職は、ブローカーを先に書いてから、予定の API に書く。
  - ブローカーの休職と退職は何度呼んでも成功する。
  - 予定の API に書けなければ、トランザクションを戻す。職員はブローカーで止めたままなのでログインできず、送り直すとブローカーの書き込みと取り消しをやり直してから書く。
  - ブローカーで書いた後に Hydra の取り消しに失敗したときは、ブローカーは `revoke_failed` の 502 を返す。
    - 予定の API は休職か退職を書いてから 500 を返し、送り直しで取り消しをやり直させる。職員は止めたままなので、その間も token_hook がトークンを拒む。
  - ブローカーにいない職員（404）は、ログインできないので、予定の API でだけ休職か退職にする。
  - ブローカーで退職した職員を休職にしようとしたとき（`retired` の 409）は、予定の API は 409 を返す。予定の API への退職の書き込みが残っていないので、退職を送り直す。
  - 事業所の行のロックで、同じ事業所の休職と退職を 1 つずつにする。ロックはブローカーを呼ぶ間も持つ。
    - 管理者どうしが同時に休職にし合っても、後の操作は最後の有効な管理者を見つけて 409 になる。

復職の流れを示す。  
予定の API は、事業所の行をロックしたトランザクションを 2 つに分け、1 つ目で休職を外し、2 つ目でブローカーを呼ぶ。

```mermaid
sequenceDiagram
  autonumber
  participant W as web（職員の詳細）
  participant A as 予定の API
  participant DB as 予定の API の DB
  participant K as ブローカー
  W->>A: POST /v1/users/{user_id}/reinstate
  rect rgba(128, 128, 128, 0.1)
    Note over A,DB: 1 つ目のトランザクション
    A->>DB: 事業所の行をロックし、職員を読み直す
    break 退職した職員
      A-->>W: 409
    end
    A->>DB: 休職を外してコミットする
  end
  rect rgba(128, 128, 128, 0.1)
    Note over A,K: 2 つ目のトランザクション。ブローカーが戻したときは予定の API に書かない
    A->>DB: 事業所の行をロックし、職員を読み直す
    break 間に休職か退職にされた
      A-->>W: 409
    end
    A->>K: POST /internal/staff/{id}/resume
    alt 戻したか、職員がいない
      K-->>A: 204 か 404
      A-->>W: 200
    else 退職した職員か、登録の途中の職員
      K-->>A: 409（retired か not_suspended）
      A->>DB: 外した休職を書き戻す
      A-->>W: 409
    else 届かないか 5xx
      K-->>A: エラー
      A-->>W: 500（休職を外したまま）
    end
  end
```

- 復職は、予定の API で休職を外してコミットしてから、ブローカーの職員を戻す。
  - ログインを許す書き込みを最後にするためである。
  - ブローカーは、事業所の行をロックした 2 つ目のトランザクションの中で、職員を読み直して有効なままのときだけ呼ぶ。間に休職にし直されていれば、戻さずに 409 を返す。
  - 2 つ目のトランザクションは、ブローカーが戻したときに予定の API に書かない。ブローカーが戻した後に接続が切れても、状態は食い違わない。
  - ブローカーが `retired` か `not_suspended` の 409 を返したときは、予定の API で外した休職を書き戻して 409 を返す。
  - ブローカーに届かないか 5xx を返したときは、予定の API で外した休職を残して 500 を返す。職員はブローカーで止めたままなのでログインできず、送り直すと、予定の API で有効な職員でもブローカーの職員を戻し直す。

### ログアウト

web は自分のセッションを消した後に、ブラウザを Hydra の RP-Initiated Logout へ、ID token を添えてリダイレクトする。  
Hydra はブローカーのログアウトの画面を呼び、ブローカーが accept すると、Hydra のログインのセッションが消える。  
上流の IdP のセッションは消さない。

```mermaid
sequenceDiagram
  autonumber
  participant B as ブラウザ
  participant W as web
  participant H as Hydra
  participant K as ブローカー
  B->>W: POST /auth/logout
  W->>W: web のセッションを消す
  break ID token の無いセッションか、セッションが無い
    W-->>B: web の / へリダイレクト
  end
  W-->>B: Hydra の end_session_endpoint へリダイレクト（id_token_hint、post_logout_redirect_uri）
  B->>H: GET /oauth2/sessions/logout
  H-->>B: ブローカーのログアウトの画面へリダイレクト（logout_challenge）
  B->>K: GET /logout
  break logout_challenge が無い
    K-->>B: ログアウトの失敗の画面（400）
  end
  K->>H: ログアウトの accept
  break accept を返せない
    K-->>B: ログアウトの失敗の画面（502）
  end
  H-->>K: リダイレクト先
  K-->>B: Hydra へリダイレクト
  B->>H: ログインのセッションを消す
  H-->>B: web の / へリダイレクト
```

- ブローカーは、ログアウトの確認の画面を出さずに accept する。
  - 職員は web のログアウトのボタンでログアウトを選んでいる。
- `logout_challenge` が無いとき（400）と、Hydra へ accept を返せないとき（502）は、ブローカーはログアウトの失敗の画面を出す。
- web は、ID token をセッションに置く。
  - refresh で Hydra が ID token を返さなければ、前の ID token を使う。Hydra は、期限の切れた ID token もログアウトの `id_token_hint` として受ける。
- ID token の無いセッション（ID token を置く前に作ったセッション）と、セッションの無いログアウトは、web の / へリダイレクトする。
  - ID token を置く前のログインは、Hydra にセッションを保たせていない。
- Hydra の web のクライアントは、ログアウトの後に戻る先（`post_logout_redirect_uris`）に web の / を持つ。

### ローカル環境

compose は、開発用の IdP（mock-oauth2-server）を、上流の IdP のフェイクとして置く。  
mock-oauth2-server はパスの最初の部分を issuer にするので、1 つのコンテナで 5 つの事業所の IdP（`/office-a` から `/office-e`）を立てる。

- compose は、E2E がトークンなしの呼び出しを試せるよう、内部のポートを `127.0.0.1` の 8101 に公開する。
- 上流の IdP ごとの違い（署名の方式、Google の `hd`）は、フェイクで確認せず、ブローカーの単体テストで確認する。
- ブローカーと予定の API のシードは、同じ職員の ID を持つ。
  - 4 つの事業所（`org-sample` から `org-sample-d`）の職員がいる。
  - `org-sample-e` は、シードに無い。運営用の CLI で事業所と最初のマネージャーを足すのに使う。
  - `org-sample-b` には、両方で休職にした職員もいる。E2E は、この職員のログインが拒まれることを確認する。

## Interface

- 読む設定と、起動しない条件は [README](https://github.com/Fukuemon/buddy/blob/develop/services/broker/README.md#configuration) にある
- ヘルスチェック: `GET /healthz`（依存先を確認しない）、`GET /readyz`（DB に届かなければ 503）、`broker healthcheck` のサブコマンド
- 公開する画面: ログイン（`GET` と `POST /login`）、上流の IdP のコールバック（`GET /login/callback`）、同意（`GET /consent`）、ログアウト（`GET /logout`）
- 内部の API: 職員の登録、有効化、削除、休職、復職、退職と、Hydra の `oauth2.token_hook`（`POST /internal/token-hook`）。
  - `INTERNAL_PORT` で待ち受ける。パスは [職員の登録、休職、復職、退職](#職員の登録休職復職退職) の表にある
- マイグレーションとシード: `migrate up`、`migrate down [N]`、`migrate seed`。
  - シードは職員がいない DB にだけ入る
