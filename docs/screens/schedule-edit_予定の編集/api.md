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
| 提供時間 | 開始から終了までの分 | なし（`startsAt` と `endsAt` から求め、保存では `endsAt` に換算する） | なし（`start_time` と `end_time` から求める） |
| サービスコード | 選んだコード | `VisitDetail.serviceCode` | `getSchedule` の `visit_info.service_code`。保存では `visit_info.service_code_id` |
| 利用者の一覧 | 利用者の名前と選んだ利用者 | `Patient.name`、`VisitDetail.patientId` | `listPatients` の `name`、`visit_info.patient_id` |
| 職員の一覧 | 職員の名前と選んだ職員 | `Staff.name`、`Schedule.staffId` | `listUsers` の `username`、`staff_id`、`visit_info.assigned_staff_id` |
| 職員の一覧 | 休職と退職の職員と、訪問しない職員を除くか | `Staff.status`、`Staff.nonVisiting` | `listUsers` の `Staff.status`、`visits` |
| 訪問の種類 | 夜勤、緊急、入院 | `VisitDetail.categories` | `getSchedule` の `visit_info.visit_categories[].name`。保存では `visit_info.visit_category_ids` |
| メモ | メモ | `Schedule.description` | `description` |
| タイトル | 通常の予定のタイトル | `Schedule.title` | `title` |

- 保存の本文は、画面の値に、画面が持たない今の予定の値を足して作る（`apps/web/src/api/http/scheduleMapper.ts` の `keepCurrentVisit`）。
  - 訪問の予定どうしの保存では、同行者（`visit_info.companion_id`）とタイトル（`title`）を今の予定の値のまま送る。
  - 担当（`visit_info.assigned_staff_id`）は、今の担当が予定の職員と同じなら新しい予定の職員にし、違えば今の担当のまま送る。
- 保存の前に、今の予定を `getSchedule` で読み直す。
- 予定の種類、サービスコード、訪問の種類は、マスタ（`listScheduleTypes`、`listServiceCodes`、`listVisitCategories`）を引いて ID にする。
- 読み直しかマスタの取得が失敗したときと、マスタに当たる値が無いときは、`updateSchedule` を呼ばずに失敗する。
- サービスコードの一覧と提供時間の範囲は、画面が持つ定数（`apps/web/src/features/schedule/constants/scheduleLabels.ts`）を使う。`listServiceCodes` の範囲は使っていない。
- 予定の一覧の取得の結果は、保存に成功したときに捨てて取り直す（`listSchedules`）。
- `listUsers` は、休職と退職の職員も返す。この画面は、`status` を持つ職員と、`visits` が false の職員を担当者の候補から除く。予定の職員の名前は、休職と退職の職員と、訪問しない職員も含めた一覧で探す。
- 予定の取得は、予定の詳細と同じく、web のサーバーが `facility_id` の違いを 403 にし、繰り返しの予定の回を `getRecurringSchedule` で読む（[予定の詳細の API との対応](../schedule-detail_予定の詳細/api.md)）。
- 繰り返しの予定の回を保存すると、`updateSchedule` の代わりに `changeOccurrence` でその回を単発の予定に置き換える。パスは `POST /v1/schedules/recurring/{recurring_schedule_id}/occurrences` である。
- キャンセルした予定は、`updateSchedule` が 409 で拒む。画面はキャンセルした予定のフォームを出さないので、保存まで進まない。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込みの失敗 | 「予定を取得できませんでした。」 | `getSchedule`、`getRecurringSchedule`、`listUsers`、`listPatients` のどれかが失敗（400、403、404、500）。予定の `facility_id` がログインした職員の事業所と違う（web のサーバーが 403 にする）。API に届かない |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | 読み込みの操作が 401 |
| 保存の失敗 | 「予定を更新できませんでした。」 | `updateSchedule` か `changeOccurrence` が失敗（400、403、404、409、500）。保存の前の `getSchedule` の読み直しか、マスタ（`listScheduleTypes`、`listServiceCodes`、`listVisitCategories`）の取得が失敗。選んだ値に当たるマスタが無い。API に届かない |
| 送信中 | なし（ログインの画面へ移るまで続く） | 保存の操作が 401 |

- 読み込みの失敗の文は `apps/web/src/features/schedule/components/ScheduleEditModalContainer.tsx` が、status によらず 1 つの文にする。保存の失敗の文も、同じファイルが status によらず 1 つの文にする。
- 400 の `invalid_input` には、休職か退職の職員か、訪問しない職員を新しく割り振ったとき（ADR-0022）と、利用の終了の利用者を新しく指したときを含む。
- 読み込みの失敗は、TanStack Query のデフォルトで 3 回取り直してから出す。404 と 403 も取り直す。
