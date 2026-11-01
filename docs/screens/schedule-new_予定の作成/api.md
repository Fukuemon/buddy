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
| 提供時間 | 分 | なし。開始時間に足して `endsAt` にする | なし |
| サービスコード | コード | `ScheduleInput.visit.serviceCode` | `visit_info.service_code_id` |
| タイトル | タイトル | `ScheduleInput.title` | `title` |
| 利用者の一覧 | 利用者の名前 | `Patient.name`、選んだものは `ScheduleInput.visit.patientId` | `listPatients` の `name`、送るのは `visit_info.patient_id` |
| 職員の一覧 | 職員の名前 | `Staff.name`、選んだものは `ScheduleInput.staffId` | `listUsers` の `username`、送るのは `staff_id`、`visit_info.assigned_staff_id` |
| 職員の一覧 | 休職と退職の職員と、訪問しない職員を除くか | `Staff.status`、`Staff.nonVisiting` | `listUsers` の `Staff.status`、`visits` |
| 訪問の種類 | 夜勤、緊急、入院 | `ScheduleInput.visit.categories` | `visit_info.visit_category_ids` |
| メモ | メモ | `ScheduleInput.description` | `description` |

- 訪問の予定の `title` は、画面で入れず「訪問」を送る。
- 職員と利用者の一覧は、`listUsers` と `listPatients` から取る。名前の絞り込みは画面の中で行い、`username` と `name` の検索の項目は使わない。
- サービスコードの一覧と提供時間の範囲は、画面の定数（`apps/web/src/features/schedule/constants/scheduleLabels.ts`）で持つ。`listServiceCodes` の範囲（`service_time_range_start`、`service_time_range_end`）は使わない。
- 送る前に、web のサーバー（BFF、`apps/web/src/api/http/httpBuddyApi.ts`）がマスタを取り、予定の種類、サービスコード、訪問の区分を ID にする。
  - マスタは `listScheduleTypes`、`listServiceCodes`、`listVisitCategories` で取る。
  - サービスコードは全角と半角の数字の違いを無視して比べる。
  - マスタを取れないか、当たる値が無いと、`createSchedule` を呼ばずに失敗する。
- 作成に成功すると、事業所の予定の取得の結果を捨てる。開いているカレンダーの予定の一覧（`listSchedules`）を取り直してから、カレンダーに戻る。
- フォームの値から `ScheduleInput` への変換は `apps/web/src/features/schedule/lib/scheduleFormMapper.ts` にある。
- 同行者は `SlotRequest` の `visit_info.companion_id` に当たる。この画面は同行者を入れず、`null` を送る。
- 繰り返しの予定は `createRecurringSchedule` で作る。この画面は呼ばず、単発の予定だけを `createSchedule` で作る。
- 職員の権限は、OpenAPI の `StaffDetail.policies` にある。職員の一覧を権限で絞るときに、これを使うか別の API を使うかは決まっていない。
- 担当者は、今は `staff_id`（予定の職員）と `visit_info.assigned_staff_id`（訪問の担当）の両方に同じ職員を送る（`apps/web/src/api/http/scheduleMapper.ts`）。OpenAPI は両方を必須にしている。
- `listUsers` は、休職と退職の職員も返す。この画面は、`status` を持つ職員と、`visits` が false の職員を担当者の候補から除く。
- `createSchedule` は、`staff_id` か `visit_info.assigned_staff_id` が休職か退職の職員か、訪問しない職員を指すと 400 を返す（ADR-0022）。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 作成の失敗 | 「予定を作成できませんでした。」 | `createSchedule` が失敗（400、403、500）。400 は、休職か退職の職員か、訪問しない職員を担当者にしたときと、利用の終了の利用者を指したときを含む。マスタ（`listScheduleTypes`、`listServiceCodes`、`listVisitCategories`）の取得が失敗。選んだ値に当たるマスタが無い。API に届かない |
| 送信中 | なし（ログインの画面へ移るまで続く） | `createSchedule` か、マスタの取得が 401 |
| 選択肢が無い | なし | `listUsers` か `listPatients` が失敗したか、終わっていない。読み込みの失敗の文は出さない |

- 作成の失敗の文は `apps/web/src/features/schedule/components/ScheduleCreateModalContainer.tsx` が、status によらず 1 つの文にする。
