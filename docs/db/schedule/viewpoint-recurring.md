# 繰り返しの予定

## Description

繰り返しの予定と規則、回にしない日。繰り返しの 1 回を置き換えた予定は schedules に入る

## Tables

| Name                                                                            | Columns | Comment                                                                | Type       |
| ------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- | ---------- |
| [public.facilities](public.facilities.md)                                       | 6       | 訪問看護の事業所                                                       | BASE TABLE |
| [public.users](public.users.md)                                                 | 11      | 職員                                                                   | BASE TABLE |
| [public.visit_infos](public.visit_infos.md)                                     | 8       | 訪問の情報                                                             | BASE TABLE |
| [public.schedule_types](public.schedule_types.md)                               | 5       | 予定の種類（通常、訪問）。マイグレーションで入れる                     | BASE TABLE |
| [public.recurring_schedules](public.recurring_schedules.md)                     | 19      | 繰り返しの予定と、その規則                                             | BASE TABLE |
| [public.recurring_schedule_exclusions](public.recurring_schedule_exclusions.md) | 2       | 繰り返しの予定のうち、回にしない日                                     | BASE TABLE |
| [public.schedules](public.schedules.md)                                         | 16      | 予定                                                                   | BASE TABLE |
| [public.recurring_schedule_details](public.recurring_schedule_details.md)       | 30      | 一覧の読み出しに使う、繰り返しの予定と訪問の情報と名前を結合したビュー | VIEW       |

## Relations

```mermaid
erDiagram

"public.users" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.visit_infos" }o--|| "public.users" : "FOREIGN KEY (facility_id, assigned_staff_id) REFERENCES users(facility_id, id)"
"public.visit_infos" }o--|| "public.users" : "FOREIGN KEY (facility_id, companion_id) REFERENCES users(facility_id, id)"
"public.recurring_schedules" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.recurring_schedules" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id)"
"public.recurring_schedules" }o--|| "public.visit_infos" : "FOREIGN KEY (facility_id, visit_info_id) REFERENCES visit_infos(facility_id, id)"
"public.recurring_schedules" }o--|| "public.schedule_types" : "FOREIGN KEY (schedule_type_id) REFERENCES schedule_types(id)"
"public.recurring_schedule_exclusions" }o--|| "public.recurring_schedules" : "FOREIGN KEY (recurring_schedule_id) REFERENCES recurring_schedules(id) ON DELETE CASCADE"
"public.schedules" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.schedules" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id)"
"public.schedules" }o--|| "public.visit_infos" : "FOREIGN KEY (facility_id, visit_info_id) REFERENCES visit_infos(facility_id, id)"
"public.schedules" }o--|| "public.schedule_types" : "FOREIGN KEY (schedule_type_id) REFERENCES schedule_types(id)"
"public.schedules" }o--|| "public.recurring_schedules" : "FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules(facility_id, id)"

"public.facilities" {
  text id
  varchar_255_ name
  varchar_255_ org_id
  text time_zone
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.users" {
  text id
  text facility_id
  varchar_255_ sub
  varchar_128_ username
  varchar_320_ email
  varchar_16_ phone_number
  text department_id
  text team_id
  text position_id
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.visit_infos" {
  text id
  text facility_id
  text patient_id
  text assigned_staff_id
  text companion_id
  text service_code_id
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.schedule_types" {
  text id
  text code
  varchar_255_ name
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.recurring_schedules" {
  text id
  text facility_id
  text staff_id
  text schedule_type_id
  date date
  time_without_time_zone start_time
  time_without_time_zone end_time
  text visit_info_id
  varchar_255_ title
  text description
  boolean is_over_time_work
  text frequency
  smallint day_of_week
  smallint day_of_month
  smallint week_of_month
  date end_date
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  integer version
}
"public.recurring_schedule_exclusions" {
  text recurring_schedule_id
  date date
}
"public.schedules" {
  text id
  text facility_id
  text staff_id
  text schedule_type_id
  date date
  time_without_time_zone start_time
  time_without_time_zone end_time
  text recurring_schedule_id
  date original_date
  text visit_info_id
  varchar_255_ title
  text description
  boolean is_over_time_work
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  integer version
}
"public.recurring_schedule_details" {
  text id
  text facility_id
  text schedule_type_id
  text schedule_type_code
  varchar_255_ schedule_type_name
  date date
  time_without_time_zone start_time
  time_without_time_zone end_time
  boolean is_over_time_work
  text staff_id
  varchar_128_ staff_name
  varchar_255_ title
  text description
  text frequency
  smallint day_of_week
  smallint day_of_month
  smallint week_of_month
  date end_date
  text visit_info_id
  text patient_id
  varchar_255_ patient_name
  text assigned_staff_id
  varchar_128_ assigned_staff_name
  text companion_id
  varchar_128_ companion_name
  text service_code_id
  varchar_255_ service_code
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  integer version
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
