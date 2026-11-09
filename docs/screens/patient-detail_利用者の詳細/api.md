# patient-detail API との対応

[利用者の詳細](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 利用者の名前 | 名前 | `PatientRecord.name`（`patients.get` の戻り値） | `getPatient` の `Patient.name` |
| 状態の印、利用の状態 | 利用の終了か（出すか） | `PatientRecord.ended_at` が `null` でないか | `Patient.ended_at` が `null` でないか |
| 状態の印 | 利用の終了にした日 | `PatientRecord.ended_at` | `Patient.ended_at` の日付（事業所の現地の日付） |
| プロフィール | サービス | `PatientRecord.service_code` と、`ServiceCodeRecord`（`serviceCodes.list` の戻り値）の時間の範囲 | `Patient.service_code` と、`listServiceCodes` の `ServiceCode` のうち `id` が `Patient.service_code_id` のものの時間の範囲 |
| プロフィール | 希望の時間帯、希望する担当の性別 | `PatientRecord.preferred_time`、`PatientRecord.preferred_gender` | `Patient.preferred_time`、`Patient.preferred_gender` |
| プロフィール | 担当の職員の名前 | `PatientRecord.assigned_staff_name` | `Patient.assigned_staff_name` |
| プロフィール、担当の職員の選択、今の担当の職員の注意 | 担当の職員が休職か退職か | `StaffRecord.status`（`staff.listRecords` の戻り値） | `Patient.assigned_staff_id` を `listUsers` の `Staff.id` に引き当てた `Staff.status` |
| 名前の入力、サービスの選択、希望の時間帯の選択、希望する担当の性別の選択、担当の職員の選択 | 送る値 | `PatientInput`（`patients.update` の引数） | `updatePatient` の本文の `name`、`service_code_id`、`preferred_time`、`preferred_gender`、`assigned_staff_id` |
| サービスの選択 | 選択肢 | `ServiceCodeRecord`（`serviceCodes.list` の戻り値） | `listServiceCodes` の `ServiceCode` |
| 担当の職員の選択、再開の担当の職員 | 選択肢 | `StaffRecord`（`staff.listRecords` の戻り値）のうち `status` が `active` で、`visits` が `true` の職員 | `listUsers` の `Staff` のうち `status` が `active` で、`visits` が `true` の職員 |
| 残る予定の一覧 | 残る予定と繰り返しの予定 | `PatientSchedules`（`patients.remainingSchedules` の戻り値か、`patients.endService` が拒まれたときの `schedules`） | `getPatientRemainingSchedules` の `PatientSchedules`。拒まれたときは `endPatientService` の 409 の `EndServiceConflict.schedules` |
| 残る予定 | 日付と時間 | `PatientSchedules.schedules[]` | `PatientSchedules.schedules[]` の `id`、`date`、`start_time`、`end_time`、`ends_next_day` |
| 残る繰り返しの予定 | 最初の回の日付、終了日、時間 | `PatientSchedules.recurring_schedules[]` | `PatientSchedules.recurring_schedules[]` の `date`、`end_date`、`start_time`、`end_time`、`ends_next_day` |
| ダイアログの利用を再開する | 送る担当の職員 | `patients.resumeService` の引数の `assignedStaffId` | `resumePatientService` の本文の `assigned_staff_id` |
| 読み込みの失敗の文 | 見つからないか | `ApiError.status` | `getPatient` の 404 |

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 職員が、保存を送っている途中である | `updatePatient` を呼ぶ mutation の `isPending` が `true`（`PatientEditDialog` の `isSubmitting`） |
| 職員が、利用の終了を送っている途中である | `endPatientService` を呼ぶ mutation の `isPending` が `true`（`PatientEndDialog` の `isSubmitting`） |
| 職員が、利用の再開を送っている途中である | `resumePatientService` を呼ぶ mutation の `isPending` が `true`（`PatientResumeDialog` の `isSubmitting`） |
| 職員が、ダイアログの確定を送っている途中である | 開いているダイアログの `isSubmitting` が `true`。上の 3 つのどれか |
| 事業所のサービスコードを読み終えている | `serviceCodes.list` の結果（`ServiceCodeRecord[]`）がある。読めなかったときは `undefined` にする |
| 事業所の職員を読み終えている | `staff.listRecords` の結果から作った担当の職員の選択肢（`staffOptions`）がある。読めなかったときは `undefined` にする |
| 開いた利用者の残る予定を、読み終えている | `patients.remainingSchedules` の結果（`PatientSchedules`）がある |
| 開いた利用者に、残る単発の予定がある | `PatientSchedules.schedules` が空でない |
| 開いた利用者に、残る繰り返しの予定がある | `PatientSchedules.recurring_schedules` が空でない |
| 開いた利用者の今の担当の職員が、休職の職員である | `PatientRecord.assigned_staff_id` で引いた `StaffRecord.status` が `on_leave` |
| 開いた利用者の今の担当の職員が、退職した職員である | `PatientRecord.assigned_staff_id` で引いた `StaffRecord.status` が `retired` |
| 開いた利用者の今の担当の職員が、訪問しない職員である | `PatientRecord.assigned_staff_id` で引いた `StaffRecord.visits` が `false` |
| 職員が、再開の担当の職員を選んでいる | `PatientResumeDialog` の選んだ職員の id が空の文字列でない |
| 再開の担当の職員の欄が、空である | `PatientResumeDialog` の選んだ職員の id が空の文字列 |
| 開いた利用者が、見つからなかった利用者である | `getPatient` の `ApiError.status` が 404（`PatientDetailContainer` の `canRetry` が `false`） |

- 送っている間は、ダイアログの入力の欄に `disabled` を、キャンセルに押せない印を付ける。覆いと Escape キーでも閉じない。
  - 欄は `PatientFormFields.tsx` と `PatientResumeDialog.tsx` が決める。
  - ボタンと覆いは packages/ui の `InputDialog`、`ConfirmDialog`、`DialogSubmit`、`Dialog` が決める。
- 保存は、2 つの選択肢を読み終えるまで押せない（`PatientEditDialog.tsx` の `canSubmit`）。
- ダイアログの利用を終了するの判定は、`PatientEndDialog.tsx` の `canSubmit` と、`lib/format.ts` の `hasNoSchedules` にある。
- 今の担当の職員の注意の文は、`PatientResumeDialog.tsx` の `currentStaffNote` が選ぶ。職員の一覧を読み終えるまでは出さない。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 4 | 利用者の一覧へ | `patient-detail-back` |
| 5 | 利用者の名前 | `patient-detail-name` |
| 6 | 状態の印 | `patient-detail-status` |
| 6 | 編集 | `patient-detail-edit` |
| 7 | 編集 | `patient-detail-edit` |
| 7 | ほかの操作 | `patient-detail-menu` |
| 8 | ほかの操作 | `patient-detail-menu` |
| 8 | プロフィール | `patient-detail-profile` |
| 9 | プロフィール | `patient-detail-profile` |
| 9 | 利用を終了する | `patient-detail-end` |
| 10 | 利用の状態 | `patient-detail-status-text` |
| 11 | 利用を再開する | `patient-detail-resume` |
| 2 | 利用者の編集のダイアログ | `patient-detail-edit-dialog` |
| 3 | 名前の入力 | `patient-detail-name-input` |
| 4 | サービスの選択 | `patient-detail-service-input` |
| 5 | 希望の時間帯の選択 | `patient-detail-time-input` |
| 6 | 希望する担当の性別の選択 | `patient-detail-gender-input` |
| 7 | 担当の職員の選択 | `patient-detail-staff-input` |
| 9 | キャンセル | `patient-detail-edit-cancel` |
| 10 | 保存 | `patient-detail-save` |
| 2 | 利用の終了のダイアログ | `patient-end-dialog` |
| 4 | 残る予定の一覧 | `patient-end-schedules` |
| 5 | 残る予定 | `patient-end-schedule-{予定の id}` |
| 6 | 残る繰り返しの予定 | `patient-end-recurring-{繰り返しの予定の id}` |
| 5 | キャンセル | `patient-end-cancel` |
| 7 | キャンセル | `patient-end-cancel` |
| 6 | ダイアログの利用を終了する | `patient-end-submit` |
| 8 | ダイアログの利用を終了する | `patient-end-submit` |
| 2 | 利用の再開のダイアログ | `patient-resume-dialog` |
| 4 | 再開の担当の職員 | `patient-resume-staff` |
| 5 | 今の担当の職員の注意 | `patient-resume-staff-note` |
| 6 | キャンセル | `patient-resume-cancel` |
| 7 | ダイアログの利用を再開する | `patient-resume-submit` |
| 8 | ダイアログの利用を再開するの条件の文 | `patient-resume-submit-hint` |
| 5 | 読み込み中の表示 | `patient-detail-loading` |
| 5 | 読み込みの失敗の文 | `patient-detail-error` |
| 6 | 読み直す | `patient-detail-retry` |
| 9 | メニュー | `site-nav-toggle` |
| 10 | メニュー | `site-nav-toggle` |
| 11 | メニュー | `site-nav-toggle` |
| 12 | メニュー | `site-nav-toggle` |
| 6 | メニュー | `site-nav-toggle` |
| 7 | メニュー | `site-nav-toggle` |
| 10 | 最新の情報の読み込みの失敗の文 | `refetch-error` |
| 11 | 最新の情報を読み直す | `refetch-retry` |

- 利用の状態の `patient-detail-status-text` は、モックでは値の欄に、実装では値の欄の中の文に付く。どちらも同じ文を指す。
- メニューの項目の並びの `patient-detail-menu-list` と、編集のフォームの `patient-detail-profile-form` は、構成要素の表に載せないので、この表に載せない。
- モックの「…」のメニューの覆いの `patient-detail-menu-close` は、実装に無い。実装のメニューは、外を押すと閉じる。

## 操作

`getPatientRemainingSchedules` と全ての書き込みの操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認する。  
持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getPatient` | `GET /v1/patients/{patient_id}` | なし | 200。`Patient`。利用の終了の利用者も返す | 404 `not_found` |
| `getPatientRemainingSchedules` | `GET /v1/patients/{patient_id}/remaining_schedules` | なし | 200。`PatientSchedules` | 404 `not_found` |
| `updatePatient` | `PUT /v1/patients/{patient_id}` | `name`、`service_code_id`、`preferred_time`、`preferred_gender`、`assigned_staff_id` | 200。`Patient` | 400 `invalid_input`: 入力が誤っているか、担当を休職か退職の職員か、訪問しない職員に変えた。404 `not_found` |
| `endPatientService` | `POST /v1/patients/{patient_id}/end_service` | なし | 200。`Patient` | 409 `patient_has_schedules`: 予定か繰り返しの予定が残る。`schedules` に一覧がある |
| `resumePatientService` | `POST /v1/patients/{patient_id}/resume_service` | `assigned_staff_id` | 200。`Patient` | 400 `invalid_input`: 担当に休職か退職の職員か、訪問しない職員を指した |
| `listServiceCodes`、`listUsers` | [利用者の登録の API との対応](../patient-new_利用者の登録/api.md) と同じ | | | |

- `listServiceCodes` と `listUsers` は、画面を開いたときに `getPatient` と一緒に呼ぶ。
  - 「読み込み中」の状態は `getPatient` だけを待つ。
  - どちらかが失敗していれば、ダイアログを開くときに呼び直す。
- `getPatientRemainingSchedules` は、利用の終了のダイアログを開いたときに呼ぶ。
  - レスポンスは、`endPatientService` の 409 が返す `PatientSchedules` と同じ形で、事業所の現地の日付で今日以降のものを返す。
- `updatePatient` は部分の更新を持たないので、画面は変えない項目も今の値で送る。
  - 担当の職員を変えなければ、今の担当が休職か退職か訪問しない職員でも拒まれない。
- `resumePatientService` は、利用中の利用者に送っても成功し、担当を書き換える。
  - 画面は、利用の終了の利用者のときだけ利用を再開するを出す。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込みの失敗 | 「利用者が見つかりません。利用者の一覧から開き直してください。」 | `getPatient` が 404 |
| 読み込みの失敗 | 「利用者を読み込めませんでした。時間をおいて、読み直してください。」 | `getPatient` が 404 のほかの失敗、API に届かない |
| 利用者の編集 | 「サービスと職員を読み込めませんでした。閉じてから、開き直してください。」 | `listServiceCodes` か `listUsers` が失敗、API に届かない |
| 利用者の編集 | 利用者の登録の登録の失敗の文の「登録」を「保存」に替えたもの | `updatePatient` の失敗。[利用者の登録の対応](../patient-new_利用者の登録/api.md#状態と失敗の要因) と同じ |
| 利用の終了を拒む | 残る予定の一覧 | `endPatientService` が 409 の `patient_has_schedules` |
| 利用の終了の確認 | 「残る予定を読み込めませんでした。閉じてから、開き直してください。」 | `getPatientRemainingSchedules` が失敗、API に届かない |
| 利用の終了の確認 | 「この操作をする権限がありません。」 | `endPatientService` が 403 |
| 利用の終了の確認 | 「利用を終了できませんでした。時間をおいて、もう一度終了してください。」 | `endPatientService` が 403、409 のほかの失敗、API に届かない |
| 利用の再開 | 「選んだ担当の職員は、休職か退職になりました。別の職員を選んでください。」 | `resumePatientService` が 400 |
| 利用の再開 | 「この操作をする権限がありません。」 | `resumePatientService` が 403 |
| 利用の再開 | 「利用を再開できませんでした。時間をおいて、もう一度再開してください。」 | `resumePatientService` が 400、403 のほかの失敗、API に届かない |
| 利用の再開 | 「サービスと職員を読み込めませんでした。閉じてから、開き直してください。」 | `listUsers` が失敗、API に届かない |
| 最新の情報の読み込みの失敗 | 「最新の情報を読み込めませんでした。」 | 読み終えた後に読み直して、`getPatient` が失敗、API に届かない。403 と 404 も含む |

- 文を選ぶ処理は `apps/web/src/features/patient/lib/errorMessage.ts` にある。
  - 保存は `patientSubmitErrorMessage`、利用の終了は `endServiceErrorMessage`、利用の再開は `resumeServiceErrorMessage` が選ぶ。
