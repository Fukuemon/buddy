# schedule-review API との対応

[確認が必要な予定](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。  
web は `BuddyApi.calendars`（`apps/web/src/api/BuddyApi.ts`）で API を呼ぶ。  
型は、OpenAPI の型をそのまま使う（`apps/web/src/api/types.ts` の `CalendarExport`、`CalendarExportIssue`）。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」「要確認」「連携」を出すか | `Viewer.policyCodes` に `staff.manage` があるか（`hasPermission`） | `getMe` の `policies[].code` に `staff.manage` があるか |
| ログインした職員 | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 要確認 | 確認が必要な予定の件数。100 件以上は「99+」 | `calendars.exportIssues` の戻り値の数 | `listCalendarExportIssues` の `items` の数 |
| 予定の一覧 | 行と並びと、行がどの予定か | `calendars.exportIssues` の戻り値と、`CalendarExportIssue.schedule_id`、`recurring_schedule_id` | `listCalendarExportIssues` の `items` |
| 予定の日時 | 日付、時刻、繰り返しか | `CalendarExportIssue.date`、`start_time`、`end_time`、`ends_next_day`、`recurring_schedule_id` | `CalendarExportIssue` の `date`、`start_time`、`end_time`、`ends_next_day`、`recurring_schedule_id` |
| 職員 | 職員の名前 | `CalendarExportIssue.staff_name` | `CalendarExportIssue` の `staff_name` |
| 理由 | 理由ごとの文 | `CalendarExportIssue.error_code`、`status`、`acceptable`、`recurring_schedule_id` | `CalendarExport` の `error_code` と `status`、`CalendarExportIssue` の `acceptable` と `recurring_schedule_id` |
| 最後に変わった日時 | 日時 | `CalendarExportIssue.updated_at` | `CalendarExport` の `updated_at` |
| 予定の確認のダイアログ | どの予定を開いたか | 押した行の `CalendarExportIssue` | `listCalendarExportIssues` の `items` の 1 件 |
| ダイアログの予定の日時 | 一覧の行と同じ値 | 一覧の行と同じ項目 | 一覧の行と同じ項目 |
| ダイアログの職員 | 一覧の行と同じ値 | 一覧の行と同じ項目 | 一覧の行と同じ項目 |
| ダイアログの最後に変わった日時 | 一覧の行と同じ値 | 一覧の行と同じ項目 | 一覧の行と同じ項目 |
| ダイアログの理由 | 一覧の行と同じ値 | 一覧の行と同じ項目 | 一覧の行と同じ項目 |
| 予定を開く | 出すかと、移る先の予定 | `CalendarExportIssue.schedule_id` | `CalendarExport` の `schedule_id` |
| buddy の内容で書き直す | なし | `CalendarExportIssue.id` | `CalendarExport` の `id` |
| 書き直す予定 | 日時と職員の名前 | `CalendarExportIssue` の日時の項目と `staff_name` | 予定の日時と職員と同じ |
| 書き直すときの注意 | buddy でキャンセルした単発の予定か | `CalendarExportIssue.status`、`error_code`、`acceptable`、`recurring_schedule_id` | `CalendarExportIssue` の `status`、`error_code`、`acceptable`、`recurring_schedule_id` |
| ダイアログの書き直す | 書き直す待ちにした書き出し | `calendars.retryExport` の戻り値 | `createCalendarExportRetry` のレスポンスの `CalendarExport` |
| 読み込みの失敗の文 | 権限で拒まれたか | `ApiError.status` | レスポンスの status |
| 書き直しの失敗の文 | 理由ごとの文 | `ApiError.status`、`ApiError.code` | レスポンスの status と `Error.code` |

表の項目の値と、値から表示を決める規則は次のとおり。

- 予定の一覧の `items` は、新しく変わった順に並ぶ。
  - 確認が必要な書き出しは予定ごとに 1 件なので、行は単発の予定の `schedule_id` か、繰り返しの予定の `recurring_schedule_id` で 1 行に決まる。
- 繰り返しの予定の `date` は、最初の回の日付である。
- 理由の文は、`error_code` と `status`（`conflict`、`failed`）で分ける。
  - `error_code` は、`precondition_failed`、`not_found`、`forbidden`、`rejected`、`unavailable`、`unappliable`、`not_buddy_primary` のどれかである。
  - `precondition_failed` は、`CalendarExportIssue` の `acceptable` と `recurring_schedule_id` でも文を分ける。
  - 単発の予定で `acceptable` が false なのは、buddy でキャンセルした予定である。
- 予定の確認のダイアログを開くときに、API は呼ばない。
- 予定を開くの `schedule_id` は、繰り返しの予定では `null` になる。
- 書き直すときの注意は、buddy でキャンセルした単発の予定に出す。
  - buddy でキャンセルした単発の予定は、`status` が `conflict` で、`error_code` が `precondition_failed` か `not_found` の予定である。
  - そのうえ、`acceptable` が false で、`recurring_schedule_id` が `null` になる。

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 開いた予定が、繰り返しの予定である | 押した行の `CalendarExportIssue.schedule_id` が `null`（`recurring_schedule_id` に値がある）。`CalendarReviewDialog` は `schedule_id` が `null` でないときだけ予定を開くを出す |
| 職員が、書き直しを送っている途中である | `useRetryExport` の mutation の `isPending` が `true`（`CalendarRewriteDialog` の `isSubmitting`） |

- 送っている間は、ダイアログのキャンセルと書き直すに `disabled` を付け、覆いと Escape キーでも閉じない。packages/ui の `ConfirmDialog`、`DialogSubmit` の `SubmitButtons`、`Dialog` が決める。
- 状態は、`CalendarReviewContainer.tsx` が、読み込みの失敗、読み込み中、一覧の順に決め、`CalendarReviewView.tsx` が一覧の 0 件を空にする。
  - 開いているダイアログは、`CalendarReviewContainer.tsx` の `target` の `step`（`detail` か `rewrite`）が決める。
  - キャンセルした予定の確認とキャンセルした予定を書き直すダイアログは、`isCancelledSingleIssue` が true の予定のときである。
    - 関数は `apps/web/src/features/calendar/lib/exportIssue.ts` にある。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 5 | ヘルプ | `schedule-review-help` |
| 7 | 予定の一覧 | `calendar-review-table` |
| 8 | 予定の行 | `calendar-review-row-schedule-schedule-1` |
| 9 | 予定の日時 | `calendar-review-datetime-export-1` |
| 11 | 理由 | `calendar-review-reason-export-1` |
| 13 | 要確認 | `site-nav-review` |
| 14 | 取り込み | `site-nav-import` |
| 15 | メニュー | `site-nav-toggle` |
| 7 | 予定が無いことの文 | `calendar-review-empty` |
| 8 | 要確認 | `site-nav-review` |
| 9 | 取り込み | `site-nav-import` |
| 10 | メニュー | `site-nav-toggle` |
| 7 | 読み込み中の表示 | `calendar-review-loading` |
| 7 | 読み込みの失敗の文 | `calendar-review-error` |
| 8 | 読み直す | `calendar-review-retry` |
| 9 | 要確認 | `site-nav-review` |
| 10 | 取り込み | `site-nav-import` |
| 11 | メニュー | `site-nav-toggle` |
| 2 | 予定の確認のダイアログ | `calendar-review-dialog` |
| 3 | 閉じる | `calendar-review-close` |
| 4 | ダイアログの予定の日時 | `calendar-review-dialog-datetime` |
| 7 | ダイアログの理由 | `calendar-review-dialog-reason` |
| 8 | 予定を開く | `calendar-review-open-export-1` |
| 9 | buddy の内容で書き直す | `calendar-review-rewrite-export-1` |
| 2 | 書き直すダイアログ | `calendar-rewrite-dialog` |
| 3 | 書き直す予定 | `calendar-rewrite-target` |
| 4 | 書き直すときの注意 | `calendar-rewrite-notice` |
| 5 | キャンセル | `calendar-rewrite-cancel` |
| 6 | ダイアログの書き直す | `calendar-rewrite-submit` |
| 5 | 書き直しの失敗の文 | `calendar-rewrite-error` |
| 6 | キャンセル | `calendar-rewrite-cancel` |
| 7 | ダイアログの書き直す | `calendar-rewrite-submit` |
| 8 | 予定を開く | `calendar-review-open-export-5` |
| 9 | buddy の内容で書き直す | `calendar-review-rewrite-export-5` |
| 6 | 予定のカレンダーへ | `page-forbidden-back` |
| 7 | メニュー | `site-nav-toggle` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- 行は、[確認が必要な予定](index.md) の構成の状態の順に並べた。ほかの状態と番号と testid が同じ行は、最初の状態の行だけを置く。
- 行ごとの testid は、モックの値をそのまま載せる。実装は、次の形で作る。
  - 予定の行は、単発の予定で `calendar-review-row-schedule-{予定の id}`、繰り返しの予定で `calendar-review-row-recurring-{繰り返しの予定の id}` である。
  - 予定の日時と理由は、`calendar-review-datetime-{書き出しの id}`、`calendar-review-reason-{書き出しの id}` である。
  - 予定を開くと buddy の内容で書き直すは、`calendar-review-open-{書き出しの id}`、`calendar-review-rewrite-{書き出しの id}` である。
- 次の testid は、構成要素の表に載せないので、この表に載せない。
  - ヘルプの説明の `schedule-review-help-text`
  - ナビゲーションのほかの項目の `site-nav-*` と、要確認の件数の印の `site-nav-review-count`
  - アカウントのメニューの `viewer-menu`、`viewer-profile`
  - 権限が無いことの枠の `page-forbidden`

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 権限が無い | 「この画面を開く権限がありません」 | `getMe` の `policies[].code` に `staff.manage` が無い |
| 読み込みの失敗 | 「この操作をする権限がありません。」 | `listCalendarExportIssues` が 403 |
| 読み込みの失敗 | 「確認が必要な予定を読み込めませんでした。時間をおいて、読み直してください。」 | `listCalendarExportIssues` が 403 でない status で失敗したか、API に届かない |
| 書き直しの失敗 | 「この操作をする権限がありません。」 | `createCalendarExportRetry` が 403 |
| 書き直しの失敗 | 「この予定は、すでに書き直しを始めたか、書き直し終えています。一覧を読み直してください。」 | `createCalendarExportRetry` が 409 `export_not_in_review` か 404 `not_found` |
| 書き直しの失敗 | 「書き直せませんでした。時間をおいて、もう一度書き直してください。」 | `createCalendarExportRetry` がほかの理由で失敗したか、API に届かない |

- 権限が無いときは、web は、ほかの操作を呼ばない。
- 文を選ぶ処理は、`apps/web/src/features/calendar/lib/errorMessage.ts` にある。
  - `loadErrorMessage` と `rewriteErrorMessage` が文を選ぶ。

## 操作

全ての操作は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `listCalendarExportIssues` | `GET /v1/facilities/{facility_id}/calendar_export_issues` | なし | 200 と、`items` に `CalendarExportIssue` の配列 | なし |
| `createCalendarExportRetry` | `POST /v1/calendar_exports/{calendar_export_id}/retries` | なし | 202 と `CalendarExport` | 404 `not_found`、409 `export_not_in_review` |

- エラーの code の意味は次のとおり。
  - `not_found`: 書き出しが無い。
  - `export_not_in_review`: 確認が必要な書き出しでない。すでに書き直す待ちにしたか、書き終えた。
- `listCalendarExportIssues` は、書き出しのうち `status` が `conflict` か `failed` のものを返す。
  - 予定のタイトル、利用者名、カレンダーの ID は返さない。
- `CalendarExport` は、`id`、`schedule_id`、`recurring_schedule_id`、`status`、`error_code`、`attempts`、`updated_at` を持つ。
  - `schedule_id` と `recurring_schedule_id` は、どちらか一方だけに値がある。
  - `status` は次のどれか。
    - `pending`: 書く待ち
    - `succeeded`: 書き終えた
    - `conflict`: buddy と Google カレンダーの両方で予定が変わったか、Google カレンダーで予定が消えていたか、Google カレンダーの変更を buddy に読み替えられないので、止めた
    - `failed`: 書く権限が無いか、再送の上限まで書けなかった
  - `error_code` は、最後に書けなかった理由で、次のどれか。
    - `precondition_failed`: buddy と Google カレンダーの両方で予定が変わった
      - 消された予定を除く書き出しの 412 を含む。
    - `not_found`: Google カレンダーで予定が消されたか、予定かカレンダーが見つからない（404）
      - Google カレンダーで予定が消されたときには、消された予定への書き出しの 412 を含む。
    - `forbidden`: サービスアカウントがカレンダーに書けない
    - `rejected`: Google が予定の内容を受け付けなかった
    - `unavailable`: Google に届かないか、一時的なエラーが続いた
    - `unappliable`: Google カレンダーの変更を buddy の予定に読み替えられない
    - `not_buddy_primary`: 事業所が `buddy_primary` でないので、書かずに `conflict` で保留にした
      - 扱いは [Google カレンダーとの連携の Design Doc](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/internal/features/calendar/DesignDoc.md) にある。
- `CalendarExportIssue` は、`CalendarExport` に、予定の職員（`staff_id`、`staff_name`）と日時と `acceptable` を足した項目を持つ。
  - 日時は `date`、`start_time`、`end_time`、`ends_next_day` で表す。
  - `acceptable` は、Google カレンダーで予定が変わったか消えたので書けなかった、buddy でキャンセルしていない単発の予定かを示す。`status` が `conflict` で、`error_code` が `precondition_failed` か `not_found` のときに true になる。
  - web は、理由の文と書き直すときの注意を分けるのに `acceptable` を使う。
- `createCalendarExportRetry` は、書き出しを、Google カレンダーの予定の変更を比べずに buddy の今の内容で書き直す待ちにする。
  - 書き出しの処理が、次の周期で書く。
  - Google カレンダーで消された予定は作り直す。
  - buddy でキャンセルした単発の予定は、Google カレンダーの予定を If-Match を付けずに消す。
  - 結び付けを外したカレンダーの予定は、消さず、書き直さない。
