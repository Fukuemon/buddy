# staff-new API との対応

[職員の登録](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。

## 値の対応

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

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 職員が、登録を送っている途中である | `createUser` を呼ぶ mutation の `isPending` が `true`（`StaffCreateDialog` の `isSubmitting`） |
| 事業所の部署を読み終えている | `departments.list` の結果（`Department[]`）がある。読めなかったときは `undefined` にする |
| 事業所のチームを読み終えている | `teams.list` の結果（`Team[]`）がある。読めなかったときは `undefined` にする |
| 事業所の役職を読み終えている | `positions.list` の結果（`Position[]`）がある。読めなかったときは `undefined` にする |

- 送っている間は、入力の欄に `disabled` を、閉じるとキャンセルに押せない印を付ける。覆いと Escape キーでも閉じない。訪問の選択は、送っている間も押せる。
  - 欄は `StaffCreateDialog.tsx`、ボタンと覆いは packages/ui の `InputDialog`、`DialogSubmit`、`Dialog` が決める。
- 登録のボタンは、3 つの選択肢を読み終えるまで押せない（`StaffCreateDialog.tsx` の `canSubmit`）。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 3 | ヘルプ | `staff-new-help` |
| 4 | 閉じる | `staff-new-close` |
| 5 | 名前 | `staff-new-name` |
| 6 | メールアドレス | `staff-new-email` |
| 7 | 電話番号 | `staff-new-phone` |
| 8 | 部署 | `staff-new-department` |
| 9 | チーム | `staff-new-team` |
| 10 | 役職 | `staff-new-position` |
| 11 | 訪問 | `staff-new-visits` |
| 12 | キャンセル | `staff-new-cancel` |
| 13 | 登録 | `staff-new-submit` |
| 14 | 入力の誤りの文 | `staff-new-error-{項目}` |
| 14 | 登録の失敗の文 | `staff-new-submit-error` |

- 入力の誤りの文の `{項目}` は、`name`、`email`、`phone` のどれかである。
- ヘルプの説明の `staff-new-help-text` と、ダイアログの本体の `staff-new-dialog` は、構成要素の表に載せないので、この表に載せない。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 登録の失敗 | 「このメールアドレスの職員は、すでに登録されています。」 | `createUser` が 409 |
| 登録の失敗 | 「部署、チーム、役職のどれかが見つかりません。開き直してから、選び直してください。」 | `createUser` が 400 |
| 登録の失敗 | 「この操作をする権限がありません。」 | `createUser` が 403 |
| 登録の失敗 | 「登録できませんでした。時間をおいて、もう一度登録してください。」 | `createUser` が 400、403、409 のほかの失敗、API に届かない |
| 入力 | 「部署、チーム、役職を読み込めませんでした。閉じてから、開き直してください。」 | `listDepartments`、`listTeams`、`listPositions` のどれかの失敗 |

- 文を選ぶ処理は `apps/web/src/features/staff/lib/errorMessage.ts` の `staffSubmitErrorMessage` と `OPTIONS_LOAD_ERROR_MESSAGE` にある。
- `createUser` の 400 は、部署、チーム、役職が無いときのほかに入力の誤りでも返るが、web は 400 を全て部署、チーム、役職の文にする。
  - 入力の誤りは、送る前に画面が入力の誤りの文で止める。

## 操作

全ての書き込みの操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `listDepartments` | `GET /v1/facilities/{facility_id}/departments` | なし | 200。`Unit` の配列 | なし |
| `listTeams` | `GET /v1/facilities/{facility_id}/teams` | なし | 200。`Unit` の配列 | なし |
| `listPositions` | `GET /v1/facilities/{facility_id}/positions` | なし | 200。`Position` の配列。名前の順 | なし |
| `createUser` | `POST /v1/facilities/{facility_id}/users` | `username`、`email`、`phone_number`、`department_id`、`team_id`、`position_id`、`visits` | 201。`StaffDetail` | 400 `invalid_input`: 入力が誤っているか、部署、チーム、役職が無いかほかの事業所のもの。409 `conflict`: 同じメールの職員がいる |

- `createUser` は、ID ブローカーにも職員を登録する。
  - ブローカーに登録した後に失敗したときは、同じ本文で送り直してよい。
  - 画面は、登録の失敗の後に登録を押し直すと、同じ本文で送る。
- 登録した職員には、役職のデフォルトの権限が付く。
  - チームを対象にする権限は、`team_id` のチームを対象にする。
