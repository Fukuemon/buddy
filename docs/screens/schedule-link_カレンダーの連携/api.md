# schedule-link API との対応

[カレンダーの連携](index.md) の項目と、web の型と OpenAPI の項目の対応。画面を作る人と API を変える人が読む。

web の型と、この画面のための OpenAPI の操作はまだ無い。OpenAPI の項目は、`apps/schedule-api/openapi.yaml` に足す操作の案で書く。案の表は、#140 で足す `external_calendars` と `import_runs` に合わせた。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」を出すか | `Viewer` に職員の管理の権限を足す（案） | `getMe` の `policies[].code` に `staff.manage` があるか |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| サービスアカウントのメールアドレス | メールアドレス | 未定 | `getCalendarServiceAccount` の `email`（案） |
| 職員の一覧 | 職員の名前 | `Staff.name` | `listUsers` の `Staff.username` |
| カレンダーの ID | カレンダーの ID | 未定 | `listExternalCalendars` の `ExternalCalendar.external_calendar_id`（案） |
| 最後の取り込み | 終わった日時、期間、失敗か | 未定 | `ExternalCalendar.last_import` の `finished_at`、`range_start`、`range_end`、`status`（案） |
| カレンダーの ID の入力 | 既定の値 | `Staff` にメールアドレスを足す（案） | `listUsers` の `Staff.email` |
| 読めるか確かめる | 読めたか | 未定 | `checkExternalCalendar` の応答（案） |
| ダイアログの結び付ける | 結び付けたカレンダー | 未定 | `createExternalCalendar` の応答の `ExternalCalendar`（案） |
| ダイアログの外す | なし | 未定 | `deleteExternalCalendar`（案） |
| 確かめの結果 | 状態ごとの文 | `ApiError.status`、`ApiError.message` | 応答の status と `Error.code` |

## 足す操作の案

全ての操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確かめ、持たなければ 403（`forbidden`）を返す。`Error.code` には、`calendar_not_configured`、`calendar_unreadable`、`calendar_unavailable` を足す。

| operationId | メソッドとパス | 要求 | 成功の応答 | 誤り |
| --- | --- | --- | --- | --- |
| `getCalendarServiceAccount` | `GET /v1/facilities/{facility_id}/calendar_service_account` | なし | 200。`email` | 503 `calendar_not_configured`: 鍵が設定されていない |
| `listExternalCalendars` | `GET /v1/facilities/{facility_id}/external_calendars` | なし | 200。`items` に `ExternalCalendar` の配列 | なし |
| `checkExternalCalendar` | `POST /v1/facilities/{facility_id}/external_calendars/check` | `external_calendar_id` | 200。`readable: true` | 422 `calendar_unreadable`: Google が 403 か 404 を返した。502 `calendar_unavailable`: Google に届かないか 5xx。503 `calendar_not_configured` |
| `createExternalCalendar` | `POST /v1/facilities/{facility_id}/external_calendars` | `staff_id`、`external_calendar_id` | 201。`ExternalCalendar` | 404 `not_found`: 職員が無い。409 `conflict`: 職員にほかのカレンダーがあるか、カレンダーがほかの職員に結び付いている。422、502、503 は `checkExternalCalendar` と同じ |
| `deleteExternalCalendar` | `DELETE /v1/external_calendars/{external_calendar_id}` | なし | 204 | 404 `not_found` |

- パスの `external_calendar_id` は、buddy の `external_calendars.id` である。要求の本文の `external_calendar_id` は、Google のカレンダーの ID で、表の `external_calendars.external_calendar_id` に当たる。名前が紛らわしいので、OpenAPI に足すときに、本文の側を `calendar_id` にするかを決める。
- `ExternalCalendar` は、`external_calendars` の列と同じ項目に、`last_import` を足す。`provider` は `google` だけを取る。
  - `last_import` は、そのカレンダーの `import_runs` のうち、`started_at` が最も新しい行である。取り込んだことが無ければ `null` にする。
  - `last_import` の項目は、`id`、`range_start`、`range_end`、`status`、`imported_count`、`skipped_count`、`finished_at`。`status` は `running`、`succeeded`、`failed` のどれか。
- 409 の 2 つの原因は、表の一意の制約 `external_calendars_staff_key` と `external_calendars_external_key` に当たる。画面が文を分けられるように、`Error.message` を原因ごとに変える。
- `checkExternalCalendar` と `createExternalCalendar` は、Google Calendar API で予定の一覧を 1 件だけ読み、読めるかを確かめる。応答と誤りの文に、Google の応答の本文とカレンダーの ID を入れない。
- `deleteExternalCalendar` は、表の外部キーの `ON DELETE CASCADE` で、`calendar_sync_states`、`external_event_links`、`import_runs` の行も消す。取り込んだ予定（`schedules`、`recurring_schedules`）は消さない。
