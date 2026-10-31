# staff-detail API との対応

[職員の詳細](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。  

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 職員の名前、メールアドレス | 名前、メールアドレス | `StaffDetail.username`、`email`（`staff.get` の戻り値） | `getUser` の `StaffDetail.username`、`email`。退職した職員では `email` が `null` |
| 状態の印、在籍の状態 | 状態、休職にした日、戻る予定の日、退職にした日 | `StaffDetail.status`、`leave_started_at`、`leave_return_date`、`retired_at` | `StaffDetail.status`、`leave_started_at`、`leave_return_date`、`retired_at` |
| プロフィール | 電話番号、部署、チーム | `StaffDetail.phone_number`、`department.name`、`team.name` | `StaffDetail.phone_number`、`department.name`、`team.name`。退職した職員では `phone_number` が `null` |
| 名前の入力、電話番号の入力、部署の選択、チームの選択 | 送る値 | `StaffUpdateInput`（`staff.update` の引数） | `updateUser` の本文の `username`、`phone_number`、`department_id`、`team_id` |
| 部署の選択、チームの選択 | 選択肢 | `Department`、`Team`（`departments.list`、`teams.list` の戻り値） | `listDepartments`、`listTeams` の `Unit` |
| 役職 | 役職の名前 | `StaffDetail.position.name` | `StaffDetail.position.name` |
| 役職の選択 | 選択肢 | `Position`（`positions.list` の戻り値） | `listPositions` の `Position` の `id`、`name` |
| 役職を変えるときの注意、付いた理由 | 役職に決まっている権限か | `Position.policies` | `StaffDetail.policies` の `policy_id` が、`listPositions` の `Position` で `id` が `StaffDetail.position.id` のものの `policies` にあるか。`StaffDetail.position` は `id` と `name` だけの `Ref` で、役職に決まっている権限を持たない |
| ダイアログの役職を変える | 送る役職 | `staff.changePosition` の引数 | `changeUserPosition` の本文の `position_id` |
| 権限の一覧、権限の選択 | 8 つの権限 | `Policy`（`policies.list` の戻り値） | `listPolicies` の `Policy` の `id`、`name`、`code`、`needs_target` |
| 付いているかの印 | 付いているか | `StaffDetail.policies[].policy_id` | `StaffDetail.policies[].policy_id` が `Policy.id` と同じものがあるか |
| 権限の一覧 | 対象の名前 | `StaffPolicy.target_user_ids`、`target_team_ids` | `policies[].target_user_ids` を `listUsers` の `Staff.username` に、`target_team_ids` を `listTeams` の `Unit.name` に引き当てる |
| 対象の選択 | 職員かチームか | `Policy.code` | `Policy.code` が `schedule.team.` で始まればチーム、ほかの `needs_target` の権限は職員 |
| 権限の保存 | 外す権限、足す権限と対象 | `PolicyChange`（`staff.removePolicy`、`staff.addPolicy` の引数） | `removeUserPolicy` のパスの `user_policy_id`、`addUserPolicy` の本文の `policy_id`、`target_user_ids`、`target_team_ids` |
| 残る予定と担当の一覧 | 残る予定、繰り返しの予定、担当の利用者 | `StaffAssignments`（`staff.remainingAssignments` の戻り値、`staff.retire` の拒まれた結果） | `getUserRemainingAssignments` の `StaffAssignments`。退職を拒んだときは `retireUser` の 409 の `RetireConflict.assignments` |
| 残る予定 | 日付と時間 | `StaffAssignments.schedules[]` | `StaffAssignments.schedules[]` の `id`、`date`、`start_time`、`end_time` |
| 残る繰り返しの予定 | 最初の回の日付、終了日、時間 | `StaffAssignments.recurring_schedules[]` | `StaffAssignments.recurring_schedules[]` の `date`、`end_date`、`start_time`、`end_time` |
| 残る担当の利用者 | 利用者の名前 | `StaffAssignments.patients[]` | `StaffAssignments.patients[].name` |
| 戻る予定の日 | 送る日付 | `staff.startLeave` の引数 | `startUserLeave` の本文の `return_date` |
| ほかの操作 | 出すか | `Viewer.staffId` | `getMe` の `id` と `StaffDetail.id` が違うか |
| 読み込みの失敗の文 | 見つからないか | `ApiError.status` | `getUser` の 404 |

## 操作

全ての書き込みの操作と `getUserRemainingAssignments` は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getUser` | `GET /v1/users/{user_id}` | なし | 200。`StaffDetail` | 404 `not_found` |
| `updateUser` | `PUT /v1/users/{user_id}` | `username`、`phone_number`、`department_id`、`team_id` | 200。`StaffDetail` | 400 `invalid_input`: 入力が誤っているか、ほかの事業所の部署かチーム。409 `conflict`: 退職した職員 |
| `changeUserPosition` | `PUT /v1/users/{user_id}/position` | `position_id` | 200。`StaffDetail` | 409 `conflict`: 職員の管理の権限を持つ最後の有効な職員を、その権限を持たない役職に変えようとした |
| `addUserPolicy` | `POST /v1/users/{user_id}/policies` | `policy_id`、`target_user_ids`、`target_team_ids` | 201。`StaffDetail` | 400 `invalid_input`: 対象の指定が権限に合わない。409 `conflict`: 同じ権限を持っている |
| `removeUserPolicy` | `DELETE /v1/users/{user_id}/policies/{user_policy_id}` | なし | 200。`StaffDetail` | 409 `conflict`: 職員の管理の権限を持つ最後の有効な職員から、その権限を外そうとした |
| `getUserRemainingAssignments` | `GET /v1/users/{user_id}/remaining_assignments` | なし | 200。`StaffAssignments` | 404 `not_found` |
| `startUserLeave` | `POST /v1/users/{user_id}/leave` | `return_date` | 200。`StaffStatusChange` | 409 `conflict`: 自分か、職員の管理の権限を持つ最後の有効な職員か、退職した職員 |
| `reinstateUser` | `POST /v1/users/{user_id}/reinstate` | なし | 200。`StaffDetail` | 409 `conflict`: 退職した職員 |
| `retireUser` | `POST /v1/users/{user_id}/retire` | なし | 200。`StaffStatusChange` | 409 `staff_has_assignments`: 予定か担当の利用者が残る。`assignments` に一覧がある。409 `conflict`: 自分か、職員の管理の権限を持つ最後の有効な職員 |
| `listPositions` | `GET /v1/facilities/{facility_id}/positions` | なし | 200。`Position` の配列 | なし |
| `listPolicies` | `GET /v1/policies` | なし | 200。`Policy` の配列 | なし |
| `listDepartments`、`listTeams`、`listUsers` | [職員の登録の API との対応](../staff-new_職員の登録/api.md) と同じ | | | |

- `getUserRemainingAssignments` は、休職と退職の確認のダイアログを開いたときに呼ぶ。レスポンスは、`startUserLeave` と `retireUser` が返す `StaffAssignments` と同じ形で、事業所の現地の日付で今日以降のものを返す。
- `startUserLeave` も、休職にした後に `StaffStatusChange.assignments` を返す。画面は、ダイアログを開いたときに読んだ一覧を出し、この値は使わない。
- `updateUser` は、チームを変えると、チームを対象にする権限のうち古いチームを指す対象を新しいチームに移す。画面は、返った `StaffDetail.policies` で権限の一覧を出し直す。
