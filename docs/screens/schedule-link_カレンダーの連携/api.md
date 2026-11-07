# schedule-link API との対応

[カレンダーの連携](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。  
web は `BuddyApi.calendars`（`apps/web/src/api/BuddyApi.ts`）で API を呼ぶ。  
型は、OpenAPI の型をそのまま使う（`apps/web/src/api/types.ts` の `ExternalCalendar`）。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」「要確認」「連携」を出すか | `Viewer.policyCodes` に `staff.manage` があるか（`hasPermission`） | `getMe` の `policies[].code` に `staff.manage` があるか |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 共有する相手のメールアドレス | この事業所のサービスアカウントのメールアドレス | `calendars.serviceAccount` の戻り値 | `getCalendarServiceAccount` の `email` |
| 職員の一覧 | 職員の名前 | `Staff.name` | `listUsers` の `Staff.username` |
| カレンダーの ID | カレンダーの ID | `ExternalCalendar.calendar_id` | `listExternalCalendars` の `items[].calendar_id` |
| 最後の取り込み | 終わった日時、期間、失敗か | `ExternalCalendar.last_import` | `ExternalCalendar.last_import` の `finished_at`、`range_start`、`range_end`、`status` |
| 結び付ける、行の操作 | どちらを出すか | `ExternalCalendar` が職員にあるか | `listExternalCalendars` の `items[].staff_id` に職員があるか |
| カレンダーの ID の入力 | デフォルト値 | `Staff.email` | `listUsers` の `Staff.email` |
| 読めるか確認する | 読めたか | `calendars.check` が成功したか | `createExternalCalendarCheck` のレスポンス |
| ダイアログの結び付ける | 結び付けたカレンダー | `calendars.link` の戻り値 | `createExternalCalendar` のレスポンスの `ExternalCalendar` |
| ダイアログの外す | なし | `calendars.unlink` | `removeExternalCalendar` |
| 確認の結果 | 状態ごとの文 | `ApiError.status`、`ApiError.code` | レスポンスの status と `Error.code` |

- 職員の一覧の行は、`CalendarLinkContainer.tsx` が、`Staff.status` が `retired` の職員を除き、`Staff.name` の順（`localeCompare` の `ja`）に並べて作る。
- 最後の取り込みの文言は、`apps/web/src/components/lastImport.ts` の `formatLastImport` が作る。
  - `finished_at` が `null` なら `started_at` を出す。

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 行の職員に、結び付けたカレンダーがある | 行の `CalendarLinkRow.calendar` が `undefined` でない。`listExternalCalendars` の `items[]` のうち、`staff_id` が行の職員の `Staff.id` のもの |
| この事業所で、Google カレンダーを使う準備ができている | `calendars.serviceAccount` の戻り値（`CalendarLinkViewState.serviceAccount`）が `null` でない（`CalendarLinkTable` の `canLink`） |
| 職員が、結び付けを送っている途中である | `useLinkCalendar` の mutation の `isPending` が `true`（`CalendarLinkDialog` の `isSubmitting`） |
| カレンダーの ID の入力が、空である | `calendarId.trim()` が `''` |
| 職員が、読めるかの確認を送っている途中である | `useCheckCalendar` の mutation の `isPending` が `true`（`CalendarCheckStatus` が `checking`） |
| 今入れているカレンダーの ID で、読めるかの確認が成功している | `CalendarCheckStatus` が `readable`。`useCheckCalendar` が成功し、その `variables` が `calendarId.trim()` と同じで、確認と結び付けのどちらも失敗していない |
| 職員が、外す操作を送っている途中である | `useUnlinkCalendar` の mutation の `isPending` が `true`（`CalendarUnlinkDialog` の `isSubmitting`） |

- `CalendarCheckStatus` は、`CalendarLinkContainer.tsx` が、確認の途中、確認か結び付けの失敗、今の入力での確認の成功の順に決める。
- 送っている間は、ダイアログの閉じる、キャンセル、確定のボタンと入力の欄に `disabled` を付け、覆いと Escape キーでも閉じない。packages/ui の `InputDialog`、`ConfirmDialog`、`Dialog` が決める。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 6 | 共有の手順 | `calendar-link-guide` |
| 7 | 共有する相手のメールアドレス | `calendar-link-service-account` |
| 8 | コピー | `calendar-link-copy` |
| 9 | 共有の手順の詳しく | `calendar-link-guide-toggle` |
| 10 | 職員の一覧 | `calendar-link-table` |
| 11 | カレンダーの ID | `calendar-link-calendar-id-{職員の id}` |
| 13 | 結び付ける | `calendar-link-open-{職員の id}` |
| 14 | 行の操作 | `calendar-link-menu-{職員の id}` |
| 15 | 要確認 | `site-nav-review` |
| 16 | 取り込み | `site-nav-import` |
| 17 | メニュー | `site-nav-toggle` |
| 18 | 予定の正本の切り替え | `calendar-link-cutover` |
| 11 | 結び付ける | `calendar-link-open-{職員の id}` |
| 12 | 要確認 | `site-nav-review` |
| 13 | 取り込み | `site-nav-import` |
| 14 | メニュー | `site-nav-toggle` |
| 15 | 予定の正本の切り替え | `calendar-link-cutover` |
| 2 | 結び付けるダイアログ | `calendar-link-dialog` |
| 3 | 閉じる | `calendar-link-dialog-close` |
| 4 | 職員の名前 | `calendar-link-staff` |
| 5 | カレンダーの ID のヘルプ | `schedule-link-calendar-id-help` |
| 6 | カレンダーの ID の入力 | `calendar-link-input` |
| 7 | 読めるか確認する | `calendar-link-check` |
| 8 | キャンセル | `calendar-link-cancel` |
| 9 | ダイアログの結び付ける | `calendar-link-submit` |
| 10 | 確認の結果 | `calendar-link-check-result` |
| 2 | 外すダイアログ | `calendar-unlink-dialog` |
| 4 | キャンセル | `calendar-unlink-cancel` |
| 5 | ダイアログの外す | `calendar-unlink-submit` |
| 6 | 読み込み中の表示 | `calendar-link-loading` |
| 7 | 要確認 | `site-nav-review` |
| 8 | 取り込み | `site-nav-import` |
| 9 | メニュー | `site-nav-toggle` |
| 10 | 予定の正本の切り替え | `calendar-link-cutover` |
| 6 | 読み込みの失敗の文 | `calendar-link-error` |
| 7 | 読み直す | `calendar-link-retry` |
| 8 | 要確認 | `site-nav-review` |
| 9 | 取り込み | `site-nav-import` |
| 10 | メニュー | `site-nav-toggle` |
| 11 | 予定の正本の切り替え | `calendar-link-cutover` |
| 6 | 準備ができていないことの文 | `calendar-link-not-configured` |
| 7 | 職員の一覧 | `calendar-link-table` |
| 8 | カレンダーの ID | `calendar-link-calendar-id-{職員の id}` |
| 10 | 結び付ける | `calendar-link-open-{職員の id}` |
| 11 | 行の操作 | `calendar-link-menu-{職員の id}` |
| 6 | 予定のカレンダーへ | `page-forbidden-back` |
| 7 | メニュー | `site-nav-toggle` |
| 1 | 行の操作のメニュー | `calendar-link-menu-list-{職員の id}` |
| 2 | 取り込む | `calendar-link-import-{職員の id}` |
| 3 | 外す | `calendar-link-remove-{職員の id}` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- 行は、「一覧」「結び付けていない」「結び付けるダイアログ」と「読めた」「読めない」「外すダイアログ」「読み込み中」「読み込みの失敗」「準備ができていない」「権限が無い」「行の操作のメニュー」の状態の順に並べた。ほかの状態と番号と testid が同じ行は、最初の状態の行だけを置く。
- 次の testid は、構成要素の表に載せないので、この表に載せない。
  - 職員の一覧の行の `calendar-link-row-{職員の id}`
  - 共有の手順の欄の `calendar-link-steps` と、ヘルプの説明の `schedule-link-calendar-id-help-text`
  - ナビゲーションのほかの項目の `site-nav-*` と、アカウントのメニューの `viewer-menu`、`viewer-profile`
  - 権限が無いことの枠の `page-forbidden`
- 実装にあり、モックに無い testid は次のとおり。
  - 読めるか確認するの横の文の `calendar-link-check-hint`
  - ダイアログの結び付けるの上の文の `calendar-link-submit-hint`
  - 外すの失敗の文の `calendar-unlink-error`

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 権限が無い | 「この画面を開く権限がありません」 | `getMe` の `policies[].code` に `staff.manage` が無い。web は、ほかの操作を呼ばない |
| 準備ができていない | 「この事業所では、まだ Google カレンダーを使う準備ができていません。事業所の管理者に、設定を頼んでください。」 | `getCalendarServiceAccount` が 503 `calendar_not_configured` |
| 読み込みの失敗 | 「この操作をする権限がありません。」 | `listUsers`、`listExternalCalendars`、`getCalendarServiceAccount` のどれかが 403 |
| 読み込みの失敗 | 「職員とカレンダーを読み込めませんでした。時間をおいて、読み直してください。」 | `listUsers`、`listExternalCalendars` のどちらかが 403 以外の失敗か、`getCalendarServiceAccount` が 403 と 503 `calendar_not_configured` 以外の失敗。API に届かないときを含む |
| 読めない | 「この操作をする権限がありません。」 | `createExternalCalendarCheck` か `createExternalCalendar` が 403 |
| 読めない | 「このカレンダーを読めません。カレンダーが、上に出ている buddy のメールアドレスに共有されているかと、カレンダーの ID が合っているかを確認してください。」 | 422 `calendar_unreadable` |
| 読めない | 「このカレンダーは、ほかの職員に結び付いています。」 | `createExternalCalendar` が 409 `calendar_taken` |
| 読めない | 「この職員には、ほかのカレンダーが結び付いています。一覧を読み直してください。」 | `createExternalCalendar` が 409 `staff_has_calendar` |
| 読めない | 「このカレンダーは、この職員にすでに結び付いています。一覧を読み直してください。」 | `createExternalCalendar` が 409 `calendar_already_linked` |
| 読めない | 「Google カレンダーに届きませんでした。時間をおいて、もう一度確認してください。」 | 502 `calendar_unavailable` |
| 読めない | 「確認できませんでした。時間をおいて、もう一度確認してください。」 | ほかの失敗。400 `invalid_input`、503 `calendar_not_configured`、API に届かないときを含む |
| 外すダイアログ | 「この操作をする権限がありません。」 | `removeExternalCalendar` が 403 |
| 外すダイアログ | 「外せませんでした。時間をおいて、もう一度外してください。」 | `removeExternalCalendar` が 403 以外の失敗。404 `not_found` を含む |

- 文を選ぶ処理は、`apps/web/src/features/calendar/lib/errorMessage.ts` にある。
  - `loadErrorMessage`、`linkErrorMessage`、`unlinkErrorMessage` が文を選ぶ。
- 準備ができていないことは、`apps/web/src/features/calendar/queries.ts` の `serviceAccountQueryOptions` が決める。
  - `getCalendarServiceAccount` の 503 `calendar_not_configured` を、メールアドレスが無いこと（`null`）にする。

## 操作

全ての操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getCalendarServiceAccount` | `GET /v1/facilities/{facility_id}/calendar_service_account` | なし | 200。`email` | 503 `calendar_not_configured`: サービスアカウントが設定されていない |
| `listExternalCalendars` | `GET /v1/facilities/{facility_id}/external_calendars` | なし | 200。`items` に `ExternalCalendar` の配列 | なし |
| `createExternalCalendarCheck` | `POST /v1/facilities/{facility_id}/external_calendars/check` | `calendar_id` | 200。`readable: true` | 422 `calendar_unreadable`: Google が 403 か 404 を返した。502 `calendar_unavailable`: Google に届かないか、ほかのエラー。503 `calendar_not_configured` |
| `createExternalCalendar` | `POST /v1/facilities/{facility_id}/external_calendars` | `staff_id`、`calendar_id` | 201。`ExternalCalendar` | 400 `invalid_input`: 職員が無いか、ほかの事業所の職員。409 `staff_has_calendar`、`calendar_taken`、`calendar_already_linked`。422、502、503 は `createExternalCalendarCheck` と同じ |
| `removeExternalCalendar` | `DELETE /v1/external_calendars/{external_calendar_id}` | なし | 204 | 404 `not_found`: カレンダーが無いか、外した |

- パスの `external_calendar_id` は、buddy の `external_calendars.id` を指す。
- 本文とレスポンスの `calendar_id` は Google のカレンダーの ID で、テーブルの `external_calendars.external_calendar_id` に当たる。
- `ExternalCalendar` は、`id`、`facility_id`、`staff_id`、`provider`、`calendar_id`、`created_at`、`updated_at`、`last_import` を持つ。
  - `provider` は `google` だけを取る。
  - `last_import` は、そのカレンダーの `import_runs` のうち、`started_at` が最も新しいレコードである。取り込んだことが無ければ `null` にする。
  - `last_import` の項目は、`id`、`range_start`、`range_end`、`status`、`imported_count`、`skipped_count`、`started_at`、`finished_at`。`status` は `running`、`succeeded`、`failed` のどれか。
- 409 の code は、テーブルの一意の制約に当たる原因を分ける。
  - `staff_has_calendar`: 職員に外していないカレンダーがある（部分の一意の index `external_calendars_staff_key`）
  - `calendar_taken`: カレンダーがほかの職員に結び付いている。外したカレンダーも含む（`external_calendars_external_key`）
  - `calendar_already_linked`: カレンダーがその職員にすでに結び付いている
- `createExternalCalendarCheck` と `createExternalCalendar` は、Google Calendar API で予定の一覧を 1 件だけ読み、読めるかを確認する。
  - レスポンスとエラーの文に、Google のレスポンスの本文とカレンダーの ID を入れない。
- `removeExternalCalendar` は、`external_calendars` のレコードを消さずに `disabled_at` を入れる。
  - 取り込んだ予定と Google カレンダーの予定の対応（`external_event_links`）と取り込みの記録は残るので、同じカレンダーを結び付け直して同じ期間を取り込んでも、予定は重ならない。
  - 同じ職員に結び付け直すと、外したレコードの `disabled_at` を空に戻す。
