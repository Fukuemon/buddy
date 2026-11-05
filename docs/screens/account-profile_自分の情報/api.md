# account-profile API との対応

[自分の情報](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人と API を変える人が読む。

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 職員の名前 | 名前 | `StaffDetail.username` | `getMe` の `StaffDetail.username` |
| メールアドレス | メールアドレス | `StaffDetail.email` | `getMe` の `StaffDetail.email` |
| プロフィール | 部署、チーム、役職 | `StaffDetail.department.name`、`team.name`、`position.name` | `getMe` の `StaffDetail.department.name`、`team.name`、`position.name` |
| 持っている権限 | 権限の名前と並び | `StaffDetail.policies[].name`、`code` | `getMe` の `StaffDetail.policies[].name`。並びは `code` で決める |
| 権限の対象 | 対象の名前 | `StaffDetail.policies[].target_user_ids` を `staff.list` の `Staff.name` に、`target_team_ids` を `teams.list` の `Team.name` に引き当てる | `policies[].target_user_ids` を `listUsers` の `Staff.username` に、`target_team_ids` を `listTeams` の `Unit.name` に引き当てる |
| 持っている権限が無いことの文 | 出すか | `StaffDetail.policies` | `getMe` の `StaffDetail.policies` が空 |
| 職員の詳細を開く | 出すか、移る先 | `hasPermission(viewer, 'staff.manage')`、`Viewer.staffId` | `getMe` の `StaffDetail.policies[].code` に `staff.manage` があるか。移る先は `/staff/<StaffDetail.id>` |
| Google カレンダー | カレンダーの ID | `ExternalCalendar.calendar_id` | `getMyExternalCalendar` の `external_calendar.calendar_id` |
| 最後の取り込み | 日時、期間、失敗か | `ExternalCalendar.last_import` | `getMyExternalCalendar` の `external_calendar.last_import` の `finished_at`（`null` なら `started_at`）、`range_start`、`range_end`、`status` |
| 連携していないことの文 | 出すか | `getMyExternalCalendar` の戻り値 | `getMyExternalCalendar` の `external_calendar` が `null` |

- 画面は、`BuddyApi` の `me.get` で `getMe` の `StaffDetail` を、`me.externalCalendar` で `getMyExternalCalendar` の `external_calendar` を読む。
  - `Viewer` には項目を足さない。`Viewer` は全ての画面の権限の確認で読み直すので、この画面だけが使う項目を持たせない。
- `getMyExternalCalendar` は、予定の API の `GET /v1/me/external_calendar` である。
  - 設計は [Google カレンダーとの連携の Design Doc の自分のカレンダーの連携の状態](https://github.com/Fukuemon/buddy/blob/develop/services/schedule/internal/features/calendar/DesignDoc.md#自分のカレンダーの連携の状態) にある。
- 最後の取り込みの形は、カレンダーの連携の画面と同じ `apps/web/src/components/lastImport.ts` の `formatLastImport` で作る。
  - `formatLastImport` は取り込んだことが無いと「なし」を返すが、この画面は `last_import` が `null` なら行ごと出さない。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込みの失敗 | 「自分の情報を読み込めませんでした。時間をおいて、読み直してください。」 | `getMe`、`getMyExternalCalendar`、`listUsers`、`listTeams` のどれかが失敗、API に届かない |

## 操作

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getMe` | `GET /v1/me` | なし | 200。`StaffDetail` | 403 `forbidden`: 事業所に登録されていない職員 |
| `getMyExternalCalendar` | `GET /v1/me/external_calendar` | なし | 200。`external_calendar` に `ExternalCalendar`。結び付いていなければ `external_calendar` が `null` | なし |
| `listUsers` | `GET /v1/facilities/{facility_id}/users` | なし | 200。`Staff` の配列 | なし |
| `listTeams` | `GET /v1/facilities/{facility_id}/teams` | なし | 200。`Unit` の配列 | なし |

- どの操作も、職員の管理の権限を要らない。
  - `getMyExternalCalendar` は、トークンの職員に結び付いたカレンダーだけを返し、ほかの職員のカレンダーは返さない。
  - 事業所の結び付けたカレンダーを一覧する `listExternalCalendars` は、職員の管理の権限が要るので使わない。
