# 外部のカレンダーの取り込みと書き出し

## Description

職員の外部のカレンダーと同期の状態、外部の予定と予定の対応、取り込みの記録、書き出しの待ち

## Tables

| Name                                                          | Columns | Comment                                                                         | Type       |
| ------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------- | ---------- |
| [public.users](public.users.md)                               | 14      | 職員                                                                            | BASE TABLE |
| [public.recurring_schedules](public.recurring_schedules.md)   | 19      | 繰り返しの予定と、その規則                                                      | BASE TABLE |
| [public.schedules](public.schedules.md)                       | 16      | 予定                                                                            | BASE TABLE |
| [public.external_calendars](public.external_calendars.md)     | 8       | 取り込む外部のカレンダーと、その持ち主の職員。外していないものは職員ごとに 1 つ | BASE TABLE |
| [public.calendar_sync_states](public.calendar_sync_states.md) | 10      | 外部のカレンダーごとの同期の状態                                                | BASE TABLE |
| [public.external_event_links](public.external_event_links.md) | 11      | 外部の予定と、buddy の単発か繰り返しの予定の対応                                | BASE TABLE |
| [public.import_runs](public.import_runs.md)                   | 14      | 外部のカレンダーからの取り込みの 1 回ごとの記録                                 | BASE TABLE |
| [public.calendar_exports](public.calendar_exports.md)         | 14      | 予定を外部のカレンダーに書き出す待ち。予定の変更と同じトランザクションで積む    | BASE TABLE |

## Relations

```mermaid
erDiagram

"public.recurring_schedules" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id)"
"public.schedules" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id)"
"public.schedules" }o--|| "public.recurring_schedules" : "FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules(facility_id, id)"
"public.external_calendars" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.calendar_sync_states" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"
"public.external_event_links" }o--|| "public.recurring_schedules" : "FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules(facility_id, id) ON DELETE CASCADE"
"public.external_event_links" }o--|| "public.schedules" : "FOREIGN KEY (facility_id, schedule_id) REFERENCES schedules(facility_id, id) ON DELETE CASCADE"
"public.external_event_links" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"
"public.import_runs" }o--|| "public.users" : "FOREIGN KEY (facility_id, requested_by) REFERENCES users(facility_id, id)"
"public.import_runs" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"
"public.calendar_exports" }o--|| "public.recurring_schedules" : "FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules(facility_id, id) ON DELETE CASCADE"
"public.calendar_exports" }o--|| "public.schedules" : "FOREIGN KEY (facility_id, schedule_id) REFERENCES schedules(facility_id, id) ON DELETE CASCADE"

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
  timestamp_with_time_zone leave_started_at
  date leave_return_date
  timestamp_with_time_zone retired_at
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
"public.external_calendars" {
  text id
  text facility_id
  text staff_id
  text provider
  varchar_1024_ external_calendar_id
  timestamp_with_time_zone disabled_at
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.calendar_sync_states" {
  text external_calendar_id
  text facility_id
  text sync_token
  text last_status
  text last_error
  timestamp_with_time_zone last_synced_at
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  timestamp_with_time_zone next_sync_at
  timestamp_with_time_zone locked_until
}
"public.external_event_links" {
  text id
  text facility_id
  text external_calendar_id
  varchar_1024_ external_event_id
  varchar_1024_ recurring_event_id
  text etag
  text schedule_id
  text recurring_schedule_id
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  integer synced_version
}
"public.import_runs" {
  text id
  text facility_id
  text external_calendar_id
  text requested_by
  date range_start
  date range_end
  text status
  integer imported_count
  integer skipped_count
  text error
  timestamp_with_time_zone started_at
  timestamp_with_time_zone finished_at
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.calendar_exports" {
  text id
  text facility_id
  text schedule_id
  text recurring_schedule_id
  text status
  integer revision
  integer attempts
  timestamp_with_time_zone next_attempt_at
  timestamp_with_time_zone locked_until
  boolean overwrite
  text error_code
  timestamp_with_time_zone finished_at
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
