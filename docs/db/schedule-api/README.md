# schedule-api

## Tables

| Name                                                              | Columns | Comment                                                                | Type       |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- | ---------- |
| [departments](departments.md)                                     | 5       | 事業所の部署                                                           | BASE TABLE |
| [facilities](facilities.md)                                       | 5       | 訪問看護の事業所                                                       | BASE TABLE |
| [patients](patients.md)                                           | 9       | 利用者                                                                 | BASE TABLE |
| [policies](policies.md)                                           | 6       | 権限。マイグレーションで入れ、API では作らない                         | BASE TABLE |
| [position_policies](position_policies.md)                         | 2       | 役職の既定の権限                                                       | BASE TABLE |
| [positions](positions.md)                                         | 5       | 事業所の役職。職員を登録するときに写す既定の権限を持つ                 | BASE TABLE |
| [recurring_rules](recurring_rules.md)                             | 8       | 繰り返しの規則                                                         | BASE TABLE |
| [recurring_schedule_details](recurring_schedule_details.md)       | 29      | 一覧の読み出しに使う、繰り返しの予定と訪問の情報と名前を結合したビュー | VIEW       |
| [recurring_schedule_exclusions](recurring_schedule_exclusions.md) | 2       | 繰り返しの予定のうち、回にしない日                                     | BASE TABLE |
| [recurring_schedules](recurring_schedules.md)                     | 14      | 繰り返しの予定                                                         | BASE TABLE |
| [schedule_cancels](schedule_cancels.md)                           | 5       | 予定の取り消し                                                         | BASE TABLE |
| [schedule_details](schedule_details.md)                           | 26      | 一覧の読み出しに使う、予定と訪問の情報と名前を結合したビュー           | VIEW       |
| [schedule_types](schedule_types.md)                               | 4       | 予定の種類（通常、訪問）。マイグレーションで入れる                     | BASE TABLE |
| [schedules](schedules.md)                                         | 14      | 予定                                                                   | BASE TABLE |
| [service_codes](service_codes.md)                                 | 6       | サービスコード。マイグレーションで入れる                               | BASE TABLE |
| [teams](teams.md)                                                 | 5       | 事業所のチーム                                                         | BASE TABLE |
| [user_policies](user_policies.md)                                 | 3       | 職員が持つ権限。職員と権限の組で一意                                   | BASE TABLE |
| [user_policy_targets](user_policy_targets.md)                     | 4       | 職員の権限の対象                                                       | BASE TABLE |
| [users](users.md)                                                 | 11      | 職員                                                                   | BASE TABLE |
| [visit_categories](visit_categories.md)                           | 4       | 訪問の区分（夜勤、緊急、入院）。マイグレーションで入れる               | BASE TABLE |
| [visit_info_details](visit_info_details.md)                       | 9       | 訪問の情報と名前を結合したビュー                                       | VIEW       |
| [visit_info_visit_categories](visit_info_visit_categories.md)     | 2       | 訪問に付けた区分。1 件の訪問に複数を付けられる                         | BASE TABLE |
| [visit_infos](visit_infos.md)                                     | 7       | 訪問の情報                                                             | BASE TABLE |

## Relations

```mermaid
erDiagram

"departments" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"patients" }o--|| "users" : "FOREIGN KEY (assigned_staff_id) REFERENCES users (id)"
"patients" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"patients" }o--|| "service_codes" : "FOREIGN KEY (service_code_id) REFERENCES service_codes (id)"
"position_policies" }o--|| "policies" : "FOREIGN KEY (policy_id) REFERENCES policies (id)"
"position_policies" }o--|| "positions" : "FOREIGN KEY (position_id) REFERENCES positions (id)"
"positions" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"recurring_schedule_exclusions" }o--|| "recurring_schedules" : "FOREIGN KEY (recurring_schedule_id) REFERENCES recurring_schedules (id)"
"recurring_schedules" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"recurring_schedules" }o--|| "recurring_rules" : "FOREIGN KEY (recurring_rule_id) REFERENCES recurring_rules (id)"
"recurring_schedules" }o--|| "users" : "FOREIGN KEY (staff_id) REFERENCES users (id)"
"recurring_schedules" }o--|| "schedule_types" : "FOREIGN KEY (schedule_type_id) REFERENCES schedule_types (id)"
"recurring_schedules" }o--o| "visit_infos" : "FOREIGN KEY (visit_info_id) REFERENCES visit_infos (id)"
"schedule_cancels" |o--|| "schedules" : "FOREIGN KEY (schedule_id) REFERENCES schedules (id)"
"schedules" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"schedules" }o--o| "recurring_schedules" : "FOREIGN KEY (recurring_schedule_id) REFERENCES recurring_schedules (id)"
"schedules" }o--|| "users" : "FOREIGN KEY (staff_id) REFERENCES users (id)"
"schedules" }o--|| "schedule_types" : "FOREIGN KEY (schedule_type_id) REFERENCES schedule_types (id)"
"schedules" }o--o| "visit_infos" : "FOREIGN KEY (visit_info_id) REFERENCES visit_infos (id)"
"teams" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"user_policies" }o--|| "policies" : "FOREIGN KEY (policy_id) REFERENCES policies (id)"
"user_policies" }o--|| "users" : "FOREIGN KEY (user_id) REFERENCES users (id)"
"user_policy_targets" }o--o| "teams" : "FOREIGN KEY (target_team_id) REFERENCES teams (id)"
"user_policy_targets" }o--o| "users" : "FOREIGN KEY (target_user_id) REFERENCES users (id)"
"user_policy_targets" }o--|| "user_policies" : "FOREIGN KEY (user_policy_id) REFERENCES user_policies (id)"
"users" }o--|| "departments" : "FOREIGN KEY (department_id) REFERENCES departments (id)"
"users" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"users" }o--|| "positions" : "FOREIGN KEY (position_id) REFERENCES positions (id)"
"users" }o--|| "teams" : "FOREIGN KEY (team_id) REFERENCES teams (id)"
"visit_info_visit_categories" }o--|| "visit_categories" : "FOREIGN KEY (visit_category_id) REFERENCES visit_categories (id)"
"visit_info_visit_categories" }o--|| "visit_infos" : "FOREIGN KEY (visit_info_id) REFERENCES visit_infos (id)"
"visit_infos" }o--|| "users" : "FOREIGN KEY (assigned_staff_id) REFERENCES users (id)"
"visit_infos" }o--o| "users" : "FOREIGN KEY (companion_id) REFERENCES users (id)"
"visit_infos" }o--|| "patients" : "FOREIGN KEY (patient_id) REFERENCES patients (id)"
"visit_infos" }o--|| "service_codes" : "FOREIGN KEY (service_code_id) REFERENCES service_codes (id)"

"departments" {
  char_26_ id PK
  char_26_ facility_id FK
  varchar_255_ name
  datetime created_at
  datetime updated_at
}
"facilities" {
  char_26_ id PK
  varchar_255_ name
  varchar_255_ org_id
  datetime created_at
  datetime updated_at
}
"patients" {
  char_26_ id PK
  char_26_ facility_id FK
  varchar_255_ name
  varchar_8_ preferred_time
  varchar_8_ preferred_gender
  char_26_ service_code_id FK
  char_26_ assigned_staff_id FK
  datetime created_at
  datetime updated_at
}
"policies" {
  char_26_ id PK
  varchar_64_ code
  varchar_255_ name
  tinyint_1_ needs_target
  datetime created_at
  datetime updated_at
}
"position_policies" {
  char_26_ position_id PK
  char_26_ policy_id PK
}
"positions" {
  char_26_ id PK
  char_26_ facility_id FK
  varchar_255_ name
  datetime created_at
  datetime updated_at
}
"recurring_rules" {
  char_26_ id PK
  varchar_16_ frequency
  tinyint day_of_week
  tinyint day_of_month
  tinyint week_of_month
  date end_date
  datetime created_at
  datetime updated_at
}
"recurring_schedule_details" {
  char_26_ id
  char_26_ facility_id
  char_26_ schedule_type_id
  varchar_255_ schedule_type_name
  date date
  time start_time
  time end_time
  tinyint_1_ is_over_time_work
  char_26_ staff_id
  varchar_128_ staff_name
  varchar_255_ title
  text description
  char_26_ recurring_rule_id
  varchar_16_ frequency
  tinyint day_of_week
  tinyint day_of_month
  tinyint week_of_month
  date end_date
  char_26_ visit_info_id
  char_26_ patient_id
  varchar_255_ patient_name
  char_26_ assigned_staff_id
  varchar_128_ assigned_staff_name
  char_26_ companion_id
  varchar_128_ companion_name
  char_26_ service_code_id
  varchar_255_ service_code
  datetime created_at
  datetime updated_at
}
"recurring_schedule_exclusions" {
  char_26_ recurring_schedule_id PK
  date date PK
}
"recurring_schedules" {
  char_26_ id PK
  char_26_ facility_id FK
  char_26_ staff_id FK
  char_26_ schedule_type_id FK
  char_26_ recurring_rule_id FK
  date date
  time start_time
  time end_time
  char_26_ visit_info_id FK
  varchar_255_ title
  text description
  tinyint_1_ is_over_time_work
  datetime created_at
  datetime updated_at
}
"schedule_cancels" {
  char_26_ id PK
  char_26_ schedule_id FK
  varchar_255_ reason
  datetime created_at
  datetime updated_at
}
"schedule_details" {
  char_26_ id
  char_26_ facility_id
  char_26_ schedule_type_id
  varchar_255_ schedule_type_name
  date date
  time start_time
  time end_time
  tinyint_1_ is_over_time_work
  char_26_ staff_id
  varchar_128_ staff_name
  varchar_255_ title
  text description
  char_26_ recurring_schedule_id
  char_26_ visit_info_id
  char_26_ patient_id
  varchar_255_ patient_name
  char_26_ assigned_staff_id
  varchar_128_ assigned_staff_name
  char_26_ companion_id
  varchar_128_ companion_name
  char_26_ service_code_id
  varchar_255_ service_code
  char_26_ cancel_id
  varchar_255_ cancel_reason
  datetime created_at
  datetime updated_at
}
"schedule_types" {
  char_26_ id PK
  varchar_255_ name
  datetime created_at
  datetime updated_at
}
"schedules" {
  char_26_ id PK
  char_26_ facility_id FK
  char_26_ staff_id FK
  char_26_ schedule_type_id FK
  date date
  time start_time
  time end_time
  char_26_ recurring_schedule_id FK
  char_26_ visit_info_id FK
  varchar_255_ title
  text description
  tinyint_1_ is_over_time_work
  datetime created_at
  datetime updated_at
}
"service_codes" {
  char_26_ id PK
  varchar_255_ code
  int service_time_range_start
  int service_time_range_end
  datetime created_at
  datetime updated_at
}
"teams" {
  char_26_ id PK
  char_26_ facility_id FK
  varchar_255_ name
  datetime created_at
  datetime updated_at
}
"user_policies" {
  char_26_ id PK
  char_26_ user_id FK
  char_26_ policy_id FK
}
"user_policy_targets" {
  char_26_ id PK
  char_26_ user_policy_id FK
  char_26_ target_user_id FK
  char_26_ target_team_id FK
}
"users" {
  char_26_ id PK
  varchar_255_ sub
  varchar_128_ username
  varchar_320_ email
  varchar_16_ phone_number
  char_26_ facility_id FK
  char_26_ department_id FK
  char_26_ team_id FK
  char_26_ position_id FK
  datetime created_at
  datetime updated_at
}
"visit_categories" {
  char_26_ id PK
  varchar_255_ name
  datetime created_at
  datetime updated_at
}
"visit_info_details" {
  char_26_ id
  char_26_ patient_id
  varchar_255_ patient_name
  char_26_ assigned_staff_id
  varchar_128_ assigned_staff_name
  char_26_ companion_id
  varchar_128_ companion_name
  char_26_ service_code_id
  varchar_255_ service_code
}
"visit_info_visit_categories" {
  char_26_ visit_info_id PK
  char_26_ visit_category_id PK
}
"visit_infos" {
  char_26_ id PK
  char_26_ patient_id FK
  char_26_ assigned_staff_id FK
  char_26_ companion_id FK
  char_26_ service_code_id FK
  datetime created_at
  datetime updated_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
