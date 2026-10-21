# public.users

## Description

職員

## Columns

| Name          | Type                     | Default | Nullable | Children                                                                                                                                                                                                                                                                                                                                                                                                | Parents                                                                                                                                                       | Comment                                          |
| ------------- | ------------------------ | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| id            | text                     |         | false    | [public.user_policies](public.user_policies.md) [public.user_policy_targets](public.user_policy_targets.md) [public.patients](public.patients.md) [public.visit_infos](public.visit_infos.md) [public.recurring_schedules](public.recurring_schedules.md) [public.schedules](public.schedules.md) [public.external_calendars](public.external_calendars.md) [public.import_runs](public.import_runs.md) |                                                                                                                                                               |                                                  |
| facility_id   | text                     |         | false    | [public.user_policies](public.user_policies.md) [public.user_policy_targets](public.user_policy_targets.md) [public.patients](public.patients.md) [public.visit_infos](public.visit_infos.md) [public.recurring_schedules](public.recurring_schedules.md) [public.schedules](public.schedules.md) [public.external_calendars](public.external_calendars.md) [public.import_runs](public.import_runs.md) | [public.facilities](public.facilities.md) [public.departments](public.departments.md) [public.teams](public.teams.md) [public.positions](public.positions.md) |                                                  |
| sub           | varchar(255)             |         | true     |                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                               | ブローカーの subject。初回のログインまで NULL    |
| username      | varchar(128)             |         | false    |                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                               | 電子カルテの職員名と同じ表記。照合が名前で比べる |
| email         | varchar(320)             |         | false    |                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                               | 小文字にそろえた値。事業所の中で一意             |
| phone_number  | varchar(16)              |         | true     |                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                               |                                                  |
| department_id | text                     |         | false    |                                                                                                                                                                                                                                                                                                                                                                                                         | [public.departments](public.departments.md)                                                                                                                   |                                                  |
| team_id       | text                     |         | false    |                                                                                                                                                                                                                                                                                                                                                                                                         | [public.teams](public.teams.md)                                                                                                                               |                                                  |
| position_id   | text                     |         | false    |                                                                                                                                                                                                                                                                                                                                                                                                         | [public.positions](public.positions.md)                                                                                                                       |                                                  |
| created_at    | timestamp with time zone | now()   | false    |                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                               |                                                  |
| updated_at    | timestamp with time zone | now()   | false    |                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                                                                               |                                                  |

## Viewpoints

| Name                                                     | Definition                                                                             |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [事業所と組織](viewpoint-organization.md)                | 事業所と、その中の部署、チーム、役職、職員                                             |
| [職員と権限](viewpoint-policies.md)                      | 職員が持つ権限と、その対象。職員を登録するとき、役職の既定の権限を写す                 |
| [利用者](viewpoint-patients.md)                          | 利用者と、受けているサービスと、主に担当する職員                                       |
| [予定と訪問](viewpoint-schedules.md)                     | 予定と、訪問のときの訪問の情報と区分、予定の取り消し                                   |
| [繰り返しの予定](viewpoint-recurring.md)                 | 繰り返しの予定と規則、回にしない日。繰り返しの 1 回を置き換えた予定は schedules に入る |
| [外部のカレンダーの取り込み](viewpoint-calendar-sync.md) | 職員の外部のカレンダーと同期の状態、外部の予定と予定の対応、取り込みの記録             |

## Constraints

| Name                         | Type        | Definition                                                                       |
| ---------------------------- | ----------- | -------------------------------------------------------------------------------- |
| users_created_at_not_null    | n           | NOT NULL created_at                                                              |
| users_department_id_not_null | n           | NOT NULL department_id                                                           |
| users_email_lower_check      | CHECK       | CHECK (((email)::text = lower((email)::text)))                                   |
| users_email_not_null         | n           | NOT NULL email                                                                   |
| users_facility_id_not_null   | n           | NOT NULL facility_id                                                             |
| users_id_check               | CHECK       | CHECK ((id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text))                             |
| users_id_not_null            | n           | NOT NULL id                                                                      |
| users_position_id_not_null   | n           | NOT NULL position_id                                                             |
| users_team_id_not_null       | n           | NOT NULL team_id                                                                 |
| users_updated_at_not_null    | n           | NOT NULL updated_at                                                              |
| users_username_not_null      | n           | NOT NULL username                                                                |
| users_facility_fkey          | FOREIGN KEY | FOREIGN KEY (facility_id) REFERENCES facilities(id)                              |
| users_department_fkey        | FOREIGN KEY | FOREIGN KEY (facility_id, department_id) REFERENCES departments(facility_id, id) |
| users_team_fkey              | FOREIGN KEY | FOREIGN KEY (facility_id, team_id) REFERENCES teams(facility_id, id)             |
| users_position_fkey          | FOREIGN KEY | FOREIGN KEY (facility_id, position_id) REFERENCES positions(facility_id, id)     |
| users_pkey                   | PRIMARY KEY | PRIMARY KEY (id)                                                                 |
| users_sub_key                | UNIQUE      | UNIQUE (sub)                                                                     |
| users_facility_email_key     | UNIQUE      | UNIQUE (facility_id, email)                                                      |
| users_facility_id_key        | UNIQUE      | UNIQUE (facility_id, id)                                                         |

## Indexes

| Name                     | Definition                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| users_pkey               | CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)                               |
| users_sub_key            | CREATE UNIQUE INDEX users_sub_key ON public.users USING btree (sub)                           |
| users_facility_email_key | CREATE UNIQUE INDEX users_facility_email_key ON public.users USING btree (facility_id, email) |
| users_facility_id_key    | CREATE UNIQUE INDEX users_facility_id_key ON public.users USING btree (facility_id, id)       |
| users_department_idx     | CREATE INDEX users_department_idx ON public.users USING btree (facility_id, department_id)    |
| users_team_idx           | CREATE INDEX users_team_idx ON public.users USING btree (facility_id, team_id)                |
| users_position_idx       | CREATE INDEX users_position_idx ON public.users USING btree (facility_id, position_id)        |

## Triggers

| Name                 | Definition                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| users_set_updated_at | CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_updated_at() |

## Relations

```mermaid
erDiagram

"public.user_policies" }o--|| "public.users" : "FOREIGN KEY (facility_id, user_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.user_policy_targets" }o--|| "public.users" : "FOREIGN KEY (facility_id, target_user_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.patients" }o--|| "public.users" : "FOREIGN KEY (facility_id, assigned_staff_id) REFERENCES users(facility_id, id)"
"public.visit_infos" }o--|| "public.users" : "FOREIGN KEY (facility_id, assigned_staff_id) REFERENCES users(facility_id, id)"
"public.visit_infos" }o--|| "public.users" : "FOREIGN KEY (facility_id, companion_id) REFERENCES users(facility_id, id)"
"public.recurring_schedules" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id)"
"public.schedules" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id)"
"public.external_calendars" }o--|| "public.users" : "FOREIGN KEY (facility_id, staff_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.import_runs" }o--|| "public.users" : "FOREIGN KEY (facility_id, requested_by) REFERENCES users(facility_id, id)"
"public.users" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"
"public.users" }o--|| "public.departments" : "FOREIGN KEY (facility_id, department_id) REFERENCES departments(facility_id, id)"
"public.users" }o--|| "public.teams" : "FOREIGN KEY (facility_id, team_id) REFERENCES teams(facility_id, id)"
"public.users" }o--|| "public.positions" : "FOREIGN KEY (facility_id, position_id) REFERENCES positions(facility_id, id)"

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
}
"public.external_calendars" {
  text id
  text facility_id FK
  text staff_id FK
  text provider
  varchar_1024_ external_calendar_id
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
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
}
"public.facilities" {
  text id
  varchar_255_ name
  varchar_255_ org_id
  text time_zone
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
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
}
"public.positions" {
  text id
  text facility_id FK
  varchar_255_ name
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
