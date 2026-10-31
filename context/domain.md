---
type: context
title: 業務の知識
description: 用語の定義と、概念ごとの文書の一覧。状態と遷移、不変条件は概念ごとに domain/ に置く
status: stable
---

# 業務の知識

## Glossary

### 事業所と職員

| 用語 | 意味 | コードの識別子 |
| --- | --- | --- |
| 事業所 | 訪問看護の事業所。データを分ける単位 | Go `organization.Facility`、テーブル `facilities`、API `Facility` |
| 組織 | ID ブローカーが持つ組織。事業所と 1 対 1 に対応し、access token に組織の ID が入る。組織の ID（`org_id`）は、同じ事業所を認証の側から指す。予定の API の Go のパッケージ `organization` は、名前が似ているが組織とは別のもので、事業所と、その中の部署、チーム、役職、権限を持つ | `facilities.org_id`、`principal.Identity.OrgID`、ブローカーの `staff.org_id`、クレームの名前は `OIDC_ORG_CLAIM` |
| 部署、チーム | 事業所の中の職員の所属 | `organization.Department`、`organization.Team`、テーブル `departments`、`teams` |
| 役職 | 職員の役割。職員に付けるデフォルトの権限を持つ | `organization.Position`、テーブル `positions`、`position_policies` |
| マネージャー、チームリーダー、メンバー | PRD が使う役職の 3 つの呼び方。デフォルトの権限が違う | テーブル `positions` のレコード。名前は事業所ごとに決める |
| 権限 | 職員ができる操作と、その対象 | `organization.Policy`、`staff.Grant`、テーブル `policies`、`user_policies`、`user_policy_targets` |
| 職員 | 事業所で働き、buddy にログインする人 | Go `staff.Staff`、テーブル `users`、API `Staff`、パス `/users`、web `Staff`、`Viewer` |
| 利用者 | 事業所が訪問する相手 | Go `patient.Patient`、テーブル `patients`、API `Patient` |
| 担当の職員 | 利用者を主に担当する職員 | `Patient.AssignedStaffID`、`patients.assigned_staff_id` |
| 利用の終了 | サービスを終えた利用者の状態。利用の再開で利用中に戻せる | `Patient.EndedAt`、`patients.ended_at`、API `Patient.ended_at`、`end_service`、`resume_service`、web `Patient.ended` |

### 予定

| 用語 | 意味 | コードの識別子 |
| --- | --- | --- |
| 予定 | 職員の 1 回の予定。種類は通常と訪問 | Go `schedule.Schedule`、テーブル `schedules`、API `Schedule`、web `ScheduleKind`（`normal`、`visit`） |
| 繰り返しの予定 | 規則に従って繰り返す予定 | Go `schedule.RecurringSchedule`、テーブル `recurring_schedules` |
| 回の置き換え | 繰り返しの 1 回を、単発の予定に置き換えること | `ChangeOccurrence`、パス `.../occurrences` |
| キャンセル | 予定の取り消し。理由を持つ | `schedule.Cancel`、テーブル `schedule_cancels` |
| 時間外の勤務 | 17 時以降に始まる予定 | `Slot.IsOverTimeWork`、カラム `is_over_time_work`（開始の時刻から DB が生成する） |
| 訪問の情報 | 訪問の予定に付く、利用者、主訪問者、同行者、サービスコード、訪問の区分 | Go `visit.Info`、テーブル `visit_infos`、API `VisitInfo`、web `VisitDetail` |
| 主訪問者 | 訪問する職員。業務の役割で、役職を問わない。予定の管理では訪問の情報の担当の職員、照合では実績の CSV の「主訪問者」のカラム | `Info.AssignedStaffID`、照合の `Key.Staff` |
| 同行者 | 訪問に同行する職員 | `Info.CompanionID` |
| サービスコード | レセプトのサービスの種類と、提供時間の範囲（分） | Go `visit.ServiceCode`、テーブル `service_codes`、web `SERVICE_CODES` |
| 訪問の区分 | 夜勤、緊急、入院 | Go `visit.Category`、テーブル `visit_categories`、web `ScheduleCategory` |
| 提供時間 | 訪問でサービスを提供した時間（分） | 照合の `Record.Duration` |

### 照合

| 用語 | 意味 | コードの識別子 |
| --- | --- | --- |
| 照合の担当 | 月末に予定と実績を比べ、食い違いを直す職員。役職とは別の、業務の役割 | なし（照合の画面は全ての職員が開ける） |
| 照合 | 予定と実績を対にし、不整合、予定のみ、実績のみ、整合の 4 つの区分に分けること | 照合の API `check.Run`、API `createCheck`、`Report` |
| 実績 | 電子カルテ（iBow）から書き出した訪問の記録の CSV の行 | `record.SourceVisit`、`csvio.VisitColumns` |
| 予定（照合の） | 予定の CSV の行か、Google カレンダーの予定 | `record.SourceSchedule`、`check.ScheduleSource` |
| 対のキー | 訪問日、利用者名、主訪問者 | `record.Key` |
| 区分 | 照合の結果の分類。不整合、予定のみ、実績のみ、整合 | `judge.Category`（`mismatch`、`schedule_only`、`visit_only`、`match`）、web `RECEIPT_CATEGORIES` |
| サービス内容 | 照合で比べるサービスの表記（`訪看I２` など） | `Record.Service`、`servicerule.Lookup` |
| 許容範囲 | サービス内容ごとに許す分の範囲。両端を含む | `servicerule.Range` |
| 加算 | 実績の加算①から加算⑤ | `Record.Additions` |
| 注意の印 | 「 ※」。整合の行で値は違うが両方が許容範囲に入る値と、不整合の行で規則に合わない加算に付ける | `Checks.DurationEqual`、`EndEqual`、`Additions` |
| 対象の月 | Google カレンダーから予定を取る月 | `source.Request.Month`、API `month` |

### Google カレンダーとの連携

和語のまま書く業務の機能の名前。pull request のマージ、HTTP のリクエストのような技術用語とは書き分ける。

| 用語 | 意味 | コードの識別子 |
| --- | --- | --- |
| 結び付け | 職員に Google カレンダーを対応させること。画面の名前は「カレンダーの連携」 | テーブル `external_calendars`、API `createExternalCalendar`、`removeExternalCalendar` |
| 予定の取り込み | 結び付けたカレンダーの予定を、期間を選んで buddy の予定にすること。確定の前にプレビューする | テーブル `import_runs`、`external_event_links`、API `createCalendarImportPreview`、`createCalendarImport` |
| 予定の書き出し | buddy で作り、変え、キャンセルした予定を、結び付けたカレンダーに書くこと | テーブル `calendar_exports`、API `listCalendarExportIssues`、`createCalendarExportRetry` |
| 同期 | 職員が Google カレンダーで変えた予定を、増分で読んで buddy の予定に当てること。buddy と Google の両方で変わった予定は当てない | テーブル `calendar_sync_states`、Go `calendar.Syncer` |
| 確認が必要な予定（取り込みの） | 取り込みのプレビューで、タイトルの利用者を 1 人に決められず、取り込む前に取り込み方を選ぶ予定 | API `ImportPreview.needs_review`、`ImportReviewItem` |
| 確認が必要な予定（書き出しの） | 書き出しか同期で、buddy に当てず、Google にも書かずに止めた予定。両方で変わった、Google で消された、Google の変更を読み替えられない、書けなかった予定が当たる。画面の名前は「確認が必要な予定」 | `calendar_exports` の `conflict` と `failed`、API `listCalendarExportIssues` |
| buddy の内容で書き直す | 確認が必要な予定（書き出しの）を、buddy の内容で Google カレンダーに書き直すこと | API `createCalendarExportRetry` |
| Google の内容に合わせる | 確認が必要な単発の予定（書き出しの）を、Google カレンダーの今の内容にそろえること。Google で消された予定は buddy でキャンセルする | API `createCalendarExportAcceptance` |
| 事業所のサービスアカウント | 事業所の職員がカレンダーを共有する相手の Google のサービスアカウント。予定の API と照合の API が同じアカウントで読み書きする | API `getCalendarServiceAccount`、`GOOGLE_CALENDAR_SERVICE_ACCOUNTS_FILE` |

### 呼び方の対応

- 予定の管理の利用者は、照合では `client`（カラムは「利用者名」）と呼ぶ。
- サービスコードは、予定の管理では半角の数字（`訪看I2`）、照合では正規化の後の全角の数字（`訪看I２`）で持つ。
- 文書の表記は、ここの「用語」の列にそろえる。揺れやすい表記は `prh.yml` の規則が止める。

## Concepts

- [予定](domain/schedule.md) — 単発の予定の種類、キャンセル、変更
- [繰り返しの予定](domain/recurring-schedule.md) — 規則、回、除外、回の置き換え
- [訪問の情報](domain/visit.md) — 訪問の予定に付く利用者と職員とサービス
- [利用者](domain/patient.md) — 利用者の利用の終了と再開。終了の利用者を予定の候補と職員の退職の確認から外す規則
- [職員とログイン](domain/staff-login.md) — 職員の登録、休職、復職、退職の規則。ブローカーが上流の IdP のアカウントを職員に結び付ける規則と、予定の API が `sub` で職員を引く規則
- [事業所の分離](domain/facility.md) — 事業所をまたぐ参照の拒否
- [権限](domain/permission.md) — 役職のデフォルトの権限と職員ごとの権限
- [照合](domain/receipt-check.md) — 予定と実績の対の作り方と区分の決め方
