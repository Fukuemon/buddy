# schedule-detail API との対応

[予定の詳細](index.md) の項目と、web の型と OpenAPI の項目の対応。OpenAPI の項目は、`getSchedule`（`GET /v1/schedules/{schedule_id}`）の応答の `Schedule` で書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 種類 | 「通常」か「訪問」 | `Schedule.kind` | `schedule_type` |
| タイトル | タイトル | `Schedule.title` | `title` |
| 日時 | 日付、開始と終了の時刻 | `Schedule.startsAt`、`Schedule.endsAt` | `date`、`start_time`、`end_time` |
| 利用者 | 利用者の名前 | `Schedule.visit.patientId` を、利用者の一覧（`Patient.name`）で引く | `visit_info.patient_name` |
| サービスコード | サービスコード | `Schedule.visit.serviceCode` | `visit_info.service_code` |
| 訪問の種類 | 夜勤、緊急、入院 | `Schedule.visit.categories` | `visit_info.visit_categories[].name` |
| 担当者、予定者 | 職員の名前 | `Schedule.staffId` を、職員の一覧（`Staff.name`）で引く | `staff_name` |
| メモ | メモ | `Schedule.description` | `description` |

- 種類の文言は `SCHEDULE_KIND_LABEL`、訪問の種類の文言は `SCHEDULE_CATEGORY_LABEL` で決める。どちらも `apps/web/src/features/schedule/constants/scheduleLabels.ts` にある。
- 予定を取るのは web の `BuddyApi.schedules.get` で、事業所の ID と予定の ID を受ける。OpenAPI の `getSchedule` はパスに事業所を持たない。
- 職員と利用者の一覧は、`BuddyApi.staff.list` と `BuddyApi.patients.list` で取る。API につないだ後は `staff_name` と `visit_info.patient_name` を使えば、一覧を待たずに済む。
- 予定の取得の失敗の文は、`ApiError.status` が 404 かどうかで分ける。OpenAPI の `getSchedule` は 400、401、403、404、500 を返す。
- 予定のキャンセルは `cancelSchedule`（`POST /v1/schedules/{schedule_id}/cancel`）で行う。この画面は呼ばない。
- 画面に出していない同行者、時間外の勤務の印、キャンセルの理由は、`Schedule` の `visit_info.companion_name`、`is_over_time_work`、`cancel.reason` に当たる。
- 繰り返しの予定は `getRecurringSchedule`（`GET /v1/schedules/recurring/{recurring_schedule_id}`）で、予定と別に取る。
