# patient-list API との対応

[利用者の一覧](index.md) の項目と、web の型と OpenAPI の項目の対応。  
画面を作る人、API を変える人、仕様と実装を照合する人が読む。

## 値の対応

| 要素名 | 表示する値 | web の型の項目 | OpenAPI の項目 |
| --- | --- | --- | --- |
| ナビゲーション | 「取り込み」「要確認」「連携」と、見出し「職員」と「利用者」のまとまりを出すか | `Viewer.policyCodes` に `staff.manage` があるか（`hasPermission`） | `getMe` の `policies[].code` に `staff.manage` があるか |
| アカウント | 職員の名前 | `Viewer.staffName` | `getMe` の `username` |
| 利用者の一覧 | 利用者の並び | `PatientRecord[]`（`patients.listRecords` の戻り値）を、画面で名前の順に並べ直す | `listPatients`（`include_ended=true`、`sort_field=name`、`sort_order=asc`） |
| 利用者の一覧 | サービス | `PatientRecord.service_code` | `Patient.service_code` |
| 利用者の一覧 | 希望の時間帯、希望する担当の性別 | `PatientRecord.preferred_time`、`PatientRecord.preferred_gender` | `Patient.preferred_time`、`Patient.preferred_gender` |
| 利用者の一覧、担当の職員の絞り込み | 担当の職員の名前 | `PatientRecord.assigned_staff_name` | `Patient.assigned_staff_name` |
| 利用者の一覧 | 担当の職員が休職か退職か | `StaffRecord.status`（`staff.listRecords` の戻り値） | `Patient.assigned_staff_id` を `listUsers` の `Staff.id` に引き当てた `Staff.status` |
| 名前の検索 | 名前 | `PatientRecord.name` | `Patient.name` |
| 利用者の行 | 詳細の URL の利用者 | `PatientRecord.id` | `Patient.id` |
| 状態の絞り込み | 利用の終了か | `PatientRecord.ended_at` が `null` でないか | `Patient.ended_at` が `null` でないか |
| 利用の終了にした日 | 日付 | `PatientRecord.ended_at` | `Patient.ended_at` の日付（事業所の現地の日付） |
| 読み込みの失敗の文 | 読めなかったか | `ApiError` | `listPatients`、`listUsers` のエラー |

## 条件の対応

なし。

- 「読み込みの失敗」の状態は、利用者の一覧（`listPatients`）か職員の一覧（`listUsers`）のどちらかを読めなかったときになる（`PatientListContainer.tsx` の `isError`）。

## 要素の testid

| 番号 | 要素名 | testid |
| --- | --- | --- |
| 1 | ナビゲーション | `site-nav` |
| 2 | アカウント | `viewer-menu-open` |
| 3 | ログアウト | `viewer-logout` |
| 5 | ヘルプ | `patient-list-help` |
| 6 | 利用者を登録 | `patient-list-new` |
| 7 | 名前の検索 | `patient-list-search` |
| 7 | 読み込み中の表示 | `patient-list-loading` |
| 7 | 読み込みの失敗の文 | `patient-list-error` |
| 8 | 担当の職員の絞り込み | `patient-list-filter-staff` |
| 8 | 読み直す | `patient-list-retry` |
| 9 | 状態の絞り込み | `patient-list-filter-status` |
| 10 | 人数 | `patient-list-count` |
| 11 | 利用者の一覧 | `patient-list-table` |
| 11 | 利用者が無いことの文 | `patient-list-empty` |
| 12 | 利用者の行 | `patient-list-row-{利用者の id}` |
| 12 | 絞り込みを外す | `patient-list-filter-clear` |
| 13 | 利用の終了にした日 | `patient-list-ended-on-{利用者の id}` |
| 6 | 予定のカレンダーへ | `page-forbidden-back` |
| 13 | メニュー | `site-nav-toggle` |
| 14 | メニュー | `site-nav-toggle` |
| 8 | メニュー | `site-nav-toggle` |
| 9 | メニュー | `site-nav-toggle` |
| 7 | メニュー | `site-nav-toggle` |

- ヘルプの説明の `patient-list-help-text` と、権限が無いことの入れ物の `page-forbidden` は、構成要素の表に載せないので、この表に載せない。

## 操作

| operationId | メソッドとパス | リクエスト | 成功のレスポンス | エラー |
| --- | --- | --- | --- | --- |
| `getMe` | `GET /v1/me` | なし | 200。`StaffDetail` | なし |
| `listPatients` | `GET /v1/facilities/{facility_id}/patients` | `include_ended`、`sort_field`、`sort_order` | 200。`Patient` の配列。`include_ended=true` なら利用の終了の利用者を含む | 403 `forbidden`: ほかの事業所 |
| `listUsers` | `GET /v1/facilities/{facility_id}/users` | なし | 200。`Staff` の配列。休職と退職の職員を含む | 403 `forbidden`: ほかの事業所 |

- `listPatients` は、職員の管理の権限を持たない職員も呼べる。
  - この画面を職員の管理の権限を持つ職員に限るのは、画面の判定である。
- 名前の検索と絞り込みは画面で行うので、`listPatients` の `name` と `assigned_staff` は使わない。
  - 画面に無い、希望の時間帯と希望する担当の性別の絞り込みの `preferred_time` と `preferred_gender` も使わない。
- web の `patients.listRecords` は、利用の終了の利用者を含めて、サービス、希望、担当の職員とともに返す。
  - 予定の画面の利用者の候補が使う `patients.list` は、ID と名前と利用の終了かだけを返す。
