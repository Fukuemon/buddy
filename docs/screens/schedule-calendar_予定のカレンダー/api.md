# schedule-calendar API との対応

[予定のカレンダー](index.md) の項目と、web の型と OpenAPI の項目の対応。  
OpenAPI の項目は、`services/schedule/openapi.yaml` の名前で書く。  
web の型（`apps/web/src/api/types.ts`）はフェイクの API に合わせた形で、OpenAPI と名前が違う。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| チームのチェックボックス | チームの名前 | `Team.name` | `listTeams` の `Unit.name` |
| 職員のチェックボックス | 職員の名前と、属するチーム | `Staff.name`、`Staff.teamId` | `listUsers` の `Staff.username`、`Staff.team.id` |
| 職員のチェックボックス、職員の列、予定 | 休職と退職の職員と、訪問しない職員を除くか | `Staff.status`、`Staff.nonVisiting` | `listUsers` の `Staff.status`、`visits` |
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
| 予定を作成、空いた時間、時間の枠、Google カレンダーの案内 | 事業所が予定を Google カレンダーで管理しているか | `ScheduleList.sourceMode`。読み直している間は `Facility.sourceMode` | `listSchedules` の `source_mode`、`getFacility` の `Facility.source_mode` |
| 同期の警告、同期の警告の行 | 職員の名前 | `CalendarSyncStatus.staff_name` | `listSchedules` の `calendar_syncs[].staff_name` |
| 同期の警告、同期の警告の行 | 状態と、最後に同期できた時刻 | `CalendarSyncStatus.last_status`、`CalendarSyncStatus.last_succeeded_at` | `listSchedules` の `calendar_syncs[].last_status`、`last_succeeded_at` |
| 同期の警告の行 | 行の区別 | `CalendarSyncStatus.external_calendar_id` | `listSchedules` の `calendar_syncs[].external_calendar_id` |
| 確認が必要な予定の通知、通知の予定 | 確認が必要な予定 | `ScheduleList.needsReview` | `listSchedules` の `schedules` と `recurring_schedules` のうち、`review_reason` が `null` でない予定 |
| 通知の予定 | 日時 | `Schedule.startsAt`、`Schedule.endsAt` | `listSchedules` の `Schedule.date`、`start_time`、`end_time` |
| 通知の予定 | 職員の名前 | `Schedule.staffId` を、職員の一覧（`Staff.name`）で引く | `Schedule.staff_id` を、`listUsers` の `Staff.username` で引く |
| 通知の予定、要確認の印 | 理由 | `Schedule.reviewReason` | `listSchedules` の `Schedule.review_reason` |
| 予定 | Google カレンダーの予定か | `Schedule.fromGoogleCalendar` | `listSchedules` の `Schedule.source` が `google_calendar` |

- 予定の一覧の取得は、`listSchedules`（`GET /v1/facilities/{facility_id}/schedules`）に当たる。
  - web の画面は、期間を `ScheduleListParams` の `from`、`to` の日時で、職員を `staffIds` で渡す。
  - OpenAPI は `date_from`、`date_to` の日付だけを受け、職員で絞る引数を持たない。
- web のサーバー（BFF、`apps/web/src/api/http/httpBuddyApi.ts`）は、`from` と `to` を `date_from`、`date_to` の日付に直して `listSchedules` を呼ぶ。
  - `to` は含まないので、`date_to` は `to` の前の日にする。
  - 期間に重なるかと職員の絞り込みは、レスポンスを受けた後に web のサーバーが行う。
- web のサーバーは、`ScheduleListParams` の `includeCancelled` が `true` のときだけ、`cancel` が `null` でない予定を残す。
  - `cancel` が `null` でない予定は、キャンセルした予定である。
  - 画面は、URL の `cancelled` が `true` のときに `includeCancelled` を渡す。
- 繰り返しの予定の `recurring_schedules` は、web のサーバーが期間の回に分け、回の ID（`occurrenceId`）を持つ単発の予定にする。
  - 流れは [予定の管理の Design Doc の予定の画面の読み込みと保存](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#予定の画面の読み込みと保存) にある。
- 訪問の予定のタイトルに使う利用者の名前は、web では `visit_info.patient_id` を利用者の一覧の `listPatients` で名前に置き換える。
  - OpenAPI の予定は `visit_info.patient_name` も持つが、web は使わない。
- 予定の種類は `schedule_type` が「訪問」かどうかで決める。
- `listUsers` は、職員の管理の画面のために休職と退職の職員も返す。
  - web は、`status` が `active` でない職員だけに `Staff.status` を写す。
  - この画面は、`status` を持つ職員とその予定を除く。
  - `visits` が false の職員には `Staff.nonVisiting` を写し、同じく職員とその予定を除く。
  - ADR-0021: [照合を照合の権限で許し、事務の役職を足し、訪問しない職員を予定と担当から外す](../../adr/0021-receipt-check-policy-and-non-visiting-staff.md)
- PRD の時間外の勤務の印の `Schedule.is_over_time_work` は、web の型に無く、画面に出していない。
- 予定の一覧は、閲覧の権限で見てよい職員の予定だけを返す。
  - 自分の予定は常に返す。
  - 流れは [予定の管理の Design Doc の認証から事業所の確認までの流れ](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md#認証から事業所の確認までの流れ) にある。

## Google カレンダーで予定を管理する事業所

- `source_mode` が `google_primary` の事業所では、`listSchedules` は、同期が写した Google カレンダーの予定（Projection）を返す。
  - 予定の `source` は `google_calendar` になり、web のサーバーは `Schedule.fromGoogleCalendar` を `true` にする。
  - Google カレンダーの繰り返しの予定は、API が期間の回に分けて単発の予定で返し、`recurring_schedules` は空である。
  - buddy の繰り返しの規則に写せない予定は、最初の回の日時の 1 件で、`review_reason` が `recurrence_unsupported` になる。
  - `recurrence_unsupported` のほかの `review_reason` を持つ予定は、`visit_info` が `null` の通常の予定で、`title` に Google カレンダーのタイトルが入る。
  - 流れは [予定の管理の Design Doc](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/DesignDoc.md) にある。
- web のサーバーは、`listSchedules` のレスポンスを `ScheduleList` にする。
  - `schedules` は、期間に重なり、職員の絞り込みに当たる予定である。
  - `needsReview` は、`review_reason` を持つ予定を、期間で絞らず、職員の絞り込みだけで絞ったものである。
  - `calendarSyncs` は、`calendar_syncs` を `staff_id` で職員の絞り込みに当てたものである。
  - 処理は `apps/web/src/api/http/httpBuddyApi.ts` の `schedules.list` にある。
- `calendar_syncs` は、ログインした職員が見てよい職員に結び付けた、外していないカレンダーの分を返す。
  - `buddy_primary` の事業所では空である。
  - 最新でないとみなす時間は画面が決め、`apps/web/src/features/schedule/lib/calendarSync.ts` の `CALENDAR_SYNC_STALE_MS`（10 分）にある。
  - 状態は `calendarSyncProblemsOf` が、`last_status` が `failed`、`last_succeeded_at` が `null`、`last_succeeded_at` が 10 分より前の順に当てる。
- 理由の文は、`apps/web/src/features/schedule/constants/scheduleLabels.ts` の `SCHEDULE_REVIEW_REASON_LABEL` で決める。
- 事業所は `getFacility`（`GET /v1/facilities/{facility_id}`）で読み、web の `BuddyApi.facilities.get` が `Facility` にする。
  - 画面は、`ScheduleList.sourceMode` があればそれを、無ければ `Facility.sourceMode` を使う。日付を移って一覧を読み直す間に、「予定を作成」が出たり消えたりしないためである。
  - どちらも無い間は、予定を作る操作を出さない。
- `createSchedule` は、`google_primary` の事業所では 409 の `google_primary` で拒む。

## 権限の出し分け

| 判定 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- |
| ログインした職員の予定の権限と対象 | `Viewer.schedulePolicies` の `code`、`targetStaffIds`、`targetTeamIds` | `getMe` の `policies` の `code`、`target_user_ids`、`target_team_ids` |
| 職員の絞り込み、職員の列で、職員を出すか | `Staff.id`、`Staff.teamId` | `listUsers` の `Staff.id`、`Staff.team.id` |
| 予定を作成を出すか | `Viewer.schedulePolicies` の `code` | `getMe` の `policies` の `code` |
| 時間の枠を押せるか | `Staff.id`、`Staff.teamId` | `listUsers` の `Staff.id`、`Staff.team.id` |

- 判定は、予定の API の判定（`schedule.CanRead`、`schedule.CanEdit`）と同じ規則で行う。
  - 判定の処理は `apps/web/src/features/schedule/lib/schedulePermission.ts` にある。
  - 職員の絞り込みと職員の列は `readableStaff` で絞る。
    - 自分と、`schedule.all.*`、`target_user_ids` に職員を含む `schedule.user.*`、`target_team_ids` に職員のチームを含む `schedule.team.*` の対象の職員を残す。
  - 予定を作成は、`code` が `.edit` で終わる権限を 1 つ以上持つときに出す。
    - この判定は `canEditAnySchedule` が行う。
    - 週の表示の空いた時間も、同じ条件で予定の作成を開く。
  - 時間の枠は、列の職員を `canEditScheduleOf` で判定する。
- web のサーバーは、`getMe` の `policies` のうち、予定の権限の 7 つの `code`（`SCHEDULE_POLICY_CODES`）を `Viewer.schedulePolicies` に写す。
  - 写すのは `apps/web/src/api/http/scheduleMapper.ts` の `fromApiMe` である。
- 出し分けは表示だけに使う。
  - 予定を拒むのは、予定の API の `listSchedules` と `createSchedule` である。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込みの失敗 | 「予定を取得できませんでした。」 | `listSchedules` か `listUsers` が失敗（400、403、500）。403 は、職員が休職か退職しているときと、パスの事業所が職員の事業所と違うときを含む。API に届かない |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | `listSchedules` か `listUsers` が 401 |

- 文は `apps/web/src/features/schedule/components/ScheduleCalendarContainer.tsx` が、status によらず 1 つの文にする。
- 予定の一覧は、見てよくない職員の予定を除いて返すので、予定を見る権限が無いことの文は出さない。
- 4xx の失敗は取り直さず、すぐに出す。
  - ほかの失敗は、3 回まで取り直してから出す。
  - 取り直すかは `apps/web/src/appContext.ts` の `shouldRetryQuery` が決める。
- 事業所（`getFacility`）の失敗も、この状態にしない。
  - 予定の一覧を読めれば、その `source_mode` で予定を作る操作と通知を出し分ける。
- チームと利用者の一覧（`listTeams`、`listPatients`）の失敗は、この状態にしない。
  - 職員の絞り込みはチームを出さず、訪問の予定のタイトルは「利用者不明 訪問」になる。
