# patient-new API との対応

[利用者の登録](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 名前 | 入れた名前 | `PatientInput.name` | `createPatient` の本文の `name` |
| サービス | 選択肢 | `ServiceCodeRecord`（`serviceCodes.list` の戻り値） | `listServiceCodes` の `ServiceCode` の `id`、`code`、`service_time_range_start`、`service_time_range_end` |
| サービス | 選んだサービス | `PatientInput.service_code_id` | `createPatient` の本文の `service_code_id` |
| 希望の時間帯 | 選んだ時間帯 | `PatientInput.preferred_time` | `createPatient` の本文の `preferred_time`（`午前`、`午後`） |
| 希望する担当の性別 | 選んだ性別 | `PatientInput.preferred_gender` | `createPatient` の本文の `preferred_gender`（`男性`、`女性`） |
| 担当の職員 | 選択肢 | `StaffRecord`（`staff.listRecords` の戻り値）のうち `status` が `active` で、`visits` が `true` の職員 | `listUsers` の `Staff` のうち `status` が `active` で、`visits` が `true` の職員 |
| 担当の職員 | 選んだ職員 | `PatientInput.assigned_staff_id` | `createPatient` の本文の `assigned_staff_id` |
| 登録 | 登録した利用者 | `PatientRecord`（`patients.create` の戻り値） | `createPatient` のレスポンスの `Patient` |
| 登録の失敗の文 | 理由ごとの文 | `ApiError.status`、`ApiError.code` | レスポンスの status と `Error.code` |

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 職員が、登録を送っている途中である | `createPatient` を呼ぶ mutation の `isPending` が `true`（`PatientCreateDialog` の `isSubmitting`） |
| 事業所のサービスコードを読み終えている | `serviceCodes.list` の結果（`ServiceCodeRecord[]`）がある。読めなかったときは `undefined` にする |
| 事業所の職員を読み終えている | `staff.listRecords` の結果から作った担当の職員の選択肢（`staffOptions`）がある。読めなかったときは `undefined` にする |

- 送っている間は、入力の欄に `disabled` を、キャンセルに押せない印を付ける。覆いと Escape キーでも閉じない。
  - 欄は `PatientFormFields.tsx`、ボタンと覆いは packages/ui の `InputDialog`、`DialogSubmit`、`Dialog` が決める。
- 登録のボタンは、2 つの選択肢を読み終えるまで押せない（`PatientCreateDialog.tsx` の `canSubmit`）。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 3 | 名前 | `patient-new-name` |
| 4 | サービス | `patient-new-service` |
| 5 | 希望の時間帯 | `patient-new-time` |
| 6 | 希望する担当の性別 | `patient-new-gender` |
| 7 | 担当の職員 | `patient-new-staff` |
| 8 | キャンセル | `patient-new-cancel` |
| 9 | 登録 | `patient-new-submit` |
| 10 | 入力の誤りの文 | `patient-new-error-{項目}` |
| 10 | 登録の失敗の文 | `patient-new-submit-error` |

- 入力の誤りの文の `{項目}` は、`name`、`service`、`time`、`gender`、`staff` のどれかである。
- ラジオボタンの選択肢は、`patient-new-time-morning`、`patient-new-time-afternoon`、`patient-new-gender-male`、`patient-new-gender-female` である。
- ダイアログの本体の `patient-new-dialog` は、構成要素の表に載せないので、この表に載せない。

## 操作

`createPatient` は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `listServiceCodes` | `GET /v1/visit_infos/service_codes` | なし | 200。`ServiceCode` の配列 | なし |
| `listUsers` | `GET /v1/facilities/{facility_id}/users` | なし | 200。`Staff` の配列 | なし |
| `createPatient` | `POST /v1/facilities/{facility_id}/patients` | `name`、`service_code_id`、`preferred_time`、`preferred_gender`、`assigned_staff_id` | 201。`Patient` | 400 `invalid_input`: 入力が誤っているか、サービスコードか担当の職員が無いか、担当に休職か退職の職員か、訪問しない職員を指した |

- 3 つの理由の 400 は、どれも `code` が `invalid_input` で、`message` だけが違う。
  - 名前の誤りは、送る前に画面が止める。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 入力 | 「サービスと職員を読み込めませんでした。閉じてから、開き直してください。」 | `listServiceCodes` か `listUsers` の失敗 |
| 登録の失敗 | 「選んだ担当の職員は、休職か退職になりました。別の職員を選んでください。」 | `createPatient` が 400 で、送った担当の職員を `listUsers` で読み直すと休職か退職 |
| 登録の失敗 | 「サービスか担当の職員が見つかりません。開き直してから、選び直してください。」 | `createPatient` が 400 で、読み直した担当の職員が有効か、見つからないか、読み直せない |
| 登録の失敗 | 「この操作をする権限がありません。」 | `createPatient` が 403 |
| 登録の失敗 | 「登録できませんでした。時間をおいて、もう一度登録してください。」 | `createPatient` が 400 と 403 のほかの失敗、API に届かない |

- 文を選ぶ処理は `apps/web/src/features/patient/lib/errorMessage.ts` の `patientSubmitErrorMessage` にある。
- 担当の職員を読み直す処理は `apps/web/src/features/patient/queries.ts` の `useIsStaffStopped` にある。
