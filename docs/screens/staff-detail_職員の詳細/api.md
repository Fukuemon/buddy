# staff-detail API との対応

[職員の詳細](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| 職員の名前 | 名前 | `StaffDetail.username`（`staff.get` の戻り値） | `getUser` の `StaffDetail.username` |
| 状態の印、在籍の状態 | 状態、休職にした日、戻る予定の日、退職にした日 | `StaffDetail.status`、`leave_started_at`、`leave_return_date`、`retired_at` | `StaffDetail.status`、`leave_started_at`、`leave_return_date`、`retired_at`。`status` が有効なら、どちらも出さない |
| メールアドレス、プロフィール | メールアドレス、電話番号 | `StaffDetail.email`、`phone_number` | `StaffDetail.email`、`phone_number`。退職した職員では `null` で、どちらも出さない。`phone_number` が `null` なら、電話番号の行を出さない |
| プロフィール | 部署、チーム | `StaffDetail.department.name`、`team.name` | `StaffDetail.department.name`、`team.name` |
| プロフィール | 訪問 | `StaffDetail.visits` | `StaffDetail.visits`。false なら「訪問しない（予定のカレンダーの列と、予定と担当の候補に出ません）」 |
| 名前の入力、電話番号の入力、部署の選択、チームの選択、訪問の選択 | 送る値 | `StaffUpdateInput`（`staff.update` の引数） | `updateUser` の本文の `username`、`phone_number`、`department_id`、`team_id`、`visits` |
| 部署の選択、チームの選択 | 選択肢 | `Department`、`Team`（`departments.list`、`teams.list` の戻り値） | `listDepartments`、`listTeams` の `Unit` |
| 役職 | 役職の名前 | `StaffDetail.position.name` | `StaffDetail.position.name` |
| 役職の選択 | 選択肢 | `Position`（`positions.list` の戻り値） | `listPositions` の `Position` の `id`、`name` |
| 役職を変えるときの注意 | 職員ごとに足した権限の名前 | `positions.list` の戻り値のうち `id` が `StaffDetail.position.id` の `Position` の `policies` に無い `StaffDetail.policies` の `name` | `StaffDetail.policies` のうち、`getPosition` で `StaffDetail.position.id` を読んだ `Position.policies` に無い権限の `name`。`StaffDetail.position` は `id` と `name` だけの `Ref` で、デフォルトの権限を持たない |
| ダイアログの役職を変える | 送る役職 | `staff.changePosition` の引数 | `changeUserPosition` の本文の `position_id` |
| 権限の一覧 | 付いている権限の名前 | `Policy.name`（`policies.list` の戻り値のうち、`StaffDetail.policies[].policy_id` にあるもの） | `StaffDetail.policies[].name` |
| 権限のまとまり | 役職の名前、まとまりの分け方 | `StaffDetail.position.name` と、`positions.list` の戻り値のうち `id` が `StaffDetail.position.id` の `Position.policies` | 役職の名前は `StaffDetail.position.name`。`getPosition` で `StaffDetail.position.id` を読み、`Position.policies[].id` に `policy_id` が入る権限を役職のまとまりに、入らない権限を「個別に足した権限」（ダイアログでは「ほかの権限」）に入れる |
| 権限の対象 | 対象の名前 | `StaffPolicy.target_user_ids` を `staff.list` の `Staff.name` に、`target_team_ids` を `teams.list` の `Team.name` に引き当てる | `policies[].target_user_ids` を `listUsers` の `Staff.username` に、`target_team_ids` を `listTeams` の `Unit.name` に引き当てる |
| 権限の選択 | 選択肢 | `Policy`（`policies.list` の戻り値） | `listPolicies` の `Policy` の `id`、`name`、`code`、`needs_target` |
| 対象の選択 | 職員かチームか | `Policy.code` | `Policy.code` が `schedule.user.` で始まれば職員、`schedule.team.` で始まればチーム |
| 対象の候補 | 候補 | `staff.list` の有効な `Staff` か、`teams.list` の `Team` | `listUsers` の有効な `Staff` か、`listTeams` の `Unit` のうち、選んでいないもの |
| 権限の保存 | 足す権限と対象 | `PolicyChange` の `add`（`staff.addPolicy` の引数） | `addUserPolicy` の本文の `policy_id`、`target_user_ids`、`target_team_ids` |
| 権限の保存 | 外す権限 | `PolicyChange` の `remove`（`staff.removePolicy` の引数） | `removeUserPolicy` のパスの `user_policy_id` |
| 残る予定と担当の一覧 | 残る予定、繰り返しの予定、担当の利用者 | `StaffAssignments`（`staff.remainingAssignments` の戻り値、`staff.retire` と `staff.update` の拒まれた結果） | `getUserRemainingAssignments` の `StaffAssignments`。退職を拒んだときは `retireUser` の、訪問しない職員への変更を拒んだときは `updateUser` の 409 の `RetireConflict.assignments` |
| 残る予定 | 日付と時間 | `StaffAssignments.schedules[]` | `StaffAssignments.schedules[]` の `id`、`date`、`start_time`、`end_time` |
| 残る繰り返しの予定 | 最初の回の日付、終了日、時間 | `StaffAssignments.recurring_schedules[]` | `StaffAssignments.recurring_schedules[]` の `date`、`end_date`、`start_time`、`end_time` |
| 残る担当の利用者 | 利用者の名前 | `StaffAssignments.patients[]` | `StaffAssignments.patients[].name` |
| 戻る予定の日 | 送る日付 | `staff.startLeave` の引数 | `startUserLeave` の本文の `return_date` |
| 休職にする、退職にする | 出すか | `Viewer.staffId` | `getMe` の `id` と `StaffDetail.id` が違うか |
| 読み込みの失敗の文 | 見つからないか | `ApiError.status` | `getUser` の 404 |

## 条件の対応

| 条件 | 判定に使う値 |
| --- | --- |
| 開いた職員が、退職した職員である | `StaffDetail.status` が `retired`（`StaffDetailView` の `canChange` が `false`） |
| 開いた職員が、ログインした職員である | URL の職員の ID が `Viewer.staffId` と同じ（`StaffDetailContainer` が渡す `isSelf`） |
| 全ての権限を読み終えている | `policies.list` の結果（`Policy[]`）がある（`StaffDetailView` の `policies` が `undefined` でない） |
| 権限が、対象を指定する権限である | `Policy.needs_target` が `true`（`policyTargetKind` が `undefined` でない） |
| 開いた職員に付いた権限に、対象がある | `StaffPolicy.target_user_ids` と `StaffPolicy.target_team_ids` の数の和が 1 以上 |
| 職員が、復職を送っている途中である | `reinstateUser` を呼ぶ mutation（`useReinstate`）の `isPending` が `true`（`StaffDetailView` の `isReinstating`） |
| 職員が、保存を送っている途中である | `updateUser` を呼ぶ mutation（`useUpdateStaff`）の `isPending` が `true`（`StaffProfileDialog` の `isSubmitting`） |
| 事業所の部署を読み終えている | `departments.list` の結果（`Department[]`）がある。プロフィールの編集のダイアログを開いたときに読む |
| 事業所のチームを読み終えている | `teams.list` の結果（`Team[]`）がある |
| 職員が、役職の変更を送っている途中である | `changeUserPosition` を呼ぶ mutation（`useChangePosition`）の `isPending` が `true`（`StaffPositionDialog` の `isSubmitting`） |
| 事業所の役職を読み終えている | `positions.list` の結果（`Position[]`）がある |
| 選んだ役職が、開いた職員の今の役職である | `StaffPositionDialog` の選んだ役職の ID が `StaffDetail.position.id` と同じ |
| 職員が、権限の保存を送っている途中である | `addUserPolicy` と `removeUserPolicy` を呼ぶ mutation（`useSavePolicies`）の `isPending` が `true`（`StaffPoliciesDialog` の `isSubmitting`） |
| 職員が、その権限にチェックを入れている | `PolicySelection` の権限の `code` の `checked` が `true` |
| 事業所の職員かチームを読み終えている | 職員を対象にする権限では `staff.list` の結果（`Staff[]`）が、チームを対象にする権限では `teams.list` の結果がある（`StaffPoliciesDialog` の `staffOptions`、`teamOptions`） |
| 職員が、開いたときから権限の選択か対象を変えている | `planPolicyChanges` が返す `PolicyChange[]` が空でない |
| チェックを入れた対象を指定する権限の全てに、対象がある | `hasTargetsForAll` が `true` |
| 開いたときからの、権限の選択と対象の変更がある | `planPolicyChanges` が返す `PolicyChange[]` が空でない |
| チェックを入れた対象を指定する権限に、対象の無い権限がある | `hasTargetsForAll` が `false` |
| 職員が、休職を送っている途中である | `startUserLeave` を呼ぶ mutation（`useStartLeave`）の `isPending` が `true`（`StaffLeaveDialog` の `isSubmitting`） |
| 開いた職員の、残る予定と担当の利用者を読み終えている | `staff.remainingAssignments` の結果（`StaffAssignments`）がある。退職を拒まれた後は、拒まれた結果の `StaffAssignments` を使う |
| 開いた職員に、今日以降に残る予定と担当の利用者がある | `hasNoAssignments` が `false`（`StaffAssignments.schedules`、`recurring_schedules`、`patients` のどれかが空でない） |
| 職員が、退職を送っている途中である | `retireUser` を呼ぶ mutation（`useRetire`）の `isPending` が `true`（`StaffRetireDialog` の `isSubmitting`） |
| 開いたダイアログが、休職か退職のダイアログである | `StaffDetailContainer` の開いているダイアログ（`open`）が `leave` か `retire` |
| 職員が、訪問の選択で訪問しないを選んでいる | `StaffProfileDialog` の `visits` が `false` |
| 開いた職員に、今日以降に残る単発の予定がある | `StaffAssignments.schedules` が空でない |
| 開いた職員に、今日以降に回が残る繰り返しの予定がある | `StaffAssignments.recurring_schedules` が空でない |
| 開いた職員に、担当の利用者がいる | `StaffAssignments.patients` が空でない |
| 読めなかった理由が、職員が見つからないことである | `staff.get` の `ApiError.status` が 404（`StaffDetailViewState` の `canRetry` が `false`） |

- 判定の処理は、次のファイルにある。
  - 職員の見出し、タブ、権限の一覧: `apps/web/src/features/staff/components/StaffDetailView.tsx`
  - 開くダイアログと、送っている途中か: `apps/web/src/features/staff/components/StaffDetailContainer.tsx`
  - ダイアログの中: `apps/web/src/features/staff/components/` の次のファイル
    - `StaffProfileDialog.tsx`、`StaffPositionDialog.tsx`、`StaffPoliciesDialog.tsx`
    - `StaffLeaveDialog.tsx`、`StaffRetireDialog.tsx`、`StaffAssignmentList.tsx`
  - 権限の変更の比べ方と、対象の有無: `apps/web/src/features/staff/lib/policyChanges.ts` の `planPolicyChanges`、`hasTargetsForAll`
  - 対象を指定する権限か、残るものが無いか: `apps/web/src/features/staff/lib/format.ts` の `policyTargetKind`、`hasNoAssignments`
- 送っている間は、入力の欄に `disabled` を、キャンセルに押せない印を付ける。覆いと Escape キーでも閉じない。
  - ボタンと覆いは packages/ui の `InputDialog`、`ConfirmDialog`、`DialogSubmit`、`Dialog` が決める。
  - 訪問の選択（`VisitsField`）には、送っている間も `disabled` を付けない。
- プロフィールの編集のダイアログの残る予定と担当の一覧は、訪問しない職員への変更を拒まれた結果（`refusedAssignments`）があり、`visits` が `false` のときだけ出す（`StaffProfileDialog.tsx`）。
- 部署とチームの選択は、選択肢が `undefined` の間は押せない（`StaffFormFields.tsx` の `StaffSelect`）。
- 対象を足すは、選択肢が `undefined` の間は押せない（packages/ui の `ChipPicker`）。
- メールアドレスは、`StaffDetail.status` でなく、`StaffDetail.email` が `null` でないかで出し分ける（`StaffDetailView.tsx`）。退職すると予定の API とブローカーがメールを消すので、退職した職員かで分けるのと同じ結果になる。
- 出し分けは表示だけに使う。
  - 職員を変える操作を拒むのは、職員の API である。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 6 | メニュー | `site-nav-toggle` |
| 7 | メニュー | `site-nav-toggle` |
| 11 | メニュー | `site-nav-toggle` |
| 13 | メニュー | `site-nav-toggle` |
| 14 | メニュー | `site-nav-toggle` |
| 15 | メニュー | `site-nav-toggle` |
| 17 | メニュー | `site-nav-toggle` |
| 4 | 職員の一覧へ | `staff-detail-back` |
| 5 | 職員の名前 | `staff-detail-name` |
| 6 | 状態の印 | `staff-detail-status` |
| 6 | メールアドレス | `staff-detail-email` |
| 7 | メールアドレス | `staff-detail-email` |
| 7 | 編集 | `staff-detail-edit` |
| 8 | 編集 | `staff-detail-edit` |
| 8 | ほかの操作 | `staff-detail-menu` |
| 9 | ほかの操作 | `staff-detail-menu` |
| 7 | タブ | `staff-detail-tabs` |
| 9 | タブ | `staff-detail-tabs` |
| 10 | タブ | `staff-detail-tabs` |
| 8 | プロフィール | `staff-detail-profile` |
| 10 | プロフィール | `staff-detail-profile` |
| 11 | プロフィール | `staff-detail-profile` |
| 9 | 役職 | `staff-detail-position-name` |
| 11 | 役職 | `staff-detail-position-name` |
| 12 | 役職 | `staff-detail-position-name` |
| 12 | 役職を変える | `staff-detail-position-change` |
| 13 | 役職を変える | `staff-detail-position-change` |
| 10 | 在籍の状態 | `staff-detail-status-text` |
| 14 | 在籍の状態 | `staff-detail-status-text` |
| 10 | 権限を変える | `staff-detail-policies-change` |
| 11 | 権限の一覧 | `staff-policy-list` |
| 4 | 権限のまとまり | `staff-policies-group-position` |
| 12 | 権限のまとまり | `staff-policy-group-position` |
| 13 | 権限の対象 | `staff-policy-targets-{権限の code}` |
| 13 | 休職にする | `staff-detail-leave` |
| 15 | 復職にする | `staff-detail-reinstate` |
| 16 | 復職の失敗の文 | `staff-detail-reinstate-error` |
| 14 | 退職にする | `staff-detail-retire` |
| 16 | 退職にする | `staff-detail-retire` |
| 2 | プロフィールの編集のダイアログ | `staff-detail-edit-dialog` |
| 3 | 名前の入力 | `staff-detail-name-input` |
| 4 | 変えられないメールアドレス | `staff-detail-email-readonly` |
| 5 | 電話番号の入力 | `staff-detail-phone-input` |
| 6 | 部署の選択 | `staff-detail-department-input` |
| 7 | チームの選択 | `staff-detail-team-input` |
| 9 | 訪問の選択 | `staff-detail-visits-input` |
| 11 | 保存 | `staff-detail-save` |
| 2 | 役職を変えるダイアログ | `staff-position-dialog` |
| 3 | 役職の選択 | `staff-position-options` |
| 4 | 役職を変えるときの注意 | `staff-position-note` |
| 6 | ダイアログの役職を変える | `staff-position-submit` |
| 7 | ダイアログの役職を変えるの条件の文 | `staff-position-submit-hint` |
| 2 | 権限を変えるダイアログ | `staff-policies-dialog` |
| 3 | 権限の選択 | `staff-policies-option-{権限の code}` |
| 5 | 対象の選択 | `staff-policies-targets` |
| 6 | 対象を外す | `staff-policies-target-remove-{職員の id}` |
| 3 | 対象を足す | `staff-policies-target-add` |
| 7 | 対象を足す | `staff-policies-target-add` |
| 4 | 対象の候補 | `staff-policies-target-options` |
| 6 | 権限の保存 | `staff-policies-submit` |
| 9 | 権限の保存 | `staff-policies-submit` |
| 10 | 権限の保存の失敗の文 | `staff-policies-error` |
| 7 | 権限の保存の条件の文 | `staff-policies-submit-hint` |
| 10 | 権限の保存の条件の文 | `staff-policies-submit-hint` |
| 11 | 権限の保存の条件の文 | `staff-policies-submit-hint` |
| 2 | 休職のダイアログ | `staff-leave-dialog` |
| 4 | 残る予定と担当の一覧 | `staff-leave-assignments` |
| 4 | 残る予定と担当の一覧 | `staff-retire-assignments` |
| 12 | 残る予定と担当の一覧 | `staff-non-visiting-assignments` |
| 5 | 残る予定 | `staff-leave-assignment-schedule-{予定の id}` |
| 5 | 残る予定 | `staff-retire-assignment-schedule-{予定の id}` |
| 6 | 残る繰り返しの予定 | `staff-leave-assignment-recurring-{繰り返しの予定の id}` |
| 6 | 残る繰り返しの予定 | `staff-retire-assignment-recurring-{繰り返しの予定の id}` |
| 7 | 残る担当の利用者 | `staff-leave-assignment-patient-{利用者の id}` |
| 7 | 残る担当の利用者 | `staff-retire-assignment-patient-{利用者の id}` |
| 8 | 戻る予定の日 | `staff-leave-return-date` |
| 10 | ダイアログの休職にする | `staff-leave-submit` |
| 2 | 退職のダイアログ | `staff-retire-dialog` |
| 6 | ダイアログの退職にする | `staff-retire-submit` |
| 9 | ダイアログの退職にする | `staff-retire-submit` |
| 5 | キャンセル | `staff-retire-cancel` |
| 5 | キャンセル | `staff-position-cancel` |
| 5 | キャンセル | `staff-policies-cancel` |
| 8 | キャンセル | `staff-retire-cancel` |
| 8 | キャンセル | `staff-policies-cancel` |
| 9 | キャンセル | `staff-leave-cancel` |
| 10 | キャンセル | `staff-detail-edit-cancel` |
| 5 | 読み込み中の表示 | `staff-detail-loading` |
| 5 | 読み込みの失敗の文 | `staff-detail-error` |
| 6 | 読み直す | `staff-detail-retry` |
| 11 | 権限の読み込みの失敗の文 | `staff-detail-policies-error` |
| 12 | 権限を読み直す | `staff-detail-policies-retry` |
| 12 | 部署とチームの読み込みの失敗の文 | `staff-detail-save-error` |
| 4 | 役職の読み込みの失敗の文 | `staff-position-error` |
| 14 | 最新の情報の読み込みの失敗の文 | `refetch-error` |
| 15 | 最新の情報を読み直す | `refetch-retry` |

- 番号は、状態ごとの構成要素の表の番号である。同じ要素が状態ごとに違う番号を持つときは、番号ごとに行を分ける。
- ダイアログのキャンセルと確定のボタンと本体の testid は、packages/ui の `InputDialog` と `ConfirmDialog` が接頭辞から付ける。
  - 接頭辞は、`staff-detail-edit`、`staff-position`、`staff-policies`、`staff-leave`、`staff-retire` である。
  - 保存のボタンだけは、`staff-detail-save` を渡して付ける。
- 対象を足すと対象の候補の testid は、packages/ui の `ChipPicker` が接頭辞の `staff-policies-target` から付ける。
- 残る予定と担当の一覧の testid は、`StaffAssignmentList` が `staff-leave`、`staff-retire`、`staff-non-visiting` の接頭辞から付ける。
- 構成要素の表に載せない入れ物と行の testid は、この表に載せない。
  - `staff-detail-tab-{…}`、`staff-detail-policies`、`staff-policy-row-{…}`、`staff-detail-profile-form`、`staff-detail-visits`
  - `staff-policies-options`、`staff-policies-group-other`、`staff-policies-target-{…}`
- モックの `staff-detail-phone`、`staff-detail-menu-close`、`staff-policies-target-options-close` は、実装に無い。

## 状態と失敗の要因

| 状態 | 出す文 | 要因 |
| --- | --- | --- |
| 読み込みの失敗 | 「職員が見つかりません。職員の一覧から開き直してください。」 | `getUser` が 404 |
| 読み込みの失敗 | 「職員を読み込めませんでした。時間をおいて、読み直してください。」 | `getUser` が 404 のほかの失敗、API に届かない |
| 最新の情報の読み込みの失敗 | 「最新の情報を読み込めませんでした。」 | 読み終えた後に読み直して、`getUser` が失敗、API に届かない。403 と 404 も含む |
| プロフィールの編集 | 「退職した職員は変えられません。」 | `updateUser` が 409 の `conflict` |
| プロフィールの編集 | 「部署、チーム、役職のどれかが見つかりません。開き直してから、選び直してください。」 | `updateUser` が 400 |
| プロフィールの編集 | 「この操作をする権限がありません。」 | `updateUser` が 403 |
| プロフィールの編集 | 「保存できませんでした。時間をおいて、もう一度保存してください。」 | `updateUser` が 400、403、409 のほかの失敗、API に届かない |
| 訪問しない職員への変更を拒む | 残る予定と担当の一覧 | `updateUser` が 409 の `staff_has_assignments` |
| 役職を変える | 「職員の管理の権限を持つ最後の有効な職員は、その権限を持たない役職に変えられません。」 | `changeUserPosition` が 409 |
| 役職を変える | 「この操作をする権限がありません。」 | `changeUserPosition` が 403 |
| 役職を変える | 「役職を変えられませんでした。時間をおいて、もう一度変えてください。」 | `changeUserPosition` が 403、409 のほかの失敗、API に届かない |
| 権限の保存の一部の失敗 | 「職員の管理の権限を持つ最後の有効な職員から、その権限は外せません。」 | `removeUserPolicy` か `addUserPolicy` が 409 |
| 権限の保存の一部の失敗 | 「対象の職員かチームが見つかりません。選び直してください。」 | `addUserPolicy` か `removeUserPolicy` が 400 |
| 権限の保存の一部の失敗 | 「この操作をする権限がありません。」 | `addUserPolicy` か `removeUserPolicy` が 403 |
| 権限の保存の一部の失敗 | 「時間をおいて、もう一度保存してください。」 | 2 つ目からの変更で、400、403、409 のほかの失敗、API に届かない |
| 権限を変える | 「権限を変えられませんでした。時間をおいて、もう一度保存してください。」 | 最初の変更で API に届かない |
| 休職の確認 | 「自分と、職員の管理の権限を持つ最後の有効な職員は、休職にできません。」 | `startUserLeave` が 409 |
| 休職の確認 | 「この操作をする権限がありません。」 | `startUserLeave` が 403 |
| 休職の確認 | 「休職にできませんでした。時間をおいて、もう一度休職にしてください。」 | `startUserLeave` が 403、409 のほかの失敗、API に届かない |
| 権限の読み込みの失敗 | 「権限を読み込めませんでした。時間をおいて、読み直してください。」 | `listPolicies` か `listPositions` が失敗、API に届かない |
| 部署とチームの読み込みの失敗 | 「部署とチームを読み込めませんでした。閉じてから、開き直してください。」 | `listDepartments` か `listTeams` が失敗、API に届かない |
| 役職の読み込みの失敗 | 「役職を読み込めませんでした。閉じてから、開き直してください。」 | `listPositions` が失敗、API に届かない |
| 休職と退職の確認 | 「残る予定と担当の利用者を読み込めませんでした。閉じてから、開き直してください。」 | `getUserRemainingAssignments` が失敗、API に届かない |
| 復職の失敗 | 「退職した職員は変えられません。」 | `reinstateUser` が 409 |
| 復職の失敗 | 「この操作をする権限がありません。」 | `reinstateUser` が 403 |
| 復職の失敗 | 「復職にできませんでした。時間をおいて、もう一度復職にしてください。」 | `reinstateUser` が 403、409 のほかの失敗、API に届かない |
| 退職を拒む | 残る予定と担当の一覧 | `retireUser` が 409 の `staff_has_assignments` |
| 退職の確認 | 「自分と、職員の管理の権限を持つ最後の有効な職員は、退職にできません。」 | `retireUser` が 409 の `conflict` |
| 退職の確認 | 「この操作をする権限がありません。」 | `retireUser` が 403 |
| 退職の確認 | 「退職にできませんでした。時間をおいて、もう一度退職にしてください。」 | `retireUser` が 403、409 のほかの失敗、API に届かない |

- 文を選ぶ処理は `apps/web/src/features/staff/lib/errorMessage.ts` にある。
  - 権限の保存の理由は `policyChangeErrorReason` が、最初の変更で API に届かないかは `apps/web/src/features/staff/queries.ts` の `useSavePolicies` が決める。
- `staff_has_assignments` の 409 は、`apps/web/src/api` が文ではなく残る一覧の結果（`StaffUpdateResult`、`StaffRetireResult`）に変える。

## 操作

全ての書き込みの操作と `getUserRemainingAssignments` は、事業所の確認の後に、ログインした職員が職員の管理の権限（`staff.manage`）を持つかを確認し、持たなければ 403（`forbidden`）を返す。

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getUser` | `GET /v1/users/{user_id}` | なし | 200。`StaffDetail` | 404 `not_found` |
| `updateUser` | `PUT /v1/users/{user_id}` | `username`、`phone_number`、`department_id`、`team_id`、`visits` | 200。`StaffDetail` | 400 `invalid_input`: 入力が誤っているか、ほかの事業所の部署かチーム。409 `conflict`: 退職した職員。409 `staff_has_assignments`: 訪問しない職員に変えようとし、予定か担当の利用者が残る。`assignments` に一覧がある |
| `changeUserPosition` | `PUT /v1/users/{user_id}/position` | `position_id` | 200。`StaffDetail` | 409 `conflict`: 職員の管理の権限を持つ最後の有効な職員を、その権限を持たない役職に変えようとした |
| `addUserPolicy` | `POST /v1/users/{user_id}/policies` | `policy_id`、`target_user_ids`、`target_team_ids` | 201。`StaffDetail` | 400 `invalid_input`: 対象の指定が権限に合わない。409 `conflict`: 同じ権限を持っている |
| `removeUserPolicy` | `DELETE /v1/users/{user_id}/policies/{user_policy_id}` | なし | 200。`StaffDetail` | 409 `conflict`: 職員の管理の権限を持つ最後の有効な職員から、その権限を外そうとした |
| `getUserRemainingAssignments` | `GET /v1/users/{user_id}/remaining_assignments` | なし | 200。`StaffAssignments` | 404 `not_found` |
| `startUserLeave` | `POST /v1/users/{user_id}/leave` | `return_date` | 200。`StaffStatusChange` | 409 `conflict`: 自分か、職員の管理の権限を持つ最後の有効な職員か、退職した職員 |
| `reinstateUser` | `POST /v1/users/{user_id}/reinstate` | なし | 200。`StaffDetail` | 409 `conflict`: 退職した職員 |
| `retireUser` | `POST /v1/users/{user_id}/retire` | なし | 200。`StaffStatusChange` | 409 `staff_has_assignments`: 予定か担当の利用者が残る。`assignments` に一覧がある。409 `conflict`: 自分か、職員の管理の権限を持つ最後の有効な職員 |
| `listPositions` | `GET /v1/facilities/{facility_id}/positions` | なし | 200。`Position` の配列 | なし |
| `getPosition` | `GET /v1/positions/{position_id}` | なし | 200。`Position` | 404 `not_found` |
| `listPolicies` | `GET /v1/policies` | なし | 200。`Policy` の配列 | なし |
| `listDepartments`、`listTeams`、`listUsers` | [職員の登録の API との対応](../staff-new_職員の登録/api.md) と同じ | | | |

- `getUserRemainingAssignments` は、休職と退職の確認のダイアログを開いたときに呼ぶ。
  - レスポンスは、`startUserLeave` と `retireUser` が返す `StaffAssignments` と同じ形で、事業所の現地の日付で今日以降のものを返す。
- `startUserLeave` も、休職にした後に `StaffStatusChange.assignments` を返す。
  - 画面は、ダイアログを開いたときに読んだ一覧を出し、この値は使わない。
- `startUserLeave` は、休職の職員に送り直すと、戻る予定の日だけを書き換える。
  - 画面は休職の職員に休職にするを出さないので、この使い方をしない。
- `updateUser` は、チームを変えると、チームを対象にする権限のうち古いチームを指す対象を新しいチームに移す。
  - 画面は、返った `StaffDetail.policies` で権限の一覧を出し直す。
- `updateUser` は、訪問する職員を訪問しない職員に変えるときだけ、退職と同じ範囲で今日以降の予定と担当の利用者を数え、残れば書かずに 409 を返す。
  - 訪問しない職員を訪問する職員に戻すときは数えない。
  - ADR-0006: [訪問するかを職員に持ち、訪問しない職員を予定と担当から外す](../../adr/0006-non-visiting-staff.md)
