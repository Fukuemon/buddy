# schedule-detail API との対応

[予定の詳細](index.md) の項目と、web の型と OpenAPI の項目の対応。  
OpenAPI の項目は、`getSchedule`（`GET /v1/schedules/{schedule_id}`）のレスポンスの `Schedule` で書く。

## 値の対応

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
| Google カレンダーの案内、編集 | Google カレンダーの予定か | `Schedule.fromGoogleCalendar` | `listSchedules` の `Schedule.source` が `google_calendar` |
| 確認が必要な理由 | 理由 | `Schedule.reviewReason` | `listSchedules` の `Schedule.review_reason` |
| （画面に出さない） | 事業所が予定を Google カレンダーで管理しているか | `Facility.sourceMode` | `getFacility` の `Facility.source_mode` |

- 種類の文言は `SCHEDULE_KIND_LABEL`、訪問の区分の文言は `SCHEDULE_CATEGORY_LABEL` で決める。
  - どちらも `apps/web/src/features/schedule/constants/scheduleLabels.ts` にある。
- 予定を取るのは web の `BuddyApi.schedules.get` で、事業所の ID と予定の ID を受ける。
  - OpenAPI の `getSchedule` はパスに事業所を持たない。
  - web のサーバー（BFF、`apps/web/src/api/http/httpBuddyApi.ts`）は、レスポンスの `facility_id` がログインした職員の事業所と違えば、status が 403 の `ApiError` にする。
- 職員と利用者の一覧は、`BuddyApi.staff.list` と `BuddyApi.patients.list` で取る。
  - OpenAPI の予定は `staff_name` と `visit_info.patient_name` も持つ。
  - web は `staff_name` と `visit_info.patient_name` を使わず、一覧で名前を引く。
- `getSchedule` はキャンセルした予定も返す。
  - web は `cancel` があれば、キャンセルの理由を出し、編集のボタンを出さない。
- 予定のキャンセルは `cancelSchedule`（`POST /v1/schedules/{schedule_id}/cancel`）で行う。
  - この画面は呼ばない。
- 画面に出していない同行者、時間外の勤務の印は、`Schedule` の `visit_info.companion_name`、`is_over_time_work` に当たる。
- 繰り返しの予定の回は、回の ID（`occurrenceId`）で開く。
  - web のサーバーは、`getRecurringSchedule`（`GET /v1/schedules/recurring/{recurring_schedule_id}`）で繰り返しの予定を取り、その回を単発の予定の形にする。
  - 回が無いか除外した日なら、web のサーバーは status が 404 の `ApiError` にする。

## Google カレンダーで予定を管理する事業所

- 画面は、先に `getFacility`（`GET /v1/facilities/{facility_id}`）で事業所を読み、`source_mode` で予定の読み方を決める。
  - web の `BuddyApi.facilities.get` が `Facility` にする。
  - `buddy_primary` なら、`BuddyApi.schedules.get` で予定を読む。
  - `google_primary` なら、`BuddyApi.schedules.list`（`listSchedules`）で読む。Google カレンダーの予定（Projection）には `getSchedule` が無く、404 になるためである。
- `google_primary` の事業所の一覧は、カレンダーの search params の `view` と `date` から `getCalendarRange` で決めた期間で読み、`staffIds` は渡さない。
  - `includeCancelled` には search params の `cancelled` を渡す。
  - 予定は、`ScheduleList.schedules` と `ScheduleList.needsReview` を合わせた中から id で探す。`needsReview` は期間で絞らないので、最初の回が期間の外の `recurrence_unsupported` の予定も見つかる。
  - 見つからなければ、`SCHEDULE_NOT_FOUND_MESSAGE` を出す。
  - 処理は `apps/web/src/features/schedule/components/ScheduleDetailModalContainer.tsx` にある。
- `Schedule.source` が `google_calendar` の予定は、web のサーバーが `Schedule.fromGoogleCalendar` を `true` にする。
  - 画面は案内を出し、編集のボタンを出さない。
- `review_reason` が `null` でない予定は、web のサーバーが `Schedule.reviewReason` に写す。
  - 理由の文は `apps/web/src/features/schedule/constants/scheduleLabels.ts` の `SCHEDULE_REVIEW_REASON_LABEL` で決める。
  - `recurrence_unsupported` のほかの予定は、`visit_info` が `null` の通常の予定で、`title` に Google カレンダーのタイトルが入る。

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 開いた予定が、キャンセルした予定である | `Schedule.cancel` がある |
| 開いた予定が、Google カレンダーの予定である | `Schedule.fromGoogleCalendar` が `true` |
| ログインした職員が、開いた予定の職員の予定を編集できる | `Viewer.schedulePolicies` の `code`、`targetStaffIds`、`targetTeamIds` と、予定の職員の `Schedule.staffId` と、`Schedule.staffId` を職員の一覧で引いた `Staff.teamId` |
| 開いた予定が、通常の予定である | `Schedule.kind` が `normal` |
| 開いた予定が、訪問の予定である | `Schedule.kind` が `visit` |
| 開いた予定に、訪問の情報がある | `Schedule.visit` がある |
| 開いた予定に、メモがある | `Schedule.description` が空の文字列でない |

- 判定の処理は、`apps/web/src/features/schedule/components/ScheduleDetailModal.tsx` と `ScheduleDetailModalContainer.tsx` にある。
  - キャンセルした予定では、`ScheduleDetailModal` が下端（下端の閉じると編集）を描かない。
  - Google カレンダーの予定と、編集できない予定では、`ScheduleDetailModalContainer` が `onEdit` を渡さない。
- 編集の権限の項目と、OpenAPI の項目の対応は次のとおり。
  - `Viewer.schedulePolicies` の `code`、`targetStaffIds`、`targetTeamIds` は、`getMe` の `policies` の項目に当たる。
    - 順に `code`、`target_user_ids`、`target_team_ids` である。
  - `Schedule.staffId` は `staff_id` に、`Staff.teamId` は `listUsers` の `Staff.team.id` に当たる。
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

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 2 | 予定の詳細のダイアログ | `schedule-detail-modal` |
| 4 | 閉じる | `modal-close` |
| 5 | キャンセルの理由 | `schedule-detail-cancel` |
| 5 | Google カレンダーの案内 | `schedule-detail-google-calendar` |
| 6 | 確認が必要な理由 | `schedule-detail-review-reason` |
| 5 | 日時 | `schedule-detail-datetime` |
| 6 | 日時 | `schedule-detail-datetime` |
| 7 | 日時 | `schedule-detail-datetime` |
| 8 | 訪問の情報 | `schedule-detail-visit` |
| 9 | 訪問の情報 | `schedule-detail-visit` |
| 12 | メモ | `schedule-detail-memo` |
| 13 | メモ | `schedule-detail-memo` |
| 9 | 下端の閉じる | `schedule-detail-close` |
| 11 | 下端の閉じる | `schedule-detail-close` |
| 13 | 下端の閉じる | `schedule-detail-close` |
| 10 | 編集 | `schedule-detail-edit` |
| 14 | 編集 | `schedule-detail-edit` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- 閉じるの `modal-close` は、packages/ui の `Modal` が付ける。
- 訪問の情報の項目の並び（`schedule-detail-visit-fields`）は、構成要素の表に載せないので、この表に載せない。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 見つからない | 「予定が見つかりません。」 | `getSchedule` か `getRecurringSchedule` が 404。繰り返しの予定に回が無い（web のサーバーが 404 にする）。`google_primary` の事業所で、`listSchedules` の期間の予定と確認が必要な予定に、URL の予定が無い。`getFacility` か、`google_primary` の事業所の `listSchedules` が 404 |
| 見る権限が無い | 「この予定を見る権限がありません。」 | `getSchedule` か `getRecurringSchedule` が 403。予定の `facility_id` がログインした職員の事業所と違う（web のサーバーが 403 にする） |
| 見る権限が無い | 「この予定を見る権限がありません。」 | `getFacility` か、`google_primary` の事業所の `listSchedules` が 403 |
| 読み込みの失敗 | 「予定を取得できませんでした。」 | `getSchedule` か `getRecurringSchedule` が 404 と 403 のほかの失敗（400、500）。`getFacility` か、`google_primary` の事業所の `listSchedules` が 404 と 403 のほかの失敗。API に届かない |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | 予定の API か web のサーバーが 401 |

- 文は `apps/web/src/features/schedule/lib/errorMessage.ts` の `scheduleLoadErrorMessage` が、`ApiError.status` で選ぶ。
- 4xx の失敗は取り直さず、すぐに出す。
  - ほかの失敗は、3 回まで取り直してから出す。
  - 取り直すかは `apps/web/src/appContext.ts` の `shouldRetryQuery` が決める。
