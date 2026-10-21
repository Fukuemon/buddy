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
| 事業所 | 訪問看護の事業所。データを分ける単位 | Go `organization.Facility`、表 `facilities`、API `Facility` |
| 組織 | 認証のブローカーが持つ組織。事業所と 1 対 1 に対応し、access token に組織の ID が入る | `facilities.org_id`、`auth.Identity.OrgID`、クレームの名前は `OIDC_ORG_CLAIM` |
| 部署、チーム | 事業所の中の職員の所属 | `organization.Department`、`organization.Team`、表 `departments`、`teams` |
| 役職 | 職員の役割。職員に付ける権限の既定を持つ | `organization.Position`、表 `positions`、`position_policies` |
| マネージャー、チームリーダー、メンバー | PRD が使う役職の 3 つの呼び方。権限の既定が違う | 表 `positions` の行。名前は事業所ごとに決める |
| 権限 | 職員ができる操作と、その対象 | `organization.Policy`、`staff.Grant`、表 `policies`、`user_policies`、`user_policy_targets` |
| 職員 | 事業所で働き、buddy にログインする人 | Go `staff.Staff`、表 `users`、API `Staff`、パス `/users`、web `Staff`、`Viewer` |
| 利用者 | 事業所が訪問する相手 | Go `patient.Patient`、表 `patients`、API `Patient` |
| 担当の職員 | 利用者を主に担当する職員 | `Patient.AssignedStaffID`、`patients.assigned_staff_id` |

### 予定

| 用語 | 意味 | コードの識別子 |
| --- | --- | --- |
| 予定 | 職員の 1 回の予定。種類は通常と訪問 | Go `schedule.Schedule`、表 `schedules`、API `Schedule`、web `ScheduleKind`（`normal`、`visit`） |
| 繰り返しの予定 | 規則に従って繰り返す予定 | Go `schedule.RecurringSchedule`、表 `recurring_schedules`、`recurring_rules` |
| 回の置き換え | 繰り返しの 1 回を、単発の予定に置き換えること | `ChangeOccurrence`、パス `.../occurrences` |
| キャンセル | 予定の取り消し。理由を持つ | `schedule.Cancel`、表 `schedule_cancels` |
| 時間外の勤務 | 17 時以降に始まる予定 | `Slot.IsOverTimeWork`、列 `is_over_time_work` |
| 訪問の情報 | 訪問の予定に付く、利用者、主訪問者、同行者、サービスコード、訪問の区分 | Go `visit.Info`、表 `visit_infos`、API `VisitInfo`、web `VisitDetail` |
| 主訪問者 | 訪問する職員。予定の管理では訪問の情報の担当の職員、照合では実績の CSV の「主訪問者」の列 | `Info.AssignedStaffID`、照合の `Key.Staff` |
| 同行者 | 訪問に同行する職員 | `Info.CompanionID` |
| サービスコード | レセプトのサービスの種類と、提供時間の範囲（分） | Go `visit.ServiceCode`、表 `service_codes`、web `SERVICE_CODES` |
| 訪問の区分 | 夜勤、緊急、入院 | Go `visit.Category`、表 `visit_categories`、web `ScheduleCategory` |
| 提供時間 | 訪問でサービスを提供した時間（分） | 照合の `Record.Duration` |

### 照合

| 用語 | 意味 | コードの識別子 |
| --- | --- | --- |
| 照合の担当 | 月末に予定と実績を比べ、食い違いを直す職員。役職とは別の、業務の役割 | なし（照合の画面は全ての職員が開ける） |
| 照合 | 予定と実績を対にし、不整合、予定のみ、実績のみ、整合の 4 つの区分に分けること | receipt-api `check.Run`、API `createCheck`、`Report` |
| 実績 | 電子カルテ（iBow）から書き出した訪問の記録の CSV の行 | `record.SourceVisit`、`csvio.VisitColumns` |
| 予定（照合の） | 予定の CSV の行か、Google カレンダーの予定 | `record.SourceSchedule`、`check.ScheduleSource` |
| 対のキー | 訪問日、利用者名、主訪問者 | `record.Key` |
| 区分 | 照合の結果の分類。不整合、予定のみ、実績のみ、整合 | `judge.Category`（`mismatch`、`schedule_only`、`visit_only`、`match`）、web `RECEIPT_CATEGORIES` |
| サービス内容 | 照合で比べるサービスの表記（`訪看I２` など） | `Record.Service`、`servicerule.Lookup` |
| 許容範囲 | サービス内容ごとに許す分の範囲。両端を含む | `servicerule.Range` |
| 加算 | 実績の加算①から加算⑤ | `Record.Additions` |
| 注意の印 | 「 ※」。整合の行で値は違うが両方が許容範囲に入る値と、不整合の行で規則に合わない加算に付ける | `Checks.DurationEqual`、`EndEqual`、`Additions` |
| 対象の月 | Google カレンダーから予定を取る月 | `source.Request.Month`、API `month` |

### 呼び方の対応

- 予定の管理の利用者は、照合では `client`（列は「利用者名」）と呼ぶ。
- 職員の表は `users`、Go は `staff` と呼ぶ。API のパスは `/users` である。
- サービスコードは、予定の管理では半角の数字（`訪看I2`）、照合では正規化の後の全角の数字（`訪看I２`）で持つ。
- 文書の表記は、ここの「用語」の列にそろえる。揺れやすい表記は `prh.yml` の規則が止める。

## Concepts

- [予定](domain/schedule.md) — 単発の予定の種類、キャンセル、変更
- [繰り返しの予定](domain/recurring-schedule.md) — 規則、回、除外、回の置き換え
- [訪問の情報](domain/visit.md) — 訪問の予定に付く利用者と職員とサービス
- [職員とログイン](domain/staff-login.md) — 初回のログインで `sub` を職員に結び付ける
- [事業所の分離](domain/facility.md) — 事業所をまたぐ参照の拒否
- [権限](domain/permission.md) — 役職の既定と職員ごとの権限
- [照合](domain/receipt-check.md) — 予定と実績の対の作り方と区分の決め方
