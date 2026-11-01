# schedule-new API との対応

[予定の作成](index.md) の項目と、web の型と OpenAPI の項目の対応。  
OpenAPI の項目のうち、送る値は `createSchedule`（`POST /v1/facilities/{facility_id}/schedules`）のリクエストの `SlotRequest` の項目で書く。  
選択肢は、一覧の操作のレスポンスの項目で書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 予定の種類 | 通常か訪問 | `ScheduleInput.kind` | `schedule_type_id` |
| 日付 | 予定の日 | `ScheduleInput.startsAt` の日付 | `date` |
| 開始時間 | 開始の時刻 | `ScheduleInput.startsAt` の時刻 | `start_time` |
| 終了時間 | 終わりの時刻 | `ScheduleInput.endsAt` の時刻 | `end_time` |
| 終了時間 | 訪問の予定の終了が翌日か | なし。開始時間と提供時間の和が 24 時以上なら、`endsAt` を翌日にする | `ends_next_day` |
| 終了は翌日 | 通常の予定の終了が翌日か | なし。選ぶと `endsAt` を翌日にする | `ends_next_day` |
| 提供時間 | 分 | なし。開始時間に足して `endsAt` にする | なし |
| 提供時間 | 範囲の下限と上限、選んだときの値 | `ServiceCodeRecord.service_time_range_start`、`service_time_range_end` | `listServiceCodes` の `service_time_range_start`、`service_time_range_end` |
| サービスコード | 選択肢の並びと表記 | `ServiceCodeRecord.code`、選んだものは `ScheduleInput.visit.serviceCode` | `listServiceCodes` の `code`、送るのは `visit_info.service_code_id` |
| タイトル | タイトル | `ScheduleInput.title` | `title` |
| 利用者の一覧 | 利用者の名前 | `Patient.name`、選んだものは `ScheduleInput.visit.patientId` | `listPatients` の `name`、送るのは `visit_info.patient_id` |
| 職員の一覧 | 職員の名前 | `Staff.name`、選んだものは `ScheduleInput.staffId` | `listUsers` の `username`、送るのは `staff_id`、`visit_info.assigned_staff_id` |
| 職員の一覧 | 休職と退職の職員と、訪問しない職員を除くか | `Staff.status`、`Staff.nonVisiting` | `listUsers` の `Staff.status`、`visits` |
| 職員の一覧 | 予定を作れる職員か | `Viewer.schedulePolicies`、`Staff.teamId` | `getMe` の `policies` の `code`、`target_user_ids`、`target_team_ids` |
| 訪問の区分 | 夜勤、緊急、入院 | `ScheduleInput.visit.categories` | `visit_info.visit_category_ids` |
| メモ | メモ | `ScheduleInput.description` | `description` |

- 訪問の予定の `title` は、画面で入れず「訪問」を送る。
- 職員、利用者、サービスコードの一覧は、`listUsers`、`listPatients`、`listServiceCodes` から取る。3 つを取り終えるまでフォームを出さない。名前の絞り込みは画面の中で行い、`username` と `name` の検索の項目は使わない。
- サービスコードの選択肢は、`listServiceCodes` の順に並べ、`code` をそのまま出す。
  - 初期値は、`code` を NFKC で正規化して「訪看I2」に当たるもので、無ければ先頭の `code` である。処理は `apps/web/src/features/schedule/lib/scheduleFormMapper.ts` の `defaultServiceCode` にある。提供時間の初期値は、そのサービスコードの `service_time_range_end` である。
  - 提供時間の範囲の検証は、選んだ `code` の `service_time_range_start` と `service_time_range_end` で行う。検証は `apps/web/src/features/schedule/schema/scheduleForm.ts` にある。
- 送る前に、web のサーバー（BFF、`apps/web/src/api/http/httpBuddyApi.ts`）がマスタを取り、予定の種類、サービスコード、訪問の区分を ID にする。
  - マスタは `listScheduleTypes`、`listServiceCodes`、`listVisitCategories` で取る。
  - サービスコードは、`listServiceCodes` の `code` と同じ表記で比べる。
  - マスタを取れないか、当たる値が無いと、`createSchedule` を呼ばずに失敗する。
- 作成に成功すると、事業所の予定の取得の結果を捨てる。開いているカレンダーの予定の一覧（`listSchedules`）を取り直してから、カレンダーに戻る。
- フォームの値から `ScheduleInput` への変換は `apps/web/src/features/schedule/lib/scheduleFormMapper.ts` にある。
- 同行者は `SlotRequest` の `visit_info.companion_id` に当たる。この画面は同行者を入れず、`null` を送る。
- 繰り返しの予定は `createRecurringSchedule` で作る。この画面は呼ばず、単発の予定だけを `createSchedule` で作る。
- 主訪問者は、`staff_id`（予定の職員）と `visit_info.assigned_staff_id`（訪問の担当）の両方に同じ職員を送る。変換は `apps/web/src/api/http/scheduleMapper.ts` の `toSlotRequest` にある。OpenAPI は両方を必須にしている。
- `listUsers` は、休職と退職の職員も返す。この画面は、`status` を持つ職員と、`visits` が false の職員を主訪問者と予定者の候補から除く。
- `createSchedule` は、`staff_id` か `visit_info.assigned_staff_id` が休職か退職の職員か、訪問しない職員を指すと 400 を返す（ADR-0022）。

## 権限の判定

- 予定の権限は、画面を読み込むたびに web のサーバーが `getMe`（`GET /v1/me`）で読む。
  - `policies` のうち `schedule.` で始まる `code` と、`target_user_ids`、`target_team_ids` を `Viewer.schedulePolicies` に入れる。
  - 処理は `apps/web/src/server/runtime.ts` にある。
- 主訪問者と予定者の候補は、`Viewer.schedulePolicies` から、職員ごとに予定を作れるかを決めて絞る。処理は `apps/web/src/features/schedule/lib/schedulePermission.ts` の `editableStaff` にある。
  - `schedule.self.edit` は自分を、`schedule.all.edit` は全ての職員を対象にする。
  - `schedule.user.edit` は `target_user_ids` の職員を、`schedule.team.edit` は `target_team_ids` のチームの職員を対象にする。
  - 規則は、予定の API の判定（`schedule.CanEdit`）と同じである。拒むのは予定の API である。
- URL の `staffId` が候補の外の職員を指すときは、未選択にする（`apps/web/src/features/schedule/components/ScheduleCreateModalContainer.tsx`）。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | `listUsers`、`listPatients`、`listServiceCodes` のどれかが終わっていないか、401 |
| 読み込みの失敗 | 「職員と利用者を読み込めませんでした。閉じてから、開き直してください。」 | `listUsers`、`listPatients`、`listServiceCodes` のどれかが 401 以外で失敗。API に届かない |
| 作成の失敗 | 「この操作をする権限がありません。」 | `createSchedule` が 403 |
| 作成の失敗 | 「入力の内容では予定を作成できません。内容を直してください。」 | `createSchedule` が 400。休職か退職の職員か、訪問しない職員を主訪問者か予定者にしたときと、利用の終了の利用者を指したときを含む |
| 作成の失敗 | 「予定を作成できませんでした。」 | `createSchedule` が 400、401、403 以外で失敗。マスタ（`listScheduleTypes`、`listServiceCodes`、`listVisitCategories`）の取得が失敗。選んだ値に当たるマスタが無い。API に届かない |
| 送信中 | なし（ログインの画面へ移るまで続く） | `createSchedule` か、マスタの取得が 401 |

- 作成の失敗の文は、`apps/web/src/features/schedule/lib/errorMessage.ts` の `scheduleSubmitErrorMessage` が status で選ぶ。読み込みの失敗の文は、同じファイルの `SCHEDULE_OPTIONS_LOAD_ERROR_MESSAGE` である。
- 一覧の取得は、4xx なら取り直さずにすぐ失敗にし、ほかの失敗は取り直してから失敗にする。処理は `apps/web/src/integrations/tanstack-query/root-provider.tsx` の `shouldRetryQuery` にある。
