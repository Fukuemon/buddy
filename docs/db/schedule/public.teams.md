# public.teams

## Description

事業所のチーム

## Columns

| Name        | Type                     | Default | Nullable | Children                                                                                    | Parents                                   | Comment                                                                                        |
| ----------- | ------------------------ | ------- | -------- | ------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| id          | text                     |         | false    | [public.users](public.users.md) [public.user_policy_targets](public.user_policy_targets.md) |                                           |                                                                                                |
| facility_id | text                     |         | false    | [public.users](public.users.md) [public.user_policy_targets](public.user_policy_targets.md) | [public.facilities](public.facilities.md) |                                                                                                |
| name        | varchar(255)             |         | false    |                                                                                             |                                           | 事業所の中で一意                                                                               |
| created_at  | timestamp with time zone | now()   | false    |                                                                                             |                                           |                                                                                                |
| updated_at  | timestamp with time zone | now()   | false    |                                                                                             |                                           |                                                                                                |
| color       | text                     |         | false    |                                                                                             |                                           | チームの色。packages/ui のチームの色のトークンの名前（team- の後ろ）。事業所の中で重なってよい |

## Viewpoints

| Name                                      | Definition                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| [事業所と組織](viewpoint-organization.md) | 事業所と、その中の部署、チーム、役職、職員                                         |
| [職員と権限](viewpoint-policies.md)       | 職員が持つ権限と、その対象。職員を登録するとき、役職のデフォルトの権限をコピーする |

## Constraints

| Name                       | Type        | Definition                                                                                                                                              |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| teams_color_check          | CHECK       | CHECK ((color = ANY (ARRAY['blue'::text, 'orange'::text, 'magenta'::text, 'cyan'::text, 'yellow'::text, 'purple'::text, 'green'::text, 'lime'::text]))) |
| teams_color_not_null       | n           | NOT NULL color                                                                                                                                          |
| teams_created_at_not_null  | n           | NOT NULL created_at                                                                                                                                     |
| teams_facility_id_not_null | n           | NOT NULL facility_id                                                                                                                                    |
| teams_id_check             | CHECK       | CHECK ((id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text))                                                                                                    |
| teams_id_not_null          | n           | NOT NULL id                                                                                                                                             |
| teams_name_not_null        | n           | NOT NULL name                                                                                                                                           |
| teams_updated_at_not_null  | n           | NOT NULL updated_at                                                                                                                                     |
| teams_facility_fkey        | FOREIGN KEY | FOREIGN KEY (facility_id) REFERENCES facilities(id)                                                                                                     |
| teams_pkey                 | PRIMARY KEY | PRIMARY KEY (id)                                                                                                                                        |
| teams_facility_name_key    | UNIQUE      | UNIQUE (facility_id, name)                                                                                                                              |
| teams_facility_id_key      | UNIQUE      | UNIQUE (facility_id, id)                                                                                                                                |

## Indexes

| Name                    | Definition                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| teams_pkey              | CREATE UNIQUE INDEX teams_pkey ON public.teams USING btree (id)                             |
| teams_facility_name_key | CREATE UNIQUE INDEX teams_facility_name_key ON public.teams USING btree (facility_id, name) |
| teams_facility_id_key   | CREATE UNIQUE INDEX teams_facility_id_key ON public.teams USING btree (facility_id, id)     |

## Triggers

| Name                 | Definition                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| teams_set_updated_at | CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION set_updated_at() |

## Relations

```mermaid
erDiagram

"public.users" }o--|| "public.teams" : "FOREIGN KEY (facility_id, team_id) REFERENCES teams(facility_id, id)"
"public.user_policy_targets" }o--|| "public.teams" : "FOREIGN KEY (facility_id, target_team_id) REFERENCES teams(facility_id, id) ON DELETE CASCADE"
"public.teams" }o--|| "public.facilities" : "FOREIGN KEY (facility_id) REFERENCES facilities(id)"

"public.teams" {
  text id
  text facility_id FK
  varchar_255_ name
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  text color
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
"public.user_policy_targets" {
  text id
  text facility_id FK
  text user_policy_id FK
  text target_user_id FK
  text target_team_id FK
}
"public.facilities" {
  text id
  varchar_255_ name
  varchar_255_ org_id
  text time_zone
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
