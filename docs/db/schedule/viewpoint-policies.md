# 職員と権限

## Description

職員が持つ権限と、その対象。職員を登録するとき、役職のデフォルトの権限をコピーする。権限の変更は監査の記録に残す（ADR-0042）

## Tables

| Name                                                        | Columns | Comment                                                                                                         | Type       |
| ----------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- | ---------- |
| [public.teams](public.teams.md)                             | 6       | 事業所のチーム                                                                                                  | BASE TABLE |
| [public.positions](public.positions.md)                     | 5       | 事業所の役職。職員を登録するときに写す既定の権限を持つ                                                          | BASE TABLE |
| [public.policies](public.policies.md)                       | 6       | 権限。マイグレーションで入れ、API では作らない                                                                  | BASE TABLE |
| [public.position_policies](public.position_policies.md)     | 2       | 役職の既定の権限                                                                                                | BASE TABLE |
| [public.users](public.users.md)                             | 15      | 職員                                                                                                            | BASE TABLE |
| [public.user_policies](public.user_policies.md)             | 4       | 職員が持つ権限。職員と権限の組で一意                                                                            | BASE TABLE |
| [public.user_policy_targets](public.user_policy_targets.md) | 5       | 職員の権限の対象                                                                                                | BASE TABLE |
| [public.permission_audits](public.permission_audits.md)     | 12      | 権限の変更と運営者の登録の監査の記録（ADR-0042）。画面と API に出さず、運営者が DB で読む。消さず、書き換えない | BASE TABLE |

## Relations

```mermaid
erDiagram

"public.position_policies" }o--|| "public.positions" : "FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE CASCADE"
"public.position_policies" }o--|| "public.policies" : "FOREIGN KEY (policy_id) REFERENCES policies(id)"
"public.users" }o--|| "public.teams" : "FOREIGN KEY (facility_id, team_id) REFERENCES teams(facility_id, id)"
"public.users" }o--|| "public.positions" : "FOREIGN KEY (facility_id, position_id) REFERENCES positions(facility_id, id)"
"public.user_policies" }o--|| "public.policies" : "FOREIGN KEY (policy_id) REFERENCES policies(id)"
"public.user_policies" }o--|| "public.users" : "FOREIGN KEY (facility_id, user_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.user_policy_targets" }o--|| "public.teams" : "FOREIGN KEY (facility_id, target_team_id) REFERENCES teams(facility_id, id) ON DELETE CASCADE"
"public.user_policy_targets" }o--|| "public.users" : "FOREIGN KEY (facility_id, target_user_id) REFERENCES users(facility_id, id) ON DELETE CASCADE"
"public.user_policy_targets" }o--|| "public.user_policies" : "FOREIGN KEY (facility_id, user_policy_id) REFERENCES user_policies(facility_id, id) ON DELETE CASCADE"
"public.permission_audits" }o--|| "public.positions" : "FOREIGN KEY (facility_id, target_position_id) REFERENCES positions(facility_id, id)"
"public.permission_audits" }o--|| "public.users" : "FOREIGN KEY (facility_id, actor_user_id) REFERENCES users(facility_id, id)"
"public.permission_audits" }o--|| "public.users" : "FOREIGN KEY (facility_id, target_user_id) REFERENCES users(facility_id, id)"

"public.teams" {
  text id
  text facility_id
  varchar_255_ name
  timestamp_with_time_zone created_at
  timestamp_with_time_zone updated_at
  text color
}
"public.positions" {
  text id
  text facility_id
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
  text position_id
  text policy_id
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
  timestamp_with_time_zone leave_started_at
  date leave_return_date
  timestamp_with_time_zone retired_at
  boolean visits
}
"public.user_policies" {
  text id
  text facility_id
  text user_id
  text policy_id
}
"public.user_policy_targets" {
  text id
  text facility_id
  text user_policy_id
  text target_user_id
  text target_team_id
}
"public.permission_audits" {
  text id
  text facility_id
  text action
  text actor_kind
  text actor_user_id
  text actor_operator
  text target_user_id
  text target_position_id
  jsonb before
  jsonb after
  text request_id
  timestamp_with_time_zone occurred_at
}
```

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
