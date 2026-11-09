# schedule-cutover API との対応

[予定の正本の切り替え](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。  
web は `BuddyApi.calendars`（`apps/web/src/api/BuddyApi.ts`）で API を呼ぶ。  
型は、OpenAPI の型をそのまま使う（`apps/web/src/api/types.ts` の `CalendarCutover`、`CalendarCutoverState`、`CalendarCutoverUnmet`）。

## 値の対応

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

- 最後の同期と最後の取り込みの文言は、`apps/web/src/features/calendar/lib/cutover.ts` の `formatCutoverSync` と `formatCutoverImport` が作る。
  - 最後の取り込みは、`finished_at` が `null` なら `started_at` を出す。

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 職員が、切り替えの開始を送っている途中である | `useStartCutover` の mutation の `isPending` が `true`（`CalendarCutoverView` の `isStarting`） |
| 職員が、完了を送っている途中である | `useCompleteCutover` の mutation の `isPending` が `true`（`CalendarCutoverView` の `isCompleting`） |
| 職員が、やめる操作を送っている途中である | `useCancelCutover` の mutation の `isPending` が `true`（`CalendarCutoverCancelDialog` の `isSubmitting`） |

- 状態は、`CalendarCutoverContainer.tsx` が、読み込みの失敗、この画面での完了、読み込み中、切り替え中、正本が buddy、切り替えの前の順に判定する。
- やめる操作を送っている間は、ダイアログのキャンセルとやめるに `disabled` を付け、覆いと Escape キーでも閉じない。packages/ui の `ConfirmDialog` と `Dialog` が決める。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 2 | カレンダーの連携 | `calendar-cutover-link-settings` |
| 5 | Google カレンダーを変えない案内 | `calendar-cutover-no-edit` |
| 6 | カレンダーの一覧 | `calendar-cutover-calendars` |
| 7 | 切り替えを始める | `calendar-cutover-start` |
| 7 | 始めるの失敗の文 | `calendar-cutover-start-error` |
| 8 | 切り替えを始める | `calendar-cutover-start` |
| 4 | 切り替え中の表示 | `calendar-cutover-open` |
| 7 | 取り込む | `calendar-cutover-open-import-{職員の id}` |
| 8 | 完了する | `calendar-cutover-complete` |
| 9 | 切り替えをやめる | `calendar-cutover-cancel` |
| 8 | 完了できない一覧 | `calendar-cutover-unmet` |
| 9 | 完了する | `calendar-cutover-complete` |
| 10 | 切り替えをやめる | `calendar-cutover-cancel` |
| 4 | キャンセル | `calendar-cutover-cancel-confirm-cancel` |
| 5 | やめる | `calendar-cutover-cancel-confirm-submit` |
| 4 | 完了したことの文 | `calendar-cutover-completed` |
| 5 | 予定のカレンダーを開く | `calendar-cutover-open-calendar` |
| 4 | 正本が buddy のことの文 | `calendar-cutover-buddy-primary` |
| 4 | 読み込み中の表示 | `calendar-cutover-loading` |
| 4 | 読み込みの失敗の文 | `calendar-cutover-load-error` |
| 5 | 読み直す | `calendar-cutover-retry` |
| 8 | 最新の情報の読み込みの失敗の文 | `refetch-error` |
| 9 | 最新の情報を読み直す | `refetch-retry` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- 次の testid は、構成要素の表に載せないので、この表に載せない。
  - カレンダーの一覧の行の `calendar-cutover-calendar-{職員の id}`
  - 行の中の最後の取り込みの `calendar-cutover-import-{職員の id}` と、最後の同期の `calendar-cutover-sync-{職員の id}`
  - 完了できない一覧の表の `calendar-cutover-unmet-table` と、行の `calendar-cutover-unmet-{理由}`
  - やめる前の確認のダイアログの本体の `calendar-cutover-cancel-confirm-dialog`
- 完了の失敗の文の `calendar-cutover-complete-error` と、やめるの失敗の文の `calendar-cutover-cancel-confirm-error` は、実装にあり、モックに無い。

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
| 切り替え中 | 「この事業所では、まだ Google カレンダーを使う準備ができていません。事業所の管理者に、設定を頼んでください。」 | `createCalendarCutoverCompletion` が 503 `calendar_not_configured` |
| 始められない、切り替え中 | 「この操作をする権限がありません。」 | `startCalendarCutover`、`createCalendarCutoverCompletion`、`cancelCalendarCutover` が 403 |
| 始められない、切り替え中 | 「操作できませんでした。時間をおいて、もう一度試してください。」 | `startCalendarCutover`、`createCalendarCutoverCompletion`、`cancelCalendarCutover` のほかの失敗。409 `google_write_pending`、API に届かないときを含む |
| 最新の情報の読み込みの失敗 | 「最新の情報を読み込めませんでした。」 | 読み終えた後に読み直して、`getFacility` か `getCalendarCutoverStatus`が失敗、API に届かない。403 と 404 も含む |

- 文を選ぶ処理は `apps/web/src/features/calendar/lib/errorMessage.ts` の `cutoverErrorMessage` にある。
- 完了の失敗の文は、`createCalendarCutoverCompletion` の 409 `cutover_incomplete` のほかの全ての失敗で出す。
  - 出す場所は、完了するのボタンの上である（`CalendarCutoverView.tsx` の `completeError`）。
- 完了の条件の 6 つは、`CalendarCutoverUnmet.reason` の `not_imported`、`sync_stale`、`event_not_imported`、`needs_review`、`changed`、`deleted` に当たる。
- 始める、完了する、やめるの mutation は、成功したときだけ `onSuccess` で切り替えの状況、事業所、予定を読み直す（`apps/web/src/features/calendar/queries.ts`）。
  - 完了は、完了したときと、完了の条件を満たさない一覧が返ったときに読み直す。
  - 失敗したときは読み直さず、今の状態のまま失敗の文を出す。ほかの画面で先に操作されても、失敗の文が消えない。
  - 始めるが 409 `cutover_sync_not_ready` で失敗したときだけ、カレンダーの一覧の最後の同期を出し直すために、切り替えの状況を読み直す。状態は「始められない」のままである。
- 完了できない一覧の理由の文言は `apps/web/src/features/calendar/lib/cutover.ts` の `UNMET_REASON_LABEL` と `UNMET_REASON_ACTION` にある。
