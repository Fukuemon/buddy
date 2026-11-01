# staff-new API との対応

[職員の登録](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。  

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 名前 | 入れた名前 | `StaffCreateInput.username`（`staff.create` の引数） | `createUser` の本文の `username` |
| メールアドレス | 入れたメールアドレス | `StaffCreateInput.email` | `createUser` の本文の `email` |
| 電話番号 | 入れた電話番号。空なら送らない | `StaffCreateInput.phone_number` | `createUser` の本文の `phone_number` |
| 部署 | 選択肢 | `Department`（`departments.list` の戻り値） | `listDepartments` の `Unit` の `id`、`name` |
| 部署 | 選んだ部署 | `StaffCreateInput.department_id` | `createUser` の本文の `department_id` |
| チーム | 選択肢 | `Team`（`teams.list` の戻り値） | `listTeams` の `Unit` の `id`、`name` |
| チーム | 選んだチーム | `StaffCreateInput.team_id` | `createUser` の本文の `team_id` |
| 役職 | 選択肢 | `Position`（`positions.list` の戻り値） | `listPositions` の `Position` の `id`、`name` |
| 役職 | 選んだ役職 | `StaffCreateInput.position_id` | `createUser` の本文の `position_id` |
| 訪問 | 選んだ選択肢。「訪問する」なら true | `StaffCreateInput.visits` | `createUser` の本文の `visits`。省くと true |
| 登録 | 登録した職員 | `StaffDetail`（`staff.create` の戻り値） | `createUser` のレスポンスの `StaffDetail` |
| 登録の失敗の文 | 理由ごとの文 | `ApiError.status`、`ApiError.code` | レスポンスの status と `Error.code` |

## 操作

全ての書き込みの操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `listDepartments` | `GET /v1/facilities/{facility_id}/departments` | なし | 200。`Unit` の配列 | なし |
| `listTeams` | `GET /v1/facilities/{facility_id}/teams` | なし | 200。`Unit` の配列 | なし |
| `listPositions` | `GET /v1/facilities/{facility_id}/positions` | なし | 200。`Position` の配列。名前の順 | なし |
| `createUser` | `POST /v1/facilities/{facility_id}/users` | `username`、`email`、`phone_number`、`department_id`、`team_id`、`position_id`、`visits` | 201。`StaffDetail` | 400 `invalid_input`: 入力が誤っているか、部署、チーム、役職が無いかほかの事業所のもの。409 `conflict`: 同じメールの職員がいる |

- `createUser` は、ID ブローカーにも職員を登録する。ブローカーに登録した後に失敗したときは、同じ本文で送り直してよい。画面は、登録の失敗の後に登録を押し直すと、同じ本文で送る。
- 登録した職員には、役職のデフォルトの権限が付く。チームを対象にする権限は、`team_id` のチームを対象にする。
