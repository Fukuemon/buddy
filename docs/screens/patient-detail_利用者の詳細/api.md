# patient-detail API との対応

[利用者の詳細](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。  
画面は未実装なので、web の型の項目のうち、今の型に無いものは「足す」と書く。  
`getPatient` と `getPatientRemainingSchedules` は予定の API に無く、#353 で足す。名前と形は、#353 をマージした後に照合する。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 利用者の名前 | 名前 | `Patient.name` | `getPatient` の `Patient.name` |
| 状態の印、利用の状態 | 利用の終了か（出すか） | `Patient.ended` | `Patient.ended_at` が `null` でないか |
| 状態の印 | 利用の終了にした日 | 足す | `Patient.ended_at` の日付（事業所の現地の日付） |
| プロフィール | サービス | 足す | `Patient.service_code` と、`listServiceCodes` の `ServiceCode` のうち `id` が `Patient.service_code_id` のものの時間の範囲 |
| プロフィール | 希望の時間帯、希望する担当の性別 | 足す | `Patient.preferred_time`、`Patient.preferred_gender` |
| プロフィール | 担当の職員の名前 | 足す | `Patient.assigned_staff_name` |
| プロフィール、担当の職員の選択、今の担当の職員の注意 | 担当の職員が休職か退職か | `Staff.status`（`staff.list` の戻り値） | `Patient.assigned_staff_id` を `listUsers` の `Staff.id` に引き当てた `Staff.status` |
| 名前の入力、サービスの選択、希望の時間帯の選択、希望する担当の性別の選択、担当の職員の選択 | 送る値 | 足す | `updatePatient` の本文の `name`、`service_code_id`、`preferred_time`、`preferred_gender`、`assigned_staff_id` |
| サービスの選択 | 選択肢 | 足す | `listServiceCodes` の `ServiceCode` |
| 担当の職員の選択、再開の担当の職員 | 選択肢 | `Staff`（`staff.list` の戻り値） | `listUsers` の `Staff` のうち `status` が `active` の職員 |
| 残る予定の一覧 | 残る予定と繰り返しの予定 | 足す | `getPatientRemainingSchedules` の `PatientSchedules`。拒まれたときは `endPatientService` の 409 の `EndServiceConflict.schedules` |
| 残る予定 | 日付と時間 | 足す | `PatientSchedules.schedules[]` の `id`、`date`、`start_time`、`end_time` |
| 残る繰り返しの予定 | 最初の回の日付、終了日、時間 | 足す | `PatientSchedules.recurring_schedules[]` の `date`、`end_date`、`start_time`、`end_time` |
| ダイアログの利用を再開する | 送る担当の職員 | 足す | `resumePatientService` の本文の `assigned_staff_id` |
| 読み込みの失敗の文 | 見つからないか | `ApiError.status` | `getPatient` の 404 |

## 操作

`getPatientRemainingSchedules` と全ての書き込みの操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getPatient`（#353 で足す） | `GET /v1/patients/{patient_id}` | なし | 200。`Patient`。利用の終了の利用者も返す | 404 `not_found` |
| `getPatientRemainingSchedules`（#353 で足す） | `GET /v1/patients/{patient_id}/remaining_schedules` | なし | 200。`PatientSchedules` | 404 `not_found` |
| `updatePatient` | `PUT /v1/patients/{patient_id}` | `name`、`service_code_id`、`preferred_time`、`preferred_gender`、`assigned_staff_id` | 200。`Patient` | 400 `invalid_input`: 入力が誤っているか、担当を休職か退職の職員か、訪問しない職員に変えた。404 `not_found` |
| `endPatientService` | `POST /v1/patients/{patient_id}/end_service` | なし | 200。`Patient` | 409 `patient_has_schedules`: 予定か繰り返しの予定が残る。`schedules` に一覧がある |
| `resumePatientService` | `POST /v1/patients/{patient_id}/resume_service` | `assigned_staff_id` | 200。`Patient` | 400 `invalid_input`: 担当に休職か退職の職員か、訪問しない職員を指した |
| `listServiceCodes`、`listUsers` | [利用者の登録の API との対応](../patient-new_利用者の登録/api.md) と同じ | | | |

- `getPatientRemainingSchedules` は、利用の終了のダイアログを開いたときに呼ぶ。レスポンスは、`endPatientService` の 409 が返す `PatientSchedules` と同じ形で、事業所の現地の日付で今日以降のものを返す。
- `updatePatient` は部分の更新を持たないので、画面は変えない項目も今の値で送る。担当の職員を変えなければ、今の担当が休職か退職でも拒まれない。
- `resumePatientService` は、利用中の利用者に送っても成功し、担当を書き換える。画面は、利用の終了の利用者のときだけ利用を再開するを出す。
