# schedule-calendar API との対応

[予定のカレンダー](index.md) の項目と、web の型と OpenAPI の項目の対応。OpenAPI の項目は、`services/schedule/openapi.yaml` の名前で書く。web の型（`apps/web/src/api/types.ts`）はフェイクの API に合わせた形で、OpenAPI と名前が違う。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| チームのチェックボックス | チームの名前 | `Team.name` | `listTeams` の `Unit.name` |
| 職員のチェックボックス | 職員の名前と、属するチーム | `Staff.name`、`Staff.teamId` | `listUsers` の `Staff.username`、`Staff.team.id` |
| 職員のチェックボックス、職員の列、予定 | 休職と退職の職員を除くか | `Staff.status` | `listUsers` の `Staff.status` |
| ミニカレンダー、ミニカレンダーの日 | 表示の基準の日付 | search params の `date` | なし |
| キャンセルした予定を出す | キャンセルした予定を出すか | search params の `cancelled` | なし |
| 表示の単位 | 月、週、日 | search params の `view` | なし |
| 予定 | 日付と開始の時刻 | `Schedule.startsAt` | `listSchedules` の `Schedule.date`、`start_time` |
| 予定 | 終了の時刻（日の表示） | `Schedule.endsAt` | `listSchedules` の `Schedule.end_time` |
| 予定 | タイトル | `Schedule.title`、`Schedule.kind`、`Schedule.visit.patientId` と `Patient.name` | `listSchedules` の `Schedule.title`、`schedule_type`、`visit_info.patient_id` と、`listPatients` の `Patient.name` |
| 予定 | 色と、置く列 | `Schedule.staffId` | `listSchedules` の `Schedule.staff_id` |
| 予定 | キャンセルした予定の印と取り消し線 | `Schedule.cancel` | `listSchedules` の `Schedule.cancel` |
| 職員の列 | 職員の名前 | `Staff.name` | `listUsers` の `Staff.username` |
| 職員の予定の列 | 職員 | `Staff.id` | `listUsers` の `Staff.id` |

- 予定の一覧の取得は、`listSchedules`（`GET /v1/facilities/{facility_id}/schedules`）に当たる。web の画面は、期間を `ScheduleListParams` の `from`、`to` の日時で、職員を `staffIds` で渡す。OpenAPI は `date_from`、`date_to` の日付だけを受け、職員で絞る引数を持たない。
- web のサーバー（BFF、`apps/web/src/api/http/httpBuddyApi.ts`）は、`from` と `to` を `date_from`、`date_to` の日付に直して `listSchedules` を呼ぶ。`to` は含まないので、`date_to` は `to` の前の日にする。期間に重なるかと職員の絞り込みは、レスポンスを受けた後に web のサーバーが行う。
- web のサーバーは、`ScheduleListParams` の `includeCancelled` が `true` のときだけ、`cancel` が `null` でない予定（キャンセルした予定）を残す。画面は、URL の `cancelled` が `true` のときに `includeCancelled` を渡す。`recurring_schedules`（繰り返しの予定）は使わない。
- 訪問の予定のタイトルに使う利用者の名前は、web では `visit_info.patient_id` を利用者の一覧（`listPatients`）で名前に置き換える。OpenAPI の予定は `visit_info.patient_name` も持つが、web は使わない。
- 予定の種類は `schedule_type` が「訪問」かどうかで決める。
- `listUsers` は、職員の管理の画面のために休職と退職の職員も返す。web は `status` が `active` でない職員だけに `Staff.status` を写し、この画面は `status` を持つ職員とその予定を除く。
- PRD の時間外の勤務の印（`Schedule.is_over_time_work`）は、web の型に無く、画面に出していない。
