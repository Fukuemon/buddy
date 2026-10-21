# schedule-review API との対応

[確かめが要る予定](index.md) の項目と、web の型と OpenAPI の項目の対応。画面を作る人と API を変える人が読む。web は `BuddyApi.calendars`（`apps/web/src/api/client.ts`）で API を呼ぶ。型は、OpenAPI の型をそのまま使う（`apps/web/src/api/types.ts` の `CalendarExport`、`CalendarExportIssue`）。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」と「要確認」を出すか | `Viewer.canManageStaff` | `getMe` の `policies[].code` に `staff.manage` があるか |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 予定の一覧 | 行と並び | `calendars.exportIssues` の戻り値 | `listCalendarExportIssues` の `items`。新しく変わった順 |
| 予定の日時 | 日付、時刻、繰り返しか | `CalendarExportIssue.date`、`start_time`、`end_time`、`recurring_schedule_id` | `CalendarExportIssue` の `date`、`start_time`、`end_time`、`recurring_schedule_id`。繰り返しの予定の `date` は最初の回の日付 |
| 職員 | 職員の名前 | `CalendarExportIssue.staff_name` | `CalendarExportIssue` の `staff_name` |
| 理由 | 理由ごとの文 | `CalendarExportIssue.error_code`、`status` | `CalendarExport` の `error_code`（`precondition_failed`、`not_found`、`forbidden`、`unavailable`）と `status`（`conflict`、`failed`） |
| 気付いた日時 | 日時 | `CalendarExportIssue.updated_at` | `CalendarExport` の `updated_at` |
| 予定を開く | 出すかと、移る先の予定 | `CalendarExportIssue.schedule_id` | `CalendarExport` の `schedule_id`。繰り返しの予定では `null` |
| buddy の内容で書き直す | なし | `CalendarExportIssue.id` | `CalendarExport` の `id` |
| 書き直す予定 | 日時と職員の名前 | `CalendarExportIssue` の日時の項目と `staff_name` | 予定の日時と職員と同じ |
| ダイアログの書き直す | 書き直す待ちにした書き出し | `calendars.retryExport` の戻り値 | `createCalendarExportRetry` の応答の `CalendarExport` |
| 読み込みの失敗の文 | 権限で拒まれたか | `ApiError.status` | 応答の status |
| 書き直しの失敗の文 | 理由ごとの文 | `ApiError.status`、`ApiError.code` | 応答の status と `Error.code` |

## 操作

全ての操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確かめ、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | 要求 | 成功の応答 | 誤り |
| --- | --- | --- | --- | --- |
| `listCalendarExportIssues` | `GET /v1/facilities/{facility_id}/calendar_export_issues` | なし | 200。`items` に `CalendarExportIssue` の配列 | なし |
| `createCalendarExportRetry` | `POST /v1/calendar_exports/{calendar_export_id}/retries` | なし | 202。`CalendarExport` | 404 `not_found`: 書き出しが無い。409 `export_not_in_review`: 確かめが要る書き出しでない。すでに書き直す待ちにしたか、書き終えた |

- `listCalendarExportIssues` は、書き出しのうち `status` が `conflict` か `failed` のものを返す。予定の題名、利用者名、カレンダーの ID は返さない。
- `CalendarExport` は、`id`、`schedule_id`、`recurring_schedule_id`、`status`、`error_code`、`attempts`、`updated_at` を持つ。`schedule_id` と `recurring_schedule_id` は、どちらか一方だけに値がある。
  - `status` は次のどれか。
    - `pending`: 書く待ち
    - `succeeded`: 書き終えた
    - `conflict`: Google カレンダーで予定が変わっていたか消えていたので、書かずに止めた
    - `failed`: 書く権限が無いか、再送の上限まで書けなかった
  - `error_code` は、最後に書けなかった理由で、次のどれか。
    - `precondition_failed`: Google カレンダーで予定が変わっていた（412）
    - `not_found`: Google カレンダーで予定が消された
    - `forbidden`: サービスアカウントがカレンダーに書けない
    - `unavailable`: Google に届かないか、一時的な誤りが続いた
- `CalendarExportIssue` は、`CalendarExport` に、予定の `staff_id`、`staff_name`、`date`、`start_time`、`end_time` を足したものである。
- `createCalendarExportRetry` は、書き出しを、Google カレンダーの予定の変更を比べずに buddy の今の内容で書き直す待ちにする。書き出しの処理が、次の周期で書く。Google カレンダーで消された予定は作り直す。
