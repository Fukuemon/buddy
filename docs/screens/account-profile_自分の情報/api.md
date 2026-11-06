# account-profile API との対応

[自分の情報](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。

## 値の対応

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

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| ログインした職員が、職員の管理の権限を持つ | `Viewer.policyCodes` に `staff.manage` がある（`hasPermission(viewer, STAFF_MANAGE)`） |
| ログインした職員に、持っている権限がある | `StaffDetail.policies` が空でない |
| 持っている権限に、対象の職員かチームがある | `StaffPolicy.target_user_ids` と `target_team_ids` の数の和が 0 でない |
| ログインした職員に、結び付いた Google カレンダーがある | `getMyExternalCalendar` の結果（`ExternalCalendar`）が `null` でない |
| 結び付いたカレンダーに、最後の取り込みがある | `ExternalCalendar.last_import` が `null` でない |

- 判定は `AccountProfileView.tsx` と、`AccountProfileContainer.tsx` の `canManageStaff` にある。
- 職員の詳細を開くの判定は、画面の権限の一覧（`StaffDetail.policies`）でなく、ログインした職員の情報（`Viewer`）を使う。`Viewer` は 5 分まで古いことがあるので、権限を変えた直後は、出し分けと一覧が食い違う間がある。
- メールアドレスは `StaffDetail.email` が `null` でないときに出す。休職と退職の職員はログインできないので、この画面では常に出る。
- 名前を引けない権限の対象は、ID のまま出す（`lib/format.ts` の `policyTargetText`）。仕様書には書かない。
- ログアウトは、web をフェイクの API で動かすときは出ない（`SiteLayoutContainer.tsx` の `canLogout`）。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | 自分の情報 | `viewer-profile` |
| 4 | ログアウト | `viewer-logout` |
| 5 | ページのタイトル | `account-profile-title` |
| 6 | 職員の詳細を開く | `account-profile-staff-detail` |
| 6 | 職員の名前 | `account-profile-name` |
| 7 | 職員の名前 | `account-profile-name` |
| 7 | メールアドレス | `account-profile-email` |
| 8 | メールアドレス | `account-profile-email` |
| 9 | 持っている権限 | `account-profile-policy-list` |
| 10 | 持っている権限 | `account-profile-policy-list` |
| 9 | 持っている権限が無いことの文 | `account-profile-policies-empty` |
| 10 | 権限の対象 | `account-profile-policy-targets-{権限の code}` |
| 11 | カレンダーの連携 | `account-profile-calendar` |
| 10 | カレンダーの連携 | `account-profile-calendar` |
| 12 | Google カレンダー | `account-profile-calendar-id` |
| 11 | Google カレンダー | `account-profile-calendar-id` |
| 12 | 連携していないことの文 | `account-profile-calendar-not-linked` |
| 13 | 最後の取り込み | `account-profile-last-import` |
| 12 | 最後の取り込み | `account-profile-last-import` |
| 6 | 読み込み中の表示 | `account-profile-loading` |
| 6 | 読み込みの失敗の文 | `account-profile-error` |
| 7 | 読み直す | `account-profile-retry` |
| 14 | メニュー | `site-nav-toggle` |
| 13 | メニュー | `site-nav-toggle` |
| 7 | メニュー | `site-nav-toggle` |
| 8 | メニュー | `site-nav-toggle` |

- プロフィールの面の `account-profile-profile` は、職員の名前とメールアドレスも含む面に付く。構成要素の表のプロフィール（部署、チーム、役職の並び）と違う要素なので、この表に載せない。
- 権限の面の `account-profile-policies` と、権限の行の `account-profile-policy-{権限の code}` は、構成要素の表に載せないので、この表に載せない。

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
