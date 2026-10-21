-- ADR-0011 で見直した表を、1 本の初期のマイグレーションで作る。
-- ID は ULID の文字列で、バイトの順で比べる。形の CHECK は主キーだけに付け、外部キーの列は主キーの値しか入らないので重ねない。
-- 名前の列は既定の決定的な照合順序のままにし、完全に一致する値だけを同じとみなす。
-- 事業所の中の参照は (facility_id, id) の複合の外部キーで指し、別の事業所の行を指せないようにする。

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TABLE facilities (
    id         text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    name       varchar(255)     NOT NULL,
    org_id     varchar(255)     NULL,
    time_zone  text             NOT NULL DEFAULT 'Asia/Tokyo',
    created_at timestamptz      NOT NULL DEFAULT now(),
    updated_at timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT facilities_pkey PRIMARY KEY (id),
    CONSTRAINT facilities_org_id_key UNIQUE (org_id)
);

CREATE TABLE departments (
    id          text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id text COLLATE "C" NOT NULL,
    name        varchar(255)     NOT NULL,
    created_at  timestamptz      NOT NULL DEFAULT now(),
    updated_at  timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT departments_pkey PRIMARY KEY (id),
    CONSTRAINT departments_facility_name_key UNIQUE (facility_id, name),
    CONSTRAINT departments_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT departments_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id)
);

CREATE TABLE teams (
    id          text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id text COLLATE "C" NOT NULL,
    name        varchar(255)     NOT NULL,
    created_at  timestamptz      NOT NULL DEFAULT now(),
    updated_at  timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT teams_pkey PRIMARY KEY (id),
    CONSTRAINT teams_facility_name_key UNIQUE (facility_id, name),
    CONSTRAINT teams_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT teams_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id)
);

CREATE TABLE positions (
    id          text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id text COLLATE "C" NOT NULL,
    name        varchar(255)     NOT NULL,
    created_at  timestamptz      NOT NULL DEFAULT now(),
    updated_at  timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT positions_pkey PRIMARY KEY (id),
    CONSTRAINT positions_facility_name_key UNIQUE (facility_id, name),
    CONSTRAINT positions_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT positions_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id)
);

CREATE TABLE policies (
    id           text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    code         varchar(64)      NOT NULL,
    name         varchar(255)     NOT NULL,
    needs_target boolean          NOT NULL DEFAULT false,
    created_at   timestamptz      NOT NULL DEFAULT now(),
    updated_at   timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT policies_pkey PRIMARY KEY (id),
    CONSTRAINT policies_code_key UNIQUE (code),
    CONSTRAINT policies_name_key UNIQUE (name)
);

CREATE TABLE position_policies (
    position_id text COLLATE "C" NOT NULL,
    policy_id   text COLLATE "C" NOT NULL,
    CONSTRAINT position_policies_pkey PRIMARY KEY (position_id, policy_id),
    CONSTRAINT position_policies_position_fkey FOREIGN KEY (position_id) REFERENCES positions (id) ON DELETE CASCADE,
    CONSTRAINT position_policies_policy_fkey FOREIGN KEY (policy_id) REFERENCES policies (id)
);

-- メールは予定の API が小文字にそろえてから保存し、比べる。そろえ忘れた書き込みは CHECK が止める。
CREATE TABLE users (
    id            text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id   text COLLATE "C" NOT NULL,
    sub           varchar(255)     NULL,
    username      varchar(128)     NOT NULL,
    email         varchar(320)     NOT NULL,
    phone_number  varchar(16)      NULL,
    department_id text COLLATE "C" NOT NULL,
    team_id       text COLLATE "C" NOT NULL,
    position_id   text COLLATE "C" NOT NULL,
    created_at    timestamptz      NOT NULL DEFAULT now(),
    updated_at    timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_sub_key UNIQUE (sub),
    CONSTRAINT users_facility_email_key UNIQUE (facility_id, email),
    CONSTRAINT users_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT users_email_lower_check CHECK (email = lower(email)),
    CONSTRAINT users_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT users_department_fkey FOREIGN KEY (facility_id, department_id) REFERENCES departments (facility_id, id),
    CONSTRAINT users_team_fkey FOREIGN KEY (facility_id, team_id) REFERENCES teams (facility_id, id),
    CONSTRAINT users_position_fkey FOREIGN KEY (facility_id, position_id) REFERENCES positions (facility_id, id)
);
CREATE INDEX users_department_idx ON users (facility_id, department_id);
CREATE INDEX users_team_idx ON users (facility_id, team_id);
CREATE INDEX users_position_idx ON users (facility_id, position_id);

CREATE TABLE user_policies (
    id          text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id text COLLATE "C" NOT NULL,
    user_id     text COLLATE "C" NOT NULL,
    policy_id   text COLLATE "C" NOT NULL,
    CONSTRAINT user_policies_pkey PRIMARY KEY (id),
    CONSTRAINT user_policies_user_policy_key UNIQUE (user_id, policy_id),
    CONSTRAINT user_policies_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT user_policies_user_fkey FOREIGN KEY (facility_id, user_id) REFERENCES users (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT user_policies_policy_fkey FOREIGN KEY (policy_id) REFERENCES policies (id)
);
CREATE INDEX user_policies_facility_user_idx ON user_policies (facility_id, user_id);

-- 対象は職員かチームのどちらか 1 つである。NULL の側の複合の外部キーは確かめない（MATCH SIMPLE）。
CREATE TABLE user_policy_targets (
    id             text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id    text COLLATE "C" NOT NULL,
    user_policy_id text COLLATE "C" NOT NULL,
    target_user_id text COLLATE "C" NULL,
    target_team_id text COLLATE "C" NULL,
    CONSTRAINT user_policy_targets_pkey PRIMARY KEY (id),
    CONSTRAINT user_policy_targets_user_key UNIQUE (user_policy_id, target_user_id),
    CONSTRAINT user_policy_targets_team_key UNIQUE (user_policy_id, target_team_id),
    CONSTRAINT user_policy_targets_one_check CHECK ((target_user_id IS NULL) <> (target_team_id IS NULL)),
    CONSTRAINT user_policy_targets_user_policy_fkey FOREIGN KEY (facility_id, user_policy_id) REFERENCES user_policies (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT user_policy_targets_user_fkey FOREIGN KEY (facility_id, target_user_id) REFERENCES users (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT user_policy_targets_team_fkey FOREIGN KEY (facility_id, target_team_id) REFERENCES teams (facility_id, id) ON DELETE CASCADE
);
CREATE INDEX user_policy_targets_facility_user_policy_idx ON user_policy_targets (facility_id, user_policy_id);
CREATE INDEX user_policy_targets_target_user_idx ON user_policy_targets (facility_id, target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX user_policy_targets_target_team_idx ON user_policy_targets (facility_id, target_team_id) WHERE target_team_id IS NOT NULL;

CREATE TABLE service_codes (
    id                       text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    code                     varchar(255)     NOT NULL,
    service_time_range_start integer          NOT NULL,
    service_time_range_end   integer          NOT NULL,
    created_at               timestamptz      NOT NULL DEFAULT now(),
    updated_at               timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT service_codes_pkey PRIMARY KEY (id),
    CONSTRAINT service_codes_code_key UNIQUE (code),
    CONSTRAINT service_codes_time_range_check CHECK (0 <= service_time_range_start AND service_time_range_start <= service_time_range_end)
);

CREATE TABLE visit_categories (
    id         text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    name       varchar(255)     NOT NULL,
    created_at timestamptz      NOT NULL DEFAULT now(),
    updated_at timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT visit_categories_pkey PRIMARY KEY (id),
    CONSTRAINT visit_categories_name_key UNIQUE (name)
);

CREATE TABLE patients (
    id                text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id       text COLLATE "C" NOT NULL,
    name              varchar(255)     NOT NULL,
    preferred_time    text             NOT NULL,
    preferred_gender  text             NOT NULL,
    service_code_id   text COLLATE "C" NOT NULL,
    assigned_staff_id text COLLATE "C" NOT NULL,
    created_at        timestamptz      NOT NULL DEFAULT now(),
    updated_at        timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT patients_pkey PRIMARY KEY (id),
    CONSTRAINT patients_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT patients_preferred_time_check CHECK (preferred_time IN ('午前', '午後')),
    CONSTRAINT patients_preferred_gender_check CHECK (preferred_gender IN ('男性', '女性')),
    CONSTRAINT patients_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT patients_service_code_fkey FOREIGN KEY (service_code_id) REFERENCES service_codes (id),
    CONSTRAINT patients_assigned_staff_fkey FOREIGN KEY (facility_id, assigned_staff_id) REFERENCES users (facility_id, id)
);
CREATE INDEX patients_facility_name_idx ON patients (facility_id, name);
CREATE INDEX patients_assigned_staff_idx ON patients (facility_id, assigned_staff_id);

CREATE TABLE visit_infos (
    id                text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id       text COLLATE "C" NOT NULL,
    patient_id        text COLLATE "C" NOT NULL,
    assigned_staff_id text COLLATE "C" NOT NULL,
    companion_id      text COLLATE "C" NULL,
    service_code_id   text COLLATE "C" NOT NULL,
    created_at        timestamptz      NOT NULL DEFAULT now(),
    updated_at        timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT visit_infos_pkey PRIMARY KEY (id),
    CONSTRAINT visit_infos_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT visit_infos_companion_check CHECK (companion_id <> assigned_staff_id),
    CONSTRAINT visit_infos_patient_fkey FOREIGN KEY (facility_id, patient_id) REFERENCES patients (facility_id, id),
    CONSTRAINT visit_infos_assigned_staff_fkey FOREIGN KEY (facility_id, assigned_staff_id) REFERENCES users (facility_id, id),
    CONSTRAINT visit_infos_companion_fkey FOREIGN KEY (facility_id, companion_id) REFERENCES users (facility_id, id),
    CONSTRAINT visit_infos_service_code_fkey FOREIGN KEY (service_code_id) REFERENCES service_codes (id)
);
CREATE INDEX visit_infos_patient_idx ON visit_infos (facility_id, patient_id);
CREATE INDEX visit_infos_assigned_staff_idx ON visit_infos (facility_id, assigned_staff_id);
CREATE INDEX visit_infos_companion_idx ON visit_infos (facility_id, companion_id) WHERE companion_id IS NOT NULL;

CREATE TABLE visit_info_visit_categories (
    visit_info_id     text COLLATE "C" NOT NULL,
    visit_category_id text COLLATE "C" NOT NULL,
    CONSTRAINT visit_info_visit_categories_pkey PRIMARY KEY (visit_info_id, visit_category_id),
    CONSTRAINT visit_info_visit_categories_visit_info_fkey FOREIGN KEY (visit_info_id) REFERENCES visit_infos (id) ON DELETE CASCADE,
    CONSTRAINT visit_info_visit_categories_visit_category_fkey FOREIGN KEY (visit_category_id) REFERENCES visit_categories (id)
);

-- 種類ごとの規則は code で読む。name は表示に使う。
CREATE TABLE schedule_types (
    id         text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    code       text             NOT NULL,
    name       varchar(255)     NOT NULL,
    created_at timestamptz      NOT NULL DEFAULT now(),
    updated_at timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT schedule_types_pkey PRIMARY KEY (id),
    CONSTRAINT schedule_types_code_key UNIQUE (code),
    CONSTRAINT schedule_types_name_key UNIQUE (name),
    CONSTRAINT schedule_types_code_check CHECK (code IN ('normal', 'visit'))
);

-- 繰り返しの規則は、この表の frequency から end_date の列に持つ。
-- 毎週は曜日だけを、毎月は日だけか、週と曜日の組を受け付ける。指定しない項目は最初の日付から決める。
CREATE TABLE recurring_schedules (
    id                text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id       text COLLATE "C" NOT NULL,
    staff_id          text COLLATE "C" NOT NULL,
    schedule_type_id  text COLLATE "C" NOT NULL,
    date              date             NOT NULL,
    start_time        time             NOT NULL,
    end_time          time             NOT NULL,
    visit_info_id     text COLLATE "C" NULL,
    title             varchar(255)     NULL,
    description       text             NULL,
    is_over_time_work boolean          NOT NULL GENERATED ALWAYS AS (start_time >= time '17:00') STORED,
    frequency         text             NOT NULL,
    day_of_week       smallint         NULL,
    day_of_month      smallint         NULL,
    week_of_month     smallint         NULL,
    end_date          date             NULL,
    created_at        timestamptz      NOT NULL DEFAULT now(),
    updated_at        timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT recurring_schedules_pkey PRIMARY KEY (id),
    CONSTRAINT recurring_schedules_visit_info_key UNIQUE (visit_info_id),
    CONSTRAINT recurring_schedules_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT recurring_schedules_time_check CHECK (start_time < end_time),
    CONSTRAINT recurring_schedules_end_date_check CHECK (end_date >= date),
    CONSTRAINT recurring_schedules_frequency_check CHECK (frequency IN ('weekly', 'monthly')),
    CONSTRAINT recurring_schedules_day_of_week_check CHECK (day_of_week BETWEEN 1 AND 7),
    CONSTRAINT recurring_schedules_day_of_month_check CHECK (day_of_month BETWEEN 1 AND 31),
    CONSTRAINT recurring_schedules_week_of_month_check CHECK (week_of_month BETWEEN 1 AND 5),
    CONSTRAINT recurring_schedules_rule_check CHECK (
        (frequency = 'weekly' AND day_of_month IS NULL AND week_of_month IS NULL)
        OR (frequency = 'monthly' AND day_of_month IS NOT NULL AND day_of_week IS NULL AND week_of_month IS NULL)
        OR (frequency = 'monthly' AND day_of_month IS NULL AND (day_of_week IS NULL) = (week_of_month IS NULL))
    ),
    CONSTRAINT recurring_schedules_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT recurring_schedules_staff_fkey FOREIGN KEY (facility_id, staff_id) REFERENCES users (facility_id, id),
    CONSTRAINT recurring_schedules_type_fkey FOREIGN KEY (schedule_type_id) REFERENCES schedule_types (id),
    CONSTRAINT recurring_schedules_visit_info_fkey FOREIGN KEY (facility_id, visit_info_id) REFERENCES visit_infos (facility_id, id)
);
CREATE INDEX recurring_schedules_staff_idx ON recurring_schedules (facility_id, staff_id);

CREATE TABLE recurring_schedule_exclusions (
    recurring_schedule_id text COLLATE "C" NOT NULL,
    date                  date             NOT NULL,
    CONSTRAINT recurring_schedule_exclusions_pkey PRIMARY KEY (recurring_schedule_id, date),
    CONSTRAINT recurring_schedule_exclusions_recurring_schedule_fkey FOREIGN KEY (recurring_schedule_id) REFERENCES recurring_schedules (id) ON DELETE CASCADE
);

-- 繰り返しの 1 回を置き換えた予定は、元の繰り返しの予定と元の回の日付を持つ。同じ回は 1 度だけ置き換えられる。
CREATE TABLE schedules (
    id                    text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id           text COLLATE "C" NOT NULL,
    staff_id              text COLLATE "C" NOT NULL,
    schedule_type_id      text COLLATE "C" NOT NULL,
    date                  date             NOT NULL,
    start_time            time             NOT NULL,
    end_time              time             NOT NULL,
    recurring_schedule_id text COLLATE "C" NULL,
    original_date         date             NULL,
    visit_info_id         text COLLATE "C" NULL,
    title                 varchar(255)     NULL,
    description           text             NULL,
    is_over_time_work     boolean          NOT NULL GENERATED ALWAYS AS (start_time >= time '17:00') STORED,
    created_at            timestamptz      NOT NULL DEFAULT now(),
    updated_at            timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT schedules_pkey PRIMARY KEY (id),
    CONSTRAINT schedules_visit_info_key UNIQUE (visit_info_id),
    CONSTRAINT schedules_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT schedules_original_date_key UNIQUE (recurring_schedule_id, original_date),
    CONSTRAINT schedules_time_check CHECK (start_time < end_time),
    CONSTRAINT schedules_original_date_check CHECK ((recurring_schedule_id IS NULL) = (original_date IS NULL)),
    CONSTRAINT schedules_facility_fkey FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT schedules_staff_fkey FOREIGN KEY (facility_id, staff_id) REFERENCES users (facility_id, id),
    CONSTRAINT schedules_type_fkey FOREIGN KEY (schedule_type_id) REFERENCES schedule_types (id),
    CONSTRAINT schedules_recurring_schedule_fkey FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules (facility_id, id),
    CONSTRAINT schedules_visit_info_fkey FOREIGN KEY (facility_id, visit_info_id) REFERENCES visit_infos (facility_id, id)
);
CREATE INDEX schedules_facility_date_idx ON schedules (facility_id, date, start_time);
CREATE INDEX schedules_staff_date_idx ON schedules (facility_id, staff_id, date);

CREATE TABLE schedule_cancels (
    id          text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    schedule_id text COLLATE "C" NOT NULL,
    reason      varchar(255)     NOT NULL,
    created_at  timestamptz      NOT NULL DEFAULT now(),
    updated_at  timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT schedule_cancels_pkey PRIMARY KEY (id),
    CONSTRAINT schedule_cancels_schedule_key UNIQUE (schedule_id),
    CONSTRAINT schedule_cancels_schedule_fkey FOREIGN KEY (schedule_id) REFERENCES schedules (id) ON DELETE CASCADE
);

-- Google カレンダーの取り込み（ADR-0009 の段階 1）の表。外部の予定の題名と本文は利用者の名前を含むので保存しない。

CREATE TABLE external_calendars (
    id                   text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id          text COLLATE "C" NOT NULL,
    staff_id             text COLLATE "C" NOT NULL,
    provider             text             NOT NULL,
    external_calendar_id varchar(1024)    NOT NULL,
    disabled_at          timestamptz      NULL,
    created_at           timestamptz      NOT NULL DEFAULT now(),
    updated_at           timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT external_calendars_pkey PRIMARY KEY (id),
    CONSTRAINT external_calendars_external_key UNIQUE (provider, external_calendar_id),
    CONSTRAINT external_calendars_facility_id_key UNIQUE (facility_id, id),
    CONSTRAINT external_calendars_provider_check CHECK (provider IN ('google')),
    CONSTRAINT external_calendars_staff_fkey FOREIGN KEY (facility_id, staff_id) REFERENCES users (facility_id, id) ON DELETE CASCADE
);
-- 外したカレンダーの行は消さず、外部の予定との対応を残す。職員ごとに 1 つの制約は、外していない行だけに当てる。
CREATE UNIQUE INDEX external_calendars_staff_key ON external_calendars (staff_id, provider) WHERE disabled_at IS NULL;
CREATE INDEX external_calendars_facility_staff_idx ON external_calendars (facility_id, staff_id);

CREATE TABLE calendar_sync_states (
    external_calendar_id text COLLATE "C" NOT NULL,
    facility_id          text COLLATE "C" NOT NULL,
    sync_token           text             NULL,
    last_status          text             NOT NULL,
    last_error           text             NULL,
    last_synced_at       timestamptz      NULL,
    created_at           timestamptz      NOT NULL DEFAULT now(),
    updated_at           timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT calendar_sync_states_pkey PRIMARY KEY (external_calendar_id),
    CONSTRAINT calendar_sync_states_last_status_check CHECK (last_status IN ('never', 'succeeded', 'failed')),
    CONSTRAINT calendar_sync_states_calendar_fkey FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars (facility_id, id) ON DELETE CASCADE
);
CREATE INDEX calendar_sync_states_facility_calendar_idx ON calendar_sync_states (facility_id, external_calendar_id);

-- 外部の予定 1 つは、単発か繰り返しの予定のどちらか 1 つに対応する。
CREATE TABLE external_event_links (
    id                    text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id           text COLLATE "C" NOT NULL,
    external_calendar_id  text COLLATE "C" NOT NULL,
    external_event_id     varchar(1024)    NOT NULL,
    recurring_event_id    varchar(1024)    NULL,
    etag                  text             NOT NULL,
    schedule_id           text COLLATE "C" NULL,
    recurring_schedule_id text COLLATE "C" NULL,
    created_at            timestamptz      NOT NULL DEFAULT now(),
    updated_at            timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT external_event_links_pkey PRIMARY KEY (id),
    CONSTRAINT external_event_links_event_key UNIQUE (external_calendar_id, external_event_id),
    CONSTRAINT external_event_links_schedule_key UNIQUE (schedule_id),
    CONSTRAINT external_event_links_recurring_schedule_key UNIQUE (recurring_schedule_id),
    CONSTRAINT external_event_links_target_check CHECK (num_nonnulls(schedule_id, recurring_schedule_id) = 1),
    CONSTRAINT external_event_links_calendar_fkey FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT external_event_links_schedule_fkey FOREIGN KEY (facility_id, schedule_id) REFERENCES schedules (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT external_event_links_recurring_schedule_fkey FOREIGN KEY (facility_id, recurring_schedule_id) REFERENCES recurring_schedules (facility_id, id) ON DELETE CASCADE
);
CREATE INDEX external_event_links_facility_calendar_idx ON external_event_links (facility_id, external_calendar_id);
CREATE INDEX external_event_links_facility_schedule_idx ON external_event_links (facility_id, schedule_id) WHERE schedule_id IS NOT NULL;
CREATE INDEX external_event_links_facility_recurring_schedule_idx ON external_event_links (facility_id, recurring_schedule_id) WHERE recurring_schedule_id IS NOT NULL;

CREATE TABLE import_runs (
    id                   text COLLATE "C" NOT NULL CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
    facility_id          text COLLATE "C" NOT NULL,
    external_calendar_id text COLLATE "C" NOT NULL,
    requested_by         text COLLATE "C" NOT NULL,
    range_start          date             NOT NULL,
    range_end            date             NOT NULL,
    status               text             NOT NULL,
    imported_count       integer          NOT NULL DEFAULT 0,
    skipped_count        integer          NOT NULL DEFAULT 0,
    error                text             NULL,
    started_at           timestamptz      NOT NULL DEFAULT now(),
    finished_at          timestamptz      NULL,
    created_at           timestamptz      NOT NULL DEFAULT now(),
    updated_at           timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT import_runs_pkey PRIMARY KEY (id),
    CONSTRAINT import_runs_range_check CHECK (range_start <= range_end),
    CONSTRAINT import_runs_status_check CHECK (status IN ('running', 'succeeded', 'failed')),
    CONSTRAINT import_runs_count_check CHECK (imported_count >= 0 AND skipped_count >= 0),
    CONSTRAINT import_runs_finished_check CHECK ((status = 'running') = (finished_at IS NULL)),
    CONSTRAINT import_runs_calendar_fkey FOREIGN KEY (facility_id, external_calendar_id) REFERENCES external_calendars (facility_id, id) ON DELETE CASCADE,
    CONSTRAINT import_runs_requested_by_fkey FOREIGN KEY (facility_id, requested_by) REFERENCES users (facility_id, id)
);
CREATE INDEX import_runs_facility_calendar_idx ON import_runs (facility_id, external_calendar_id, started_at);
CREATE INDEX import_runs_requested_by_idx ON import_runs (facility_id, requested_by);

CREATE TRIGGER facilities_set_updated_at BEFORE UPDATE ON facilities FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER departments_set_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER positions_set_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER policies_set_updated_at BEFORE UPDATE ON policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER service_codes_set_updated_at BEFORE UPDATE ON service_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER visit_categories_set_updated_at BEFORE UPDATE ON visit_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER patients_set_updated_at BEFORE UPDATE ON patients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER visit_infos_set_updated_at BEFORE UPDATE ON visit_infos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER schedule_types_set_updated_at BEFORE UPDATE ON schedule_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER recurring_schedules_set_updated_at BEFORE UPDATE ON recurring_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER schedules_set_updated_at BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER schedule_cancels_set_updated_at BEFORE UPDATE ON schedule_cancels FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER external_calendars_set_updated_at BEFORE UPDATE ON external_calendars FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER calendar_sync_states_set_updated_at BEFORE UPDATE ON calendar_sync_states FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER external_event_links_set_updated_at BEFORE UPDATE ON external_event_links FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER import_runs_set_updated_at BEFORE UPDATE ON import_runs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE VIEW visit_info_details AS
SELECT vi.id, vi.facility_id,
       vi.patient_id, pa.name AS patient_name,
       vi.assigned_staff_id, au.username AS assigned_staff_name,
       vi.companion_id, cu.username AS companion_name,
       vi.service_code_id, sc.code AS service_code
FROM visit_infos vi
JOIN patients pa ON pa.id = vi.patient_id
JOIN users au ON au.id = vi.assigned_staff_id
LEFT JOIN users cu ON cu.id = vi.companion_id
JOIN service_codes sc ON sc.id = vi.service_code_id;

CREATE VIEW schedule_details AS
SELECT s.id, s.facility_id,
       s.schedule_type_id, st.code AS schedule_type_code, st.name AS schedule_type_name,
       s.date, s.start_time, s.end_time, s.is_over_time_work,
       s.staff_id, u.username AS staff_name,
       s.title, s.description, s.recurring_schedule_id, s.original_date,
       s.visit_info_id,
       vid.patient_id, vid.patient_name,
       vid.assigned_staff_id, vid.assigned_staff_name,
       vid.companion_id, vid.companion_name,
       vid.service_code_id, vid.service_code,
       c.id AS cancel_id, c.reason AS cancel_reason,
       s.created_at, s.updated_at
FROM schedules s
JOIN schedule_types st ON st.id = s.schedule_type_id
JOIN users u ON u.id = s.staff_id
LEFT JOIN visit_info_details vid ON vid.id = s.visit_info_id
LEFT JOIN schedule_cancels c ON c.schedule_id = s.id;

CREATE VIEW recurring_schedule_details AS
SELECT rs.id, rs.facility_id,
       rs.schedule_type_id, st.code AS schedule_type_code, st.name AS schedule_type_name,
       rs.date, rs.start_time, rs.end_time, rs.is_over_time_work,
       rs.staff_id, u.username AS staff_name,
       rs.title, rs.description,
       rs.frequency, rs.day_of_week, rs.day_of_month, rs.week_of_month, rs.end_date,
       rs.visit_info_id,
       vid.patient_id, vid.patient_name,
       vid.assigned_staff_id, vid.assigned_staff_name,
       vid.companion_id, vid.companion_name,
       vid.service_code_id, vid.service_code,
       rs.created_at, rs.updated_at
FROM recurring_schedules rs
JOIN schedule_types st ON st.id = rs.schedule_type_id
JOIN users u ON u.id = rs.staff_id
LEFT JOIN visit_info_details vid ON vid.id = rs.visit_info_id;

-- 事業所に属さず、全ての環境で同じ値のマスタを入れる。シードを当てない本番でも予定を作れるようにする。
-- サービスコードの表記は、API の値をそのまま比べる web（apps/web/src/api/types.ts の SERVICE_CODES）に合わせる。
-- 提供時間の範囲は、receipt-api の servicerule と照合の Design Doc に合わせる。

INSERT INTO schedule_types (id, code, name) VALUES
    ('01M3TC68E05E1N46YCCBT6ZQB2', 'normal', '通常'),
    ('01M3TC69D8KB2938F3GS7WBVT5', 'visit', '訪問');

INSERT INTO service_codes (id, code, service_time_range_start, service_time_range_end) VALUES
    ('01M3TC60M0XC173N54CJQRKFVR', '訪看I2', 20, 29),
    ('01M3TC61K82WSVMKHFBEVC4NYM', '訪看I3', 30, 59),
    ('01M3TC62JGSGQN3D5JKQYJR08M', '訪看I4', 60, 89),
    ('01M5CY43AMEXN4FR51A0SYRSWD', '訪看I5', 21, 40),
    ('01M5CY43AN1ZGENC609SEDDYMG', '訪看I5・2超', 41, 60),
    ('01M5CY43AN1ZGENC609WD9P416', '予防看I2', 20, 29),
    ('01M5CY43AN1ZGENC609XEGM8QX', '予防看I3', 30, 59),
    ('01M5CY43AN1ZGENC609YXNV8C8', '予防看I4', 60, 89),
    ('01M5CY43AN1ZGENC609Z81TVGD', '予防看I5', 21, 40),
    ('01M5CY43AN1ZGENC609ZKDKFW9', '予防看I5・2超', 41, 60),
    ('01M5CY43AN1ZGENC60A06ZN94F', '医', 30, 90);

INSERT INTO visit_categories (id, name) VALUES
    ('01M3TC63HR6H7CP0CVRZGED7BB', '夜勤'),
    ('01M3TC64H0JJHBDMJQPGBX9FM7', '緊急'),
    ('01M3TC65G8G68GS870DAANGEBG', '入院');

-- 権限は全ての環境で同じ 8 行で、認可は code で読む。staff.manage は ADR-0006 の職員の管理の権限である。
INSERT INTO policies (id, code, name, needs_target) VALUES
    ('01M5E1S42TTS7QZK05YGS0GYR8', 'schedule.self.edit', '自分の予定の編集', false),
    ('01M5E1S42TTS7QZK05YGS0GYR9', 'schedule.user.read', '指定した職員の予定の閲覧', true),
    ('01M5E1S42TTS7QZK05YGS0GYRA', 'schedule.user.edit', '指定した職員の予定の編集', true),
    ('01M5E1S42TTS7QZK05YGS0GYRB', 'schedule.team.read', '指定したチームの職員の予定の閲覧', true),
    ('01M5E1S42TTS7QZK05YGS0GYRC', 'schedule.team.edit', '指定したチームの職員の予定の編集', true),
    ('01M5E1S42TTS7QZK05YGS0GYRD', 'schedule.all.read', '事業所の全ての予定の閲覧', false),
    ('01M5E1S42TTS7QZK05YGS0GYRE', 'schedule.all.edit', '事業所の全ての予定の編集', false),
    ('01M5E5GP6Q8BQYNWN66QHJF60J', 'staff.manage', '職員の管理', false);

COMMENT ON TABLE facilities IS '訪問看護の事業所';
COMMENT ON COLUMN facilities.name IS '事業所名';
COMMENT ON COLUMN facilities.org_id IS 'ブローカーの組織の ID。結び付けるまで NULL';
COMMENT ON COLUMN facilities.time_zone IS '予定の日付と時刻を読む現地のタイムゾーン（IANA の名前）';
COMMENT ON TABLE departments IS '事業所の部署';
COMMENT ON COLUMN departments.name IS '事業所の中で一意';
COMMENT ON TABLE teams IS '事業所のチーム';
COMMENT ON COLUMN teams.name IS '事業所の中で一意';
COMMENT ON TABLE positions IS '事業所の役職。職員を登録するときに写す既定の権限を持つ';
COMMENT ON COLUMN positions.name IS '事業所の中で一意';
COMMENT ON TABLE policies IS '権限。マイグレーションで入れ、API では作らない';
COMMENT ON COLUMN policies.code IS '認可が読む識別子';
COMMENT ON COLUMN policies.name IS '権限の名前';
COMMENT ON COLUMN policies.needs_target IS '対象の職員かチームを指定するか';
COMMENT ON TABLE position_policies IS '役職の既定の権限';
COMMENT ON TABLE user_policies IS '職員が持つ権限。職員と権限の組で一意';
COMMENT ON TABLE user_policy_targets IS '職員の権限の対象';
COMMENT ON COLUMN user_policy_targets.target_user_id IS '対象の職員。チームと排他';
COMMENT ON COLUMN user_policy_targets.target_team_id IS '対象のチーム。職員と排他';
COMMENT ON TABLE users IS '職員';
COMMENT ON COLUMN users.sub IS 'ブローカーの subject。初回のログインまで NULL';
COMMENT ON COLUMN users.username IS '電子カルテの職員名と同じ表記。照合が名前で比べる';
COMMENT ON COLUMN users.email IS '小文字にそろえた値。事業所の中で一意';
COMMENT ON TABLE patients IS '利用者';
COMMENT ON COLUMN patients.preferred_time IS '希望の時間帯（午前、午後）';
COMMENT ON COLUMN patients.preferred_gender IS '希望の訪問者の性別（男性、女性）';
COMMENT ON COLUMN patients.service_code_id IS '受けているサービス';
COMMENT ON COLUMN patients.assigned_staff_id IS '主に担当する職員';
COMMENT ON TABLE schedule_types IS '予定の種類（通常、訪問）。マイグレーションで入れる';
COMMENT ON COLUMN schedule_types.code IS '規則が読む識別子（normal、visit）';
COMMENT ON TABLE schedules IS '予定';
COMMENT ON COLUMN schedules.recurring_schedule_id IS '繰り返しの 1 回を置き換えたときだけ';
COMMENT ON COLUMN schedules.original_date IS '置き換えた元の回の日付。recurring_schedule_id と組で持つ';
COMMENT ON COLUMN schedules.visit_info_id IS '訪問のときだけ。予定ごとに 1 つ';
COMMENT ON COLUMN schedules.is_over_time_work IS '開始が 17 時以降。開始の時刻から生成する';
COMMENT ON TABLE schedule_cancels IS '予定の取り消し';
COMMENT ON TABLE recurring_schedules IS '繰り返しの予定と、その規則';
COMMENT ON COLUMN recurring_schedules.date IS '最初の回の日付';
COMMENT ON COLUMN recurring_schedules.visit_info_id IS '訪問のときだけ。予定ごとに 1 つ';
COMMENT ON COLUMN recurring_schedules.is_over_time_work IS '開始が 17 時以降。開始の時刻から生成する';
COMMENT ON COLUMN recurring_schedules.frequency IS 'weekly、monthly';
COMMENT ON COLUMN recurring_schedules.day_of_week IS '1（月曜）から 7';
COMMENT ON COLUMN recurring_schedules.day_of_month IS '1 から 31';
COMMENT ON COLUMN recurring_schedules.week_of_month IS '1 から 5';
COMMENT ON COLUMN recurring_schedules.end_date IS 'この日を含む。NULL なら終わりなし';
COMMENT ON TABLE recurring_schedule_exclusions IS '繰り返しの予定のうち、回にしない日';
COMMENT ON TABLE visit_infos IS '訪問の情報';
COMMENT ON COLUMN visit_infos.assigned_staff_id IS '主訪問者';
COMMENT ON COLUMN visit_infos.companion_id IS '同行者';
COMMENT ON TABLE visit_info_visit_categories IS '訪問に付けた区分。1 件の訪問に複数を付けられる';
COMMENT ON TABLE service_codes IS 'サービスコード。マイグレーションで入れる';
COMMENT ON COLUMN service_codes.code IS '例は 訪看I2、訪看I3';
COMMENT ON COLUMN service_codes.service_time_range_start IS '提供時間の範囲の下限（分）。照合の許容範囲と同じ値';
COMMENT ON COLUMN service_codes.service_time_range_end IS '提供時間の範囲の上限（分）。照合の許容範囲と同じ値';
COMMENT ON TABLE visit_categories IS '訪問の区分（夜勤、緊急、入院）。マイグレーションで入れる';
COMMENT ON TABLE external_calendars IS '取り込む外部のカレンダーと、その持ち主の職員。外していないものは職員ごとに 1 つ';
COMMENT ON COLUMN external_calendars.provider IS 'google';
COMMENT ON COLUMN external_calendars.external_calendar_id IS '外部のカレンダーの ID。サービスアカウントに共有されたもの';
COMMENT ON COLUMN external_calendars.disabled_at IS '外した時刻。外しても行と外部の予定との対応は残す。NULL なら使っている';
COMMENT ON TABLE calendar_sync_states IS '外部のカレンダーごとの同期の状態';
COMMENT ON COLUMN calendar_sync_states.sync_token IS '次の増分の取得に使うトークン。全件を取り直すときは NULL';
COMMENT ON COLUMN calendar_sync_states.last_status IS 'never、succeeded、failed';
COMMENT ON COLUMN calendar_sync_states.last_error IS '最後の失敗の理由。外部の予定の題名を含めない';
COMMENT ON TABLE external_event_links IS '外部の予定と、buddy の単発か繰り返しの予定の対応';
COMMENT ON COLUMN external_event_links.recurring_event_id IS '繰り返しの 1 回のとき、外部の繰り返しの予定の ID';
COMMENT ON COLUMN external_event_links.etag IS '最後に同期した時点の外部の予定の etag';
COMMENT ON TABLE import_runs IS '外部のカレンダーからの取り込みの 1 回ごとの記録';
COMMENT ON COLUMN import_runs.requested_by IS '取り込みを確定した職員';
COMMENT ON COLUMN import_runs.range_start IS '取り込む期間の最初の日';
COMMENT ON COLUMN import_runs.range_end IS '取り込む期間の最後の日。この日を含む';
COMMENT ON COLUMN import_runs.status IS 'running、succeeded、failed';
COMMENT ON COLUMN import_runs.skipped_count IS 'buddy の予定に写せず、取り込まなかった外部の予定の数';
COMMENT ON VIEW schedule_details IS '一覧の読み出しに使う、予定と訪問の情報と名前を結合したビュー';
COMMENT ON VIEW recurring_schedule_details IS '一覧の読み出しに使う、繰り返しの予定と訪問の情報と名前を結合したビュー';
COMMENT ON VIEW visit_info_details IS '訪問の情報と名前を結合したビュー';
