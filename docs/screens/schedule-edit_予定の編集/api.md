# schedule-edit API との対応

[予定の編集](index.md) の項目と、web の型と OpenAPI の項目の対応。  
予定は `getSchedule`（`GET /v1/schedules/{schedule_id}`）で取り、`updateSchedule`（`PUT /v1/schedules/{schedule_id}`）で直す。  
`updateSchedule` は、本文の `SlotRequest` で予定の全ての項目を置き換える。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 項目の一覧 | 予定の種類で項目を切り替える | `Schedule.kind` | `getSchedule` の `schedule_type`。保存では `schedule_type_id` |
| 日付 | 開始の日付 | `Schedule.startsAt` の日付 | `date` |
| 開始時間 | 開始の時刻 | `Schedule.startsAt` の時刻 | `start_time` |
| 終了時間 | 終了の時刻 | `Schedule.endsAt` の時刻 | `end_time` |
| 終了は翌日 | 通常の予定の終了が翌日か | `Schedule.endsAt` の日付が `startsAt` の翌日か | `ends_next_day` |
| 提供時間 | 開始から終了までの分 | なし（`startsAt` と `endsAt` から求め、保存では `endsAt` に換算する） | なし（`start_time`、`end_time`、`ends_next_day` から求める） |
| 提供時間 | 範囲の下限と上限、サービスコードを選んだときの値 | `ServiceCodeRecord.service_time_range_start`、`service_time_range_end` | `listServiceCodes` の `service_time_range_start`、`service_time_range_end` |
| サービスコード | 選択肢の並びと表記 | `ServiceCodeRecord.code` | `listServiceCodes` の `code` |
| サービスコード | 選んだコード | `VisitDetail.serviceCode` | `getSchedule` の `visit_info.service_code`。保存では `visit_info.service_code_id` |
| 利用者の一覧 | 利用者の名前と選んだ利用者 | `Patient.name`、`VisitDetail.patientId` | `listPatients` の `name`、`visit_info.patient_id` |
| 職員の一覧 | 職員の名前と選んだ職員 | `Staff.name`、`Schedule.staffId` | `listUsers` の `username`、`staff_id`、`visit_info.assigned_staff_id` |
| 職員の一覧 | 休職と退職の職員と、訪問しない職員を除くか | `Staff.status`、`Staff.nonVisiting` | `listUsers` の `Staff.status`、`visits` |
| 職員の一覧 | 予定を編集できる職員か | `Viewer.schedulePolicies`、`Staff.teamId` | `getMe` の `policies` の `code`、`target_user_ids`、`target_team_ids` |
| 権限が無いことの説明 | 予定の職員の予定を編集できないか | `Viewer.schedulePolicies`、`Schedule.staffId`、予定の職員の `Staff.teamId` | `getMe` の `policies`、`getSchedule` の `staff_id` |
| 訪問の区分 | 夜勤、緊急、入院 | `VisitDetail.categories` | `getSchedule` の `visit_info.visit_categories[].name`。保存では `visit_info.visit_category_ids` |
| メモ | メモ | `Schedule.description` | `description` |
| タイトル | 通常の予定のタイトル | `Schedule.title` | `title` |
| Google カレンダーで管理していることの文 | 事業所が予定を Google カレンダーで管理しているか | `Facility.sourceMode` | `getFacility` の `Facility.source_mode` |

- 事業所は `getFacility`（`GET /v1/facilities/{facility_id}`）で読み、web の `BuddyApi.facilities.get` が `Facility` にする。
  - `source_mode` が `buddy_primary` と分かるか、`getFacility` が失敗したときだけ、`getSchedule` を呼ぶ。Google カレンダーの予定（Projection）には `getSchedule` が無く、404 になるためである。
  - `source_mode` が `google_primary` なら、フォームの代わりに `SCHEDULE_GOOGLE_PRIMARY_MESSAGE` を出す。文は `apps/web/src/features/schedule/lib/errorMessage.ts` にある。
  - 処理は `apps/web/src/features/schedule/components/ScheduleEditModalContainer.tsx` にある。
- 保存の本文は、画面の値に、画面が持たない今の予定の値を足して作る。
  - 処理は `apps/web/src/api/http/scheduleMapper.ts` の `keepCurrentVisit` にある。
  - 訪問の予定どうしの保存では、同行者の `visit_info.companion_id` とタイトルの `title` を今の予定の値のまま送る。
  - 主訪問者は、予定の職員の `staff_id` に送る。
  - 訪問の担当の `visit_info.assigned_staff_id` は、今の担当が予定の職員と同じなら同じ職員を送り、違えば今の担当のまま送る。
- 保存の前に、今の予定を `getSchedule` で読み直す。
- サービスコードの選択肢は、`listServiceCodes` の順に並べ、`code` をそのまま出す。
  - 提供時間の範囲の検証は、選んだ `code` の `service_time_range_start` と `service_time_range_end` で行う。
    - 検証は `apps/web/src/features/schedule/schema/scheduleForm.ts` にある。
- 予定の種類、サービスコード、訪問の区分は、マスタを引いて ID にする。
  - マスタは `listScheduleTypes`、`listServiceCodes`、`listVisitCategories` で取る。
  - サービスコードは、`listServiceCodes` の `code` と同じ表記で比べる。
- 読み直しかマスタの取得が失敗したときと、マスタに当たる値が無いときは、`updateSchedule` を呼ばずに失敗する。
- 予定の一覧の取得の結果は、保存に成功したときに捨てて、`listSchedules` で取り直す。
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

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | 読み込みの操作が終わっていないか、401 |
| 読み込みの失敗 | 「予定が見つかりません。」 | `getSchedule` か `getRecurringSchedule` が 404 |
| 読み込みの失敗 | 「この予定を見る権限がありません。」 | `getSchedule` か `getRecurringSchedule` が 403。予定の `facility_id` がログインした職員の事業所と違う（web のサーバーが 403 にする） |
| 読み込みの失敗 | 「予定を取得できませんでした。」 | `getSchedule` か `getRecurringSchedule` が 401、403、404 以外で失敗。`listUsers`、`listPatients`、`listServiceCodes` のどれかが 401 以外で失敗。API に届かない |
| Google カレンダーで管理している | 「この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください。」 | API の失敗ではない。`getFacility` の `source_mode` が `google_primary` |
| 権限が無い | 「この予定を編集する権限がありません。」 | API の失敗ではない。`getMe` の `policies` で、予定の職員の予定を編集できない |
| 保存の失敗 | 「この操作をする権限がありません。」 | `updateSchedule` か `changeOccurrence` が 403 |
| 保存の失敗 | 「入力の内容では予定を更新できません。内容を直してください。」 | `updateSchedule` か `changeOccurrence` が 400 |
| 保存の失敗 | 「この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください。」 | `updateSchedule` か `changeOccurrence` が 409 `google_primary`。事業所が Google カレンダーを予定の正本にしている |
| 保存の失敗 | 「予定を更新できませんでした。」 | `updateSchedule` か `changeOccurrence` が 400、401、403、409 `google_primary` 以外で失敗（404、ほかの 409、500）。保存の前の `getSchedule` の読み直しか、マスタ（`listScheduleTypes`、`listServiceCodes`、`listVisitCategories`）の取得が失敗。選んだ値に当たるマスタが無い。API に届かない |
| 送信中 | なし（ログインの画面へ移るまで続く） | 保存の操作が 401 |

- 読み込みの失敗の文は、`apps/web/src/features/schedule/lib/errorMessage.ts` の `scheduleLoadErrorMessage` が、予定の取得の status で選ぶ。
  - 一覧の取得の失敗は `SCHEDULE_LOAD_ERROR_MESSAGE` にする。
- 保存の失敗の文は、同じ `errorMessage.ts` の `scheduleSubmitErrorMessage` が status で選ぶ。
- 権限が無いことの文は、同じ `errorMessage.ts` の `SCHEDULE_EDIT_FORBIDDEN_MESSAGE` にある。
- 400 の `invalid_input` には、休職か退職の職員か、訪問しない職員を新しく割り振ったときと、利用の終了の利用者を新しく指したときを含む。
  - ADR-0014: [照合を照合の権限で許し、事務の役職を足し、訪問しない職員を予定と担当から外す](../../adr/0014-receipt-check-policy-and-non-visiting-staff.md)
- 読み込みは、4xx なら取り直さずにすぐ失敗にし、ほかの失敗は取り直してから失敗にする。
  - 処理は `apps/web/src/appContext.ts` の `shouldRetryQuery` にある。
