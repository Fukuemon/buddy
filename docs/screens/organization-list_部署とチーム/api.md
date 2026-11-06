# organization-list API との対応

[部署とチーム](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」「要確認」「連携」と、見出し「職員」のまとまりを出すか | `Viewer.policyCodes` に `staff.manage` があるか（`hasPermission`） | `getMe` の `policies[].code` に `staff.manage` があるか |
| アカウント | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 部署の一覧 | 部署の並び | `Department[]` | `listDepartments`（名前の順） |
| 部署の行 | 部署の名前 | `Department.name` | `Unit.name` |
| 編集 | 編集する部署 | `Department.id` | `Unit.id` |
| チームの一覧 | チームの並び | `Team[]` | `listTeams`（名前の順） |
| チーム | チームの名前 | `Team.name` | `Team.name` |
| チーム | 点の色 | `Team.color` | `Team.color`（`TeamColor`）。`team-` を前に付けたトークンで塗る |
| 編集 | 編集するチーム | `Team.id` | `Team.id` |
| 名前 | 部署の名前 | `BuddyApi.departments.create` と `update` の `name` | 作成は `createDepartment` の `name`、編集は `updateDepartment` の `name` |
| 名前 | チームの名前 | `TeamInput.name` | 作成は `createTeam` の `name`、編集は `updateTeam` の `name` |
| 色 | 選んだ色 | `TeamInput.color` | 作成は `createTeam` の `color`、編集は `updateTeam` の `color` |
| 色 | 作成の初期値 | 画面で決める | `listTeams` が返した全てのチームの `color` |
| 保存の失敗の文 | 失敗の理由 | `ApiError` | 409 `conflict`、404 `not_found`、403 `forbidden` |
| 読み込みの失敗の文 | 読めなかったか | `ApiError` | `listDepartments`、`listTeams` のエラー |

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 事業所に、部署がある | `departments.list` の結果（`Department[]`）が空でない |
| 事業所に、チームがある | `teams.list` の結果（`Team[]`）が空でない |
| 職員が、作るか保存を送っている途中である | 作成か編集を送る mutation の `isPending` が `true`（`OrganizationUnitDialog` の `isSubmitting`） |

- 一覧と、無いことの文の出し分けは、`OrganizationListView.tsx` の `rows.length === 0` にある。
- 送っている間は、名前と色の欄に `disabled` を、閉じるとキャンセルに押せない印を付ける。覆いと Escape キーでも閉じない。
  - 欄は `OrganizationUnitDialog.tsx`、ボタンと覆いは packages/ui の `InputDialog`、`DialogSubmit`、`Dialog` が決める。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 5 | ヘルプ | `organization-list-help` |
| 7 | 部署を作る | `organization-list-department-new` |
| 8 | 部署の一覧 | `organization-list-department-table` |
| 8 | 部署が無いことの文 | `organization-list-department-empty` |
| 9 | 部署の行 | `organization-list-department-row-{部署の id}` |
| 10 | 編集 | `organization-list-department-edit-{部署の id}` |
| 12 | チームを作る | `organization-list-team-new` |
| 10 | チームを作る | `organization-list-team-new` |
| 13 | チームの一覧 | `organization-list-team-table` |
| 11 | チームが無いことの文 | `organization-list-team-empty` |
| 14 | チームの行 | `organization-list-team-row-{チームの id}` |
| 15 | チーム | `organization-list-team-name-{チームの id}` |
| 16 | 編集 | `organization-list-team-edit-{チームの id}` |
| 3 | 閉じる | `organization-list-department-close` |
| 3 | 閉じる | `organization-list-team-close` |
| 4 | 名前 | `organization-list-department-name` |
| 4 | 名前 | `organization-list-team-name` |
| 5 | 色 | `organization-list-team-color` |
| 5 | キャンセル | `organization-list-department-cancel` |
| 6 | キャンセル | `organization-list-team-cancel` |
| 6 | 作る、保存 | `organization-list-department-submit` |
| 7 | 作る、保存 | `organization-list-team-submit` |
| 8 | 入力の誤りの文 | `organization-list-team-error-name` |
| 8 | 保存の失敗の文 | `organization-list-team-submit-error` |
| 6 | 読み込み中の表示 | `organization-list-loading` |
| 6 | 読み込みの失敗の文 | `organization-list-error` |
| 7 | 読み直す | `organization-list-retry` |
| 6 | 予定のカレンダーへ | `page-forbidden-back` |
| 17 | メニュー | `site-nav-toggle` |
| 12 | メニュー | `site-nav-toggle` |
| 7 | メニュー | `site-nav-toggle` |
| 8 | メニュー | `site-nav-toggle` |

- 部署のダイアログとチームのダイアログは、testid の始まりだけが違うので、行を分ける。入力の誤りの文と保存の失敗の文は、部署のダイアログでは `organization-list-department-error-name` と `organization-list-department-submit-error` になる。モックはチームのダイアログだけを描く。
- 色の選択肢は `organization-list-team-color-{色}` である。
- ダイアログの本体の `organization-list-{department|team}-dialog` と、権限が無いことの入れ物の `page-forbidden` は、構成要素の表に載せないので、この表に載せない。

## 操作

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getMe` | `GET /v1/me` | なし | 200。`StaffDetail` | なし |
| `listDepartments` | `GET /v1/facilities/{facility_id}/departments` | なし | 200。`Unit` の配列。名前の順 | 403 `forbidden`: ほかの事業所 |
| `createDepartment` | `POST /v1/facilities/{facility_id}/departments` | `name` | 201。`Unit` | 400 `invalid_input`: 名前が空か 255 文字を超える。403 `forbidden`: 職員の管理の権限が無いか、ほかの事業所。409 `conflict`: 同じ名前の部署がある |
| `updateDepartment` | `PUT /v1/departments/{department_id}` | `name` | 200。`Unit` | 400 `invalid_input`: 名前が空か 255 文字を超える。403 `forbidden`: 職員の管理の権限が無いか、ほかの事業所。404 `not_found`: 部署が無い。409 `conflict`: ほかの同じ名前の部署がある |
| `listTeams` | `GET /v1/facilities/{facility_id}/teams` | なし | 200。`Team` の配列。名前の順 | 403 `forbidden`: ほかの事業所 |
| `createTeam` | `POST /v1/facilities/{facility_id}/teams` | `name`、`color` | 201。`Team` | 400 `invalid_input`: 名前が空か 255 文字を超える。403 `forbidden`: 職員の管理の権限が無いか、ほかの事業所。409 `conflict`: 同じ名前のチームがある |
| `updateTeam` | `PUT /v1/teams/{team_id}` | `name`、`color` | 200。`Team` | 400 `invalid_input`: 名前が空か 255 文字を超える。403 `forbidden`: 職員の管理の権限が無いか、ほかの事業所。404 `not_found`: チームが無い。409 `conflict`: ほかの同じ名前のチームがある |

- 画面は、`createTeam` の `color` を省かず、読んだチームの色から [色](index.md#色) の作成の初期値の規則で決めた色か、職員が選び直した色を送る。
- `updateTeam` は部分の更新を持たないので、名前だけを変えるときも今の色を送る。
- 部署の名前の重なりは、`departments` のテーブルの一意の制約（`departments_facility_name_key`）で判定し、`createDepartment` と `updateDepartment` が 409 を返す。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込みの失敗 | 「部署とチームを読み込めませんでした。時間をおいて、読み直してください。」 | `listDepartments` か `listTeams` の失敗 |
| 保存の失敗 | 「「東チーム」という名前のチームは、すでにあります。別の名前にしてください。」 | `createTeam`、`updateTeam` が 409 |
| 保存の失敗 | 「「看護部」という名前の部署は、すでにあります。別の名前にしてください。」 | `createDepartment`、`updateDepartment` が 409 |
| 保存の失敗 | 「この部署が見つかりません。閉じてから、開き直してください。」か、「この部署」を「このチーム」にした文 | `updateDepartment`、`updateTeam` が 404 |
| 保存の失敗 | 「この操作をする権限がありません。」 | 4 つの書き込みの操作が 403 |
| 保存の失敗 | 「保存できませんでした。時間をおいて、もう一度保存してください。」 | 409、404、403 のほかの失敗、API に届かない |

- 文を選ぶ処理は `apps/web/src/features/organization/lib/errorMessage.ts` の `submitErrorMessage` にある。
