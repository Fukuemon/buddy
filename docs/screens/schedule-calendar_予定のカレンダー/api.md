# schedule-calendar API との対応

[予定のカレンダー](index.md) の項目と、web の型と OpenAPI の項目の対応。  
OpenAPI の項目は、`services/schedule/openapi.yaml` の名前で書く。  
web の型（`apps/web/src/api/types.ts`）はフェイクの API に合わせた形で、OpenAPI と名前が違う。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 要確認 | 確認が必要な予定の件数。100 件以上は「99+」 | `calendars.exportIssues` の戻り値の数 | `listCalendarExportIssues` の `items` の数 |
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
| 一覧の予定 | 時刻、タイトル、キャンセルした予定の印 | 予定と同じ | 予定と同じ |
| 一覧の予定 | 職員の色と名前 | `Schedule.staffId` と `Staff.name` | `listSchedules` の `Schedule.staff_id` と、`listUsers` の `Staff.username` |
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
| 切り替え中の案内、予定を作成、空いた時間、時間の枠 | 切り替え中か | `ScheduleList.cutover` が `null` でない | `listSchedules` の `cutover` |
| 切り替えの開始 | 始めた職員の名前と時刻 | `OpenCalendarCutover.started_by_name`、`OpenCalendarCutover.started_at` | `listSchedules` の `cutover.started_by_name`、`cutover.started_at` |
| 終日の予定、終日の行、一覧の終日の予定、終日の見出し、職員の終日の欄 | かかる最初の日と最後の日（最後の日を含む） | `AllDayEvent.startDate`、`AllDayEvent.endDate` | `listSchedules` の `all_day_events[].start_date`、`end_date` |
| 終日の予定、一覧の終日の予定 | タイトル。空白だけなら「（タイトルなし）」 | `AllDayEvent.title` を `formatAllDayEventTitle` に通した値 | `listSchedules` の `all_day_events[].title` |
| 終日の予定、一覧の終日の予定 | 職員の名前 | `AllDayEvent.staffName` | `listSchedules` の `all_day_events[].staff_name` |
| 終日の予定、一覧の終日の予定、職員の終日の欄 | 職員の色と、置く列 | `AllDayEvent.staffId` | `listSchedules` の `all_day_events[].staff_id` |
| カレンダーに出せない予定の通知 | 件数 | `ScheduleList.unlistedEventCounts` の `UnlistedEventCount.count` の合計 | `listSchedules` の `unlisted_event_counts[].count` の合計 |
| 出せない予定の行 | 職員の名前 | `UnlistedEventCount.staffId` を、職員の一覧（`Staff.name`）で引く | `unlisted_event_counts[].staff_id` を、`listUsers` の `Staff.username` で引く |
| 出せない予定の行 | 件数 | `UnlistedEventCount.count` | `listSchedules` の `unlisted_event_counts[].count` |

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
  - ADR-0006: [訪問するかを職員に持ち、訪問しない職員を予定と担当から外す](../../adr/0006-non-visiting-staff.md)
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
  - `needsReviewAllDayEvents` は、`review_reason` を持つ終日の予定を、期間で絞らず、職員の絞り込みだけで絞ったものである。`allDayEvents` にも残し、最初の回の日の終日の欄に出す。
  - `calendarSyncs` は、`calendar_syncs` を `staff_id` で職員の絞り込みに当てたものである。
  - `allDayEvents` と `unlistedEventCounts` は、`all_day_events` と `unlisted_event_counts` を `staff_id` で職員の絞り込みに当てたものである。
  - 処理は `apps/web/src/api/http/httpBuddyApi.ts` の `schedules.list` にある。
- `all_day_events` と `unlisted_event_counts` は、`date_from` から `date_to` までの期間に重なり、ログインした職員が見てよい職員の分を返す（#672）。
  - `buddy_primary` の事業所と、`schedule_type` で絞ったときは空である。
  - 繰り返しの終日の予定は、回ごとに返す。`AllDayEvent.id` は回ごとに違い、予定の ID としては使えない。
  - buddy の繰り返しの規則に写せない終日の予定は、最初の回の 1 件で、`review_reason` が `recurrence_unsupported` になる。回が期間に重なりうる間は、最初の回が期間の外でも返す（#972）。
  - `unlisted_event_counts` は、2 日以上にわたる予定、24 時間以上の予定、開始か終了の日時を読めない予定、長さが 0 以下の予定を数える。
  - `unlisted_event_counts` は、件数が 1 以上の職員だけを返す。繰り返しの予定は、期間に重なる回の数を数える。
  - 日時を読めない予定は、開始か終了の読めた方の日で期間に重なるかを決め、どちらも読めなければどの期間でも数える。
- 画面は、`apps/web/src/features/schedule/lib/allDayEvents.ts` の `toCalendarAllDayEvents` で、終日の予定に職員の色を付ける。
  - 職員の絞り込みに出す職員（`activeStaff` と `readableStaff` で絞った職員）にいない職員の終日の予定は除く。
  - 月と週の表示は FullCalendar の終日の予定にし、終わりを `endDate` の翌日にする。押しても `onEventClick` を呼ばない。
  - 日の表示と週の一覧は、`allDayEventsOn` で日にかかる予定を選ぶ。
- 出せない予定の行の職員の名前は、`activeStaff` と `readableStaff` で絞る前の職員の一覧（`ScheduleSourceNotices` に渡す `allStaff`）の `Staff.name` を出す。
- `calendar_syncs` は、ログインした職員が見てよい職員に結び付けた、外していないカレンダーの分を返す。
  - `buddy_primary` の事業所では空である。
  - 最新でないとみなす時間は画面が決め、`apps/web/src/features/schedule/lib/calendarSync.ts` の `CALENDAR_SYNC_STALE_MS`（10 分）にある。
  - 状態は `calendarSyncProblemsOf` が、`last_status` が `failed`、`last_succeeded_at` が `null`、`last_succeeded_at` が 10 分より前の順に当てる。
- 理由の文は、`apps/web/src/features/schedule/constants/scheduleLabels.ts` の `SCHEDULE_REVIEW_REASON_LABEL` で決める。
- 事業所は `getFacility`（`GET /v1/facilities/{facility_id}`）で読み、web の `BuddyApi.facilities.get` が `Facility` にする。
  - 画面は、`ScheduleList.sourceMode` があればそれを、無ければ `Facility.sourceMode` を使う。日付を移って一覧を読み直す間に、`buddy_primary` の事業所で「予定を作成」が出たり消えたりしないためである。
  - どちらも無い間は、予定を作る操作を出さない。
- 予定を作る操作は、`buddy_primary` の事業所か、`google_primary` の事業所で `ScheduleList` を読み終えて `ScheduleList.cutover` が `null` のときに出す。
  - `google_primary` の事業所で一覧を読み直している間は、`cutover` が分からないので出さない。
  - 処理は `apps/web/src/features/schedule/components/ScheduleCalendarContainer.tsx` にある。
- `google_primary` の事業所でも、`createSchedule` は予定を作り、Google カレンダーに書く。
  - 書き込みの扱いは、[予定の作成の API との対応](../schedule-new_予定の作成/api.md) と [ADR-0029](../../adr/0029-google-calendar-sync.md) にある。

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

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| ログインした職員が、職員の管理の権限を持つ | `Viewer.policyCodes` に `staff.manage` がある（`hasPermission(viewer, STAFF_MANAGE)`） |
| 表示する職員の絞り込みが、全員である | 選んだ職員（search params の `staff` から、`activeStaffIds` で休職と退職の職員と訪問しない職員を、`readableStaffIds` で予定を見てよくない職員と職員の一覧に無い職員を除いた配列）が空（`StaffFilterSidebar` の `isAll`、`ScheduleCalendarContainer` の `selectedStaffIds`） |
| 表示する職員の絞り込みが、ログインした職員だけである | 選んだ職員が `Viewer.staffId` の 1 人だけ（`StaffFilterSidebar` の `isOnlyViewer` の前半） |
| 職員の絞り込みに出す職員が、ログインした職員だけである | 選んだ職員が空で、職員の絞り込みに出す職員（`StaffFilterSidebar` の `staffList`）が 1 人だけ（`isOnlyViewer` の後半）。自分だけを出すのはログインした職員がその中にいるときなので、1 人はログインした職員である |
| ログインした職員が、職員の絞り込みに出す職員にいる | 職員の絞り込みに出す職員（`activeStaff` と `readableStaff` で絞った `Staff[]`）に、`Viewer.staffId` の職員がいる（`StaffFilterSidebar` の `canShowOnlyViewer`） |
| 事業所のチームの一覧を読めている | `teamListQueryOptions` の結果（`Team[]`）がある。無い間は空の配列として扱う |
| チームに、ログインした職員が予定を見られる職員がいる | `readableStaff` で絞った職員に、`Staff.teamId` がチームの `Team.id` の職員がいる |
| チームが、職員のいないチームである | `activeStaff` で絞った職員に、`Staff.teamId` がチームの `Team.id` の職員がいない |
| 職員の名前の検索が、空である | `StaffFilterSidebar` の `keyword`（入力した語の全角と半角をそろえ、空白を除いた値）が空の文字列 |
| チームに、名前に検索の語を含む職員がいる | `StaffFilterSidebar` の `teamRows` の `shownMembers` が空でない |
| 事業所の職員の一覧を読めている | `staffListQueryOptions` の結果（`Staff[]`）がある。無い間は空の配列として扱う |
| チェックボックスの職員が、職員の絞り込みに出すチームに属する | `Staff.teamId` が、職員の絞り込みに出すチームの `Team.id` のどれか |
| チェックボックスの職員が、休職か退職の職員である | `Staff.status` がある（`isActiveStaff` が false） |
| チェックボックスの職員が、訪問しない職員である | `Staff.nonVisiting` が `true`（`isActiveStaff` が false） |
| ログインした職員が、チェックボックスの職員の予定を見られる | `canReadScheduleOf(viewer, staff)` が true |
| チェックボックスの職員の名前が、検索の語を含む | `Staff.name` の全角と半角をそろえ、空白を除いた値が `keyword` を含む |
| ログインした職員が、誰かの予定を編集できる | `Viewer.schedulePolicies` に、`code` が `.edit` で終わる権限がある（`canEditAnySchedule`） |
| 事業所が、予定の正本を buddy に切り替えている途中である | `google_primary` の事業所で、`ScheduleList.cutover` が `null` でない（`listSchedules` の `cutover`）。`buddy_primary` の事業所では読まず、`null` として扱う |
| 事業所が、予定を buddy で管理している | `ScheduleList.sourceMode` があればそれが、無ければ `Facility.sourceMode` が `buddy_primary` |
| 表示の期間の予定を、読み終えている | `scheduleListQueryOptions` の結果（`ScheduleList`）がある。日付を移ると query のキーが変わるので、読み直す間は無い |
| 予定が、表示の期間に重なる | web のサーバーが、`ScheduleListParams` の `from` と `to` に重なる予定だけを `ScheduleList.schedules` に入れる |
| 表示する職員の絞り込みが、予定の職員を含む | 選んだ職員に `Schedule.staffId` がある。web のサーバーが `ScheduleListParams` の `staffIds` で絞る |
| 予定の職員が、休職か退職の職員である | `Schedule.staffId` の職員の `Staff.status` がある（`excludeInactiveStaffSchedules` が除く） |
| 予定の職員が、訪問しない職員である | `Schedule.staffId` の職員の `Staff.nonVisiting` が `true`（`excludeInactiveStaffSchedules` が除く） |
| ログインした職員が、予定の職員の予定を見られる | `listSchedules` が返す予定である。予定の API が、閲覧の権限で見てよい職員の予定だけを返す |
| 予定が、キャンセルした予定である | `Schedule.cancel` がある |
| 職員が、「キャンセルした予定を出す」にチェックを入れている | search params の `cancelled` が `true`。`ScheduleListParams` の `includeCancelled` に渡す |
| 予定が、確認が必要な予定である | `Schedule.reviewReason` がある（`ScheduleCalendarEvent.needsReview`） |
| 表示する職員のカレンダーに、予定が最新でない可能性のあるカレンダーがある | `calendarSyncProblemsOf(ScheduleList.calendarSyncs, now)` が空でない |
| 表示する職員の予定に、確認が必要な予定がある | `ScheduleList.needsReview` が空でない |
| 表示する職員の絞り込みが、列の職員を含む | 選んだ職員に `Staff.id` がある（`ScheduleCalendarContainer` の `visibleStaff`） |
| 列の職員が、休職か退職の職員である | `Staff.status` がある（`activeStaff` が除く） |
| 列の職員が、訪問しない職員である | `Staff.nonVisiting` が `true`（`activeStaff` が除く） |
| ログインした職員が、列の職員の予定を見られる | `canReadScheduleOf(viewer, staff)` が true（`readableStaff` が残す） |
| ログインした職員が、列の職員の予定を編集できる | `canEditScheduleOf(viewer, staff)` が true（`StaffScheduleDayGrid` の `canCreateFor`） |
| 表示の単位が、週である | search params の `view` を `resolveCalendarView` で決めた値が `week` |
| 画面の幅が、768px 以上である | `useIsDesktop()`（`@buddy/ui`。`(min-width: 48rem)` に当たるか）が true |
| 画面の幅が、768px 未満である | `useIsDesktop()` が false |
| 予定が、カレンダーに予定を出す条件に当てはまる | カレンダーと職員ごとの日の表に渡す `events`（`toCalendarEvents` の結果）にある。`ScheduleWeekAgenda` が、同じ `events` を `groupWeekAgenda` で日ごとに分ける |
| 表示の期間が、今日を含む | 週の表示は FullCalendar の `nowIndicator` が今日の列にだけ線を引く。日の表示は `nowForDay(date, now)` が、`date` が今日のときだけ今の時刻を返す |
| 表示する職員の予定に、表示の期間に重なるカレンダーに出せない予定がある | `ScheduleList.unlistedEventCounts` のうち、`activeStaff` と `readableStaff` で絞った職員の一覧にある職員の `count` の合計が 1 以上（`ScheduleCalendarContainer` の `unlistedEventCounts`、`ScheduleSourceNotices` の `unlistedTotal`） |
| 終日の予定が、表示の期間の日にかかる | `listSchedules` が、`date_from` から `date_to` までに重なる予定だけを `all_day_events` に返す。日の表示と週の一覧は、`allDayEventsOn` が、日が `AllDayEvent.startDate` 以上 `AllDayEvent.endDate` 以下の予定だけを置く |
| 表示する職員の絞り込みが、終日の予定の職員を含む | 選んだ職員に `AllDayEvent.staffId` がある。web のサーバーが `ScheduleListParams` の `staffIds` で絞る |
| 終日の予定の職員が、休職か退職の職員である | `AllDayEvent.staffId` の職員の `Staff.status` がある（`toCalendarAllDayEvents` が、`activeStaff` で絞った職員にいない職員の予定を除く） |
| 終日の予定の職員が、訪問しない職員である | `AllDayEvent.staffId` の職員の `Staff.nonVisiting` が `true`（`toCalendarAllDayEvents` が除く） |
| ログインした職員が、終日の予定の職員の予定を見られる | `listSchedules` が、閲覧の権限で見てよい職員の分だけを `all_day_events` に返す。`toCalendarAllDayEvents` も、`readableStaff` で絞った職員にいない職員の予定を除く |
| 表示の期間に、カレンダーに出す終日の予定がある | `ScheduleCalendar` の `allDayEvents`（`toCalendarAllDayEvents` の結果）が空でない（FullCalendar の `allDaySlot`） |
| 表示する日に、カレンダーに出す終日の予定がある | `allDayEventsOn(allDayEvents, date)` が空でない（`StaffScheduleDayGrid` の `allDayToday`） |
| 終日の予定が、カレンダーに終日の予定を出す条件に当てはまる | `ScheduleWeekAgenda` に渡す `allDayEvents`（`toCalendarAllDayEvents` の結果）にあり、`allDayEventsOn` が日の見出しの日にかかると返す |

- 判定の処理は、次のファイルにある。
  - 職員の絞り込みの出し分けと押せるかは、`StaffFilterSidebar.tsx` と `StaffFilterSidebarContainer.tsx` にある。
    - どちらも `apps/web/src/features/schedule/components/` にある。
  - 予定を作る操作、職員の列、時間の枠の出し分けは、`ScheduleCalendarContainer.tsx` にある。
    - `canWriteSchedules` は、`buddy_primary` の事業所か、`google_primary` の事業所で `cutover` が `null` の一覧を読み終えたときに true になる。
    - `canCreate` は、`canWriteSchedules` と `canEditAnySchedule` が true のときに true になる。「予定を作成」と週の表示の空いた時間に使う。
  - 時間の枠は、`canWriteSchedules` と `canEditScheduleOf` が true の列でだけ、`StaffScheduleDayGrid` がボタンにする。
  - 週の表示で `useIsDesktop()` が false のときは、`ScheduleCalendar` の代わりに `ScheduleWeekAgenda` を描く。週の表示の空いた時間は `ScheduleCalendar` にだけあるので、幅 768px 未満では出ない。
    - `useIsDesktop()` は、幅が 768px の境を越えると描き直す。`view` を省いたときの表示の単位は、`apps/web/src/features/schedule/schema/scheduleSearch.ts` の `resolveCalendarView` が開いたときの幅で 1 度だけ決める。
  - 週の一覧の並びは、`apps/web/src/features/schedule/lib/weekAgenda.ts` の `groupWeekAgenda` が決める。
  - 日の表示の職員の列は、`viewerFirst` が `Viewer.staffId` の職員を左端に移す。
  - 休職と退職の職員と訪問しない職員は、`apps/web/src/features/schedule/lib/activeStaff.ts` の関数が除く。
    - 関数は `activeStaff`、`activeStaffIds`、`excludeInactiveStaffSchedules` である。
  - 予定を見てよいかと編集してよいかは、`apps/web/src/features/schedule/lib/schedulePermission.ts` の関数が決める。
    - 関数は `canReadScheduleOf`、`canEditScheduleOf`、`canEditAnySchedule` である。
- 通知は、`apps/web/src/features/schedule/components/ScheduleSourceNotices.tsx` が、`google_primary` の事業所でだけ描く。
  - Google カレンダーの案内、同期の警告、確認が必要な予定の通知の事業所の判定は、状態で決まるので、条件の表に載せない。
- ナビゲーションの項目は、`apps/web/src/components/layout/SiteNav.tsx` の `siteNavGroups` が、職員の管理の権限で出し分ける。
  - 要確認の件数の印は、`apps/web/src/features/calendar/components/CalendarReviewBadgeContainer.tsx` が出し分ける。
    - 件数は `listCalendarExportIssues` の `items` の数である。読み終える前と 0 件のときは印を出さず、100 件以上は `CalendarReviewBadge` が「99+」にする。
- URL の `staff` は、`activeStaffIds` で休職と退職の職員と訪問しない職員を除き、`readableStaffIds` で職員の一覧に無い職員と予定を見てよくない職員を除く。
  - 残りが空なら、全員を選んだ形として扱う。見えない職員が選んだままになり、全員と一部の判定が崩れないためである。
  - 「表示する職員が無い」の状態は、職員の絞り込みに出す職員（`readableStaff(viewer, activeStaff(...))`）が空のときにだけなる。
- 予定と職員のチェックボックスの色は、`staffColorMap` が、`activeStaff` と `readableStaff` で絞った職員の並びの位置から決める。
  - 処理は `apps/web/src/features/schedule/lib/toCalendarEvents.ts` にある。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 4 | 職員の絞り込み | `staff-filter-sidebar` |
| 5 | 全員を表示 | `staff-filter-reset` |
| 6 | チームのチェックボックス | `staff-filter-team-{チームの id}` |
| 7 | 職員のチェックボックス | `staff-filter-staff-{職員の id}` |
| 6 | 前へ | `calendar-prev` |
| 7 | 前へ | `calendar-prev` |
| 8 | 前へ | `calendar-prev` |
| 7 | 今日 | `calendar-today` |
| 8 | 今日 | `calendar-today` |
| 9 | 今日 | `calendar-today` |
| 8 | 次へ | `calendar-next` |
| 9 | 次へ | `calendar-next` |
| 10 | 次へ | `calendar-next` |
| 9 | ミニカレンダー | `mini-calendar` |
| 10 | ミニカレンダー | `mini-calendar` |
| 11 | ミニカレンダー | `mini-calendar` |
| 10 | 表示の単位 | `calendar-view` |
| 11 | 表示の単位 | `calendar-view` |
| 12 | 表示の単位 | `calendar-view` |
| 11 | 予定を作成 | `schedule-create-open` |
| 12 | 予定を作成 | `schedule-create-open` |
| 13 | 予定を作成 | `schedule-create-open` |
| 32 | 予定を作成 | `schedule-create-open` |
| 35 | 予定を作成 | `schedule-create-open` |
| 14 | カレンダー | `schedule-calendar` |
| 15 | 予定 | `schedule-event-{予定の id}` |
| 18 | 予定 | `schedule-event-{予定の id}` |
| 13 | 表示の期間の見出し | `calendar-title` |
| 14 | 表示の期間の見出し | `calendar-title` |
| 15 | 表示の期間の見出し | `calendar-title` |
| 16 | 表示の期間の見出し | `calendar-title` |
| 17 | 表示の期間の見出し | `calendar-title` |
| 19 | 表示の期間の見出し | `calendar-title` |
| 16 | 自分だけ | `staff-filter-only-me` |
| 17 | 自分だけ | `staff-filter-only-me` |
| 18 | 自分だけ | `staff-filter-only-me` |
| 19 | 自分だけ | `staff-filter-only-me` |
| 21 | 自分だけ | `staff-filter-only-me` |
| 14 | 職員の名前の検索 | `staff-filter-search` |
| 15 | 職員の名前の検索 | `staff-filter-search` |
| 17 | 職員の名前の検索 | `staff-filter-search` |
| 18 | 職員の名前の検索 | `staff-filter-search` |
| 19 | 職員の名前の検索 | `staff-filter-search` |
| 20 | 職員の名前の検索 | `staff-filter-search` |
| 22 | 職員の名前の検索 | `staff-filter-search` |
| 15 | キャンセルした予定を出す | `calendar-show-cancelled` |
| 16 | キャンセルした予定を出す | `calendar-show-cancelled` |
| 18 | キャンセルした予定を出す | `calendar-show-cancelled` |
| 19 | キャンセルした予定を出す | `calendar-show-cancelled` |
| 20 | キャンセルした予定を出す | `calendar-show-cancelled` |
| 21 | キャンセルした予定を出す | `calendar-show-cancelled` |
| 23 | キャンセルした予定を出す | `calendar-show-cancelled` |
| 16 | ミニカレンダーの月 | `mini-calendar-month` |
| 17 | ミニカレンダーの月 | `mini-calendar-month` |
| 19 | ミニカレンダーの月 | `mini-calendar-month` |
| 20 | ミニカレンダーの月 | `mini-calendar-month` |
| 21 | ミニカレンダーの月 | `mini-calendar-month` |
| 22 | ミニカレンダーの月 | `mini-calendar-month` |
| 24 | ミニカレンダーの月 | `mini-calendar-month` |
| 25 | ミニカレンダーの月 | `mini-calendar-month` |
| 17 | 前の月 | `mini-calendar-prev` |
| 18 | 前の月 | `mini-calendar-prev` |
| 20 | 前の月 | `mini-calendar-prev` |
| 21 | 前の月 | `mini-calendar-prev` |
| 22 | 前の月 | `mini-calendar-prev` |
| 23 | 前の月 | `mini-calendar-prev` |
| 25 | 前の月 | `mini-calendar-prev` |
| 26 | 前の月 | `mini-calendar-prev` |
| 18 | 次の月 | `mini-calendar-next` |
| 19 | 次の月 | `mini-calendar-next` |
| 21 | 次の月 | `mini-calendar-next` |
| 22 | 次の月 | `mini-calendar-next` |
| 23 | 次の月 | `mini-calendar-next` |
| 24 | 次の月 | `mini-calendar-next` |
| 26 | 次の月 | `mini-calendar-next` |
| 27 | 次の月 | `mini-calendar-next` |
| 19 | ミニカレンダーの日 | `mini-calendar-day-{日付}` |
| 20 | ミニカレンダーの日 | `mini-calendar-day-{日付}` |
| 22 | ミニカレンダーの日 | `mini-calendar-day-{日付}` |
| 23 | ミニカレンダーの日 | `mini-calendar-day-{日付}` |
| 24 | ミニカレンダーの日 | `mini-calendar-day-{日付}` |
| 25 | ミニカレンダーの日 | `mini-calendar-day-{日付}` |
| 27 | ミニカレンダーの日 | `mini-calendar-day-{日付}` |
| 28 | ミニカレンダーの日 | `mini-calendar-day-{日付}` |
| 20 | 日付と絞り込み | `site-sidebar-open` |
| 21 | 日付と絞り込み | `site-sidebar-open` |
| 23 | 日付と絞り込み | `site-sidebar-open` |
| 24 | 日付と絞り込み | `site-sidebar-open` |
| 25 | 日付と絞り込み | `site-sidebar-open` |
| 26 | 日付と絞り込み | `site-sidebar-open` |
| 28 | 日付と絞り込み | `site-sidebar-open` |
| 29 | 日付と絞り込み | `site-sidebar-open` |
| 21 | 左の欄を閉じる | `site-sidebar-close` |
| 22 | 左の欄を閉じる | `site-sidebar-close` |
| 24 | 左の欄を閉じる | `site-sidebar-close` |
| 25 | 左の欄を閉じる | `site-sidebar-close` |
| 26 | 左の欄を閉じる | `site-sidebar-close` |
| 27 | 左の欄を閉じる | `site-sidebar-close` |
| 29 | 左の欄を閉じる | `site-sidebar-close` |
| 30 | 左の欄を閉じる | `site-sidebar-close` |
| 22 | 要確認 | `site-nav-review` |
| 23 | 要確認 | `site-nav-review` |
| 25 | 要確認 | `site-nav-review` |
| 26 | 要確認 | `site-nav-review` |
| 27 | 要確認 | `site-nav-review` |
| 28 | 要確認 | `site-nav-review` |
| 30 | 要確認 | `site-nav-review` |
| 31 | 要確認 | `site-nav-review` |
| 23 | 取り込み | `site-nav-import` |
| 24 | 取り込み | `site-nav-import` |
| 26 | 取り込み | `site-nav-import` |
| 27 | 取り込み | `site-nav-import` |
| 28 | 取り込み | `site-nav-import` |
| 29 | 取り込み | `site-nav-import` |
| 31 | 取り込み | `site-nav-import` |
| 32 | 取り込み | `site-nav-import` |
| 17 | メニュー | `site-nav-toggle` |
| 24 | メニュー | `site-nav-toggle` |
| 25 | メニュー | `site-nav-toggle` |
| 27 | メニュー | `site-nav-toggle` |
| 28 | メニュー | `site-nav-toggle` |
| 29 | メニュー | `site-nav-toggle` |
| 30 | メニュー | `site-nav-toggle` |
| 32 | メニュー | `site-nav-toggle` |
| 33 | メニュー | `site-nav-toggle` |
| 13 | 職員ごとの日の表 | `staff-schedule-day-grid` |
| 14 | 職員ごとの日の表 | `staff-schedule-day-grid` |
| 16 | 職員の予定の列 | `day-grid-staff-{職員の id}` |
| 17 | 時間の枠 | `day-grid-slot-{職員の id}-{HH:mm}` |
| 33 | 時間の枠 | `day-grid-slot-{職員の id}-{HH:mm}` |
| 20 | 今の時刻の線 | `day-grid-now-{職員の id}` |
| 24 | キャンセルした予定 | `schedule-event-{予定の id}` |
| 13 | Google カレンダーの案内 | `schedule-calendar-google-primary` |
| 30 | 同期の警告 | `schedule-calendar-sync-warning` |
| 31 | 同期の警告の行 | `schedule-calendar-sync-warning-{カレンダーの id}` |
| 32 | 確認が必要な予定の通知 | `schedule-calendar-needs-review` |
| 33 | 通知の予定 | `schedule-calendar-needs-review-{予定の id}` |
| 39 | 通知の終日の予定 | `schedule-calendar-needs-review-all-day-{終日の予定の id}` |
| 34 | 要確認の印 | `schedule-event-{予定の id}-needs-review` |
| 35 | 切り替え中の案内 | `schedule-calendar-cutover` |
| 36 | 切り替えの開始 | `schedule-calendar-cutover-started` |
| 31 | 週の一覧 | `schedule-agenda` |
| 32 | 一覧の日の見出し | `schedule-agenda-day-{日付}` |
| 33 | 一覧の予定 | `schedule-event-{予定の id}` |
| 30 | 最新の情報の読み込みの失敗の文 | `refetch-error` |
| 31 | 最新の情報を読み直す | `refetch-retry` |
| 34 | Google カレンダーの案内 | `schedule-calendar-google-primary` |
| 34 | カレンダーに出せない予定の通知 | `schedule-calendar-unlisted` |
| 35 | カレンダーに出せない予定の通知 | `schedule-calendar-unlisted` |
| 36 | カレンダーに出せない予定の通知 | `schedule-calendar-unlisted` |
| 35 | 出せない予定の行 | `schedule-calendar-unlisted-{職員の id}` |
| 36 | 出せない予定の行 | `schedule-calendar-unlisted-{職員の id}` |
| 37 | 出せない予定の行 | `schedule-calendar-unlisted-{職員の id}` |
| 38 | 終日の予定 | `all-day-event-{終日の予定の id}` |
| 36 | 終日の見出し | `day-grid-all-day` |
| 37 | 職員の終日の欄 | `day-grid-all-day-{職員の id}` |
| 39 | 一覧の終日の予定 | `all-day-event-{終日の予定の id}-{日付}` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- 空いた日、職員の列、週の表示の今の時刻の線、終日の行、読み込み中の表示、読み込みの失敗の文には、実装が testid を付けないので、この表に載せない。
- 職員の予定の列の `day-grid-staff-{職員の id}` は、構成要素の表に要素はあるがセクションを持たない。
- 職員ごとの日の表の時刻の列の `day-grid-times` は、構成要素の表に番号を持たないので、この表に載せない。
- 左の欄を閉じるの `site-sidebar-close` は、packages/ui の `Drawer` の `closeButtonTestId` に渡す値である。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込みの失敗 | 「予定を取得できませんでした。」 | `listSchedules` か `listUsers` が失敗（400、403、500）。403 は、職員が休職か退職しているときと、パスの事業所が職員の事業所と違うときを含む。API に届かない |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | `listSchedules` か `listUsers` が 401 |
| 最新の情報の読み込みの失敗 | 「最新の情報を読み込めませんでした。」 | 読み終えた後に読み直して、`listSchedules` か `listUsers`が失敗、API に届かない。403 と 404 も含む |

- 文は `apps/web/src/features/schedule/components/ScheduleCalendarContainer.tsx` が、status によらず 1 つの文にする。
- 予定の一覧は、見てよくない職員の予定を除いて返すので、予定を見る権限が無いことの文は出さない。
- 4xx の失敗は取り直さず、すぐに出す。
  - ほかの失敗は、3 回まで取り直してから出す。
  - 取り直すかは `apps/web/src/appContext.ts` の `shouldRetryQuery` が決める。
- 事業所（`getFacility`）の失敗も、この状態にしない。
  - 予定の一覧を読めれば、その `source_mode` で予定を作る操作と通知を出し分ける。
- チームと利用者の一覧（`listTeams`、`listPatients`）の失敗は、この状態にしない。
  - 職員の絞り込みはチームを出さず、訪問の予定のタイトルは「利用者不明 訪問」になる。
