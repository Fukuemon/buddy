# schedule-calendar API との対応

[予定のカレンダー](index.md) の項目と、web の型と OpenAPI の項目の対応。OpenAPI の項目は、`apps/schedule-api/openapi.yaml` の名前で書く。web の型（`apps/web/src/api/types.ts`）は偽物の API に合わせた形で、OpenAPI と名前が違う。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| チームのチェックボックス | チームの名前 | `Team.name` | `listTeams` の `Unit.name` |
| 職員のチェックボックス | 職員の名前と、属するチーム | `Staff.name`、`Staff.teamId` | `listUsers` の `Staff.username`、`Staff.team.id` |
| 表示する日付 | 表示の基準の日付 | search params の `date` | なし |
| 表示の単位 | 月、週、日 | search params の `view` | なし |
| 予定 | 日付と開始の時刻 | `Schedule.startsAt` | `listSchedules` の `Schedule.date`、`start_time` |
| 予定 | 終了の時刻（日の表示） | `Schedule.endsAt` | `listSchedules` の `Schedule.end_time` |
| 予定 | 題 | `Schedule.title`、`Schedule.kind`、`Schedule.visit.patientId` と `Patient.name` | `listSchedules` の `Schedule.title`、`visit_info.patient_name` |
| 予定 | 色と、置く列 | `Schedule.staffId` | `listSchedules` の `Schedule.staff_id` |
| 職員の列 | 職員の名前 | `Staff.name` | `listUsers` の `Staff.username` |
| 職員の予定の列 | 職員 | `Staff.id` | `listUsers` の `Staff.id` |

- 予定の一覧の取得は、`listSchedules`（`GET /v1/facilities/{facility_id}/schedules`）に当たる。web は期間を `ScheduleListParams` の `from`、`to` の日時で、職員を `staffIds` で渡す。OpenAPI は `date_from`、`date_to` の日付だけを受け、職員で絞る引数を持たない。
- 訪問の予定の題に使う利用者の名前は、web では利用者の一覧（`Patient`）で id を名前に置き換える。OpenAPI は予定に `visit_info.patient_name` を持つ。
- PRD の時間外の勤務の印（`Schedule.is_over_time_work`）は、web の型に無く、画面に出していない。
