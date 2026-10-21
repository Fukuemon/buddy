# schedule-new API との対応

[予定の作成](index.md) の項目と、web の型と OpenAPI の項目の対応。OpenAPI の項目は、送るものを `createSchedule`（`POST /v1/facilities/{facility_id}/schedules`）の要求の `SlotRequest` で、選択肢を一覧の操作の応答で書く。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 予定の種類 | 通常か訪問 | `ScheduleInput.kind` | `schedule_type_id` |
| 日付 | 予定の日 | `ScheduleInput.startsAt` の日付 | `date` |
| 開始時間 | 開始の時刻 | `ScheduleInput.startsAt` の時刻 | `start_time` |
| 終了時間 | 終わりの時刻 | `ScheduleInput.endsAt` の時刻 | `end_time` |
| 提供時間 | 分 | なし。開始時間に足して `endsAt` にする | なし |
| サービスコード | コード | `ScheduleInput.visit.serviceCode` | `visit_info.service_code_id` |
| タイトル | 題名 | `ScheduleInput.title` | `title` |
| 利用者の選択肢 | 利用者の名前 | `Patient.name`、選んだものは `ScheduleInput.visit.patientId` | `listPatients` の `name`、送るのは `visit_info.patient_id` |
| 担当者の選択肢 | 職員の名前 | `Staff.name`、選んだものは `ScheduleInput.staffId` | `listUsers` の `username`、送るのは `staff_id`、`visit_info.assigned_staff_id` |
| 訪問の種類 | 夜勤、緊急、入院 | `ScheduleInput.visit.categories` | `visit_info.visit_category_ids` |
| メモ | メモ | `ScheduleInput.description` | `description` |

- 訪問の予定の `title` は、画面で入れず「訪問」を送る。
- 職員と利用者の一覧は、`listUsers` と `listPatients` から取る。名前の絞り込みは画面の中で行い、`username` と `name` の検索の項目は使わない。
- サービスコードの一覧と提供時間の範囲は、画面の定数（`apps/web/src/features/schedule/constants/scheduleLabels.ts`）で持ち、`listServiceCodes` を使っていない。
- フォームの値から `ScheduleInput` への変換は `apps/web/src/features/schedule/lib/scheduleFormMapper.ts` にある。
