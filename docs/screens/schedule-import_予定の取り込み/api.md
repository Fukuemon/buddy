# schedule-import API との対応

[予定の取り込み](index.md) の項目と、web の型と OpenAPI の項目の対応。画面を作る人と API を変える人が読む。web は `BuddyApi.calendars`（`apps/web/src/api/client.ts`）で API を呼ぶ。型は、OpenAPI の型をそのまま使う（`apps/web/src/api/types.ts` の `ImportPreview`、`ImportDecision`、`ImportResult`）。結び付けの操作は、[カレンダーの連携の API との対応](../schedule-link_カレンダーの連携/api.md) にある。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」を出すか | `Viewer.canManageStaff` | `getMe` の `policies[].code` に `staff.manage` があるか |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 職員 | 結び付けた職員の名前 | `ExternalCalendar.staff_id` と `Staff.name` | `listExternalCalendars` の `items[].staff_id` と、`listUsers` の `Staff.username` |
| 期間の開始日、期間の終了日 | 日付 | `ImportRange.range_start`、`range_end` | リクエストの `range_start`、`range_end` |
| プレビューの結果のタイトル | 職員と期間 | `ImportPreview.range_start`、`range_end` | `createCalendarImportPreview` のレスポンスの `range_start`、`range_end` |
| 件数 | 5 つの件数と内訳 | `ImportPreview.counts` | `ImportPreview.counts` |
| 確認が必要な予定 | 日時、利用者名、サービス内容、理由、繰り返し | `ImportPreview.needs_review` | `ImportPreview.needs_review[]` |
| 利用者 | 候補の利用者と、ほかの利用者 | `ImportReviewItem.candidates`、`Patient` | `needs_review[].candidates[]` と、`listPatients` の `Patient.name` |
| 取り込み方 | 選んだ取り込み方 | `ImportDecision` | `createCalendarImport` のリクエストの `decisions[]` |
| 理由ごとの件数、取り込まない予定 | 日時と理由 | `ImportPreview.skipped` | `ImportPreview.skipped[]` |
| 結果の件数 | 3 つの件数 | `ImportResult` | `createCalendarImport` のレスポンスの `ImportResult` |
| 失敗の文 | 状態ごとの文 | `ApiError.status`、`ApiError.code` | レスポンスの status と `Error.code` |

## 操作

2 つの操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。パスの `external_calendar_id` は、buddy の `external_calendars.id` である。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `createCalendarImportPreview` | `POST /v1/external_calendars/{external_calendar_id}/import_previews` | `range_start`、`range_end` | 200。`ImportPreview`。予定を書かず、プレビューの結果も保存しない | 400 `invalid_input`: 期間の形が違う、開始が終了より後、1 年を超える。404 `not_found`: カレンダーが無いか、外した。422 `calendar_unreadable`。502 `calendar_unavailable`。503 `calendar_not_configured` |
| `createCalendarImport` | `POST /v1/external_calendars/{external_calendar_id}/imports` | `range_start`、`range_end`、`decisions[]` | 201。`ImportResult` | `createCalendarImportPreview` のエラーに加え、400 `invalid_input`: 選んだ利用者が事業所にいないか、取り込み方の値が違う。409 `import_preview_changed`: プレビューの後に確認が必要な予定が変わった。409 `import_running`: 同じカレンダーの取り込みが進んでいる |

### ImportPreview

| 項目 | 中身 |
| --- | --- |
| `range_start`、`range_end` | プレビューした期間。両端の日を含む |
| `counts` | `import`、`import_visit`、`import_normal`、`expanded_occurrences`、`recurring`、`recurring_as_rule`、`recurring_expanded`、`needs_review`、`skipped`、`already_imported` |
| `needs_review[]` | `external_event_id`、`revision`（まとめた予定の ID と etag から作る版）、`date`、`start_time`、`end_time`、`service`、`client_name`、`reason`（`patient_not_found`、`patient_ambiguous`）、`recurrence`（繰り返しのまま取り込む予定の規則。ほかの予定では `null`）、`candidates[]`（`patient_id`、`name`、`assigned_staff_name`） |
| `skipped[]` | `date`、`start_time`、`end_time`（読めた分だけ。読めなければ `null`）、`all_day`、`reason`（`all_day`、`multi_day`、`unreadable_time`、`zero_length`、`unreadable_title`、`service_not_found`） |

- 件数は Google の予定の数で数え、繰り返しのまま取り込む予定は 1 件に数える。回ごとにした予定は 1 回を 1 件に数え、`expanded_occurrences` に回の数を入れる。
- `needs_review[]` は、繰り返しの予定とその回のうちタイトルが親と同じものを、親の予定の ID の 1 件にまとめる。回ごとにした繰り返しの予定は `recurrence` が `null` で、`date` は期間の中の最初の回である。
- `skipped[]` とレスポンスのほかの項目に、予定のタイトルと本文を入れない。タイトルは利用者名を含むためである。`needs_review[]` の `client_name` と `service` は、確認のためにタイトルから読んだ値だけを返す。
- `skipped[]` の `reason` は、`services/schedule/internal/calendar` の `SkipReason` の値である。取り消した予定（`cancelled`）は返さない。取り消した回は、繰り返しの除外する日にするか、回ごとにするときに除くためである。タイトルが空白だけの予定は `unreadable_title` にする。

### createCalendarImport のリクエストとレスポンス

| 項目 | 中身 |
| --- | --- |
| `decisions[]` | 確認が必要な予定ごとに、`external_event_id`、`revision`（プレビューの `needs_review[].revision`）、`action`（`patient`、`normal`、`skip`）、`patient_id`（`action` が `patient` のときだけ） |
| レスポンスの `ImportResult` | `id`、`external_calendar_id`、`range_start`、`range_end`、`status`、`imported_count`、`skipped_count`、`already_imported_count`、`started_at`、`finished_at` |

- 予定の API は、Google カレンダーの予定を読み直し、プレビューと同じ規則で読み替えて、予定と `external_event_links` のレコードを 1 つのトランザクションで書く。`import_runs` のレコードは、始めに `running` で足し、終わりに `succeeded` か `failed` にする。
- 取り込み済みの判定は、`external_event_links` の一意の制約（`external_calendar_id`、`external_event_id`）で行う。同じ期間を 2 回確定しても、2 回目は対応のある予定を書かず、`already_imported_count` に数える。
- 同じカレンダーに、10 分以内に始めた `running` の `import_runs` があるときは、409 の `import_running` を返す。10 分より前の `running` は、止まった取り込みとみなして数えない。
- `already_imported_count` はテーブルに無いので、レスポンスだけに入れる。`imported_count` には、書いた予定の数（繰り返しのまま取り込んだ予定は 1 件、回ごとにした予定は 1 回を 1 件）を入れる。`skipped_count` には、取り込まない予定と、`skip` を選んだ予定を足した数を入れる。
- `decisions[]` の予定の集合が、読み直した確認が必要な予定の集合と違うか、`revision` が読み直した版と違えば、何も書かずに 409 の `import_preview_changed` を返す。プレビューの後に Google でタイトルや時刻を変えた予定に、前の取り込み方を当てないためである。
