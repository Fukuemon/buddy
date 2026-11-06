# schedule-detail API との対応

[予定の詳細](index.md) の項目と、web の型と OpenAPI の項目の対応。  
OpenAPI の項目は、`getSchedule`（`GET /v1/schedules/{schedule_id}`）のレスポンスの `Schedule` で書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 種類 | 「通常」か「訪問」 | `Schedule.kind` | `schedule_type` |
| タイトル | タイトル | `Schedule.title` | `title` |
| 日時 | 年月日、曜日、開始と終了の時刻 | `Schedule.startsAt`、`Schedule.endsAt` | `date`、`start_time`、`end_time` |
| 利用者 | 利用者の名前 | `Schedule.visit.patientId` を、利用者の一覧（`Patient.name`）で引く | `visit_info.patient_id` を、`listPatients` の `Patient.name` で引く |
| サービスコード | サービスコード | `Schedule.visit.serviceCode` | `visit_info.service_code` |
| 訪問の区分 | 夜勤、緊急、入院 | `Schedule.visit.categories` | `visit_info.visit_categories[].name` |
| 主訪問者、予定者 | 職員の名前 | `Schedule.staffId` を、職員の一覧（`Staff.name`）で引く | `staff_id` を、`listUsers` の `Staff.username` で引く |
| メモ | メモ | `Schedule.description` | `description` |
| キャンセルの理由 | 理由 | `Schedule.cancel.reason` | `cancel.reason` |
| Google カレンダーの案内、キャンセルの説明 | Google カレンダーの予定か | `Schedule.fromGoogleCalendar` | `listSchedules` の `Schedule.source` が `google_calendar` |
| 確認が必要な理由 | 理由と直し方 | `Schedule.reviewReason` | `listSchedules` の `Schedule.review_reason` |
| 予定をキャンセル、編集 | 繰り返しの規則を buddy で表せない予定か | `Schedule.reviewReason` が `recurrence_unsupported` | `listSchedules` の `Schedule.review_reason` |
| 予定をキャンセル、編集 | 予定の正本を切り替えている間か | `ScheduleList.cutover` が `null` でない | `listSchedules` の `cutover` |
| 予定をキャンセル | 繰り返しの予定の 1 回か | `Schedule.recurringOccurrence` | なし。web のサーバーが、回の ID（`occurrenceId`）の予定に付ける |
| キャンセルする予定の日時 | 年月日、曜日、開始と終了の時刻 | `Schedule.startsAt`、`Schedule.endsAt` | `date`、`start_time`、`end_time` |
| キャンセルの理由の欄 | 理由 | `BuddyApi.schedules.cancel` の `reason` | `cancelSchedule` の本文の `reason` |
| （画面に出さない） | 事業所が予定を Google カレンダーで管理しているか | `Facility.sourceMode` | `getFacility` の `Facility.source_mode` |
| （画面に出さない） | キャンセルのダイアログを開いたときの予定の etag。`google_primary` の事業所の予定だけが持つ | `Schedule.etag` | `listSchedules` の `Schedule.etag`。送るのは `cancelSchedule` の本文の `etag` |

- 種類の文言は `SCHEDULE_KIND_LABEL`、訪問の区分の文言は `SCHEDULE_CATEGORY_LABEL` で決める。
  - どちらも `apps/web/src/features/schedule/constants/scheduleLabels.ts` にある。
- 予定を取るのは web の `BuddyApi.schedules.get` で、事業所の ID と予定の ID を受ける。
  - OpenAPI の `getSchedule` はパスに事業所を持たない。
  - web のサーバー（BFF、`apps/web/src/api/http/httpBuddyApi.ts`）は、レスポンスの `facility_id` がログインした職員の事業所と違えば、status が 403 の `ApiError` にする。
- 職員と利用者の一覧は、`BuddyApi.staff.list` と `BuddyApi.patients.list` で取る。
  - OpenAPI の予定は `staff_name` と `visit_info.patient_name` も持つ。
  - web は `staff_name` と `visit_info.patient_name` を使わず、一覧で名前を引く。
- `getSchedule` はキャンセルした予定も返す。
  - web は `cancel` があれば、キャンセルの理由を出し、キャンセルと編集のボタンを出さない。
- 予定のキャンセルは `cancelSchedule`（`POST /v1/schedules/{schedule_id}/cancel`）で行う。
  - web の `BuddyApi.schedules.cancel` が呼び、本文に `reason` と、`etag` が `null` でなければ `etag` を送る。処理は `apps/web/src/api/http/httpBuddyApi.ts` にある。
  - `reason` は、理由の前後の空白を除いた値である。
  - `etag` は、キャンセルのダイアログを開いたときに読んでいた予定の `Schedule.etag` である。`buddy_primary` の事業所の予定は `etag` を持たないので、`null` を渡して送らない。
  - `google_primary` の事業所では、予定の API が Google カレンダーの予定を消し、消せたときだけ成功を返す。理由は Google カレンダーに書けないので保存しない。扱いは [ADR-0026](../../adr/0026-google-calendar-sync.md) にある。
  - 成功すると、予定の 1 件の取得の結果を捨て、事業所の予定の取得の結果を捨てて取り直す。処理は `apps/web/src/features/schedule/queries.ts` の `useCancelSchedule` にある。
- キャンセルのボタンは `canCancelSchedule` が、編集のボタンは `canChangeSchedule` が出し分ける。
  - どちらも `apps/web/src/features/schedule/lib/scheduleWritable.ts` にある。
  - `canChangeSchedule` は、キャンセルした予定、`cutover` が `null` でない間、`reviewReason` が `recurrence_unsupported` の予定で false を返す。
  - `canCancelSchedule` は、`canChangeSchedule` の条件に加えて、`Schedule.recurringOccurrence` の予定で false を返す。予定の API に、buddy の繰り返しの予定の回をキャンセルする操作が無いためである。
  - どちらも、職員の権限の `canEditScheduleOf` と合わせて判定する。
- 確認が必要な理由の直し方の文は、`apps/web/src/features/schedule/lib/reviewFix.ts` の `reviewFixMessage` が `reviewReason` で決める。
- 画面に出していない同行者、時間外の勤務の印は、`Schedule` の `visit_info.companion_name`、`is_over_time_work` に当たる。
- 繰り返しの予定の回は、回の ID（`occurrenceId`）で開く。
  - web のサーバーは、`getRecurringSchedule`（`GET /v1/schedules/recurring/{recurring_schedule_id}`）で繰り返しの予定を取り、その回を単発の予定の形にする。
  - 回が無いか除外した日なら、web のサーバーは status が 404 の `ApiError` にする。

## Google カレンダーで予定を管理する事業所

- 画面は、先に `getFacility`（`GET /v1/facilities/{facility_id}`）で事業所を読み、`source_mode` で予定の読み方を決める。
  - web の `BuddyApi.facilities.get` が `Facility` にする。
  - `buddy_primary` なら、`BuddyApi.schedules.get` で予定を読む。
  - `google_primary` なら、`BuddyApi.schedules.list`（`listSchedules`）で読む。
- `google_primary` の事業所の一覧は、カレンダーの search params の `view` と `date` から `getCalendarRange` で決めた期間で読み、`staffIds` は渡さない。
  - `includeCancelled` には search params の `cancelled` を渡す。
  - 予定は、`ScheduleList.schedules` と `ScheduleList.needsReview` を合わせた中から id で探す。`needsReview` は期間で絞らないので、最初の回が期間の外の `recurrence_unsupported` の予定も見つかる。
  - 見つからなければ、`SCHEDULE_NOT_FOUND_MESSAGE` を出す。
  - 処理は `apps/web/src/features/schedule/components/ScheduleDetailModalContainer.tsx` にある。
- `Schedule.source` が `google_calendar` の予定は、web のサーバーが `Schedule.fromGoogleCalendar` を `true` にする。
  - 画面は案内を出す。予定を編集できる職員には、キャンセルと編集のボタンも出す。
- `Schedule.etag` が `null` でない予定は、web のサーバーが `Schedule.etag` に写す。処理は `apps/web/src/api/http/scheduleMapper.ts` にある。
- `cutover` は、`listSchedules` の `cutover` を `ScheduleList.cutover` にしたものである。`buddy_primary` の事業所では読まない。
- `review_reason` が `null` でない予定は、web のサーバーが `Schedule.reviewReason` に写す。
  - 理由の文は `apps/web/src/features/schedule/constants/scheduleLabels.ts` の `SCHEDULE_REVIEW_REASON_LABEL` で決める。
  - `recurrence_unsupported` のほかの予定は、`visit_info` が `null` の通常の予定で、`title` に Google カレンダーのタイトルが入る。

## キャンセルと編集のボタンの出し分け

| 判定 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- |
| ログインした職員の予定の権限と対象 | `Viewer.schedulePolicies` の `code`、`targetStaffIds`、`targetTeamIds` | `getMe` の `policies` の `code`、`target_user_ids`、`target_team_ids` |
| 予定の職員 | `Schedule.staffId` | `staff_id` |
| 予定の職員のチーム | `Schedule.staffId` を、職員の一覧（`Staff.teamId`）で引く | `staff_id` を、`listUsers` の `Staff.team.id` で引く |

- 判定は、予定の API の判定（`schedule.CanEdit`）と同じ規則で行う。
  - 判定の処理は `apps/web/src/features/schedule/lib/schedulePermission.ts` の `canEditScheduleOf` にある。
  - `schedule.self.edit`: 予定の職員がログインした職員のときに編集できる。
  - `schedule.all.edit`: 全ての予定を編集できる。
  - `schedule.user.edit`: `target_user_ids` に予定の職員を含むときに編集できる。
  - `schedule.team.edit`: `target_team_ids` に予定の職員のチームを含むときに編集できる。
  - 職員の一覧を読み終えるまでは、予定の職員のチームを空にして判定するので、`schedule.team.edit` では編集できないとする。
- web のサーバーは、`getMe` の `policies` のうち、予定の権限の 7 つの `code`（`SCHEDULE_POLICY_CODES`）を `Viewer.schedulePolicies` に写す。
  - 写すのは `apps/web/src/api/http/scheduleMapper.ts` の `fromApiMe` である。
- 出し分けは表示だけに使う。
  - 編集を拒むのは、予定の API の `updateSchedule` である。
  - キャンセルを拒むのは、予定の API の `cancelSchedule` である。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 見つからない | 「予定が見つかりません。」 | `getSchedule` か `getRecurringSchedule` が 404。繰り返しの予定に回が無い（web のサーバーが 404 にする）。`google_primary` の事業所で、`listSchedules` の期間の予定と確認が必要な予定に、URL の予定が無い。`getFacility` か、`google_primary` の事業所の `listSchedules` が 404 |
| 見る権限が無い | 「この予定を見る権限がありません。」 | `getSchedule` か `getRecurringSchedule` が 403。予定の `facility_id` がログインした職員の事業所と違う（web のサーバーが 403 にする） |
| 見る権限が無い | 「この予定を見る権限がありません。」 | `getFacility` か、`google_primary` の事業所の `listSchedules` が 403 |
| 読み込みの失敗 | 「予定を取得できませんでした。」 | `getSchedule` か `getRecurringSchedule` が 404 と 403 のほかの失敗（400、500）。`getFacility` か、`google_primary` の事業所の `listSchedules` が 404 と 403 のほかの失敗。API に届かない |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | 予定の API か web のサーバーが 401 |
| キャンセルの失敗 | 「この操作をする権限がありません。」 | `cancelSchedule` が 403 |
| キャンセルの失敗 | 「Google カレンダーで予定が変更されていました。予定を開き直して、最新の予定を確認してから、もう一度キャンセルしてください。」 | `cancelSchedule` が 409 `google_event_changed` |
| キャンセルの失敗 | 「Google カレンダーで予定が消されたか、見つかりません。」 | `cancelSchedule` が 409 `google_event_not_found` |
| キャンセルの失敗 | 「前の保存の結果を確認しています。時間をおいて、予定を開き直してください。」 | `cancelSchedule` が 409 `google_write_pending` |
| キャンセルの失敗 | 「Google カレンダーに書けませんでした。時間をおいて、やり直してください。」 | `cancelSchedule` が 503 `google_unavailable` |
| キャンセルの失敗 | 「Google カレンダーに書けたかを確認できませんでした。時間をおいて、予定を開き直してください。」 | `cancelSchedule` が 503 `google_write_unknown` |
| キャンセルの失敗 | 「Google カレンダーに予定を書く権限がありません。カレンダーの共有の設定を、マネージャーに確認してください。」 | `cancelSchedule` が 409 `google_calendar_unwritable` |
| キャンセルの失敗 | 「Google カレンダーが予定を受け付けませんでした。入力を確認してください。」 | `cancelSchedule` が 409 `google_event_rejected` |
| キャンセルの失敗 | 「予定の職員が Google カレンダーを結び付けていません。カレンダーの結び付けを、マネージャーに頼んでください。」 | `cancelSchedule` が 409 `calendar_not_linked` |
| キャンセルの失敗 | 「この事業所には、Google カレンダーと連携する設定がありません。マネージャーに確認してください。」 | `cancelSchedule` が 503 `calendar_not_configured` |
| キャンセルの失敗 | 「予定の正本を buddy に切り替えています。切り替えが終わるまで、予定を作成、変更、キャンセルできません。」 | `cancelSchedule` が 409 `cutover_open` |
| キャンセルの失敗 | 「入力の内容では予定をキャンセルできません。内容を直してください。」 | `cancelSchedule` が 400 |
| キャンセルの失敗 | 「予定をキャンセルできませんでした。」 | `cancelSchedule` が、ここまでのほかの失敗（404、409 `conflict`、500）。API に届かない |
| キャンセルの送信中 | なし（ログインの画面へ移るまで続く） | `cancelSchedule` が 401 |

- 文は `apps/web/src/features/schedule/lib/errorMessage.ts` の `scheduleLoadErrorMessage` が、`ApiError.status` で選ぶ。
- キャンセルの失敗の文は、同じ `errorMessage.ts` の `scheduleSubmitErrorMessage` が、`ApiError.status` と `ApiError.code` で選ぶ。
  - `google_write_unknown` の文は、予定の作成とほかの操作で違う。キャンセルでは、開き直すことを案内する。
- 4xx の失敗は取り直さず、すぐに出す。
  - ほかの失敗は、3 回まで取り直してから出す。
  - 取り直すかは `apps/web/src/appContext.ts` の `shouldRetryQuery` が決める。
