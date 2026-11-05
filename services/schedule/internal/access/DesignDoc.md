---
type: feature-design
title: 権限
description: 権限のレコードとマイグレーション、職員ごとの権限の足し外しとチームの対象の移し替え、予定の認可、照合の API の権限の確認
status: stable
governs: services/schedule/internal/access
verified_commit: c0514f20
---

# 権限

## Overview

予定の API は、職員の権限を持ち、予定の操作と職員の管理の操作を権限で判定する。  
照合の API は、予定の API から職員の権限を読み、照合を判定する。  
この文書は判定の仕組みを書き、役職のデフォルトの権限をコピーする規則のような業務の規則は [権限](https://github.com/Fukuemon/buddy/blob/develop/context/domain/permission.md) が持つ。  
予定の API の全体の設計は [予定の管理の Design Doc](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md) に、全体の中での責務と依存は [buddy Design Doc](https://github.com/Fukuemon/buddy/blob/develop/docs/design/DesignDoc.md) にある。

## Scope

持つもの

- 権限のレコードと、照合の権限を足したマイグレーション
- 職員ごとの権限の足し外しと、チームを変えたときの対象の移し替え
- 予定の認可
- 照合の API が、予定の API から職員の権限を読んで照合を許す仕組み

持たないもの

- 役職のデフォルトの権限をコピーする規則と、権限ごとにできる操作。
  - [権限](https://github.com/Fukuemon/buddy/blob/develop/context/domain/permission.md) が持つ
- access token の検証から事業所の確認までのミドルウェア。
  - [予定の管理の Design Doc の認証から事業所の確認までの流れ](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#認証から事業所の確認までの流れ) にある
- 画面の出し分け。
  - web は、画面を読み込むたびに `GET /v1/me` で職員の権限を読み直して画面に渡す。[buddy Design Doc のコンテナの間の通信](https://github.com/Fukuemon/buddy/blob/develop/docs/design/DesignDoc.md#コンテナの間の通信) の web と Hydra にある
  - 照合の画面と照合の結果の画面での扱いは、[照合](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/receipt-upload_照合/index.md) と [照合の結果](https://github.com/Fukuemon/buddy/blob/develop/docs/screens/receipt-result_照合の結果/index.md) の画面仕様書にある

## Design

### 権限のレコード

`policies` は、PRD の 9 つの権限（予定の 7 つ、職員の管理、照合）を次の `code` で持つ。  
`needs_target` が true の権限は、対象の職員かチームを `user_policy_targets` に持つ。

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
| `receipt.check` | 照合 | false |

役職のデフォルトの権限をコピーする規則、役職を変えたときにコピーし直す規則、`staff.manage` の扱いは [権限](https://github.com/Fukuemon/buddy/blob/develop/context/domain/permission.md) にある。  
職員の権限（`schedule.user.*`）は、コピーするときに対象を決められないので、役職のデフォルトの権限にできない。  
`receipt.check` は、予定の API の判定には使わない。  
照合の API が照合の権限を確認する仕方は、[照合の API の権限の確認](#照合の-api-の権限の確認) にある。

- ADR-0002: [権限を役職のデフォルトと職員ごとの上書きで持ち、職員の管理と照合も権限で許す](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0002-pbac.md)

照合の権限を足したマイグレーション（`000009_receipt_check_policy`）は、役職のデフォルトの権限と、職員の管理の権限を持つ今いる職員の権限を変える。

- 各事業所に、事務の役職を足す。
  - 事務の役職のデフォルトの権限は、`schedule.all.read`、`schedule.all.edit`、`receipt.check` である。既に同じ名前の役職がある事業所には足さない。
- 事務という名前の役職の全てに、`receipt.check` を足す。
  - 戻した後に流し直すと、残した事務の役職は足した役職として扱われないので、名前で見分けて照合の権限を戻す。
- `staff.manage` をデフォルトに持つ役職に、`receipt.check` を足す。
  - 役職の名前は事業所ごとに変えてよいので、名前でマネージャーの役職を探せない。PRD の役職ごとの権限の表で `staff.manage` をデフォルトに持つのはマネージャーだけである。
- `staff.manage` を持つ退職していない職員に、`receipt.check` を職員ごとの権限として足す。
  - マイグレーションの前は全ての職員が照合を使える。役職のデフォルトだけを変えると、デプロイの直後に、マネージャーを含めて誰も照合できなくなるためである。
  - マイグレーションを足した時点では、照合の権限を足せる職員の画面も無かった。
  - ほかの職員は、`staff.manage` を持つ職員が職員ごとに足す。
- 戻すと、`receipt.check` の権限と、役職と職員の `receipt.check` の行を消す。
  - 事務の役職は残す。同じ名前の役職が前からあった事業所と、名前を変えた役職があり、このマイグレーションが足した役職を見分けられないためである。

職員の役職は `PUT /v1/users/{user_id}/position` で変える。  
職員の名前、電話番号、部署、チームは `PUT /v1/users/{user_id}` で変える。  
チームを変えると、同じトランザクションで、職員の権限のうち古いチームを指す対象を新しいチームに移す。  
ほかのチームの対象は残し、同じ権限が新しいチームを既に対象にしていれば、古いチームの対象を消す。

- 登録と役職の変更でコピーしたチームの対象は、所属のチームを指す。
- 一方で、[予定の認可](#予定の認可) は、保存した対象のチームと予定の職員の今のチームを比べるだけで、権限を持つ職員の所属のチームを読まない。
- 移さないと、異動した職員は古いチームの予定を見続け、新しいチームの予定を見られない。
- 職員ごとに足した権限の、古いチームを指す対象も移る。
  - 所属のチームのためにコピーした対象と、レコードで区別できないためである。

職員ごとに権限を足す（`POST /v1/users/{user_id}/policies`）ときは、`needs_target` が true の権限に、code に合わせて職員かチームの対象を 1 つ以上付ける。  
対象は同じ事業所のものに限る。  
外す（`DELETE /v1/users/{user_id}/policies/{user_policy_id}`）と、対象も消える。

事業所で `staff.manage` を持つ最後の有効な職員からその権限を外そうとしたときは、何も書かずに 409 を返す。  
権限を外す操作と、`staff.manage` を持たない役職に変える操作の両方が当たる。  
役職を変える操作と権限を外す操作は、休職と退職と同じく、`staff` の操作が事業所の行をロックしたトランザクションの中で、職員を読み直してから行う。  
同時に 2 人から外しても、後の操作は最後の有効な管理者を見つけて 409 になる。

- ADR-0002: [権限を役職のデフォルトと職員ごとの上書きで持ち、職員の管理と照合も権限で許す](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0002-pbac.md)

### 予定の認可

予定の操作は、`schedule` の操作の型が、ミドルウェアが context に入れた職員（`principal.Principal`）の `user_policies` で判定する。  
編集の権限は、同じ範囲の閲覧を含む。  
自分の予定は、権限によらず見てよい。

| 権限 | 見てよい予定 | 編集してよい予定 |
| --- | --- | --- |
| 権限が無い | 自分の予定 | なし |
| `schedule.self.edit` | 自分の予定 | 自分の予定 |
| `schedule.user.read` | 自分と、対象の職員の予定 | なし |
| `schedule.user.edit` | 自分と、対象の職員の予定 | 対象の職員の予定 |
| `schedule.team.read` | 自分と、対象のチームに属する職員の予定 | なし |
| `schedule.team.edit` | 自分と、対象のチームに属する職員の予定 | 対象のチームに属する職員の予定 |
| `schedule.all.read` | 事業所の全ての職員の予定 | なし |
| `schedule.all.edit` | 事業所の全ての職員の予定 | 事業所の全ての職員の予定 |

- 一覧は、見てよくない職員の予定を除いて返す。
  - 1 件を指す操作（取得、変更、キャンセル、回の置き換え）は 403 を返す。
- 作成と変更は、予定の職員の予定を編集する権限を求める。
  - 変更と回の置き換えは、元の予定の職員と、新しい予定の職員の両方の編集の権限を求める。
- 職員と利用者の登録、利用者の変更、利用の終了、利用の再開、職員の休職、復職、退職、役職の作成、職員の名前、電話番号、部署、チーム、権限、役職を変える操作は `staff.manage` で判定する（[権限のレコード](#権限のレコード)）。
  - 部署の作成と名前の変更、チームの作成と、チームの名前と色を変える操作も同じである。
- それ以外の職員、利用者、訪問の情報、組織の API は、権限で判定せず、事業所の分離だけを確認する。
- Google カレンダーとの連携の全ての操作も、`staff.manage` で判定する。
  - 対象は、サービスアカウントのメールアドレスの取得、カレンダーの一覧、読めるかの確認、結び付け、外す、取り込みのプレビューと確定である。
  - 確認が必要な予定の一覧、buddy の内容で書き直す、Google の内容に合わせるも対象にする。
  - 詳しくは [Google カレンダーとの連携の Design Doc の連携の操作の権限](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/internal/features/calendar/DesignDoc.md#連携の操作の権限) にある。

### 照合の API の権限の確認

照合の API のコードは `services/receipt/internal/permission` にある。  
処理の流れの図は [レセプトの照合の Design Doc の処理の流れ](https://github.com/Fukuemon/buddy/blob/develop/services/receipt/DesignDoc.md#処理の流れ) にある。

- 照合の権限（`receipt.check`）を持つ職員だけに許す。
  - 本文を読む前に、受けた access token をそのまま付けて予定の API の `GET /v1/me` を呼び、返った権限で確認する。
  - ADR-0002: [権限を役職のデフォルトと職員ごとの上書きで持ち、職員の管理と照合も権限で許す](https://github.com/Fukuemon/buddy/blob/develop/docs/adr/0002-pbac.md)
  - 照合の API は権限を保存しない。権限を外すと、その職員の次の照合から拒む。
- 照合の権限が無いか、予定の API が 401 か 403 を返した: 403 の `forbidden`。
  - 予定の API は、休職と退職の職員を 403 で拒む
- 予定の API に届かないか、予定の API が 401 と 403 のほかのエラーを返した: 502 の `permission_check_failed`。
  - Google カレンダーから予定を取れないときの 502 の `schedule_source_failed` と同じく、照合の API の外の依存先の失敗なので 502 にする。503 は、照合の API の設定の不足（`calendar_not_configured`）に使う

## Interface

- 予定の API の権限を読み書きするパスは、[権限のレコード](#権限のレコード) に書いた。
  - `GET /v1/me` が返す権限と、ほかのパスの定義の正本は [予定の API の openapi.yaml](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/openapi.yaml) である。
- 照合の API の `POST /v1/checks` のエラーの一覧は、[レセプトの照合の Design Doc の Interface](https://github.com/Fukuemon/buddy/blob/develop/services/receipt/DesignDoc.md#interface) にある。
