---
type: feature-design
title: 予定の管理
description: schedule-api のコードの層、表の構成（ER）、認証から事業所の確認までの流れ、繰り返しの予定、予定の変更とキャンセル
status: stable
governs: apps/schedule-api
verified_commit: ff293e9
---

# 予定の管理

## Overview

schedule-api は、事業所ごとの予定、職員、利用者、権限を持ち、web に API で渡す。  
全体の中での責務と依存は [buddy Design Doc](https://github.com/Fukuemon/buddy/blob/develop/docs/design/DesignDoc.md) にある。

## Scope

持つもの

- 事業所、部署、チーム、役職と、職員、利用者
- 権限、役職の既定の権限、職員ごとの権限とその対象
- 単発の予定、繰り返しの予定と繰り返しの規則、予定のキャンセル
- 訪問の情報、サービスコード、訪問の区分
- access token の検証から事業所の確認までのミドルウェア

持たないもの

- 住所とエリア、訪問の順路、経営数値、月の稼働時間の集計の表
- ログインとパスワード。ブローカーが持つ
- 照合の規則。receipt-api が持つ

## Design

### コードの構成

規則と手順は機能ごとのパッケージに置き、DB と HTTP のアダプタは 1 つずつ置く。機能のパッケージの中は、手順（`Usecase`）、規則（状態を持たない関数かエンティティのメソッド）、集約の単位のリポジトリに分ける。決めた理由は ADR-0005 と ADR-0010 にあり、依存してよい向きは [コードベースの構造](https://github.com/Fukuemon/buddy/blob/develop/context/codebase.md) にある。

- ADR-0005: [schedule-api の規則と手順を機能ごとのパッケージにまとめる](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0005-schedule-api-packages.md)
- ADR-0010: [予定の API の機能のパッケージで、手順を usecase、規則を関数、リポジトリを集約の単位に分ける](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0010-schedule-api-usecase-boundaries.md)

| 種類 | パッケージ | 持つもの |
| --- | --- | --- |
| 共通 | `internal/apperr`、`internal/tx`、`internal/kernel`、`internal/civil` | 共通の誤りと検証の誤り、`Transactor`、文字の検証と並べ替えと `IDGenerator` と 1 件を読む `Finder`、日付と時刻の値 |
| 機能 | `internal/organization`、`internal/staff`、`internal/patient`、`internal/visit`、`internal/schedule` | エンティティ、規則の関数、自分の集約のリポジトリのインターフェイス、ほかの機能のデータを読む小さなインターフェイス、手順（`Usecase`）とトランザクションの範囲。予定の閲覧と編集の判定は `schedule` の `permission.go` に置く |
| 認可 | `internal/principal` | トークンの主張（`Identity`）、職員（`Principal`）、職員の管理の判定 |
| 認証 | `internal/access` | トークンから職員を特定する手順と、パスが指す資源の事業所を引く手順 |
| テスト | `internal/inmem` | 機能のパッケージのテストが共有する、メモリ上のリポジトリ |
| アダプタ | `internal/mysql` | 機能のパッケージのリポジトリを、sqlc の生成コード（`sqlcgen`）で実装する |
| アダプタ | `internal/ulid` | `IDGenerator` を ULID で実装し、ID の形を確かめる |
| 設定 | `internal/config` | 環境変数から API とマイグレーションの設定を読む。DB の接続の値は自分の型で持ち、`cmd` がアダプタの設定に写す |
| 共有 | `packages/go/oidc`、`packages/go/healthcheck`（別の module） | access token の JWKS での検証、テストと `cmd/devissuer` が使う偽物の発行者（`oidctest`）、`api healthcheck`。receipt-api と共有する（ADR-0007） |
| アダプタ | `internal/httpapi/openapi` | `openapi.yaml` から生成した型と strict server のインターフェイス |
| アダプタ | `internal/httpapi` | 生成したインターフェイスを実装するハンドラと、gin のミドルウェア。要求は、埋め込んだ `openapi.yaml` の定義で確かめる |
| cmd | `cmd/api`、`cmd/migrate`、`cmd/devissuer` | 起動、マイグレーションとシード、手元で試すための偽物の発行者（イメージに入れない） |

- `kernel` は、ADR-0010 の「`apperr` と同じ段の小さなパッケージ」に当たる。`kernel.Finder[T]` は ID で 1 件を読む 1 つのメソッドのインターフェイスで、機能のパッケージは、ほかの機能のエンティティをこの形で受ける。同じ形のインターフェイスを機能ごとに書かずに済ませるためである。
- `access` は機能のパッケージではないので、型の名前を `Service` のままにし、`Usecase` への改名と「1〜2 のメソッド」の規則の対象から外す。
- `access.Staff` は、`FindIDBySub`、`LinkSub`、`Get` の 3 つのメソッドを持つ。初回のログインで sub を職員に結び付け、職員と権限を読むために、3 つともが要る。

### 表の構成

次の図は、schedule-api の全ての表と、その間の関係を示す。カラム、制約、索引は、マイグレーションから生成した[表の文書](https://github.com/Fukuemon/buddy/blob/develop/docs/db/schedule-api/README.md)（文書のサイトでは「DB の設計」の「表の一覧」）にある。表の文書の Viewpoints は、事業所と組織、職員と権限、利用者、予定と訪問、繰り返しの予定の観点ごとに、表を絞った ER 図を持つ。

- 主キーは、多くの表が ULID の `id`（`CHAR(26)`）である。
- `position_policies` と `visit_info_visit_categories` は、2 つの外部キーの組を主キーにする。
- `recurring_schedule_exclusions` は、`recurring_schedule_id` と `date` の組を主キーにする。
- `user_policy_targets` は、`id` を主キーにする。対象の列（`target_user_id` と `target_team_id`）のどちらかが NULL になり、主キーに入れられないためである。

```mermaid
erDiagram
  facilities ||--o{ departments : "持つ"
  facilities ||--o{ teams : "持つ"
  facilities ||--o{ positions : "持つ"
  facilities ||--o{ users : "所属させる"
  facilities ||--o{ patients : "受け持つ"
  facilities ||--o{ schedules : "持つ"
  facilities ||--o{ recurring_schedules : "持つ"
  departments ||--o{ users : "所属させる"
  teams ||--o{ users : "所属させる"
  positions ||--o{ users : "割り当てる"
  positions ||--o{ position_policies : "既定にする"
  policies ||--o{ position_policies : "含まれる"
  policies ||--o{ user_policies : "含まれる"
  users ||--o{ user_policies : "持つ"
  user_policies ||--o{ user_policy_targets : "対象を持つ"
  users |o--o{ user_policy_targets : "対象になる"
  teams |o--o{ user_policy_targets : "対象になる"
  users ||--o{ schedules : "持つ"
  users ||--o{ recurring_schedules : "持つ"
  schedule_types ||--o{ schedules : "分類する"
  schedule_types ||--o{ recurring_schedules : "分類する"
  recurring_rules ||--o{ recurring_schedules : "繰り返す"
  recurring_schedules ||--o{ recurring_schedule_exclusions : "除外する日"
  recurring_schedules |o--o{ schedules : "1 回だけ置き換えた予定"
  schedules ||--o| schedule_cancels : "取り消される"
  schedules |o--o| visit_infos : "訪問の情報"
  recurring_schedules |o--o| visit_infos : "訪問の情報"
  patients ||--o{ visit_infos : "訪問される"
  users ||--o{ visit_infos : "主訪問者"
  users |o--o{ visit_infos : "同行者"
  service_codes ||--o{ visit_infos : "提供する"
  service_codes ||--o{ patients : "受けている"
  visit_infos ||--o{ visit_info_visit_categories : "区分を持つ"
  visit_categories ||--o{ visit_info_visit_categories : "分類する"
  users ||--o{ patients : "主に担当する"
```

- `departments`、`teams`、`positions` は事業所ごとに持つ。名前が同じ部署でも、事業所が違えば別の行にする。事業所の間で部署を共有すると、事業所が部署の名前を変えたときにほかの事業所に波及するためである。
- `facilities.org_id` は、認証の基盤の組織の ID を持つ。NULL を許し、値があれば一意にする。認証のミドルウェアは、トークンの組織のクレームでこの列を探す。
- `users.sub` は、認証の基盤の利用者の識別子を持つ。初回のログインまでは NULL で、値があれば全ての事業所を通じて一意にする。
- `users.email` は、事業所の中で一意にする（`facility_id` と `email` の組）。初回のログインは事業所とメールで職員を探すので、当たる職員は 1 人に限られる。`users.username` は表示名で、一意にしない。
- 訪問の区分は、`visit_info_visit_categories` で 1 件の訪問に複数を付けられる。
- 一覧の読み出しには、予定と訪問の情報と名前を結合したビュー（`schedule_details`、`recurring_schedule_details`、`visit_info_details`）を使う。
- `schedule_types`、`service_codes`、`visit_categories` の行は、マイグレーションで入れる。事業所ごとには持たない。サービスコードの提供時間の範囲は、照合の許容範囲と同じ値にする。
- `policies` の 8 行は、マイグレーションで入れる。事業所ごとには持たず、API では作らない。認可は `code` で権限を読むので、行が環境ごとに違うと判定がずれるためである。
- `user_policy_targets` は、`target_user_id` と `target_team_id` のどちらか 1 つだけを持つ。DB の CHECK 制約で確かめる。

### 権限の行

`policies` は、PRD の 8 つの権限（予定の 7 つと職員の管理）を次の `code` で持つ。`needs_target` が true の権限は、対象の職員かチームを `user_policy_targets` に持つ。

| `code` | 権限 | `needs_target` |
| --- | --- | --- |
| `schedule.self.edit` | 自分の予定の編集 | false |
| `schedule.user.read` | 指定した職員の予定の閲覧 | true |
| `schedule.user.edit` | 指定した職員の予定の編集 | true |
| `schedule.team.read` | 指定したチームの職員の予定の閲覧 | true |
| `schedule.team.edit` | 指定したチームの職員の予定の編集 | true |
| `schedule.all.read` | 事業所の全ての予定の閲覧 | false |
| `schedule.all.edit` | 事業所の全ての予定の編集 | false |
| `staff.manage` | 職員の管理 | false |

役職の既定を写す規則、役職を変えたときに写し直す規則、`staff.manage` の扱いは [権限](https://github.com/Fukuemon/buddy/blob/develop/context/domain/permission.md) にある。  
職員の権限（`schedule.user.*`）は、写すときに対象を決められないので、役職の既定にできない。

- ADR-0002: [権限を役職の既定と職員ごとの上書きで持つ（PBAC）](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0002-pbac.md)

職員の役職は `PUT /v1/users/{user_id}/position` で変える。  
職員ごとに権限を足す（`POST /v1/users/{user_id}/policies`）ときは、`needs_target` が true の権限に、code に合わせて職員かチームの対象を 1 つ以上付ける。対象は同じ事業所のものに限る。外す（`DELETE /v1/users/{user_id}/policies/{user_policy_id}`）と、対象も消える。

職員と利用者の登録、役職の作成、役職を変える操作、権限を足し外す操作は、`staff.manage` を持つ職員だけに許す。

- ADR-0006: [職員と利用者の登録と、職員の権限と役職を変える操作を、職員の管理の権限で許す](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0006-staff-manage-policy.md)

### 認証から事業所の確認までの流れ

次の図は、web が予定の一覧を求めたときに、schedule-api が職員を特定し、事業所を確かめ、権限で予定を絞るまでの流れを示す。

```mermaid
sequenceDiagram
  participant W as web
  participant M as 認証のミドルウェア
  participant U as schedule.Usecase
  participant DB as MySQL

  W->>M: GET /v1/facilities/{facility_id}/schedules（Bearer）
  M->>M: JWKS で署名、iss、aud、exp、nbf を確かめる
  alt トークンがない、または検証に失敗
    M-->>W: 401
  end
  M->>DB: トークンの組織のクレームで事業所を探す
  alt 組織のクレームがない、または事業所がない
    M-->>W: 403
  end
  M->>DB: sub で職員を探す
  alt sub の職員がいない
    alt email が未確認
      M-->>W: 403
    end
    M->>DB: 組織の事業所で、email が一致し sub が NULL の職員にだけ sub を書く
    M->>DB: sub で職員を探し直す
    alt 職員がいない
      M-->>W: 403
    end
  end
  M->>M: 職員の事業所と組織の事業所を比べる
  alt 職員の事業所が組織の事業所と違う
    M-->>W: 403
  end
  M->>DB: パスの ID が指すリソースの事業所を読む
  M->>M: パスが指す事業所と職員の事業所を比べる
  alt 事業所が違う
    M-->>W: 403
  end
  M->>U: 職員と権限を request の context（principal.Principal）で渡す
  U->>DB: 全ての閲覧の権限が無ければ、事業所の職員とチームを読む
  U->>U: 職員の権限で、見てよい職員を決める
  U->>DB: 事業所の ID で絞って予定を読む
  U->>U: 見てよくない職員の予定を除く
  U-->>W: 200 予定の一覧
```

- `/v1` の全ての API は、`Authorization: Bearer` の access token を求める。`/healthz` と `/readyz` は認証を求めない。
- 署名のアルゴリズムは RS256 と ES256 だけを受け付ける。JWKS は、起動のときに discovery の文書から場所を読み、1 時間ごとに取り直す。知らない `kid` のトークンが来たときも取り直すが、間隔は 1 分以上あける。
- トークンが無いときは `WWW-Authenticate: Bearer` を、検証に失敗したときは `WWW-Authenticate: Bearer error="invalid_token"` を付けて、401 を返す。
- 組織の ID を持つクレームの名前は `OIDC_ORG_CLAIM` で決め、既定は `org_id` にする。ブローカーごとにクレームの名前が違うためである。
- sub を書く UPDATE は `sub IS NULL` を条件にする。同じ職員の初回のログインが同時に 2 つ来ても、書くのは 1 回だけになる。
- ミドルウェアは、パスの引数ごとに、指すリソースの事業所を職員の事業所と比べる。
  - `facility_id` は、値をそのまま職員の事業所と比べる。
  - `department_id`、`team_id`、`position_id`、`user_id`、`schedule_id`、`recurring_schedule_id` は、リソースを読んでその事業所と比べる。
  - `policy_id` は、事業所に属さないので確かめない。`user_policy_id` は、同じパスの `user_id` で事業所を確かめ、`staff.Usecase` が職員の権限かを確かめる。
  - この一覧に無い引数を持つパスは、事業所を確かめられないので 500 を返す。
- パスの ID が ULID でないときと、リソースが見つからないときは、ミドルウェアは通す。ULID でない ID は次のミドルウェアが 400 を返し、見つからないリソースはハンドラが 404 を返す。
- `/v1` の要求は、次の順に確かめる。先に失敗した段の応答を返すので、トークンの 401 と事業所の 403 は、パスの ID と定義の 400 より先に返る。
  1. Origin を許すか（403）。`CORS_ALLOW_ORIGINS` を設定したときだけ当てる。規則は [Interface](#interface) の CORS にある
  2. クエリを読めるか（400）。`/v1` 以外のパスにも当てる
  3. トークン（401）と、職員と組織の事業所（403）
  4. パスが指す事業所（403）
  5. パスの ID が ULID か（400）
  6. 要求が `openapi.yaml` の定義に合うか（400）

### 予定の認可

予定の操作は、`schedule.Usecase` が、ミドルウェアが context に入れた職員（`principal.Principal`）の `user_policies` で判定する。判定の規則は `schedule` の `permission.go` の関数にある。役職は見ない。編集の権限は、同じ範囲の閲覧を含む。

1. 自分の予定は、権限によらず見てよい。自分の予定の編集には `schedule.self.edit` が要る。
2. `schedule.all.read` があれば、事業所の全ての職員の予定を見てよい。`schedule.all.edit` があれば、編集もしてよい。
3. `schedule.user.*` は、対象の職員の予定に及ぶ。
4. `schedule.team.*` は、対象のチームに属する職員の予定に及ぶ。

- 一覧は、見てよくない職員の予定を除いて返す。1 件を指す操作（取得、変更、キャンセル、回の置き換え）は 403 を返す。
- 作成と変更は、予定の職員の予定を編集する権限を求める。変更と回の置き換えは、元の予定の職員と、新しい予定の職員の両方の編集の権限を求める。
- 権限の判定は、事業所の分離の後に行う。事業所が違えば、ミドルウェアが先に 403 を返す。
- 職員と利用者の登録、役職の作成、職員の権限と役職を変える操作は `staff.manage` で判定する（[権限の行](#権限の行)）。それ以外の職員、利用者、訪問の情報、組織の API は、権限で判定せず、事業所の分離だけを確かめる。

### 繰り返しの予定

- 繰り返しの予定は、最初の回の日付（`recurring_schedules.date`）と規則（`recurring_rules`）で回を決める。回は保存しない。
- 繰り返しの規則は次の 3 つ。規則に値が無いときは、最初の回の日付から曜日か日を決める。
  - `weekly`: `day_of_week` の曜日ごと
  - `monthly` で `day_of_month` がある: 毎月のその日。その日がない月は回にしない
  - `monthly` で `week_of_month` と `day_of_week` がある: 毎月の n 回目のその曜日。n は日から `(日 - 1) / 7 + 1` で決め、1 から 5 を受ける。5 回目のない月は回にしない
- 最初の回の日付より前と、`end_date` より後は回にしない。最初の回の日付は、規則の回に当たらなければならない。
- 繰り返しの 1 回だけを変えるときは、その日を `recurring_schedule_exclusions` に足し、`recurring_schedule_id` で元を指す単発の予定を作る。2 つは 1 つのトランザクションで行う。
- 予定の一覧の API は、単発の予定と繰り返しの予定を別々に返す。繰り返しの予定を期間の回に展開しない。`date_from` と `date_to` は単発の予定だけを絞る。

### 予定の変更

- 単発の予定の変更は、予定の枠を本文の内容に置き換える。部分の更新は持たない。画面のフォームは予定の全ての項目を送るためである。
- 訪問の情報は、予定ごとに 1 行を持つ。変更では本文の内容で新しい行を作り、どの予定も指さなくなった前の行を消す。
- 繰り返しの回を置き換えた予定は、変更しても `recurring_schedule_id` を保つ。
- キャンセルした予定は変更できず、409 を返す。
- 変更は、最初に予定の行に排他のロックを取る。同時の変更とキャンセルが、読んだ後の訪問の情報とキャンセルの有無を食い違わせないためである。同時の変更は、後に来た方の内容になる。

### キャンセル

- 予定をキャンセルすると、`schedule_cancels` に理由とともに 1 行を足す。予定の行は消さない。
- キャンセルした予定は、API の応答の `cancel` に理由を持つ。画面は、キャンセルした予定を予定の表示から除く。

## Interface

- 事業所に属する一覧と作成のパスは `/v1/facilities/{facility_id}/<資源>`、1 件を指すパスは `/v1/<資源>/{<資源>_id}` の形にする。主な資源は `schedules`、`schedules/recurring`、`users`、`patients`、`departments`、`teams`、`positions` である。資源ごとにどのパスを持つかは `openapi.yaml` にある。
- 事業所に属さないマスタは `/v1/policies`、`/v1/schedule_types`、`/v1/visit_infos/service_codes`、`/v1/visit_infos/visit_categories` で読む。
- 一覧の並べ替えは、許可した列の名前だけを受け、それ以外は 400 を返す。
- `GET /v1/me` は、トークンの職員と権限を返す。画面は、ログインの後にこれを呼んで事業所を決める。
- エラーは `{"code","message"}` の JSON で返す。`message` は人が読む説明で、文言は変わることがあるので、利用者は `code` で分岐する。
  - 400 の `invalid_input`: クエリを読めない、パスの ID が ULID でない、要求が `openapi.yaml` の定義に合わない、本文の値が規則に合わない、本文が指す参照が見つからないか別の事業所のもの
  - 401 の `unauthenticated`: トークンが無いか、検証に失敗した
  - 403 の `forbidden`: 職員を特定できない、事業所が違う、権限で許されない
  - 404 の `not_found`: パスで指したリソースが無い
  - 409 の `conflict`: 一意の値が重なる、キャンセル済みの予定を変えるかキャンセルする、繰り返しの回をすでに置き換えた
  - 500 の `internal`: サーバーの誤り
- CORS は、`CORS_ALLOW_ORIGINS` に並べた Origin だけに許す。空なら CORS のヘッダーを返さない。
  - 許す Origin の事前の要求には、トークンを求めずに 204 を返す。許すメソッドは GET、POST、PUT、DELETE、OPTIONS、ヘッダーは `Content-Type` と `Authorization` にする。
  - 許さない Origin の要求は、本文を持たない 403 で止める。Origin が要求の Host と同じ要求は、CORS の要求として扱わずに通す。
- 環境変数とマイグレーションのコマンドは [README](https://github.com/Fukuemon/buddy/blob/develop/apps/schedule-api/README.md) に、インフラとの約束は [buddy Design Doc のインフラとの約束](https://github.com/Fukuemon/buddy/blob/develop/docs/design/DesignDoc.md#インフラとの約束) にある。
