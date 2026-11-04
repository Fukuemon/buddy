# schedule-cutover API との対応

[予定の正本の切り替え](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。  
web は `BuddyApi.calendars`（`apps/web/src/api/BuddyApi.ts`）で API を呼ぶ。  
型は、OpenAPI の型をそのまま使う（`apps/web/src/api/types.ts` の `CalendarCutover`、`CalendarCutoverState`、`CalendarCutoverUnmet`）。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 状態の出し分け | 切り替え中か、正本が buddy か | `CalendarCutoverState.cutover` と `Facility.sourceMode` | `getCalendarCutoverStatus` の `cutover`、`getFacility` の `source_mode` |
| カレンダーの一覧 | 職員の名前、最後の同期の時刻と結果 | `CalendarCutoverCalendar` の `staff_name`、`last_succeeded_at`、`last_status` | `getCalendarCutoverStatus` の `calendars[]` の同じ項目 |
| カレンダーの一覧 | この切り替えの最後の取り込みの時刻 | `CalendarCutoverCalendar.last_import` | `calendars[].last_import` の `finished_at`、`started_at` |
| 取り込む | 開く職員 | `CalendarCutoverCalendar.staff_id` | `calendars[].staff_id` |
| 切り替え中の表示 | 始めた時刻、取り込みの期間の最初の日 | `CalendarCutover` の `started_at`、`range_start` | `CalendarCutover` の `started_at`、`range_start` |
| 切り替えを始める | 始めた切り替え | `calendars.startCutover` の戻り値 | `startCalendarCutover` のレスポンスの `CalendarCutover` |
| 完了する | 完了したか、満たさない一覧 | `calendars.completeCutover` の戻り値の `completed` か `unmet` | `createCalendarCutoverCompletion` の 200 の `CalendarCutover` か、409 の `items` |
| 完了できない一覧 | 職員の名前、日時、理由 | `CalendarCutoverUnmet` の `staff_name`、`date`、`start_time`、`end_time`、`ends_next_day`、`reason` | `CalendarCutoverIncomplete.items[]` の同じ項目 |
| やめる | やめた切り替え | `calendars.cancelCutover` の戻り値 | `cancelCalendarCutover` のレスポンスの `CalendarCutover` |

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込みの失敗 | 「この操作をする権限がありません。」 | `getFacility` か `getCalendarCutoverStatus` が 403 |
| 読み込みの失敗 | 「予定の正本の切り替えの状況を読み込めませんでした。時間をおいて、読み直してください。」 | `getFacility` か `getCalendarCutoverStatus` が 403 以外の失敗。API に届かないときを含む |
| 始められない | 「最後の同期が成功していないカレンダーがあります（石川 二葉）。同期が成功してから始めてください」 | `startCalendarCutover` が 409 `cutover_sync_not_ready`。文は API の文を出す |
| 始められない | 「この事業所では、ほかの画面で切り替えを始めています。画面を読み直してください。」 | `startCalendarCutover` が 409 `cutover_open` |
| 始められない | 「この事業所の予定の正本は、すでに buddy です。画面を読み直してください。」 | `startCalendarCutover` が 409 `cutover_not_google_primary` |
| 完了できない | 完了できない一覧 | `createCalendarCutoverCompletion` が 409 `cutover_incomplete` |
| 切り替え中 | 「この切り替えは、ほかの画面で完了したか、やめています。画面を読み直してください。」 | `createCalendarCutoverCompletion` か `cancelCalendarCutover` が 409 `cutover_not_open` |
| 切り替え中 | 「Google カレンダーから予定を読めませんでした。時間をおいて、もう一度完了してください。」 | `createCalendarCutoverCompletion` が 502 `calendar_unavailable` |
| 切り替え中 | 「Google カレンダーを読めない職員がいます。カレンダーの共有が外れていないかを、職員に確認してください。」 | `createCalendarCutoverCompletion` が 422 `calendar_unreadable` |

- 文を選ぶ処理は `apps/web/src/features/calendar/lib/errorMessage.ts` の `cutoverErrorMessage` にある。
- 完了できない一覧の理由の文言は `apps/web/src/features/calendar/lib/cutover.ts` の `UNMET_REASON_LABEL` と `UNMET_REASON_ACTION` にある。
