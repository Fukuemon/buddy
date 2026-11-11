# schedule-edit API との対応

[予定の編集](index.md) の項目と、web の型と OpenAPI の項目の対応。  
予定は `getSchedule`（`GET /v1/schedules/{schedule_id}`）で取り、`updateSchedule`（`PUT /v1/schedules/{schedule_id}`）で直す。  
`updateSchedule` は、本文の `SlotRequest` で予定の全ての項目を置き換える。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 予定の種類 | 通常と訪問のどちらを選んでいるか | フォームの値の `kind`。開いたときは `Schedule.kind` | 保存では `schedule_type_id` |
| 項目の一覧 | 予定の種類で項目を切り替える | `Schedule.kind` | `getSchedule` の `schedule_type`。保存では `schedule_type_id` |
| 日付 | 開始の日付 | `Schedule.startsAt` の日付 | `date` |
| 開始時間 | 開始の時刻 | `Schedule.startsAt` の時刻 | `start_time` |
| 終了時間 | 終了の時刻 | `Schedule.endsAt` の時刻 | `end_time` |
| 終了は翌日 | 通常の予定の終了が翌日か | `Schedule.endsAt` の日付が `startsAt` の翌日か | `ends_next_day` |
| 提供時間 | 開始から終了までの分 | なし（`startsAt` と `endsAt` から求め、保存では `endsAt` に換算する） | なし（`start_time`、`end_time`、`ends_next_day` から求める） |
| 提供時間 | 範囲の下限と上限、サービスコードを選んだときの値 | `ServiceCodeRecord.service_time_range_start`、`service_time_range_end` | `listServiceCodes` の `service_time_range_start`、`service_time_range_end` |
| サービスコード | 選択肢の並びと表記 | `ServiceCodeRecord.code` | `listServiceCodes` の `code` |
| サービスコード | 選んだコード | `VisitDetail.serviceCode` | `getSchedule` の `visit_info.service_code`。保存では `visit_info.service_code_id` |
| サービスコード | 利用者を替えたときに選ぶコード | `Patient.serviceCode` | `listPatients` の `service_code` |
| 利用者の一覧 | 利用者の名前と選んだ利用者 | `Patient.name`、`VisitDetail.patientId` | `listPatients` の `name`、`visit_info.patient_id` |
| 利用者の一覧 | 利用の終了の利用者を除くか | `Patient.ended` | `listPatients`（`include_ended=true`）の `ended_at` |
| 職員の一覧 | 職員の名前と選んだ職員 | `Staff.name`、`Schedule.staffId` | `listUsers` の `username`、`staff_id`、`visit_info.assigned_staff_id` |
| 職員の一覧 | 休職と退職の職員と、訪問しない職員を除くか | `Staff.status`、`Staff.nonVisiting` | `listUsers` の `Staff.status`、`visits` |
| 職員の一覧 | 予定を編集できる職員か | `Viewer.schedulePolicies`、`Staff.teamId` | `getMe` の `policies` の `code`、`target_user_ids`、`target_team_ids` |
| 権限が無いことの説明 | 予定の職員の予定を編集できないか | `Viewer.schedulePolicies`、`Schedule.staffId`、予定の職員の `Staff.teamId` | `getMe` の `policies`、`getSchedule` の `staff_id` |
| 訪問の区分 | 夜勤、緊急、入院 | `VisitDetail.categories` | `getSchedule` の `visit_info.visit_categories[].name`。保存では `visit_info.visit_category_ids` |
| メモ | メモ | `Schedule.description` | `description` |
| タイトル | 通常の予定のタイトル | `Schedule.title` | `title` |
| 繰り返しの規則を変えられないことの文 | 繰り返しの規則を buddy で表せない予定か | `Schedule.reviewReason` が `recurrence_unsupported` | `getSchedule` の `review_reason` |
| 移していることの文 | 事業所が予定の管理を buddy に移している途中か | `Facility.sourceMode` が `google_primary` で、`ScheduleList.cutover` が `null` でない | `getFacility` の `source_mode`、`listSchedules` の `cutover` |
| Google カレンダーの最新の予定 | 保存が Google カレンダーでの変更で拒まれた後に読み直した予定 | `getSchedule` で読み直した `Schedule` | `getSchedule` |
| 最新の予定の日時 | 年月日、曜日、開始と終了の時刻 | `Schedule.startsAt`、`Schedule.endsAt` | `getSchedule` の `date`、`start_time`、`end_time` |
| 最新の予定のタイトル | 利用者の名前とサービスコード、通常の予定のタイトル | `Schedule.visit.patientId` を利用者の一覧（`Patient.name`）で引いた名前と `Schedule.visit.serviceCode`、`Schedule.title` | `getSchedule` の `visit_info.patient_id`、`visit_info.service_code`、`title` |
| 最新の予定の職員 | 職員の名前 | `Schedule.staffId` を、職員の一覧（`Staff.name`）で引く | `getSchedule` の `staff_id` |
| （画面に出さない） | 保存で送る予定の etag | `Schedule.etag` | `getSchedule` の `etag`。送るのは `updateSchedule` の本文の `etag` |

- 画面は、`buddy_primary` と `google_primary` のどちらの事業所でも `getSchedule` で予定を読み、同じフォームを出す。
  - 処理は `apps/web/src/features/schedule/components/ScheduleEditModalContainer.tsx` にある。
- `review_reason` が `recurrence_unsupported` の予定は、フォームを出さずに、変えられないことの文を出す。
  - 判定は、権限の判定の後、キャンセルした予定の判定の前に行う。
- 移行中かは、予定の詳細と同じく、`getFacility`（`GET /v1/facilities/{facility_id}`）の `source_mode` と、`listSchedules` の `cutover` で読む。
  - `google_primary` の事業所では、カレンダーの search params の `view` と `date` から `getCalendarRange` で決めた期間で `listSchedules` を読み、`staffIds` は渡さない。`includeCancelled` には search params の `cancelled` を渡す。予定の詳細と同じ一覧の取得の結果を使う。
  - `buddy_primary` の事業所では `listSchedules` を読まず、移行中でないとして扱う。
  - `getCalendarCutoverStatus` は職員の管理の権限を求めるので使わない。
  - 最初に読み終えた値を保ち、開いた後に一覧を読み直して `cutover` が変わっても、状態を変えない。開いた後の移行は、保存が 409 `cutover_open` で拒まれて知らせ、入力を消さないためである。
  - 処理は `apps/web/src/features/schedule/queries.ts` の `useCutoverAtOpen` にある。
  - 判定は、キャンセルした予定の判定の後に行う。
- `updateSchedule` の本文の `etag` には、編集を開いたときに読んだ予定の `Schedule.etag` を送る。
  - `buddy_primary` の事業所の予定は `etag` を持たないので、`null` を渡して送らない。
  - web のサーバーは、保存の前に読み直した今の予定の `etag` を送らない。読んだ後に Google カレンダーで変わったことに気づけなくなるためである。
  - 処理は `apps/web/src/api/http/httpBuddyApi.ts` の `schedules.update` にある。
- `updateSchedule` が 409 `google_event_changed` を返すと、画面は `getSchedule` で予定を読み直し、フォームの上に最新の予定を出す。
  - 次の保存で送る `etag` は、読み直した予定の `etag` に置き換える。
  - 入力は消さない。
  - 読み直しが失敗したときは、最新の予定を出さず、`etag` も置き換えない。
  - 一度読めた最新の予定は、モーダルを閉じるまで残す。次の保存が 409 `google_event_changed` のほかの理由で失敗しても消さない。
  - 最新の予定は `apps/web/src/features/schedule/components/ScheduleLatestNotice.tsx` が描く。
- `google_primary` の事業所では、`updateSchedule` が Google カレンダーの予定を書き換え、書けたときだけ成功を返す。
  - 扱いは [ADR-0029](../../adr/0029-google-calendar-sync.md) にある。
- 保存の本文は、画面の値に、画面が持たない今の予定の値を足して作る。
  - 処理は `apps/web/src/api/http/scheduleMapper.ts` の `keepCurrentVisit` にある。
  - 訪問の予定どうしの保存では、同行者の `visit_info.companion_id` とタイトルの `title` を今の予定の値のまま送る。
  - 主訪問者は、予定の職員の `staff_id` に送る。
  - 訪問の担当の `visit_info.assigned_staff_id` は、今の担当が予定の職員と同じなら同じ職員を送り、違えば今の担当のまま送る。
- 保存の前に、今の予定を `getSchedule` で読み直す。
- サービスコードの選択肢は、`listServiceCodes` の順に並べ、`code` をそのまま出す。
  - 開いたときは、`VisitDetail.serviceCode` を選び、`Patient.serviceCode` は使わない。
  - 利用者を替えると、`Patient.serviceCode` と同じ表記の `code` を選び、提供時間をその `service_time_range_end` にする。
    - 同じ表記の `code` が無ければ、`code` を NFKC で正規化して「訪看I2」に当たるものを、それも無ければ先頭の `code` を選ぶ。
    - 選ぶコードは、`apps/web/src/features/schedule/lib/scheduleFormMapper.ts` の `patientServiceCode` が決める。
    - 職員がサービスコードを選んだかは、`apps/web/src/features/schedule/components/ScheduleForm.tsx` が持つ。選んだ後は替えない。
    - `Patient.serviceCode` は、web のサーバーが `listPatients` の `service_code` をそのまま入れる。処理は `apps/web/src/api/http/scheduleMapper.ts` の `fromApiPatient` にある。
  - 提供時間の範囲の検証は、選んだ `code` の `service_time_range_start` と `service_time_range_end` で行う。
    - 検証は `apps/web/src/features/schedule/schema/scheduleForm.ts` にある。
  - 選んだ `code` が空か、`listServiceCodes` に無いときは、「サービスコードを選んでください」を出し、提供時間の範囲を検証しない。
    - 日時の枠の文は、`scheduleDate`、`startTime`、`endTime`、`serviceCode`、`serviceTime` の誤りの順で最初の 1 つを選ぶ。処理は `apps/web/src/features/schedule/components/ScheduleForm.tsx` にある。
- 予定の種類、サービスコード、訪問の区分は、マスタを引いて ID にする。
  - マスタは `listScheduleTypes`、`listServiceCodes`、`listVisitCategories` で取る。
  - サービスコードは、`listServiceCodes` の `code` と同じ表記で比べる。
- 読み直しかマスタの取得が失敗したときと、マスタに当たる値が無いときは、`updateSchedule` を呼ばずに失敗する。
- 予定の一覧の取得の結果は、保存に成功したときに捨てて、`listSchedules` で取り直す。
- 保存に成功すると、予定の詳細へ戻る URL の `date` を、フォームの `scheduleDate`（保存した予定の日）に置き換える。
  - `google_primary` の事業所の予定の詳細は、カレンダーの表示の期間の `listSchedules` の結果から探すためである。
  - 処理は `apps/web/src/features/schedule/components/ScheduleEditModalContainer.tsx` の `backToDetail` にある。
- `listPatients` は、web のサーバーが `include_ended=true` で利用の終了の利用者も含めて取る。
  - この画面は、`Patient.ended` が `true` の利用者を利用者の候補から除く。処理は `apps/web/src/api/activePatients.ts` の `activePatients` にある。
  - 項目の一覧の利用者の名前は、除く前の一覧で引く。予定の利用者が利用の終了の利用者でも、名前を出す。
- `kind` が `visit` で `visit` を持たない予定は、通常の予定のフォームの値にする。保存すると通常の予定として送る。
  - 処理は `apps/web/src/features/schedule/lib/scheduleFormMapper.ts` の `toScheduleFormValues` にある。扱いは未決である。
- `listUsers` は、休職と退職の職員も返す。
  - この画面は、`status` を持つ職員と、`visits` が false の職員を主訪問者と予定者の候補から除く。
  - 予定の職員の名前は、休職と退職の職員と、訪問しない職員も含めた一覧で探す。
- 予定の取得は、予定の詳細と同じく、web のサーバーが `facility_id` の違いを 403 にし、繰り返しの予定の回を `getRecurringSchedule` で読む。
  - 予定の詳細の取得は、[予定の詳細の API との対応](../schedule-detail_予定の詳細/api.md) にある。
- 繰り返しの予定の回を保存すると、`updateSchedule` の代わりに `changeOccurrence` でその回を単発の予定に置き換える。
  - パスは `POST /v1/schedules/recurring/{recurring_schedule_id}/occurrences` である。
- キャンセルした予定は、`updateSchedule` が 409 で拒む。
  - 画面はキャンセルした予定のフォームを出さないので、保存まで進まない。

## 権限の判定

- 予定の権限は、画面を読み込むたびに web のサーバーが `getMe`（`GET /v1/me`）で読む。
  - `policies` のうち `schedule.` で始まる `code` と、`target_user_ids`、`target_team_ids` を `Viewer.schedulePolicies` に入れる。
  - 処理は `apps/web/src/api/http/scheduleMapper.ts` の `fromApiMe` にある。
- 判定の処理は `apps/web/src/features/schedule/lib/schedulePermission.ts` にある。
  - 規則は、予定の API の判定（`schedule.CanEdit`）と同じである。
  - 拒むのは予定の API である。
  - `schedule.self.edit` は自分を、`schedule.all.edit` は全ての職員を対象にする。
  - `schedule.user.edit` は `target_user_ids` の職員を、`schedule.team.edit` は `target_team_ids` のチームの職員を対象にする。
- 「権限が無い」の状態は、予定の `staff_id` の職員について `canEditScheduleOf` が false のときに出す。
  - チームは、`listUsers` の予定の職員の今のチームで判定する。
  - 処理は `apps/web/src/features/schedule/components/ScheduleEditModalContainer.tsx` にある。
- 主訪問者と予定者の候補は、`editableStaff` で、予定を編集できる職員に絞る。

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 開いた予定が、予定を Google カレンダーで管理している事業所の予定である | `Schedule.fromGoogleCalendar` が `true` |
| 開いた予定が、訪問の情報を読み取れなかった確認が必要な予定である | `Schedule.reviewReason` が `patient_not_found`、`patient_ambiguous`、`service_code_not_found`、`title_unreadable` のどれか |
| 事業所が、予定の管理を buddy に移している途中である | `useCutoverAtOpen` が `true`。`google_primary` の事業所で、画面を開いたときの `ScheduleList.cutover` が `null` でない（`listSchedules` の `cutover`）。`buddy_primary` の事業所では読まず、`false` にする |
| 職員が、保存を送っている途中である | react-hook-form の `formState.isSubmitting` が `true`（`ScheduleFormModal` が保存のボタンの `isLoading` に渡す）。`updateSchedule` を呼んでから、予定の詳細へ移るまでと、409 `google_event_changed` の後に `getSchedule` で読み直し終えるまでを含む |

- 予定の種類を変えられる予定かは、`apps/web/src/features/schedule/lib/reviewFix.ts` の `canAddVisitInfo` が決める。
- 保存のボタンは packages/ui の `Button` で、`isLoading` の間は押しても `onClick` と送信を止める。
- 送っている間も、`ScheduleFormModal` は `Modal` に送信中を渡さず、`ScheduleForm` の欄も `disabled` にしない。
  - キャンセル、覆い、Escape キー、入力の欄は、送っている間も動く。
- 「読み込み中」の状態の `Modal` には `onCloseRequest` を渡さないので、閉じる、覆い、Escape キーは何もしない。
  - 処理は `apps/web/src/features/schedule/components/ScheduleEditModalContainer.tsx` にある。
- 項目の一覧の項目と、右の入力の欄の出し分けは、フォームの値の `kind` と、`ScheduleForm` が持つ選んだ項目で決める。
  - どちらも状態で決まるので、条件の表に載せない。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 3 | 閉じる | `modal-close` |
| 3 | 項目の一覧 | `schedule-field-title` |
| 3 | 項目の一覧 | `schedule-field-date-time` |
| 3 | 項目の一覧 | `schedule-field-patient` |
| 3 | 項目の一覧 | `schedule-field-staff` |
| 3 | 項目の一覧 | `schedule-field-category` |
| 3 | 項目の一覧 | `schedule-field-description` |
| 4 | 日付 | `schedule-form-date` |
| 5 | 開始時間 | `schedule-form-start-time` |
| 6 | 提供時間 | `schedule-form-service-time` |
| 7 | 終了時間 | `schedule-form-end-time` |
| 6 | 終了時間 | `schedule-form-end-time` |
| 7 | 終了は翌日 | `schedule-form-ends-next-day` |
| 8 | サービスコード | `service-code-{コード}` |
| 4 | 利用者の検索 | `patient-select-search` |
| 5 | 利用者の一覧 | `patient-select-option-{利用者の id}` |
| 4 | 職員の検索 | `staff-select-search` |
| 5 | 職員の一覧 | `staff-select-option-{職員の id}` |
| 4 | 訪問の区分 | `schedule-category-night` |
| 4 | 訪問の区分 | `schedule-category-emergency` |
| 4 | 訪問の区分 | `schedule-category-hospitalization` |
| 4 | メモ | `schedule-form-description` |
| 4 | タイトル | `schedule-form-title` |
| 5 | キャンセル | `schedule-edit-cancel` |
| 6 | キャンセル | `schedule-edit-cancel` |
| 8 | キャンセル | `schedule-edit-cancel` |
| 9 | キャンセル | `schedule-edit-cancel` |
| 10 | キャンセル | `schedule-edit-cancel` |
| 6 | 保存 | `schedule-edit-submit` |
| 7 | 保存 | `schedule-edit-submit` |
| 9 | 保存 | `schedule-edit-submit` |
| 10 | 保存 | `schedule-edit-submit` |
| 11 | 保存 | `schedule-edit-submit` |
| 12 | Google カレンダーの最新の予定 | `schedule-edit-latest` |
| 13 | 最新の予定の日時 | `schedule-edit-latest-datetime` |
| 14 | 最新の予定のタイトル | `schedule-edit-latest-title` |
| 15 | 最新の予定の職員 | `schedule-edit-latest-staff` |
| 3 | 予定の種類 | `schedule-kind-tab` |
| 4 | 項目の一覧 | `schedule-field-title` |
| 4 | 項目の一覧 | `schedule-field-date-time` |
| 4 | 項目の一覧 | `schedule-field-patient` |
| 4 | 項目の一覧 | `schedule-field-staff` |
| 4 | 項目の一覧 | `schedule-field-category` |
| 4 | 項目の一覧 | `schedule-field-description` |
| 5 | 日付 | `schedule-form-date` |
| 6 | 開始時間 | `schedule-form-start-time` |
| 7 | 提供時間 | `schedule-form-service-time` |
| 8 | 終了は翌日 | `schedule-form-ends-next-day` |
| 8 | 終了時間 | `schedule-form-end-time` |
| 9 | サービスコード | `service-code-{コード}` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- 閉じるの `modal-close` は、packages/ui の `Modal` が付ける。
- 予定の種類の選択肢は、`schedule-kind-tab-normal`、`schedule-kind-tab-visit` である。packages/ui の `SegmentedControl` が、組の testid に選択肢の `kind` を付ける。
- 項目の一覧の testid の末尾は、項目の ID（`title`、`date-time`、`patient`、`staff`、`category`、`description`）である。
- サービスコードの `{コード}` は、`listServiceCodes` の `code` の表記のままである。
- 利用者の一覧と職員の一覧の testid は、行のラジオボタンに付く。
- 次の testid は、モーダルの本体に付き、構成要素の表に載せないので、この表に載せない。
  - フォームを出すモーダルの `schedule-form-modal` と、フォームの `schedule-form`
  - 「権限が無い」の状態のモーダルの `schedule-edit-forbidden`
  - 「繰り返しの規則を buddy で表せない」の状態のモーダルの `schedule-edit-recurrence-unsupported`
  - 「予定の管理を buddy に移している」の状態のモーダルの `schedule-edit-cutover`
  - キャンセルした予定のモーダルの `schedule-edit-cancelled`。この状態はモックを持たない
- 読み込み中の表示、読み込みの失敗の文、権限が無いことの説明、繰り返しの規則を変えられないことの文、移していることの文、保存の失敗の文は、testid を持たない。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | 読み込みの操作が終わっていないか、401 |
| 読み込みの失敗 | 「予定が見つかりません。」 | `getSchedule` か `getRecurringSchedule` が 404 |
| 読み込みの失敗 | 「この予定を見る権限がありません。」 | `getSchedule` か `getRecurringSchedule` が 403。予定の `facility_id` がログインした職員の事業所と違う（web のサーバーが 403 にする） |
| 読み込みの失敗 | 「予定を取得できませんでした。」 | `getSchedule` か `getRecurringSchedule` が 401、403、404 以外で失敗。`listUsers`、`listPatients`、`listServiceCodes`、`getFacility` のどれかが 401 以外で失敗。`google_primary` の事業所で `listSchedules` が 401 以外で失敗。API に届かない |
| 繰り返しの規則を buddy で表せない | 「この予定の繰り返しの規則は buddy で表せないため、buddy では変更できません。Google カレンダーで変更してください。」 | API の失敗ではない。`getSchedule` の `review_reason` が `recurrence_unsupported` |
| 予定の管理を buddy に移している | 「予定の管理を buddy に移しています。終わるまで、予定を作成、変更、キャンセルできません。」 | API の失敗ではない。`google_primary` の事業所で、画面を開いたときの `listSchedules` の `cutover` が `null` でない |
| 権限が無い | 「この予定を編集する権限がありません。」 | API の失敗ではない。`getMe` の `policies` で、予定の職員の予定を編集できない |
| 保存の失敗 | 「この操作をする権限がありません。」 | `updateSchedule` か `changeOccurrence` が 403 |
| 保存の失敗 | 「入力の内容では予定を更新できません。内容を直してください。」 | `updateSchedule` か `changeOccurrence` が 400 |
| 保存の失敗 | 「この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください。」 | `updateSchedule` か `changeOccurrence` が 409 `google_primary`。事業所が予定を Google カレンダーで管理している |
| Google カレンダーで変更されていた | 「Google カレンダーで予定が変更されていました。最新の予定を確認してから、もう一度保存してください。」 | `updateSchedule` が 409 `google_event_changed` |
| 保存の失敗 | 「Google カレンダーで予定が消されたか、見つかりません。」 | `updateSchedule` が 409 `google_event_not_found` |
| 保存の失敗 | 「前の保存の結果を確認しています。時間をおいて、予定を開き直してください。」 | `updateSchedule` が 409 `google_write_pending` |
| 保存の失敗 | 「Google カレンダーに書けませんでした。時間をおいて、やり直してください。」 | `updateSchedule` が 503 `google_unavailable` |
| 保存の失敗 | 「Google カレンダーに書けたかを確認できませんでした。時間をおいて、予定を開き直してください。」 | `updateSchedule` が 503 `google_write_unknown` |
| 保存の失敗 | 「Google カレンダーに予定を書く権限がありません。カレンダーの共有の設定を、事業所の管理者に確認してください。」 | `updateSchedule` が 409 `google_calendar_unwritable` |
| 保存の失敗 | 「Google カレンダーが予定を受け付けませんでした。入力を確認してください。」 | `updateSchedule` が 409 `google_event_rejected` |
| 保存の失敗 | 「予定の職員が Google カレンダーを結び付けていません。カレンダーの結び付けを、事業所の管理者に頼んでください。」 | `updateSchedule` が 409 `calendar_not_linked` |
| 保存の失敗 | 「この事業所には、Google カレンダーと連携する設定がありません。事業所の管理者に確認してください。」 | `updateSchedule` が 503 `calendar_not_configured` |
| 保存の失敗 | 「予定の管理を buddy に移しています。終わるまで、予定を作成、変更、キャンセルできません。」 | `updateSchedule` が 409 `cutover_open` |
| 保存の失敗 | 「予定を更新できませんでした。」 | `updateSchedule` か `changeOccurrence` が、ここまでのほかの失敗（404、409 `conflict`、500 など）。保存の前の `getSchedule` の読み直しか、マスタ（`listScheduleTypes`、`listServiceCodes`、`listVisitCategories`）の取得が失敗。選んだ値に当たるマスタが無い。API に届かない |
| 送信中 | なし（ログインの画面へ移るまで続く） | 保存の操作が 401 |

- 読み込みの失敗の文は、`apps/web/src/features/schedule/lib/errorMessage.ts` の `scheduleLoadErrorMessage` が、予定の取得の status で選ぶ。
  - 一覧の取得の失敗は `SCHEDULE_LOAD_ERROR_MESSAGE` にする。
- 保存の失敗の文は、同じ `errorMessage.ts` の `scheduleSubmitErrorMessage` が status と `ApiError.code` で選ぶ。
  - 409 `google_event_changed` かは、同じ `errorMessage.ts` の `isGoogleEventChanged` が決める。
- 権限が無いことの文は、同じ `errorMessage.ts` の `SCHEDULE_EDIT_FORBIDDEN_MESSAGE` にある。
- 400 の `invalid_input` には、休職か退職の職員か、訪問しない職員を新しく割り振ったときと、利用の終了の利用者を新しく指したときを含む。
  - ADR-0004: [職員の停止を、戻せる休職と、戻せない退職に分ける](../../adr/0004-staff-leave-and-retirement.md)
  - ADR-0005: [利用者を、戻せる利用の終了にでき、終了の利用者を予定の候補と職員の退職の確認から外す](../../adr/0005-patient-service-end.md)
  - ADR-0006: [訪問するかを職員に持ち、訪問しない職員を予定と担当から外す](../../adr/0006-non-visiting-staff.md)
- 読み込みは、4xx なら取り直さずにすぐ失敗にし、ほかの失敗は取り直してから失敗にする。
  - 処理は `apps/web/src/appContext.ts` の `shouldRetryQuery` にある。
