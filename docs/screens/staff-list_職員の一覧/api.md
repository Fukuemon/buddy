# staff-list API との対応

[職員の一覧](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。  
画面は未実装なので、web の型の項目のうち、今の型に無いものは「足す」と書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」「要確認」「連携」と、見出し「職員」のまとまりを出すか | `Viewer.canManageStaff` | `getMe` の `policies[].code` に `staff.manage` があるか |
| アカウント | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 職員の一覧 | 職員の並び | `Staff[]`（`staff.list` の戻り値） | `listUsers`（`sort_field=username`、`sort_order=asc`） |
| 職員の一覧 | 部署、チーム、役職の名前 | 足す | `Staff.department.name`、`Staff.team.name`、`Staff.position.name` |
| 職員の名前 | 名前 | `Staff.name` | `Staff.username` |
| 職員の名前 | 詳細の URL の職員 | `Staff.id` | `Staff.id` |
| 状態の印 | 有効、休職、退職 | `Staff.status` | `Staff.status`（`active`、`on_leave`、`retired`） |
| 状態の印 | 戻る予定の日 | 足す | `Staff.leave_return_date` |
| 状態の印 | 退職にした日 | 足す | `Staff.retired_at` の日付（事業所の現地の日付） |
| 読み込みの失敗の文 | 読めなかったか | `ApiError` | `listUsers` のエラー |

## 操作

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getMe` | `GET /v1/me` | なし | 200。`StaffDetail` | なし |
| `listUsers` | `GET /v1/facilities/{facility_id}/users` | `sort_field`、`sort_order` | 200。`Staff` の配列。休職と退職の職員を含む | 403 `forbidden`: ほかの事業所 |

- `listUsers` は、職員の管理の権限を持たない職員も呼べる。この画面を職員の管理の権限を持つ職員に限るのは、画面の判定である。
