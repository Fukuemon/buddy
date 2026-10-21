# 繰り返しの予定

## Description

繰り返しの規則と予定、回にしない日。繰り返しの 1 回を置き換えた予定は schedules に入る

## Tables

| Name                                                              | Columns | Comment                                                                | Type       |
| ----------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- | ---------- |
| [facilities](facilities.md)                                       | 5       | 訪問看護の事業所                                                       | BASE TABLE |
| [recurring_rules](recurring_rules.md)                             | 8       | 繰り返しの規則                                                         | BASE TABLE |
| [recurring_schedule_details](recurring_schedule_details.md)       | 29      | 一覧の読み出しに使う、繰り返しの予定と訪問の情報と名前を結合したビュー | VIEW       |
| [recurring_schedule_exclusions](recurring_schedule_exclusions.md) | 2       | 繰り返しの予定のうち、回にしない日                                     | BASE TABLE |
| [recurring_schedules](recurring_schedules.md)                     | 14      | 繰り返しの予定                                                         | BASE TABLE |
| [schedule_types](schedule_types.md)                               | 4       | 予定の種類（通常、訪問）。マイグレーションで入れる                     | BASE TABLE |
| [schedules](schedules.md)                                         | 14      | 予定                                                                   | BASE TABLE |
| [users](users.md)                                                 | 11      | 職員                                                                   | BASE TABLE |
| [visit_infos](visit_infos.md)                                     | 7       | 訪問の情報                                                             | BASE TABLE |

## Relations

```mermaid
erDiagram

"recurring_schedule_exclusions" }o--|| "recurring_schedules" : "FOREIGN KEY (recurring_schedule_id) REFERENCES recurring_schedules (id)"
"recurring_schedules" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"recurring_schedules" }o--|| "recurring_rules" : "FOREIGN KEY (recurring_rule_id) REFERENCES recurring_rules (id)"
"recurring_schedules" }o--|| "users" : "FOREIGN KEY (staff_id) REFERENCES users (id)"
"recurring_schedules" }o--|| "schedule_types" : "FOREIGN KEY (schedule_type_id) REFERENCES schedule_types (id)"
"recurring_schedules" }o--o| "visit_infos" : "FOREIGN KEY (visit_info_id) REFERENCES visit_infos (id)"
"schedules" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"schedules" }o--o| "recurring_schedules" : "FOREIGN KEY (recurring_schedule_id) REFERENCES recurring_schedules (id)"
"schedules" }o--|| "users" : "FOREIGN KEY (staff_id) REFERENCES users (id)"
"schedules" }o--|| "schedule_types" : "FOREIGN KEY (schedule_type_id) REFERENCES schedule_types (id)"
"schedules" }o--o| "visit_infos" : "FOREIGN KEY (visit_info_id) REFERENCES visit_infos (id)"
"users" }o--|| "facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities (id)"
"visit_infos" }o--|| "users" : "FOREIGN KEY (assigned_staff_id) REFERENCES users (id)"
"visit_infos" }o--o| "users" : "FOREIGN KEY (companion_id) REFERENCES users (id)"

"facilities" {
  char_26_ id
  varchar_255_ name
  varchar_255_ org_id
  datetime created_at
  datetime updated_at
}
"recurring_rules" {
  char_26_ id
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
  char_26_ recurring_schedule_id
  date date
}
"recurring_schedules" {
  char_26_ id
  char_26_ facility_id
  char_26_ staff_id
  char_26_ schedule_type_id
  char_26_ recurring_rule_id
  date date
  time start_time
  time end_time
  char_26_ visit_info_id
  varchar_255_ title
  text description
  tinyint_1_ is_over_time_work
  datetime created_at
  datetime updated_at
}
"schedule_types" {
  char_26_ id
  varchar_255_ name
  datetime created_at
  datetime updated_at
}
"schedules" {
  char_26_ id
  char_26_ facility_id
  char_26_ staff_id
  char_26_ schedule_type_id
  date date
  time start_time
  time end_time
  char_26_ recurring_schedule_id
  char_26_ visit_info_id
  varchar_255_ title
  text description
  tinyint_1_ is_over_time_work
  datetime created_at
  datetime updated_at
}
"users" {
  char_26_ id
  varchar_255_ sub
  varchar_128_ username
  varchar_320_ email
  varchar_16_ phone_number
  char_26_ facility_id
  char_26_ department_id
  char_26_ team_id
  char_26_ position_id
  datetime created_at
  datetime updated_at
}
"visit_infos" {
  char_26_ id
  char_26_ patient_id
  char_26_ assigned_staff_id
  char_26_ companion_id
  char_26_ service_code_id
  datetime created_at
  datetime updated_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
