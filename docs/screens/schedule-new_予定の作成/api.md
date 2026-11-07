# schedule-new API との対応

[予定の作成](index.md) の項目と、web の型と OpenAPI の項目の対応。  
OpenAPI の項目のうち、送る値は `createSchedule`（`POST /v1/facilities/{facility_id}/schedules`）のリクエストの `SlotRequest` の項目で書く。  
選択肢は、一覧の操作のレスポンスの項目で書く。

## 値の対応

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
| 利用者の一覧 | 利用の終了の利用者を除くか | `Patient.ended` | `listPatients`（`include_ended=true`）の `ended_at` |
| 職員の一覧 | 職員の名前 | `Staff.name`、選んだものは `ScheduleInput.staffId` | `listUsers` の `username`、送るのは `staff_id`、`visit_info.assigned_staff_id` |
| 職員の一覧 | 休職と退職の職員と、訪問しない職員を除くか | `Staff.status`、`Staff.nonVisiting` | `listUsers` の `Staff.status`、`visits` |
| 職員の一覧 | 予定を作れる職員か | `Viewer.schedulePolicies`、`Staff.teamId` | `getMe` の `policies` の `code`、`target_user_ids`、`target_team_ids` |
| 訪問の区分 | 夜勤、緊急、入院 | `ScheduleInput.visit.categories` | `visit_info.visit_category_ids` |
| メモ | メモ | `ScheduleInput.description` | `description` |
| （画面に出さない） | 作る予定の ID | `BuddyApi.schedules.create` の `id` | 本文の `id` |

- 画面は事業所を読まず、`buddy_primary` と `google_primary` のどちらの事業所でも同じフォームを出す。
- 予定の ID（ULID）は、フォームを開いたときに 1 つ作り、`createSchedule` の本文の `id` に送る。
  - 作るのは `apps/web/src/features/schedule/lib/scheduleId.ts` の `newScheduleId` である。
  - 作成が失敗して送り直すときも、同じ `id` を送る。`google_primary` の事業所で、Google カレンダーに書けたのに応答を受けられなかったときも、Google の予定が 2 つにならないためである。
  - 処理は `apps/web/src/features/schedule/components/ScheduleCreateModalContainer.tsx` にある。
  - 送るのは `apps/web/src/features/schedule/queries.ts` の `useCreateSchedule` である。
- `google_primary` の事業所では、`createSchedule` が予定の職員の Google カレンダーに予定を書き、書けたときだけ成功を返す。
  - 扱いは [ADR-0029](../../adr/0029-google-calendar-sync.md) にある。
- 訪問の予定の `title` は、画面で入れず「訪問」を送る。
- 職員、利用者、サービスコードの一覧は、`listUsers`、`listPatients`、`listServiceCodes` から取る。
  - 3 つを取り終えるまでフォームを出さない。
  - 名前の絞り込みは画面の中で行い、`username` と `name` の検索の項目は使わない。
- `listPatients` は、web のサーバーが `include_ended=true` で利用の終了の利用者も含めて取る。
  - この画面は、`Patient.ended` が `true` の利用者を利用者の候補から除く。
  - 処理は `apps/web/src/api/activePatients.ts` の `activePatients` にある。
  - 扱いは [ADR-0005](../../adr/0005-patient-service-end.md) にある。
- サービスコードの選択肢は、`listServiceCodes` の順に並べ、`code` をそのまま出す。
  - 初期値は、`code` を NFKC で正規化して「訪看I2」に当たるもので、無ければ先頭の `code` である。
    - 処理は `apps/web/src/features/schedule/lib/scheduleFormMapper.ts` の `defaultServiceCode` にある。
  - 提供時間の初期値は、初期値のサービスコードの `service_time_range_end` である。
  - 提供時間の範囲の検証は、選んだ `code` の `service_time_range_start` と `service_time_range_end` で行う。
    - 検証は `apps/web/src/features/schedule/schema/scheduleForm.ts` にある。
  - 選んだ `code` が空か、`listServiceCodes` に無いときは、「サービスコードを選んでください」を出し、提供時間の範囲を検証しない。
    - 日時の枠の文は、`scheduleDate`、`startTime`、`endTime`、`serviceCode`、`serviceTime` の誤りの順で最初の 1 つを選ぶ。処理は `apps/web/src/features/schedule/components/ScheduleForm.tsx` にある。
- 送る前に、web のサーバー（BFF、`apps/web/src/api/http/httpBuddyApi.ts`）がマスタを取り、予定の種類、サービスコード、訪問の区分を ID にする。
  - マスタは `listScheduleTypes`、`listServiceCodes`、`listVisitCategories` で取る。
  - サービスコードは、`listServiceCodes` の `code` と同じ表記で比べる。
  - マスタを取れないか、当たる値が無いと、`createSchedule` を呼ばずに失敗する。
- 作成に成功すると、事業所の予定の取得の結果を捨てる。
  - 開いているカレンダーの予定の一覧（`listSchedules`）を取り直してから、カレンダーに戻る。
- フォームの値から `ScheduleInput` への変換は `apps/web/src/features/schedule/lib/scheduleFormMapper.ts` にある。
- 同行者は `SlotRequest` の `visit_info.companion_id` に当たる。
  - この画面は同行者を入れず、`null` を送る。
- 繰り返しの予定は `createRecurringSchedule` で作る。
  - この画面は `createRecurringSchedule` を呼ばず、単発の予定だけを `createSchedule` で作る。
- 主訪問者は、予定の職員の `staff_id` と、訪問の担当の `visit_info.assigned_staff_id` の両方に同じ職員を送る。
  - 変換は `apps/web/src/api/http/scheduleMapper.ts` の `toSlotRequest` にある。
  - OpenAPI は両方を必須にしている。
- `listUsers` は、休職と退職の職員も返す。
  - この画面は、`status` を持つ職員と、`visits` が false の職員を主訪問者と予定者の候補から除く。
- `createSchedule` は、`staff_id` か `visit_info.assigned_staff_id` が休職か退職の職員か、訪問しない職員を指すと 400 を返す。
  - ADR-0004: [職員の停止を、戻せる休職と、戻せない退職に分ける](../../adr/0004-staff-leave-and-retirement.md)
  - ADR-0006: [訪問するかを職員に持ち、訪問しない職員を予定と担当から外す](../../adr/0006-non-visiting-staff.md)

## 権限の判定

- 予定の権限は、画面を読み込むたびに web のサーバーが `getMe`（`GET /v1/me`）で読む。
  - `policies` のうち `schedule.` で始まる `code` と、`target_user_ids`、`target_team_ids` を `Viewer.schedulePolicies` に入れる。
  - 処理は `apps/web/src/api/http/scheduleMapper.ts` の `fromApiMe` にある。
- 主訪問者と予定者の候補は、`Viewer.schedulePolicies` から、職員ごとに予定を作れるかを決めて絞る。
  - 処理は `apps/web/src/features/schedule/lib/schedulePermission.ts` の `editableStaff` にある。
  - `schedule.self.edit` は自分を、`schedule.all.edit` は全ての職員を対象にする。
  - `schedule.user.edit` は `target_user_ids` の職員を、`schedule.team.edit` は `target_team_ids` のチームの職員を対象にする。
  - 規則は、予定の API の判定（`schedule.CanEdit`）と同じである。
  - 拒むのは予定の API である。
- URL の `staffId` が候補の外の職員を指すときは、未選択にする。
  - 処理は `apps/web/src/features/schedule/components/ScheduleCreateModalContainer.tsx` にある。

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 職員が、作成を送っている途中である | react-hook-form の `formState.isSubmitting` が `true`（`ScheduleFormModal` が作成のボタンの `isLoading` に渡す）。`createSchedule` を呼んでから、成功してカレンダーへ移るまでを含む |

- 作成のボタンは packages/ui の `Button` で、`isLoading` の間は押しても `onClick` と送信を止める。
- 送っている間も、`ScheduleFormModal` は `Modal` に送信中を渡さず、`ScheduleForm` の欄も `disabled` にしない。
  - 閉じる、キャンセル、覆い、Escape キー、入力の欄は、送っている間も動く。
- 項目の一覧の項目と、右の入力の欄の出し分けは、フォームの値の `kind` と、`ScheduleForm` が持つ選んだ項目で決める。
  - どちらも状態で決まるので、条件の表に載せない。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 3 | 予定の種類 | `schedule-kind-tab` |
| 4 | 閉じる | `modal-close` |
| 3 | 閉じる | `modal-close` |
| 5 | 項目の一覧 | `schedule-field-title` |
| 5 | 項目の一覧 | `schedule-field-date-time` |
| 5 | 項目の一覧 | `schedule-field-patient` |
| 5 | 項目の一覧 | `schedule-field-staff` |
| 5 | 項目の一覧 | `schedule-field-category` |
| 5 | 項目の一覧 | `schedule-field-description` |
| 6 | 日付 | `schedule-form-date` |
| 7 | 開始時間 | `schedule-form-start-time` |
| 8 | 提供時間 | `schedule-form-service-time` |
| 9 | 終了時間 | `schedule-form-end-time` |
| 8 | 終了時間 | `schedule-form-end-time` |
| 9 | 終了は翌日 | `schedule-form-ends-next-day` |
| 10 | サービスコード | `service-code-{コード}` |
| 6 | タイトル | `schedule-form-title` |
| 6 | 利用者の検索 | `patient-select-search` |
| 7 | 利用者の一覧 | `patient-select-option-{利用者の id}` |
| 6 | 職員の検索 | `staff-select-search` |
| 7 | 職員の一覧 | `staff-select-option-{職員の id}` |
| 6 | 訪問の区分 | `schedule-category-night` |
| 6 | 訪問の区分 | `schedule-category-emergency` |
| 6 | 訪問の区分 | `schedule-category-hospitalization` |
| 6 | メモ | `schedule-form-description` |
| 7 | キャンセル | `schedule-new-cancel` |
| 8 | キャンセル | `schedule-new-cancel` |
| 10 | キャンセル | `schedule-new-cancel` |
| 11 | キャンセル | `schedule-new-cancel` |
| 12 | キャンセル | `schedule-new-cancel` |
| 8 | 作成 | `schedule-create-submit` |
| 9 | 作成 | `schedule-create-submit` |
| 11 | 作成 | `schedule-create-submit` |
| 12 | 作成 | `schedule-create-submit` |
| 13 | 作成 | `schedule-create-submit` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- 閉じるの `modal-close` は、packages/ui の `Modal` が付ける。
- 予定の種類の選択肢は、`schedule-kind-tab-normal`、`schedule-kind-tab-visit` である。packages/ui の `SegmentedControl` が、組の testid に選択肢の `kind` を付ける。
- 項目の一覧の testid の末尾は、項目の ID（`title`、`date-time`、`patient`、`staff`、`category`、`description`）である。
- サービスコードの `{コード}` は、`listServiceCodes` の `code` の表記のままである。
- 利用者の一覧と職員の一覧の testid は、行のラジオボタンに付く。「選択肢が無い」の状態のモックは行を持たないので、番号の印を表に付ける。
- モーダルの本体の `schedule-form-modal` と、フォームの `schedule-form` は、構成要素の表に載せないので、この表に載せない。
- 読み込み中の表示、読み込みの失敗の文、作成の失敗の文は、testid を持たない。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込み中 | なし（ログインの画面へ移るまで続く） | `listUsers`、`listPatients`、`listServiceCodes` のどれかが終わっていないか、401 |
| 読み込みの失敗 | 「職員と利用者を読み込めませんでした。閉じてから、開き直してください。」 | `listUsers`、`listPatients`、`listServiceCodes` のどれかが 401 以外で失敗。API に届かない |
| 作成の失敗 | 「この操作をする権限がありません。」 | `createSchedule` が 403 |
| 作成の失敗 | 「入力の内容では予定を作成できません。内容を直してください。」 | `createSchedule` が 400。休職か退職の職員か、訪問しない職員を主訪問者か予定者にしたときと、利用の終了の利用者を指したときを含む |
| 作成の失敗 | 「この事業所の予定は Google カレンダーで管理しています。予定は Google カレンダーで作成、変更してください。」 | `createSchedule` が 409 `google_primary`。事業所が Google カレンダーを予定の正本にしている |
| Google カレンダーに書けたかを確認できなかった | 「Google カレンダーに書けたかを確認できませんでした。もう一度「作成」を押すと、同じ予定として送り直します。」 | `createSchedule` が 503 `google_write_unknown` |
| 作成の失敗 | 「Google カレンダーで予定が変更されていました。最新の予定を確認してから、もう一度保存してください。」 | `createSchedule` が 409 `google_event_changed` |
| 作成の失敗 | 「Google カレンダーで予定が消されたか、見つかりません。」 | `createSchedule` が 409 `google_event_not_found` |
| 作成の失敗 | 「前の保存の結果を確認しています。時間をおいて、予定を開き直してください。」 | `createSchedule` が 409 `google_write_pending` |
| 作成の失敗 | 「Google カレンダーに書けませんでした。時間をおいて、やり直してください。」 | `createSchedule` が 503 `google_unavailable` |
| 作成の失敗 | 「Google カレンダーに予定を書く権限がありません。カレンダーの共有の設定を、事業所の管理者に確認してください。」 | `createSchedule` が 409 `google_calendar_unwritable` |
| 作成の失敗 | 「Google カレンダーが予定を受け付けませんでした。入力を確認してください。」 | `createSchedule` が 409 `google_event_rejected` |
| 作成の失敗 | 「予定の職員が Google カレンダーを結び付けていません。カレンダーの結び付けを、事業所の管理者に頼んでください。」 | `createSchedule` が 409 `calendar_not_linked` |
| 作成の失敗 | 「この事業所には、Google カレンダーと連携する設定がありません。事業所の管理者に確認してください。」 | `createSchedule` が 503 `calendar_not_configured` |
| 作成の失敗 | 「予定の正本を buddy に切り替えています。切り替えが終わるまで、予定を作成、変更、キャンセルできません。」 | `createSchedule` が 409 `cutover_open` |
| 作成の失敗 | 「予定を作成できませんでした。」 | `createSchedule` が、ここまでのほかの失敗（409 `conflict`、500 など）。マスタ（`listScheduleTypes`、`listServiceCodes`、`listVisitCategories`）の取得が失敗。選んだ値に当たるマスタが無い。API に届かない |
| 送信中 | なし（ログインの画面へ移るまで続く） | `createSchedule` か、マスタの取得が 401 |

- 作成の失敗の文は、`apps/web/src/features/schedule/lib/errorMessage.ts` の `scheduleSubmitErrorMessage` が status と `ApiError.code` で選ぶ。
  - `google_write_unknown` の文は、作成だけ、同じ予定として送り直せることを案内する。
- 読み込みの失敗の文は、同じ `errorMessage.ts` の `SCHEDULE_OPTIONS_LOAD_ERROR_MESSAGE` にある。
- 一覧の取得は、4xx なら取り直さずにすぐ失敗にし、ほかの失敗は取り直してから失敗にする。
  - 処理は `apps/web/src/appContext.ts` の `shouldRetryQuery` にある。
