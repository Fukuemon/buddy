# schedule-import API との対応

[予定の取り込み](index.md) の項目と、web の型と OpenAPI の項目の対応。画面を作る人と API を変える人が読む。

web の型と、この画面のための OpenAPI の操作はまだ無い。OpenAPI の項目は、`apps/schedule-api/openapi.yaml` に足す操作の案で書く。案の表は、#140 で足す `external_calendars`、`external_event_links`、`import_runs` に合わせた。結び付けの操作の案は、[カレンダーの連携の API との対応](../schedule-link_カレンダーの連携/api.md) にある。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」を出すか | `Viewer` に職員の管理の権限を足す（案） | `getMe` の `policies[].code` に `staff.manage` があるか |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 職員 | 結び付けた職員の名前 | `Staff.name` | `listExternalCalendars` の `ExternalCalendar.staff_id` と、`listUsers` の `Staff.username`（案） |
| 期間の開始日、期間の終了日 | 日付 | 未定 | 要求の `range_start`、`range_end`（案） |
| 下見の結果の題 | 職員と期間 | 未定 | `previewCalendarImport` の `range_start`、`range_end`（案） |
| 件数 | 5 つの件数と内訳 | 未定 | `ImportPreview.counts`（案） |
| 確かめが要る予定 | 日時、利用者名、サービス内容、理由、繰り返し | 未定 | `ImportPreview.needs_review[]`（案） |
| 利用者 | 候補の利用者と、ほかの利用者 | `Patient.id`、`Patient.name` | `needs_review[].candidates[]` と、`listPatients` の `Patient.name`、`assigned_staff_name` |
| 取り込み方 | 選んだ取り込み方 | 未定 | `createCalendarImport` の要求の `decisions[]`（案） |
| 理由ごとの件数、取り込まない予定 | 日時と理由 | 未定 | `ImportPreview.skipped[]`（案） |
| 結果の件数 | 3 つの件数 | 未定 | `createCalendarImport` の応答の `ImportRun`（案） |
| 失敗の文 | 状態ごとの文 | `ApiError.status`、`ApiError.message` | 応答の status と `Error.code` |

## 足す操作の案

2 つの操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確かめ、持たなければ 403（`forbidden`）を返す。パスの `external_calendar_id` は、buddy の `external_calendars.id` である。

| operationId | メソッドとパス | 要求 | 成功の応答 | 誤り |
| --- | --- | --- | --- | --- |
| `previewCalendarImport` | `POST /v1/external_calendars/{external_calendar_id}/import_previews` | `range_start`、`range_end` | 200。`ImportPreview`。予定を書かず、下見の結果も保存しない | 400 `invalid_input`: 期間の形が違う、開始が終了より後、1 年を超える。404 `not_found`: 結び付けが無い。422 `calendar_unreadable`。502 `calendar_unavailable`。503 `calendar_not_configured` |
| `createCalendarImport` | `POST /v1/external_calendars/{external_calendar_id}/imports` | `range_start`、`range_end`、`decisions[]` | 201。`ImportRun` | `previewCalendarImport` の誤りに加え、409 `conflict`: 下見の後に確かめが要る予定が変わったか、同じカレンダーの取り込みが進んでいる。422 `invalid_input`: 選んだ利用者が事業所にいない |

### ImportPreview

| 項目 | 中身 |
| --- | --- |
| `range_start`、`range_end` | 下見した期間。両端の日を含む |
| `counts` | `import`、`import_visit`、`import_normal`、`expanded_occurrences`、`recurring`、`recurring_as_rule`、`recurring_expanded`、`needs_review`、`skipped`、`already_imported` |
| `needs_review[]` | `external_event_id`、`date`、`start_time`、`end_time`、`service`、`client_name`、`reason`（`patient_not_found`、`patient_ambiguous`）、`recurrence`（繰り返しの規則。単発なら `null`）、`candidates[]`（`patient_id`、`name`、`assigned_staff_name`） |
| `skipped[]` | `date`、`start_time`、`end_time`（読めた分だけ。読めなければ `null`）、`all_day`、`reason`（`all_day`、`multi_day`、`unreadable_time`、`zero_length`、`unreadable_title`、`service_not_found`） |

- 件数は Google の予定の数で数え、繰り返しの予定は 1 件に数える。`expanded_occurrences` は、回ごとにした回の数である。
- `skipped[]` と応答のほかの項目に、予定の題名と本文を入れない。題名は利用者名を含むためである。`needs_review[]` の `client_name` と `service` は、確かめのために題名から読んだ値だけを返す。
- `skipped[]` の `reason` は、`apps/schedule-api/internal/calendar` の `SkipReason` の値に、取り込みの手順で決める `service_not_found` を足したものである。`cancelled` は返さない。取り消した回は、繰り返しの除外する日にするか、回ごとにするときに除くためである。

### createCalendarImport の要求と応答

| 項目 | 中身 |
| --- | --- |
| `decisions[]` | 確かめが要る予定ごとに、`external_event_id`、`action`（`patient`、`normal`、`skip`）、`patient_id`（`action` が `patient` のときだけ） |
| 応答の `ImportRun` | `id`、`external_calendar_id`、`range_start`、`range_end`、`status`、`imported_count`、`skipped_count`、`already_imported_count`、`started_at`、`finished_at` |

- 予定の API は、Google カレンダーの予定を読み直し、下見と同じ規則で読み替えて、予定と `external_event_links` の行を 1 つのトランザクションで書く。`import_runs` の行は、始めに `running` で足し、終わりに `succeeded` か `failed` にする。
- 取り込み済みの判定は、`external_event_links` の一意の制約（`external_calendar_id`、`external_event_id`）で行う。同じ期間を 2 回確定しても、2 回目は対応のある予定を書かず、`already_imported_count` に数える。
- 同じカレンダーに `running` の `import_runs` があるときは、409 を返す。
- `already_imported_count` は表に無いので、応答だけに入れる。`skipped_count` には、取り込まない予定と、`skip` を選んだ予定を足した数を入れる。
- `decisions[]` の予定の集合が、読み直した確かめが要る予定の集合と違えば、何も書かずに 409 を返す。
