# schedule-recurrence API との対応

[繰り返しの変更](index.md) の項目と、web の型と OpenAPI の項目の対応。  
予定は `getSchedule`（`GET /v1/schedules/{schedule_id}`）で取る。  
繰り返しは `changeRecurringRule`（`PUT /v1/schedules/recurring/{recurring_schedule_id}/rule`）で変える。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 変える範囲の説明 | 開いた回の日と今日の遅い方 | `Schedule.startsAt` の Asia/Tokyo の日付と、画面を開いたときの Asia/Tokyo の今日 | `getSchedule` の `date`。保存では `changeRecurringRule` の本文の `effective_date` |
| 変えない項目 | 時刻 | `Schedule.startsAt`、`Schedule.endsAt` の時刻 | `getSchedule` の `start_time`、`end_time` |
| 変えない項目 | 利用者の名前か、タイトル | `Schedule.visit.patientId` を利用者の一覧（`Patient.name`）で引いた名前、`Schedule.title` | `getSchedule` の `visit_info.patient_id`、`title` |
| 変えない項目 | 主訪問者か予定者の名前 | `Schedule.staffId` を職員の一覧（`Staff.name`）で引く | `getSchedule` の `staff_id` |
| 繰り返し | 選択肢と、選んでいる選択肢 | 選択肢は開いた回の日から作る。選んでいる選択肢は、フォームの値の `recurrence` が当たる選択肢 | 開いたときは `recurring_rule` |
| 繰り返す | 毎週か毎月か | フォームの値の `recurrence.frequency`。開いたときは `Schedule.recurrence.rule.frequency` | `recurring_rule.frequency` |
| 間隔 | 毎週の間隔の週の数 | フォームの値の `recurrence.interval`。開いたときは `RecurringRule.interval`（毎月と、値が無いときは 1） | `recurring_rule.interval` |
| 曜日 | 毎週の曜日の集まり | フォームの値の `recurrence.weeklyDays`。開いたときは `RecurringRule.daysOfWeek`（毎月と、値が無いときは開いた回の曜日の 1 つ） | `recurring_rule.days_of_week` |
| 日にちで決める、曜日で決める | 日にちか第何週の曜日か | フォームの値の `recurrence.monthlyBy`。開いたときは `RecurringRule.weekOfMonth` があれば `weekday` | `recurring_rule.week_of_month` があるか |
| 日にち | 毎月の日 | フォームの値の `recurrence.dayOfMonth`。開いたときは `RecurringRule.dayOfMonth` | `recurring_rule.day_of_month` |
| 週 | 毎月の第何週か | フォームの値の `recurrence.weekOfMonth`。開いたときは `RecurringRule.weekOfMonth` | `recurring_rule.week_of_month` |
| 毎月の曜日 | 毎月の第何週の曜日 | フォームの値の `recurrence.dayOfWeek`。開いたときは `RecurringRule.dayOfWeek` | `recurring_rule.day_of_week` |
| 終了日なし、終了日あり | 終了日があるか | フォームの値の `recurrence.hasEndDate`。開いたときは `RecurringRule.endDate` があるか | `recurring_rule.end_date` が null でない |
| 終了日 | 繰り返しの最後の日 | フォームの値の `recurrence.endDate`。開いたときは `RecurringRule.endDate` | `recurring_rule.end_date` |
| 権限が無いことの説明 | 予定の職員の予定を編集できないか | `Viewer.schedulePolicies`、`Schedule.staffId`、予定の職員の `Staff.teamId` | `getMe` の `policies`、`getSchedule` の `staff_id` |
| 繰り返しを変えられないことの文 | キャンセルした予定か、繰り返しの予定のまだ変えていない回か | `Schedule.cancel`、`Schedule.recurrence` | `getSchedule` の `cancel`、`recurring_schedule_id` と `recurring_rule` |
| 切り替えていることの文 | 事業所が予定の正本を buddy に切り替えている途中か | `Facility.sourceMode` が `google_primary` で、`ScheduleList.cutover` が `null` でない | `getFacility` の `source_mode`、`listSchedules` の `cutover` |
| （画面に出さない） | 繰り返しの予定の ID | `Schedule.recurrence.recurringScheduleId` | `getSchedule` の `recurring_schedule_id`。送るのは `changeRecurringRule` のパスの `recurring_schedule_id` |
| （画面に出さない） | 保存で送る予定の etag | `Schedule.etag` | `getSchedule` の `etag`。送るのは `changeRecurringRule` の本文の `etag` |
| （画面に出さない） | 新しい繰り返しの予定の ID | 画面を開いたときに作った ID | `changeRecurringRule` の本文の `id` |

- 画面は、`buddy_primary` と `google_primary` のどちらの事業所でも `getSchedule` で予定を読む。
  - `buddy_primary` の繰り返しの予定の回は、web のサーバーが `getRecurringSchedule` で繰り返しの予定を取り、`recurring_schedule_id` と `recurring_rule` を持つ回の形にする。処理は `apps/web/src/api/http/recurrence.ts` の `occurrenceOf` にある。
  - `google_primary` の繰り返しの回は、予定の API が `getSchedule` に親の ID と規則を返す。
  - web のサーバーは、`recurring_schedule_id` と `recurring_rule` の両方がある予定だけに `Schedule.recurrence` を付ける。処理は `apps/web/src/api/http/scheduleMapper.ts` の `fromApiSchedule` にある。
  - 1 回だけ変えた回は、単発の予定として返るので `Schedule.recurrence` を持たない。
- 予定の正本を切り替えているかは、予定の詳細と同じく、`getFacility`（`GET /v1/facilities/{facility_id}`）の `source_mode` と、`listSchedules` の `cutover` で読む。
  - `google_primary` の事業所では、カレンダーの search params の `view` と `date` から `getCalendarRange` で決めた期間で `listSchedules` を読み、`staffIds` は渡さない。`includeCancelled` には search params の `cancelled` を渡す。予定の詳細と同じ一覧の取得の結果を使う。
  - `buddy_primary` の事業所では `listSchedules` を読まず、切り替えていないとして扱う。
  - `getCalendarCutoverStatus` は職員の管理の権限を求めるので使わない。
  - 最初に読み終えた値を保ち、開いた後に一覧を読み直して `cutover` が変わっても、状態を変えない。開いた後の切り替えは、保存が 409 `cutover_open` で拒まれて知らせ、入力を消さないためである。
  - 処理は `apps/web/src/features/schedule/queries.ts` の `useCutoverAtOpen` にある。
- 繰り返しの選択肢は、`apps/web/src/features/schedule/components/RecurringRuleFields.tsx` の `presetsOf` が開いた回の日から作る。
  - 欄の初期値は、`recurring_rule` の空の項目を開いた回の日から埋めて作る。処理は `apps/web/src/features/schedule/schema/recurringRuleForm.ts` の `toRecurringRuleFormValues` にある。
- 保存の流れは次のとおり。
  - `effective_date` は、開いた回の日と今日の遅い方である。今日は画面を開いたときに決める。予定の API が今日より前の `effective_date` を拒むためである（ADR-0037）。
  - `etag` は開いたときの `Schedule.etag`（`google_primary` では親の予定の etag）で、`null` なら送らない。409 `google_event_changed` の後は、`getSchedule` で読み直した予定の `etag` に置き換える。読み直せないか、別の繰り返しの予定の回か、規則が変わっていたら、置き換えずに開き直すことを出す。開いたときの規則から作った入力のまま送ると、Google カレンダーで変えた規則を知らずに消すためである。
  - `id` は画面を開いたときに作った ULID で、送り直しでも同じ値を送る。`google_primary` で元の親に書けずに失敗したとき、新しい親を重ねずにやり直すためである。
  - 繰り返しを変えずに終了日だけを変えたときは、今の `recurring_rule` の終了日だけを替えて送る。予定の API は、終了日だけの変更として扱い、`effective_date` を読まない。処理は `apps/web/src/features/schedule/schema/recurringRuleChange.ts` の `recurringRuleToSend` にある。
  - 成功すると、応答の `date`（新しい繰り返しの最初の日付）と `effective_date` の遅い方を `date` にして、予定のカレンダーへ戻る。開いた回の取得の結果を捨て、事業所の予定の取得の結果を捨てて取り直す。処理は `apps/web/src/features/schedule/queries.ts` の `useChangeRecurringRule` にある。
  - 呼び出しは `apps/web/src/api/http/httpBuddyApi.ts` の `schedules.changeRule` にある。
- 入力の検証は、開いたときの欄の値と `effective_date` で行う。
  - 処理は `apps/web/src/features/schedule/schema/recurringRuleChange.ts` の `createRecurringRuleChangeSchema` にある。

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 職員が、日で「日にち」を選んでいる | フォームの値の `recurrence.monthlyBy` が `day` |
| 職員が、日で「曜日」を選んでいる | フォームの値の `recurrence.monthlyBy` が `weekday` |
| 職員が、終了日で「あり」を選んでいる | フォームの値の `recurrence.hasEndDate` が `true` |
| 事業所が、予定の正本を buddy に切り替えている途中である | `useCutoverAtOpen` が `true`。`google_primary` の事業所で、画面を開いたときの `ScheduleList.cutover` が `null` でない（`listSchedules` の `cutover`）。`buddy_primary` の事業所では読まず、`false` にする |
| 職員が、保存を送っている途中である | react-hook-form の `formState.isSubmitting` が `true`（保存のボタンの `isLoading` に渡す）。`changeRecurringRule` を呼んでから予定のカレンダーへ移るまでと、409 `google_event_changed` の後に `getSchedule` で読み直し終えるまでを含む |

- 押せなくする判定は、`apps/web/src/features/schedule/components/RecurringRuleFields.tsx` の `disabled` にある。
- 保存のボタンは packages/ui の `Button` で、`isLoading` の間は押しても `onClick` と送信を止める。
- 状態の出し分けは、`apps/web/src/features/schedule/components/ScheduleRecurrenceModalContainer.tsx` が次の順に判定する。
  - 権限が無い: `apps/web/src/features/schedule/lib/schedulePermission.ts` の `canEditScheduleOf` が `false`
  - 繰り返しを変えられない予定: `Schedule.cancel` がある。または `Schedule.recurrence` が無い
  - 予定の正本を切り替えている: `apps/web/src/features/schedule/queries.ts` の `useCutoverAtOpen` が `true`
  - 今日より前の回から開いた: `Schedule.startsAt` の Asia/Tokyo の日付が、画面を開いたときの Asia/Tokyo の今日より前
  - カスタム: フォームの値の `recurrence` が、開いた回の日から作る 3 つの選択肢のどれとも同じでない。または「カスタム…」を選んだ

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 3 | 閉じる | `modal-close` |
| 3 | 変える範囲の説明 | `schedule-recurrence-lead` |
| 4 | 変えない項目 | `schedule-recurrence-summary` |
| 5 | 繰り返し | `recurring-rule-preset` |
| 6 | 繰り返す | `recurring-rule-frequency` |
| 7 | 間隔 | `recurring-rule-interval` |
| 8 | 曜日 | `recurring-rule-day-of-week-{曜日}` |
| 7 | 日にちで決める | `recurring-rule-monthly-by-day` |
| 8 | 日にち | `recurring-rule-day-of-month` |
| 9 | 曜日で決める | `recurring-rule-monthly-by-weekday` |
| 10 | 週 | `recurring-rule-week-of-month` |
| 11 | 毎月の曜日 | `recurring-rule-monthly-day-of-week` |
| 6 | 終了日なし | `recurring-rule-ends-never` |
| 9 | 終了日なし | `recurring-rule-ends-never` |
| 12 | 終了日なし | `recurring-rule-ends-never` |
| 7 | 終了日あり | `recurring-rule-ends-on` |
| 10 | 終了日あり | `recurring-rule-ends-on` |
| 13 | 終了日あり | `recurring-rule-ends-on` |
| 8 | 終了日 | `recurring-rule-end-date` |
| 11 | 終了日 | `recurring-rule-end-date` |
| 14 | 終了日 | `recurring-rule-end-date` |
| 9 | キャンセル | `schedule-recurrence-cancel` |
| 10 | キャンセル | `schedule-recurrence-cancel` |
| 12 | キャンセル | `schedule-recurrence-cancel` |
| 15 | キャンセル | `schedule-recurrence-cancel` |
| 10 | 保存 | `schedule-recurrence-submit` |
| 11 | 保存 | `schedule-recurrence-submit` |
| 13 | 保存 | `schedule-recurrence-submit` |
| 16 | 保存 | `schedule-recurrence-submit` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- 閉じるの `modal-close` は、packages/ui の `Modal` が付ける。
- 曜日の `{曜日}` は、1（月曜）から 7（日曜）の数である。
- `recurring-rule-` で始まる testid は、繰り返しの欄（`apps/web/src/features/schedule/components/RecurringRuleFields.tsx`）が付ける。
- 番号を振らないモーダルの全体は、次の testid を持つ。
  - 欄を出す状態のモーダルの `schedule-recurrence-modal`
  - 「権限が無い」の状態のモーダルの `schedule-recurrence-forbidden`
  - 「繰り返しを変えられない予定」の状態のモーダルの `schedule-recurrence-blocked`
  - 「予定の正本を切り替えている」の状態のモーダルの `schedule-recurrence-cutover`
- 読み込み中の表示、読み込みの失敗の文、権限が無いことの説明、繰り返しを変えられないことの文、切り替えていることの文、入力の誤りの文、保存の失敗の文は、testid を持たない。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込みの失敗 | 「予定が見つかりません。」 | `getSchedule` か `getRecurringSchedule` が 404 |
| 読み込みの失敗 | 「この予定を見る権限がありません。」 | `getSchedule` か `getRecurringSchedule` が 403。予定の `facility_id` がログインした職員の事業所と違う（web のサーバーが 403 にする） |
| 読み込みの失敗 | 「予定を取得できませんでした。」 | `getSchedule` か `getRecurringSchedule` が 401、403、404 以外で失敗。`listUsers`、`listPatients`、`getFacility` のどれかが 401 以外で失敗。`google_primary` の事業所で `listSchedules` が 401 以外で失敗。API に届かない |
| 権限が無い | 「この予定を編集する権限がありません。」 | API の失敗ではない。`getMe` の `policies` で、予定の職員の予定を編集できない |
| 繰り返しを変えられない予定 | 「キャンセルした予定からは、繰り返しを変えられません。」 | API の失敗ではない。`getSchedule` の `cancel` がある |
| 繰り返しを変えられない予定 | 「この予定は繰り返しの予定の回ではないため、繰り返しを変えられません。」 | API の失敗ではない。`getSchedule` の `recurring_schedule_id` か `recurring_rule` が無い |
| 予定の正本を切り替えている | 「予定の正本を buddy に切り替えています。切り替えが終わるまで、予定を作成、変更、キャンセルできません。」 | API の失敗ではない。`google_primary` の事業所で、画面を開いたときの `listSchedules` の `cutover` が `null` でない |
| 保存の失敗 | 「この操作をする権限がありません。」 | `changeRecurringRule` が 403 |
| 保存の失敗 | 「入力の内容では予定を更新できません。内容を直してください。」 | `changeRecurringRule` が 400 |
| 保存の失敗 | 「この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください。」 | `changeRecurringRule` が 409 `google_primary` |
| 保存の失敗 | 「Google カレンダーで予定が変更されていました。最新の予定を確認してから、もう一度保存してください。」 | `changeRecurringRule` が 409 `google_event_changed` |
| 保存の失敗 | 「Google カレンダーで繰り返しの予定が変わっていました。予定のカレンダーから開き直し、最新の繰り返しを確認してください。」 | `changeRecurringRule` が 409 `google_event_changed` で、`getSchedule` で読み直せないか、読み直した予定の `Schedule.recurrence` の `recurringScheduleId` か `rule` が開いたときと違う。保存のボタンを押せなくする |
| 保存の失敗 | 「Google カレンダーで予定が消されたか、見つかりません。」 | `changeRecurringRule` が 409 `google_event_not_found` |
| 保存の失敗 | 「前の保存の結果を確認しています。時間をおいて、予定を開き直してください。」 | `changeRecurringRule` が 409 `google_write_pending` |
| 保存の失敗 | 「Google カレンダーに書けませんでした。時間をおいて、やり直してください。」 | `changeRecurringRule` が 503 `google_unavailable` |
| 保存の失敗 | 「Google カレンダーに書けたかを確認できませんでした。時間をおいて、予定を開き直してください。」 | `changeRecurringRule` が 503 `google_write_unknown` |
| 保存の失敗 | 「Google カレンダーに予定を書く権限がありません。カレンダーの共有の設定を、事業所の管理者に確認してください。」 | `changeRecurringRule` が 409 `google_calendar_unwritable` |
| 保存の失敗 | 「Google カレンダーが予定を受け付けませんでした。入力を確認してください。」 | `changeRecurringRule` が 409 `google_event_rejected` |
| 保存の失敗 | 「予定の職員が Google カレンダーを結び付けていません。カレンダーの結び付けを、事業所の管理者に頼んでください。」 | `changeRecurringRule` が 409 `calendar_not_linked` |
| 保存の失敗 | 「この事業所には、Google カレンダーと連携する設定がありません。事業所の管理者に確認してください。」 | `changeRecurringRule` が 503 `calendar_not_configured` |
| 保存の失敗 | 「予定の正本を buddy に切り替えています。切り替えが終わるまで、予定を作成、変更、キャンセルできません。」 | `changeRecurringRule` が 409 `cutover_open` |
| 保存の失敗 | 「予定を更新できませんでした。」 | `changeRecurringRule` が、ここまでのほかの失敗（404、409 `conflict`、500 など）。API に届かない |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | 読み込みのどれかが 401 |

- `changeRecurringRule` が 401 のときは、文を出さず、ログインの画面へ移るまで保存を送っている途中のままにする。

- 読み込みの失敗の文は、`apps/web/src/features/schedule/lib/errorMessage.ts` の `scheduleLoadErrorMessage` が、予定の取得の status で選ぶ。職員と利用者の一覧、事業所、予定の一覧を読めなかったときは、`SCHEDULE_LOAD_ERROR_MESSAGE` を出す。
- 保存の失敗の文は、同じ `errorMessage.ts` の `scheduleSubmitErrorMessage` が、`ApiError.status` と `ApiError.code` で、操作を「更新」として選ぶ。
