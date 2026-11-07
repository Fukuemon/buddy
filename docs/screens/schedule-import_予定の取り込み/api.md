# schedule-import API との対応

[予定の取り込み](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。  
web は `BuddyApi.calendars`（`apps/web/src/api/BuddyApi.ts`）で API を呼ぶ。  
型は、OpenAPI の型をそのまま使う（`apps/web/src/api/types.ts` の `ImportPreview`、`ImportDecision`、`ImportResult`）。  
結び付けの操作は、[カレンダーの連携の API との対応](../schedule-link_カレンダーの連携/api.md) にある。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」「要確認」「連携」を出すか | `Viewer.policyCodes` に `staff.manage` があるか（`hasPermission`） | `getMe` の `policies[].code` に `staff.manage` があるか |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 要確認 | 確認が必要な予定の件数。100 件以上は「99+」 | `calendars.exportIssues` の戻り値の数 | `listCalendarExportIssues` の `items` の数 |
| 職員 | 結び付けた職員の名前 | `ExternalCalendar.staff_id` と `Staff.name` | `listExternalCalendars` の `items[].staff_id` と、`listUsers` の `Staff.username` |
| 期間の開始日、期間の終了日 | 日付 | `ImportRange.range_start`、`range_end` | リクエストの `range_start`、`range_end` |
| 切り替えの期間 | 期間の最初の日 | `CalendarCutoverState.cutover` の `range_start`（`CalendarImportContainer` の `openCutover`） | `getCalendarCutoverStatus` の `cutover.range_start`。プレビューと取り込みのリクエストでは、`range_start` に入れ、`range_end` を `null` にする |
| プレビューの結果のタイトル | 職員と期間 | `ImportPreview.range_start`、`range_end` | `createCalendarImportPreview` のレスポンスの `range_start`、`range_end` |
| 件数 | 6 つの件数と内訳。件数の箱は 5 つで、取り込まない件数（`skipped`）は取り込まない予定の見出しに出す | `ImportPreview.counts` | `ImportPreview.counts` |
| 確認が必要な予定 | 日時、利用者名、サービス内容、理由、繰り返し | `ImportPreview.needs_review` | `ImportPreview.needs_review[]` |
| 利用者 | 候補の利用者と、ほかの利用者 | `ImportReviewItem.candidates`、`Patient` | `needs_review[].candidates[]` と、`listPatients` の `Patient.name` |
| 取り込み方 | 選んだ取り込み方 | `ImportDecision` | `createCalendarImport` のリクエストの `decisions[]` |
| 取り込まない予定 | 件数、日時と理由 | `ImportPreview.skipped` | `ImportPreview.skipped[]` |
| 結果の件数 | 3 つの件数 | `ImportResult` | `createCalendarImport` のレスポンスの `ImportResult` |
| プレビューの失敗の文、取り込みの失敗の文 | 状態ごとの文 | `ApiError.status`、`ApiError.code` | レスポンスの status と `Error.code` |

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 職員が、プレビューを送っている途中である | `usePreviewImport` の mutation の `isPending` が `true`（`CalendarImportContainer` の `isLocked`、`CalendarImportForm` の `isPreviewing`） |
| 職員が、取り込みを送っている途中である | `useImportCalendar` の mutation の `isPending` が `true`（`CalendarImportContainer` の `isLocked`、`CalendarImportPreview` の `isSubmitting`） |
| 事業所が、予定の正本を buddy に切り替えている途中である | `getCalendarCutoverStatus` の `cutover` が `null` でない（`CalendarImportContainer` の `openCutover`。`CalendarImportForm` には `cutoverRangeStart` で渡す） |
| 職員の欄が、空である | `CalendarImportForm` の `staffId` が空。`CalendarImportContainer` は、選んだ職員か、結び付けたカレンダーのある職員の 1 人目を必ず渡す |
| 期間の欄が、プレビューできる期間である | `isImportRangeReady(range_start, range_end)` が true。`range_start` と `range_end` が `YYYY-MM-DD` の形で、`validateImportRange` が `start`（開始日が終了日より後）と `end`（1 年を超える）のエラーを返さない。`CalendarImportContainer` は、`openCutover` が `null` でないか、これが true のときに `CalendarImportForm` の `canPreview` を true にする |
| プレビューの結果に、確認が必要な予定がある | `ImportPreview.needs_review` が空でない |
| 確認が必要な予定の取り込み方で、「利用者を選ぶ」を選んでいる | 予定の `ReviewChoice.action` が `patient`（`CalendarImportReviewItem` の `choice`） |
| プレビューの結果に、取り込まない予定がある | `ImportPreview.skipped` が空でない |
| 確認が必要な予定に、取り込み方を選び終えていない予定がある | `countRemaining(needs_review, choices)` が 1 以上。`ReviewChoice` が無い予定と、`action` が `patient` で `patientId` が無い予定を数える |
| プレビューの結果に、取り込む予定がある | `ImportPreview.counts.import` が 1 以上 |
| プレビューの結果に、上書きの予定がある | `ImportPreview.counts.overwrite` が 1 以上 |

- 判定の処理は、次のファイルにある。
  - 送っている途中かと切り替えの間かは、`apps/web/src/features/calendar/components/CalendarImportContainer.tsx` が決める。
    - `CalendarImportForm.tsx` と `CalendarImportPreview.tsx` に渡す。
  - 期間の確認は、`apps/web/src/features/calendar/lib/importRange.ts` の `validateImportRange` と `isImportRangeReady` にある。
  - 選び残りと確定して取り込むを押せるかは、`apps/web/src/features/calendar/lib/importSummary.ts` の `countRemaining` と `canSubmitImport` にある。
  - 取り込み済みの文を出すかは、同じファイルの `isAllImported` にある。
    - `counts.overwrite` が 1 以上のときは出さない。切り替えの取り込み直しで上書きする予定があるためである。
  - プレビューするの横の文は、`CalendarImportForm.tsx` の `showsPreviewHint` が決める。
    - `canPreview` が false で、送っている途中でなく、`cutoverRangeStart` が無く、`range_start` か `range_end` が空のときに出す。
- 状態は、`CalendarImportContainer.tsx` が、読み込みの失敗、読み込み中、結び付けたカレンダーが無い、入力の表示の順に決める。
  - 読み込みの失敗と読み込み中は、`listExternalCalendars`、`listUsers`、`getCalendarCutoverStatus` の 3 つで決める。読み直すは、3 つの結果を捨てて読み直す。
  - プレビューの結果は、プレビューしたカレンダーが今選んでいる職員のカレンダーのときだけ出す。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 6 | カレンダーの連携 | `calendar-import-link-settings` |
| 7 | 職員 | `calendar-import-staff` |
| 8 | 期間の開始日 | `calendar-import-start` |
| 9 | 期間の終了日 | `calendar-import-end` |
| 10 | プレビューする | `calendar-import-preview` |
| 11 | 要確認 | `site-nav-review` |
| 12 | 取り込み | `site-nav-import` |
| 13 | メニュー | `site-nav-toggle` |
| 11 | プレビュー中の表示 | `calendar-import-previewing` |
| 12 | 要確認 | `site-nav-review` |
| 13 | 取り込み | `site-nav-import` |
| 14 | メニュー | `site-nav-toggle` |
| 12 | ヘルプ | `schedule-import-help` |
| 13 | 件数 | `calendar-import-summary` |
| 15 | 取り込み方 | `calendar-import-review-patient-{外部の予定の id}` |
| 16 | 取り込まない予定 | `calendar-import-skipped` |
| 17 | 選び残りの文 | `calendar-import-remaining` |
| 18 | 確定して取り込む | `calendar-import-submit` |
| 19 | 要確認 | `site-nav-review` |
| 20 | 取り込み | `site-nav-import` |
| 21 | メニュー | `site-nav-toggle` |
| 16 | 利用者 | `calendar-import-review-patient-select-{外部の予定の id}` |
| 17 | 取り込まない予定 | `calendar-import-skipped` |
| 12 | 結果の件数 | `calendar-import-result-counts` |
| 13 | 予定のカレンダーで見る | `calendar-import-open-calendar` |
| 14 | 要確認 | `site-nav-review` |
| 15 | 取り込み | `site-nav-import` |
| 16 | メニュー | `site-nav-toggle` |
| 14 | 取り込み済みの文 | `calendar-import-all-imported` |
| 15 | 確定して取り込む | `calendar-import-submit` |
| 16 | 要確認 | `site-nav-review` |
| 17 | 取り込み | `site-nav-import` |
| 18 | メニュー | `site-nav-toggle` |
| 14 | 取り込まない予定 | `calendar-import-skipped` |
| 11 | プレビューの失敗の文 | `calendar-import-error` |
| 18 | 取り込みの失敗の文 | `calendar-import-error` |
| 19 | 確定して取り込む | `calendar-import-submit` |
| 20 | 要確認 | `site-nav-review` |
| 21 | 取り込み | `site-nav-import` |
| 22 | メニュー | `site-nav-toggle` |
| 7 | カレンダーが無いことの文 | `calendar-import-no-calendar` |
| 8 | 要確認 | `site-nav-review` |
| 9 | 取り込み | `site-nav-import` |
| 10 | メニュー | `site-nav-toggle` |
| 7 | 読み込み中の表示 | `calendar-import-loading` |
| 7 | 読み込みの失敗の文 | `calendar-import-load-error` |
| 8 | 読み直す | `calendar-import-retry` |
| 9 | 要確認 | `site-nav-review` |
| 10 | 取り込み | `site-nav-import` |
| 11 | メニュー | `site-nav-toggle` |
| 6 | 予定のカレンダーへ | `page-forbidden-back` |
| 7 | メニュー | `site-nav-toggle` |
| 8 | 切り替えの期間 | `calendar-import-cutover-range` |
| 9 | プレビューする | `calendar-import-preview` |
| 11 | ヘルプ | `schedule-import-help` |
| 12 | 件数 | `calendar-import-summary` |
| 14 | 取り込み方 | `calendar-import-review-patient-{外部の予定の id}` |
| 15 | 取り込まない予定 | `calendar-import-skipped` |
| 16 | 選び残りの文 | `calendar-import-remaining` |
| 17 | 確定して取り込む | `calendar-import-submit` |
| 18 | 要確認 | `site-nav-review` |
| 19 | 取り込み | `site-nav-import` |
| 20 | メニュー | `site-nav-toggle` |
| 11 | 結果の件数 | `calendar-import-result-counts` |
| 12 | 切り替えの状況に戻る | `calendar-import-back-to-cutover` |
| 13 | 要確認 | `site-nav-review` |
| 14 | 取り込み | `site-nav-import` |
| 15 | メニュー | `site-nav-toggle` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- 行は、[予定の取り込み](index.md) の構成の状態の順に並べた。ほかの状態と番号と testid が同じ行は、最初の状態の行だけを置く。
- 取り込み方の testid は、選択肢ごとに `patient`、`normal`、`skip` が入る。表には、モックが番号を付けた「利用者を選ぶ」の `calendar-import-review-patient-{外部の予定の id}` を載せる。
- 次の testid は、構成要素の表に載せないので、この表に載せない。
  - 職員と期間の入力の枠の `calendar-import-form`
  - プレビューの結果の枠の `calendar-import-result-preview` と、件数の箱の `calendar-import-count-{箱}`
  - 確認が必要な予定の箱の `calendar-import-review-{外部の予定の id}`
  - ほかの取り込み方の `calendar-import-review-normal-{外部の予定の id}`、`calendar-import-review-skip-{外部の予定の id}`
  - 取り込まない予定の見出しの `calendar-import-skipped-heading`
  - ヘルプの説明の `schedule-import-help-text`
  - 取り込みの結果の枠の `calendar-import-result` と、件数の箱の `calendar-import-result-count-{箱}`
  - ナビゲーションのほかの項目の `site-nav-*` と、アカウントのメニューの `viewer-menu`、`viewer-profile`
  - 権限が無いことの枠の `page-forbidden`
- 実装にあり、モックに無い testid は次のとおり。
  - プレビューするの横の文の `calendar-import-preview-hint`

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 権限が無い | 「この画面を開く権限がありません」 | `getMe` の `policies[].code` に `staff.manage` が無い。web は、ほかの操作を呼ばない |
| 読み込みの失敗 | 「この操作をする権限がありません。」 | `listExternalCalendars`、`listUsers`、`getCalendarCutoverStatus` のどれかが 403 |
| 読み込みの失敗 | 「結び付けたカレンダーを読み込めませんでした。時間をおいて、読み直してください。」 | `listExternalCalendars`、`listUsers`、`getCalendarCutoverStatus` のどれかが 403 以外の失敗。API に届かないときを含む |
| プレビューの失敗 | 「この操作をする権限がありません。」 | `createCalendarImportPreview` が 403 |
| プレビューの失敗 | 「Google カレンダーから予定を読めませんでした。時間をおいて、もう一度プレビューしてください。」 | `createCalendarImportPreview` が 502 `calendar_unavailable` |
| プレビューの失敗 | 「職員 A の Google カレンダーを読めません。カレンダーの共有が外れていないかを、職員に確認してください。」 | `createCalendarImportPreview` が 422 `calendar_unreadable` |
| プレビューの失敗 | 「この事業所では、まだ Google カレンダーを使う準備ができていません。事業所の管理者に、設定を頼んでください。」 | `createCalendarImportPreview` が 503 `calendar_not_configured` |
| プレビューの失敗 | 「この職員のカレンダーの結び付けが外れています。画面を読み直してください。」 | `createCalendarImportPreview` が 404 `not_found`。カレンダーを外したか、職員が退職した |
| プレビューの失敗 | 「プレビューできませんでした。時間をおいて、もう一度プレビューしてください。」 | `createCalendarImportPreview` のほかの失敗。400 `invalid_input`、API に届かないときを含む |
| 取り込みの失敗 | 「この操作をする権限がありません。」 | `createCalendarImport` が 403 |
| 取り込みの失敗 | 「プレビューの後に、Google カレンダーの予定か職員の休職が変わりました。もう一度プレビューしてから取り込んでください。予定は 1 件も取り込んでいません。」 | `createCalendarImport` が 409 `import_preview_changed`。確認が必要な予定の集合か版が、プレビューのときと違うか、職員の休職と訪問しない職員かの判定が、読み替えたときと違う |
| 取り込みの失敗 | 「この職員の取り込みが、ほかの画面で進んでいます。終わってから、もう一度プレビューしてください。予定は 1 件も取り込んでいません。」 | `createCalendarImport` が 409 `import_running` |
| 取り込みの失敗 | 「この事業所の予定は Google カレンダーで管理しているので、buddy に取り込めません。予定は 1 件も取り込んでいません。」 | `createCalendarImport` が 409 `google_primary`。事業所が Google カレンダーを予定の正本にしている |
| 取り込みの失敗 | 「予定の正本の切り替えが、ほかの画面で完了したか、やめました。画面を読み直してください。予定は 1 件も取り込んでいません。」 | `createCalendarImport` が 409 `cutover_not_open` |
| 取り込みの失敗 | 「選んだ利用者が見つかりません。利用者を選び直してください。予定は 1 件も取り込んでいません。」 | `createCalendarImport` が 400 `invalid_input`。web は期間と取り込み方の値を確認してから送るので、残るのは選んだ利用者が事業所にいないときである |
| 取り込みの失敗 | 「この職員のカレンダーの結び付けが外れています。画面を読み直してください。予定は 1 件も取り込んでいません。」 | `createCalendarImport` が 404 `not_found` |
| 取り込みの失敗 | 「利用者の一覧を読み込めませんでした。時間をおいて、もう一度プレビューしてください。」 | 確認が必要な予定があり、`listPatients` が失敗した |
| 取り込みの失敗 | 「取り込めませんでした。時間をおいて、もう一度取り込んでください。予定は 1 件も取り込んでいません。」 | `createCalendarImport` のほかの失敗。422、502、503、API に届かないときを含む |

- 文を選ぶ処理は、`apps/web/src/features/calendar/lib/errorMessage.ts` にある。
  - `loadErrorMessage`、`previewErrorMessage`、`importErrorMessage` が文を選ぶ。
  - 利用者の一覧の失敗の文は、`PATIENTS_ERROR_MESSAGE` である。

## 操作

2 つの操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。  
パスの `external_calendar_id` は、buddy の `external_calendars.id` である。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `createCalendarImportPreview` | `POST /v1/external_calendars/{external_calendar_id}/import_previews` | `range_start`、`range_end` | 200。`ImportPreview`。予定を書かず、プレビューの結果も保存しない | 400 `invalid_input`: 期間の形が違う、開始が終了より後、1 年を超える。404 `not_found`: カレンダーが無いか、外した。422 `calendar_unreadable`。502 `calendar_unavailable`。503 `calendar_not_configured` |
| `createCalendarImport` | `POST /v1/external_calendars/{external_calendar_id}/imports` | `range_start`、`range_end`、`decisions[]` | 201。`ImportResult` | `createCalendarImportPreview` のエラーに加え、400 `invalid_input`: 選んだ利用者が事業所にいないか、取り込み方の値が違う。409 `import_preview_changed`: プレビューの後に確認が必要な予定が変わった。409 `import_running`: 同じカレンダーの取り込みが進んでいる。409 `google_primary`: 事業所が Google カレンダーを予定の正本にしている |

### ImportPreview

| 項目 | 中身 |
| --- | --- |
| `range_start`、`range_end` | プレビューした期間。両端の日を含む |
| `counts` | `import`、`import_visit`、`import_normal`、`expanded_occurrences`、`recurring`、`recurring_as_rule`、`recurring_expanded`、`needs_review`、`skipped`、`already_imported` |
| `needs_review[]` | `external_event_id`、`revision`（まとめた予定の ID と etag から作る版）、`date`、`start_time`、`end_time`、`ends_next_day`（終了が `date` の翌日か）、`service`、`client_name`、`reason`（`patient_not_found`、`patient_ambiguous`）、`recurrence`（繰り返しのまま取り込む予定の規則。ほかの予定では `null`）、`candidates[]`（`patient_id`、`name`、`assigned_staff_name`） |
| `skipped[]` | `date`、`start_time`、`end_time`（読めた分だけ。読めなければ `null`）、`ends_next_day`（終了が翌日の予定に読み替えた予定か）、`all_day`、`reason`（`all_day`、`multi_day`、`unreadable_time`、`zero_length`、`unreadable_title`、`service_not_found`、`staff_on_leave`、`staff_non_visiting`） |

- 件数は Google の予定の数で数え、繰り返しのまま取り込む予定は 1 件に数える。
  - 回ごとにした予定は 1 回を 1 件に数え、`expanded_occurrences` に回の数を入れる。
- `needs_review[]` は、繰り返しの予定とその回のうちタイトルが親と同じものを、親の予定の ID の 1 件にまとめる。
  - 回ごとにした繰り返しの予定は `recurrence` が `null` で、`date` は期間の中の最初の回になる。
- `skipped[]` とレスポンスのほかの項目に、予定のタイトルと本文を入れない。
  - タイトルは利用者名を含むためである。
  - `needs_review[]` の `client_name` と `service` は、確認のためにタイトルから読んだ値だけを返す。
- `skipped[]` の `reason` は、`services/schedule/internal/features/calendar` の `SkipReason` の値を返す。
  - 取り消した予定（`cancelled`）は返さない。取り消した回は、繰り返しの除外する日にするか、回ごとにするときに除くためである。
  - タイトルが空白だけの予定は `unreadable_title` にする。

### createCalendarImport のリクエストとレスポンス

| 項目 | 中身 |
| --- | --- |
| `decisions[]` | 確認が必要な予定ごとに、`external_event_id`、`revision`（プレビューの `needs_review[].revision`）、`action`（`patient`、`normal`、`skip`）、`patient_id`（`action` が `patient` のときだけ） |
| レスポンスの `ImportResult` | `id`、`external_calendar_id`、`range_start`、`range_end`、`status`、`imported_count`、`skipped_count`、`already_imported_count`、`started_at`、`finished_at` |

- 予定の API は、Google カレンダーの予定を読み直し、プレビューと同じ規則で読み替えて、予定と `external_event_links` のレコードを 1 つのトランザクションで書く。
  - `import_runs` のレコードは、始めに `running` で足し、終わりに `succeeded` か `failed` にする。
- 取り込み済みの判定は、`external_event_links` の一意の制約（`external_calendar_id`、`external_event_id`）で行う。
  - 同じ期間を 2 回確定しても、2 回目は対応のある予定を書かず、`already_imported_count` に数える。
- 同じカレンダーに、10 分以内に始めた `running` の `import_runs` があるときは、409 の `import_running` を返す。
  - 10 分より前の `running` は、止まった取り込みとみなして数えない。
- `already_imported_count` はテーブルに無いので、レスポンスだけに入れる。
- `imported_count` には、書いた予定の数を入れる。
  - 繰り返しのまま取り込んだ予定は 1 件、回ごとにした予定は 1 回を 1 件に数える。
- `skipped_count` には、取り込まない予定と、`skip` を選んだ予定を足した数を入れる。
- `decisions[]` の予定の集合が、読み直した確認が必要な予定の集合と違うか、`revision` が読み直した版と違えば、何も書かずに 409 の `import_preview_changed` を返す。
  - プレビューの後に Google でタイトルや時刻を変えた予定に、前の取り込み方を当てないためである。
