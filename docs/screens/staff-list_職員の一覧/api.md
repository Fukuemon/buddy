# staff-list API との対応

[職員の一覧](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。  

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」「要確認」「連携」と、見出し「職員」のまとまりを出すか | `Viewer.canManageStaff` | `getMe` の `policies[].code` に `staff.manage` があるか |
| アカウント | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 部署、チーム、役職の絞り込み | 選択肢 | `Department`、`Team`、`Position`（`departments.list`、`teams.list`、`positions.list` の戻り値） | `listDepartments`、`listTeams`、`listPositions` の `name` |
| 職員の一覧 | 職員の並び | `StaffRecord[]`（`staff.listRecords` の戻り値） | `listUsers`（`sort_field=username`、`sort_order=asc`） |
| 職員の行 | 名前 | `StaffRecord.username` | `Staff.username` |
| 職員の行 | メールアドレス | `StaffRecord.email` | `Staff.email`。退職の職員では空 |
| 職員の行 | 部署、チーム、役職の名前 | `StaffRecord.department.name`、`team.name`、`position.name` | `Staff.department.name`、`Staff.team.name`、`Staff.position.name` |
| 職員の行 | 詳細の URL の職員 | `StaffRecord.id` | `Staff.id` |
| 名前の検索、部署、チーム、役職の絞り込み | 絞り込んだ職員 | 画面で絞り込む | `listUsers` が返した全ての職員の `username`、`department.id`、`team.id`、`position.id` |
| 状態の絞り込み、状態の印 | 有効、休職、退職 | `StaffRecord.status` | `Staff.status`（`active`、`on_leave`、`retired`） |
| 状態の印 | 戻る予定の日 | `StaffRecord.leave_return_date` | `Staff.leave_return_date` |
| 状態の印 | 退職にした日 | `StaffRecord.retired_at` | `Staff.retired_at` の日付（事業所の現地の日付） |
| 読み込みの失敗の文 | 読めなかったか | `ApiError` | `listUsers` のエラー |

## 操作

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getMe` | `GET /v1/me` | なし | 200。`StaffDetail` | なし |
| `listUsers` | `GET /v1/facilities/{facility_id}/users` | `sort_field`、`sort_order` | 200。`Staff` の配列。休職と退職の職員を含む | 403 `forbidden`: ほかの事業所 |
| `listDepartments` | `GET /v1/facilities/{facility_id}/departments` | なし | 200。部署の配列 | 403 `forbidden`: ほかの事業所 |
| `listTeams` | `GET /v1/facilities/{facility_id}/teams` | なし | 200。チームの配列 | 403 `forbidden`: ほかの事業所 |
| `listPositions` | `GET /v1/facilities/{facility_id}/positions` | なし | 200。`Position` の配列 | 403 `forbidden`: ほかの事業所 |

- `listUsers` は、職員の管理の権限を持たない職員も呼べる。この画面を職員の管理の権限を持つ職員に限るのは、画面の判定である。
- `listUsers` の `username`、`department`、`team`、`position` の絞り込みは使わない。状態の絞り込みが API に無く、名前の一部での検索もできないため、全ての職員を読んで画面で絞り込む。
