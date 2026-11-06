# schedule

## Viewpoints

| Name                                                               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [事業所と組織](viewpoint-organization.md)                          | 事業所と、その中の部署、チーム、役職、職員。事業所は予定の正本のモードを持つ                                                                                                                                                                                                                                                                                                                                                                                                               |
| [職員と権限](viewpoint-policies.md)                                | 職員が持つ権限と、その対象。職員を登録するとき、役職のデフォルトの権限をコピーする                                                                                                                                                                                                                                                                                                                                                                                                         |
| [利用者](viewpoint-patients.md)                                    | 利用者と、受けているサービスと、主に担当する職員                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [予定と訪問](viewpoint-schedules.md)                               | 予定と、訪問のときの訪問の情報と区分、予定の取り消し                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [繰り返しの予定](viewpoint-recurring.md)                           | 繰り返しの予定と規則、回にしない日。繰り返しの 1 回を置き換えた予定は schedules に入る                                                                                                                                                                                                                                                                                                                                                                                                     |
| [外部のカレンダーの取り込みと書き出し](viewpoint-calendar-sync.md) | 職員の外部のカレンダーと同期の状態、外部の予定と予定の対応、取り込みの記録、書き出しの待ち、Google カレンダーの予定の写し（Projection）。書き出しは、予定の正本のモードが buddy_primary の事業所に限る。同期は google_primary の事業所のカレンダーだけを読み、予定の写しに書く。google_primary の事業所で buddy から Google カレンダーに書いた予定は、訪問の情報と書き込みの保留の版を記録に持つ。切り替えは、google_primary の事業所の予定を取り込み、完了で事業所を buddy_primary にする |

## Tables

| Name                                                                            | Columns | Comment                                                                                                                                                        | Type       |
| ------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| [public.facilities](public.facilities.md)                                       | 7       | 訪問看護の事業所                                                                                                                                               | BASE TABLE |
| [public.departments](public.departments.md)                                     | 5       | 事業所の部署                                                                                                                                                   | BASE TABLE |
| [public.teams](public.teams.md)                                                 | 6       | 事業所のチーム                                                                                                                                                 | BASE TABLE |
| [public.positions](public.positions.md)                                         | 5       | 事業所の役職。職員を登録するときに写す既定の権限を持つ                                                                                                         | BASE TABLE |
| [public.policies](public.policies.md)                                           | 6       | 権限。マイグレーションで入れ、API では作らない                                                                                                                 | BASE TABLE |
| [public.position_policies](public.position_policies.md)                         | 2       | 役職の既定の権限                                                                                                                                               | BASE TABLE |
| [public.users](public.users.md)                                                 | 15      | 職員                                                                                                                                                           | BASE TABLE |
| [public.user_policies](public.user_policies.md)                                 | 4       | 職員が持つ権限。職員と権限の組で一意                                                                                                                           | BASE TABLE |
| [public.user_policy_targets](public.user_policy_targets.md)                     | 5       | 職員の権限の対象                                                                                                                                               | BASE TABLE |
| [public.service_codes](public.service_codes.md)                                 | 6       | サービスコード。マイグレーションで入れる                                                                                                                       | BASE TABLE |
| [public.visit_categories](public.visit_categories.md)                           | 4       | 訪問の区分（夜勤、緊急、入院）。マイグレーションで入れる                                                                                                       | BASE TABLE |
| [public.patients](public.patients.md)                                           | 10      | 利用者                                                                                                                                                         | BASE TABLE |
| [public.visit_infos](public.visit_infos.md)                                     | 8       | 訪問の情報                                                                                                                                                     | BASE TABLE |
| [public.visit_info_visit_categories](public.visit_info_visit_categories.md)     | 2       | 訪問に付けた区分。1 件の訪問に複数を付けられる                                                                                                                 | BASE TABLE |
| [public.schedule_types](public.schedule_types.md)                               | 5       | 予定の種類（通常、訪問）。マイグレーションで入れる                                                                                                             | BASE TABLE |
| [public.recurring_schedules](public.recurring_schedules.md)                     | 20      | 繰り返しの予定と、その規則                                                                                                                                     | BASE TABLE |
| [public.recurring_schedule_exclusions](public.recurring_schedule_exclusions.md) | 2       | 繰り返しの予定のうち、回にしない日                                                                                                                             | BASE TABLE |
| [public.schedules](public.schedules.md)                                         | 17      | 予定                                                                                                                                                           | BASE TABLE |
| [public.schedule_cancels](public.schedule_cancels.md)                           | 5       | 予定の取り消し                                                                                                                                                 | BASE TABLE |
| [public.external_calendars](public.external_calendars.md)                       | 8       | 取り込む外部のカレンダーと、その持ち主の職員。外していないものは職員ごとに 1 つ                                                                                | BASE TABLE |
| [public.calendar_sync_states](public.calendar_sync_states.md)                   | 10      | 外部のカレンダーごとの同期の状態                                                                                                                               | BASE TABLE |
| [public.external_event_links](public.external_event_links.md)                   | 12      | 外部の予定と、buddy の単発か繰り返しの予定の対応                                                                                                               | BASE TABLE |
| [public.import_runs](public.import_runs.md)                                     | 15      | 外部のカレンダーからの取り込みの 1 回ごとの記録                                                                                                                | BASE TABLE |
| [public.visit_info_details](public.visit_info_details.md)                       | 10      | 訪問の情報と名前を結合したビュー                                                                                                                               | VIEW       |
| [public.schedule_details](public.schedule_details.md)                           | 30      | 一覧の読み出しに使う、予定と訪問の情報と名前を結合したビュー                                                                                                   | VIEW       |
| [public.recurring_schedule_details](public.recurring_schedule_details.md)       | 31      | 一覧の読み出しに使う、繰り返しの予定と訪問の情報と名前を結合したビュー                                                                                         | VIEW       |
| [public.calendar_exports](public.calendar_exports.md)                           | 14      | 予定を外部のカレンダーに書き出す待ち。予定の変更と同じトランザクションで積む                                                                                   | BASE TABLE |
| [public.calendar_event_projections](public.calendar_event_projections.md)       | 19      | Google カレンダーを予定の正本にする事業所の、Google カレンダーの予定の写し（Projection）。1 つの予定を 1 行にする                                              | BASE TABLE |
| [public.calendar_cutovers](public.calendar_cutovers.md)                         | 9       | 事業所の予定の正本を Google カレンダーから buddy に切り替える作業の記録（切り替え）。事業所ごとに open は 1 つまで                                             | BASE TABLE |
| [public.calendar_cutover_skips](public.calendar_cutover_skips.md)               | 6       | 切り替えの取り込みで、確認が必要な予定に取り込まないを選んだ記録                                                                                               | BASE TABLE |
| [public.calendar_event_records](public.calendar_event_records.md)               | 15      | google_primary の事業所で、予定の API が Google カレンダーに書いた予定の、訪問の情報と書き込みの保留の版（ADR-0026）。通常の予定も保留の版を持つために行を作る | BASE TABLE |

## Stored procedures and functions

| Name                         | ReturnType | Arguments                                         | Type     |
| ---------------------------- | ---------- | ------------------------------------------------- | -------- |
| public.set_updated_at        | trigger    |                                                   | FUNCTION |
| public.projected_schedule_id | text       | external_calendar_id text, external_event_id text | FUNCTION |

## Relations

```mermaid
erDiagram

"public.departments" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.teams" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.positions" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.position_policies" }o--|| "public.positions" : "FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE"
"public.position_policies" }o--|| "public.policies" : "FOREIGN KEY (policy_id) REFERENCES policies(id)"
"public.users" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.users" }o--|| "public.departments" : "FOREIGN KEY (facility_id, department_id) REFERENCES departments(facility_id, id)"
"public.users" }o--|| "public.teams" : "FOREIGN KEY (facility_id, team_id) REFERENCES teams(facility_id, id)"
"public.users" }o--|| "public.positions" : "FOREIGN KEY (facility_id, position_id) REFERENCES positions(facility_id, id)"
"public.user_policies" }o--|| "public.policies" : "FOREIGN KEY (policy_id) REFERENCES policies(id)"
"public.user_policies" }o--|| "public.users" : "FOREIGN KEY (facility_id, user_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.user_policy_targets" }o--|| "public.teams" : "FOREIGN KEY (facility_id, target_team_id) REFERENCES teams(facility_id, id) ON DELETE CASCADE"
"public.user_policy_targets" }o--|| "public.users" : "FOREIGN KEY (facility_id, target_user_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.user_policy_targets" }o--|| "public.user_policies" : "FOREIGN KEY (facility_id, user_policy_id) REFERENCES user_policies(facility_id, id) ON DELETE CASCADE"
"public.patients" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.patients" }o--|| "public.users" : "FOREIGN KEY (facility_id, assigned_staff_id) REFERENCES users(facility_id, id)"
"public.patients" }o--|| "public.service_codes" : "FOREIGN KEY (service_code_id) REFERENCES service_codes(id)"
"public.visit_infos" }o--|| "public.users" : "FOREIGN KEY (facility_id, assigned_staff_id) REFERENCES users(facility_id, id)"
"public.visit_infos" }o--|| "public.users" : "FOREIGN KEY (facility_id, companion_id) REFERENCES users(facility_id, id)"
"public.visit_infos" }o--|| "public.service_codes" : "FOREIGN KEY (service_code_id) REFERENCES service_codes(id)"
"public.visit_infos" }o--|| "public.patients" : "FOREIGN KEY (facility_id, patient_id) REFERENCES patients(facility_id, id)"
"public.visit_info_visit_categories" }o--|| "public.visit_categories" : "FOREIGN KEY (visit_category_id) REFERENCES visit_categories(id)"
"public.visit_info_visit_categories" }o--|| "public.visit_infos" : "FOREIGN KEY (visit_info_id) REFERENCES visit_infos(id) ON DELETE CASCADE"
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
"public.schedule_cancels" |o--|| "public.schedules" : "FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE"
"public.external_calendars" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.calendar_sync_states" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"
"public.external_event_links" }o--|| "public.recurring_schedules" : "FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules(facility_id, id) ON DELETE CASCADE"
"public.external_event_links" }o--|| "public.schedules" : "FOREIGN KEY (facility_id, schedule_id) REFERENCES schedules(facility_id, id) ON DELETE CASCADE"
"public.external_event_links" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"
"public.external_event_links" }o--|| "public.calendar_cutovers" : "FOREIGN KEY (facility_id, cutover_id) REFERENCES calendar_cutovers(facility_id, id)"
"public.import_runs" }o--|| "public.users" : "FOREIGN KEY (facility_id, requested_by) REFERENCES users(facility_id, id)"
"public.import_runs" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"
"public.import_runs" }o--|| "public.calendar_cutovers" : "FOREIGN KEY (facility_id, cutover_id) REFERENCES calendar_cutovers(facility_id, id)"
"public.calendar_exports" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.calendar_exports" }o--|| "public.recurring_schedules" : "FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules(facility_id, id) ON DELETE CASCADE"
"public.calendar_exports" }o--|| "public.schedules" : "FOREIGN KEY (facility_id, schedule_id) REFERENCES schedules(facility_id, id) ON DELETE CASCADE"
"public.calendar_event_projections" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.calendar_event_projections" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"
"public.calendar_cutovers" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.calendar_cutovers" }o--|| "public.users" : "FOREIGN KEY (facility_id, started_by) REFERENCES users(facility_id, id)"
"public.calendar_cutover_skips" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"
"public.calendar_cutover_skips" }o--|| "public.calendar_cutovers" : "FOREIGN KEY (facility_id, cutover_id) REFERENCES calendar_cutovers(facility_id, id) ON DELETE CASCADE"
"public.calendar_event_records" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.calendar_event_records" }o--|| "public.visit_infos" : "FOREIGN KEY (facility_id, pending_visit_info_id) REFERENCES visit_infos(facility_id, id)"
"public.calendar_event_records" }o--|| "public.visit_infos" : "FOREIGN KEY (facility_id, visit_info_id) REFERENCES visit_infos(facility_id, id)"
"public.calendar_event_records" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"
"public.calendar_event_records" }o--|| "public.external_calendars" : "FOREIGN KEY (facility_id, pending_external_calendar_id) REFERENCES external_calendars(facility_id, id) ON DELETE CASCADE"

"public.facilities" {
  text id
  varchar_255_ name
  varchar_255_ org_id
  text time_zone
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  text source_mode
}
"public.departments" {
  text id
  text facility_id FK
  varchar_255_ name
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.teams" {
  text id
  text facility_id FK
  varchar_255_ name
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  text color
}
"public.positions" {
  text id
  text facility_id FK
  varchar_255_ name
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.policies" {
  text id
  varchar_64_ code
  varchar_255_ name
  boolean needs_target
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.position_policies" {
  text position_id FK
  text policy_id FK
}
"public.users" {
  text id
  text facility_id FK
  varchar_255_ sub
  varchar_128_ username
  varchar_320_ email
  varchar_16_ phone_number
  text department_id FK
  text team_id FK
  text position_id FK
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  timestamp_with_time_zone leave_started_at
  date leave_return_date
  timestamp_with_time_zone retired_at
  boolean visits
}
"public.user_policies" {
  text id
  text facility_id FK
  text user_id FK
  text policy_id FK
}
"public.user_policy_targets" {
  text id
  text facility_id FK
  text user_policy_id FK
  text target_user_id FK
  text target_team_id FK
}
"public.service_codes" {
  text id
  varchar_255_ code
  integer service_time_range_start
  integer service_time_range_end
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.visit_categories" {
  text id
  varchar_255_ name
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.patients" {
  text id
  text facility_id FK
  varchar_255_ name
  text preferred_time
  text preferred_gender
  text service_code_id FK
  text assigned_staff_id FK
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  timestamp_with_time_zone ended_at
}
"public.visit_infos" {
  text id
  text facility_id FK
  text patient_id FK
  text assigned_staff_id FK
  text companion_id FK
  text service_code_id FK
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.visit_info_visit_categories" {
  text visit_info_id FK
  text visit_category_id FK
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
  text facility_id FK
  text staff_id FK
  text schedule_type_id FK
  date date
  time_without_time_zone start_time
  time_without_time_zone end_time
  text visit_info_id FK
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
  boolean ends_next_day
}
"public.recurring_schedule_exclusions" {
  text recurring_schedule_id FK
  date date
}
"public.schedules" {
  text id
  text facility_id FK
  text staff_id FK
  text schedule_type_id FK
  date date
  time_without_time_zone start_time
  time_without_time_zone end_time
  text recurring_schedule_id FK
  date original_date
  text visit_info_id FK
  varchar_255_ title
  text description
  boolean is_over_time_work
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  integer version
  boolean ends_next_day
}
"public.schedule_cancels" {
  text id
  text schedule_id FK
  varchar_255_ reason
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.external_calendars" {
  text id
  text facility_id FK
  text staff_id FK
  text provider
  varchar_1024_ external_calendar_id
  timestamp_with_time_zone disabled_at
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.calendar_sync_states" {
  text external_calendar_id FK
  text facility_id FK
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
  text facility_id FK
  text external_calendar_id FK
  varchar_1024_ external_event_id
  varchar_1024_ recurring_event_id
  text etag
  text schedule_id FK
  text recurring_schedule_id FK
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  integer synced_version
  text cutover_id FK
}
"public.import_runs" {
  text id
  text facility_id FK
  text external_calendar_id FK
  text requested_by FK
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
  text cutover_id FK
}
"public.visit_info_details" {
  text id
  text facility_id
  text patient_id
  varchar_255_ patient_name
  text assigned_staff_id
  varchar_128_ assigned_staff_name
  text companion_id
  varchar_128_ companion_name
  text service_code_id
  varchar_255_ service_code
}
"public.schedule_details" {
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
  text recurring_schedule_id
  date original_date
  text visit_info_id
  text patient_id
  varchar_255_ patient_name
  text assigned_staff_id
  varchar_128_ assigned_staff_name
  text companion_id
  varchar_128_ companion_name
  text service_code_id
  varchar_255_ service_code
  text cancel_id
  varchar_255_ cancel_reason
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  integer version
  boolean ends_next_day
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
  boolean ends_next_day
}
"public.calendar_exports" {
  text id
  text facility_id FK
  text schedule_id FK
  text recurring_schedule_id FK
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
"public.calendar_event_projections" {
  text external_calendar_id FK
  varchar_1024_ external_event_id
  text facility_id FK
  text staff_id FK
  varchar_1024_ recurring_event_id
  timestamp_with_time_zone original_start_at
  date original_start_date
  text status
  text title
  timestamp_with_time_zone start_at
  date start_date
  timestamp_with_time_zone end_at
  date end_date
  text time_zone
  text__ recurrence
  text etag
  timestamp_with_time_zone google_updated_at
  date last_end_date
  timestamp_with_time_zone projected_at
}
"public.calendar_cutovers" {
  text id
  text facility_id FK
  text status
  date range_start
  text started_by FK
  timestamp_with_time_zone started_at
  timestamp_with_time_zone finished_at
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
"public.calendar_cutover_skips" {
  text cutover_id FK
  text facility_id FK
  text external_calendar_id FK
  varchar_1024_ external_event_id
  varchar_64_ revision
  timestamp_with_time_zone created_at
}
"public.calendar_event_records" {
  text schedule_id
  text facility_id FK
  text external_calendar_id FK
  varchar_1024_ external_event_id
  text visit_info_id FK
  integer version
  integer pending_version
  text pending_state
  text pending_visit_info_id FK
  timestamp_with_time_zone pending_deadline
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  timestamp_with_time_zone pending_locked_until
  text pending_external_calendar_id FK
  varchar_1024_ pending_external_event_id
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
