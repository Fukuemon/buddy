# schedule-review API との対応

[確かめが要る予定](index.md) の項目と、web の型と OpenAPI の項目の対応。画面を作る人と API を変える人が読む。web は `BuddyApi.calendars`（`apps/web/src/api/client.ts`）で API を呼ぶ。型は、OpenAPI の型をそのまま使う（`apps/web/src/api/types.ts` の `CalendarExport`、`CalendarExportIssue`）。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」と「要確認」を出すか | `Viewer.canManageStaff` | `getMe` の `policies[].code` に `staff.manage` があるか |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 予定の一覧 | 行と並び | `calendars.exportIssues` の戻り値 | `listCalendarExportIssues` の `items`。新しく変わった順 |
| 予定の日時 | 日付、時刻、繰り返しか | `CalendarExportIssue.date`、`start_time`、`end_time`、`recurring_schedule_id` | `CalendarExportIssue` の `date`、`start_time`、`end_time`、`recurring_schedule_id`。繰り返しの予定の `date` は最初の回の日付 |
| 職員 | 職員の名前 | `CalendarExportIssue.staff_name` | `CalendarExportIssue` の `staff_name` |
| 理由 | 理由ごとの文 | `CalendarExportIssue.error_code`、`status` | `CalendarExport` の `error_code`（`precondition_failed`、`not_found`、`forbidden`、`rejected`、`unavailable`、`unappliable`）と `status`（`conflict`、`failed`）。`precondition_failed` は `acceptable` でも文を分ける |
| 最後に変わった日時 | 日時 | `CalendarExportIssue.updated_at` | `CalendarExport` の `updated_at` |
| Google の内容に合わせる | 出すか | `CalendarExportIssue.acceptable` | `CalendarExportIssue` の `acceptable` |
| 予定を開く | 出すかと、移る先の予定 | `CalendarExportIssue.schedule_id` | `CalendarExport` の `schedule_id`。繰り返しの予定では `null` |
| buddy の内容で書き直す | なし | `CalendarExportIssue.id` | `CalendarExport` の `id` |
| 書き直す予定 | 日時と職員の名前 | `CalendarExportIssue` の日時の項目と `staff_name` | 予定の日時と職員と同じ |
| ダイアログの書き直す | 書き直す待ちにした書き出し | `calendars.retryExport` の戻り値 | `createCalendarExportRetry` の応答の `CalendarExport` |
| 読み込みの失敗の文 | 権限で拒まれたか | `ApiError.status` | 応答の status |
| 書き直しの失敗の文 | 理由ごとの文 | `ApiError.status`、`ApiError.code` | 応答の status と `Error.code` |
| 合わせる予定 | 日時と職員の名前 | `CalendarExportIssue` の日時の項目と `staff_name` | 予定の日時と職員と同じ |
| ダイアログの合わせる | 合わせて終えた書き出し | `calendars.acceptExport` の戻り値 | `createCalendarExportAcceptance` の応答の `CalendarExport` |
| 合わせるの失敗の文 | 理由ごとの文 | `ApiError.status`、`ApiError.code` | 応答の status と `Error.code` |

## 操作

全ての操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確かめ、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | 要求 | 成功の応答 | 誤り |
| --- | --- | --- | --- | --- |
| `listCalendarExportIssues` | `GET /v1/facilities/{facility_id}/calendar_export_issues` | なし | 200。`items` に `CalendarExportIssue` の配列 | なし |
| `createCalendarExportRetry` | `POST /v1/calendar_exports/{calendar_export_id}/retries` | なし | 202。`CalendarExport` | 404 `not_found`: 書き出しが無い。409 `export_not_in_review`: 確かめが要る書き出しでない。すでに書き直す待ちにしたか、書き終えた |
| `createCalendarExportAcceptance` | `POST /v1/calendar_exports/{calendar_export_id}/acceptances` | なし | 200。`status` が `succeeded` の `CalendarExport` | 404 `not_found`。409 `export_not_in_review`、`export_not_acceptable`（`acceptable` が false）、`external_change_unappliable`（Google の予定を読み替えられない）。422 `calendar_unreadable`、502 `calendar_unavailable`、503 `calendar_not_configured` |

- `listCalendarExportIssues` は、書き出しのうち `status` が `conflict` か `failed` のものを返す。予定の題名、利用者名、カレンダーの ID は返さない。
- `CalendarExport` は、`id`、`schedule_id`、`recurring_schedule_id`、`status`、`error_code`、`attempts`、`updated_at` を持つ。`schedule_id` と `recurring_schedule_id` は、どちらか一方だけに値がある。
  - `status` は次のどれか。
    - `pending`: 書く待ち
    - `succeeded`: 書き終えた
    - `conflict`: buddy と Google カレンダーの両方で予定が変わったか、Google カレンダーで予定が消えていたか、Google カレンダーの変更を buddy に読み替えられないので、止めた
    - `failed`: 書く権限が無いか、再送の上限まで書けなかった
  - `error_code` は、最後に書けなかった理由で、次のどれか。
    - `precondition_failed`: buddy と Google カレンダーの両方で予定が変わった（書き出しの 412 を含む）
    - `not_found`: Google カレンダーで予定が消された
    - `forbidden`: サービスアカウントがカレンダーに書けない
    - `rejected`: Google が予定の内容を受け付けなかった
    - `unavailable`: Google に届かないか、一時的な誤りが続いた
    - `unappliable`: Google カレンダーの変更を buddy の予定に読み替えられない
- `CalendarExportIssue` は、`CalendarExport` に、予定の職員（`staff_id`、`staff_name`）と日時（`date`、`start_time`、`end_time`）と `acceptable` を足したものである。
  - `acceptable` は、Google カレンダーの内容に合わせられるかである。単発の予定で、`status` が `conflict`、`error_code` が `precondition_failed` か `not_found` のときに true である。
- `createCalendarExportRetry` は、書き出しを、Google カレンダーの予定の変更を比べずに buddy の今の内容で書き直す待ちにする。書き出しの処理が、次の周期で書く。Google カレンダーで消された予定は作り直す。
- `createCalendarExportAcceptance` は、予定の API が Google カレンダーの今の予定を読み、buddy の予定をその内容にして、書き出しを終える。Google カレンダーで消された予定は、buddy でキャンセルする。
