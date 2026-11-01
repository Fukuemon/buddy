# organization-list API との対応

[部署とチーム](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。  
画面は未実装なので、web の型の項目のうち、今の型に無いものは「足す」と書く。  
部署の作成と名前の変更の API は無いので、[足す操作](#足す操作) に、足す API を書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」「要確認」「連携」と、見出し「職員」のまとまりを出すか | `Viewer.canManageStaff` | `getMe` の `policies[].code` に `staff.manage` があるか |
| アカウント | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 部署の一覧 | 部署の並び | 足す | `listDepartments`（名前の順） |
| 部署の行 | 部署の名前 | 足す | `Unit.name` |
| 編集 | 編集する部署 | 足す | `Unit.id` |
| チームの一覧 | チームの並び | 足す | `listTeams`（名前の順） |
| チーム | チームの名前 | 足す | `Team.name` |
| チーム | 点の色 | 足す | `Team.color`（`TeamColor`）。`team-` を前に付けたトークンで塗る |
| 編集 | 編集するチーム | 足す | `Team.id` |
| 名前 | 部署の名前 | 足す | 作成は `createDepartment` の `name`、編集は `updateDepartment` の `name`（どちらも足す） |
| 名前 | チームの名前 | 足す | 作成は `createTeam` の `name`、編集は `updateTeam` の `name` |
| 色 | 選んだ色 | 足す | 作成は `createTeam` の `color`、編集は `updateTeam` の `color` |
| 色 | 作成の初期値 | 画面で決める | `listTeams` が返した全てのチームの `color` |
| 保存の失敗の文 | 失敗の理由 | `ApiError` | 409 `conflict`、404 `not_found`、403 `forbidden` |
| 読み込みの失敗の文 | 読めなかったか | `ApiError` | `listDepartments`、`listTeams` のエラー |

## 操作

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getMe` | `GET /v1/me` | なし | 200。`StaffDetail` | なし |
| `listDepartments` | `GET /v1/facilities/{facility_id}/departments` | なし | 200。`Unit` の配列。名前の順 | 403 `forbidden`: ほかの事業所 |
| `listTeams` | `GET /v1/facilities/{facility_id}/teams` | なし | 200。`Team` の配列。名前の順 | 403 `forbidden`: ほかの事業所 |
| `createTeam` | `POST /v1/facilities/{facility_id}/teams` | `name`、`color` | 201。`Team` | 400 `invalid_input`: 名前が空か 255 文字を超える。403 `forbidden`: 職員の管理の権限が無いか、ほかの事業所。409 `conflict`: 同じ名前のチームがある |
| `updateTeam` | `PUT /v1/teams/{team_id}` | `name`、`color` | 200。`Team` | 400 `invalid_input`: 名前が空か 255 文字を超える。403 `forbidden`: 職員の管理の権限が無いか、ほかの事業所。404 `not_found`: チームが無い。409 `conflict`: ほかの同じ名前のチームがある |

- 画面は、`createTeam` の `color` を省かず、[色の初期値](index.md#色の初期値) で選んだ色か、職員が選び直した色を送る。
- `updateTeam` は部分の更新を持たないので、名前だけを変えるときも今の色を送る。

## 足す操作

部署の作成と名前の変更を、予定の API に足す。  
形は、チームの作成と変更（`createTeam`、`updateTeam`）にそろえる。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `createDepartment` | `POST /v1/facilities/{facility_id}/departments` | `name`（1〜255 文字） | 201。`Unit` | 400 `invalid_input`: 名前が空か 255 文字を超える。403 `forbidden`: 職員の管理の権限（`staff.manage`）が無いか、ほかの事業所。409 `conflict`: 同じ事業所に同じ名前の部署がある |
| `updateDepartment` | `PUT /v1/departments/{department_id}` | `name`（1〜255 文字） | 200。`Unit` | 400 `invalid_input`: 名前が空か 255 文字を超える。403 `forbidden`: 職員の管理の権限が無いか、ほかの事業所。404 `not_found`: 部署が無い。409 `conflict`: 同じ事業所にほかの同じ名前の部署がある |

- どちらも、職員の管理の権限（`staff.manage`）を持つ職員だけが呼べる。
- 事業所の中で部署の名前を重ねない制約は、`departments` のテーブルにある（`departments_facility_name_key`）。409 は、この制約の違反から返す。
