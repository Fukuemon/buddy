# schedule-link API との対応

[カレンダーの連携](index.md) の項目と、web の型と OpenAPI の項目の対応。画面を作る人と API を変える人が読む。web は `BuddyApi.calendars`（`apps/web/src/api/client.ts`）で API を呼ぶ。型は、OpenAPI の型をそのまま使う（`apps/web/src/api/types.ts` の `ExternalCalendar`）。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」を出すか | `Viewer.canManageStaff` | `getMe` の `policies[].code` に `staff.manage` があるか |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| サービスアカウントのメールアドレス | メールアドレス | `calendars.serviceAccount` の戻り値 | `getCalendarServiceAccount` の `email` |
| 職員の一覧 | 職員の名前 | `Staff.name` | `listUsers` の `Staff.username` |
| カレンダーの ID | カレンダーの ID | `ExternalCalendar.calendar_id` | `listExternalCalendars` の `items[].calendar_id` |
| 最後の取り込み | 終わった日時、期間、失敗か | `ExternalCalendar.last_import` | `ExternalCalendar.last_import` の `finished_at`、`range_start`、`range_end`、`status` |
| カレンダーの ID の入力 | 既定の値 | `Staff.email` | `listUsers` の `Staff.email` |
| 読めるか確かめる | 読めたか | `calendars.check` が成功したか | `createExternalCalendarCheck` の応答 |
| ダイアログの結び付ける | 結び付けたカレンダー | `calendars.link` の戻り値 | `createExternalCalendar` の応答の `ExternalCalendar` |
| ダイアログの外す | なし | `calendars.unlink` | `removeExternalCalendar` |
| 確かめの結果 | 状態ごとの文 | `ApiError.status`、`ApiError.code` | 応答の status と `Error.code` |

## 操作

全ての操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確かめ、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | 要求 | 成功の応答 | 誤り |
| --- | --- | --- | --- | --- |
| `getCalendarServiceAccount` | `GET /v1/facilities/{facility_id}/calendar_service_account` | なし | 200。`email` | 503 `calendar_not_configured`: サービスアカウントが設定されていない |
| `listExternalCalendars` | `GET /v1/facilities/{facility_id}/external_calendars` | なし | 200。`items` に `ExternalCalendar` の配列 | なし |
| `createExternalCalendarCheck` | `POST /v1/facilities/{facility_id}/external_calendars/check` | `calendar_id` | 200。`readable: true` | 422 `calendar_unreadable`: Google が 403 か 404 を返した。502 `calendar_unavailable`: Google に届かないか、ほかの誤り。503 `calendar_not_configured` |
| `createExternalCalendar` | `POST /v1/facilities/{facility_id}/external_calendars` | `staff_id`、`calendar_id` | 201。`ExternalCalendar` | 400 `invalid_input`: 職員が無いか、ほかの事業所の職員。409 `staff_has_calendar`、`calendar_taken`、`calendar_already_linked`。422、502、503 は `createExternalCalendarCheck` と同じ |
| `removeExternalCalendar` | `DELETE /v1/external_calendars/{external_calendar_id}` | なし | 204 | 404 `not_found`: カレンダーが無いか、外した |

- パスの `external_calendar_id` は、buddy の `external_calendars.id` である。本文と応答の `calendar_id` は Google のカレンダーの ID で、表の `external_calendars.external_calendar_id` に当たる。
- `ExternalCalendar` は、`id`、`facility_id`、`staff_id`、`provider`（`google` だけ）、`calendar_id`、`created_at`、`updated_at`、`last_import` を持つ。
  - `last_import` は、そのカレンダーの `import_runs` のうち、`started_at` が最も新しい行である。取り込んだことが無ければ `null` にする。
  - `last_import` の項目は、`id`、`range_start`、`range_end`、`status`、`imported_count`、`skipped_count`、`started_at`、`finished_at`。`status` は `running`、`succeeded`、`failed` のどれか。
- 409 の code は、表の一意の制約に当たる原因を分ける。
  - `staff_has_calendar`: 職員に外していないカレンダーがある（部分の一意の index `external_calendars_staff_key`）
  - `calendar_taken`: カレンダーがほかの職員に結び付いている。外したカレンダーも含む（`external_calendars_external_key`）
  - `calendar_already_linked`: カレンダーがその職員にすでに結び付いている
- `createExternalCalendarCheck` と `createExternalCalendar` は、Google Calendar API で予定の一覧を 1 件だけ読み、読めるかを確かめる。応答と誤りの文に、Google の応答の本文とカレンダーの ID を入れない。
- `removeExternalCalendar` は、`external_calendars` の行を消さずに `disabled_at` を入れる。取り込んだ予定と Google カレンダーの予定の対応（`external_event_links`）と取り込みの記録は残るので、同じカレンダーを結び付け直して同じ期間を取り込んでも、予定は重ならない。同じ職員に結び付け直すと、外した行の `disabled_at` を空に戻す。
