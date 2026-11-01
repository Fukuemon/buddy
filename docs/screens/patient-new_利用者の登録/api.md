# patient-new API との対応

[利用者の登録](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 名前 | 入れた名前 | `PatientInput.name` | `createPatient` の本文の `name` |
| サービス | 選択肢 | `ServiceCodeRecord`（`serviceCodes.list` の戻り値） | `listServiceCodes` の `ServiceCode` の `id`、`code`、`service_time_range_start`、`service_time_range_end` |
| サービス | 選んだサービス | `PatientInput.service_code_id` | `createPatient` の本文の `service_code_id` |
| 希望の時間帯 | 選んだ時間帯 | `PatientInput.preferred_time` | `createPatient` の本文の `preferred_time`（`午前`、`午後`） |
| 希望する担当の性別 | 選んだ性別 | `PatientInput.preferred_gender` | `createPatient` の本文の `preferred_gender`（`男性`、`女性`） |
| 担当の職員 | 選択肢 | `StaffRecord`（`staff.listRecords` の戻り値）のうち `status` が `active` の職員 | `listUsers` の `Staff` のうち `status` が `active` の職員 |
| 担当の職員 | 選んだ職員 | `PatientInput.assigned_staff_id` | `createPatient` の本文の `assigned_staff_id` |
| 登録 | 登録した利用者 | `PatientRecord`（`patients.create` の戻り値） | `createPatient` のレスポンスの `Patient` |
| 登録の失敗の文 | 理由ごとの文 | `ApiError.status`、`ApiError.code` | レスポンスの status と `Error.code` |

## 操作

`createPatient` は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `listServiceCodes` | `GET /v1/visit_infos/service_codes` | なし | 200。`ServiceCode` の配列 | なし |
| `listUsers` | `GET /v1/facilities/{facility_id}/users` | なし | 200。`Staff` の配列 | なし |
| `createPatient` | `POST /v1/facilities/{facility_id}/patients` | `name`、`service_code_id`、`preferred_time`、`preferred_gender`、`assigned_staff_id` | 201。`Patient` | 400 `invalid_input`: 入力が誤っているか、サービスコードか担当の職員が無いか、担当に休職か退職の職員を指した |

- 3 つの理由の 400 は、どれも `code` が `invalid_input` で、`message` だけが違う。画面は、送った担当の職員を `listUsers` で読み直し、休職か退職なら担当の職員の文を、そうでなければサービスか担当の職員の文を出す。名前の誤りは、送る前に画面が止める。
