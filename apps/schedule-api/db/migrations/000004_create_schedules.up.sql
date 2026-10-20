CREATE TABLE schedule_types (
    id         CHAR(26)     NOT NULL,
    name       VARCHAR(255) NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_schedule_types_name (name)
);

CREATE TABLE recurring_rules (
    id            CHAR(26)    NOT NULL,
    frequency     VARCHAR(16) NOT NULL,
    day_of_week   TINYINT     NULL,
    day_of_month  TINYINT     NULL,
    week_of_month TINYINT     NULL,
    end_date      DATE        NULL,
    created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_recurring_rules_frequency CHECK (frequency IN ('weekly', 'monthly'))
);

CREATE TABLE recurring_schedules (
    id                CHAR(26)     NOT NULL,
    facility_id       CHAR(26)     NOT NULL,
    staff_id          CHAR(26)     NOT NULL,
    schedule_type_id  CHAR(26)     NOT NULL,
    recurring_rule_id CHAR(26)     NOT NULL,
    date              DATE         NOT NULL,
    start_time        TIME         NOT NULL,
    end_time          TIME         NOT NULL,
    visit_info_id     CHAR(26)     NULL,
    title             VARCHAR(255) NULL,
    description       TEXT         NULL,
    is_over_time_work BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_recurring_schedules_facility (facility_id),
    CONSTRAINT fk_recurring_schedules_facility FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT fk_recurring_schedules_staff FOREIGN KEY (staff_id) REFERENCES users (id),
    CONSTRAINT fk_recurring_schedules_type FOREIGN KEY (schedule_type_id) REFERENCES schedule_types (id),
    CONSTRAINT fk_recurring_schedules_rule FOREIGN KEY (recurring_rule_id) REFERENCES recurring_rules (id),
    CONSTRAINT fk_recurring_schedules_visit_info FOREIGN KEY (visit_info_id) REFERENCES visit_infos (id)
);

CREATE TABLE recurring_schedule_exclusions (
    recurring_schedule_id CHAR(26) NOT NULL,
    date                  DATE     NOT NULL,
    PRIMARY KEY (recurring_schedule_id, date),
    CONSTRAINT fk_rse_recurring_schedule FOREIGN KEY (recurring_schedule_id) REFERENCES recurring_schedules (id) ON DELETE CASCADE
);

CREATE TABLE schedules (
    id                    CHAR(26)     NOT NULL,
    facility_id           CHAR(26)     NOT NULL,
    staff_id              CHAR(26)     NOT NULL,
    schedule_type_id      CHAR(26)     NOT NULL,
    date                  DATE         NOT NULL,
    start_time            TIME         NOT NULL,
    end_time              TIME         NOT NULL,
    recurring_schedule_id CHAR(26)     NULL,
    visit_info_id         CHAR(26)     NULL,
    title                 VARCHAR(255) NULL,
    description           TEXT         NULL,
    is_over_time_work     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_schedules_facility_date (facility_id, date),
    CONSTRAINT fk_schedules_facility FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT fk_schedules_staff FOREIGN KEY (staff_id) REFERENCES users (id),
    CONSTRAINT fk_schedules_type FOREIGN KEY (schedule_type_id) REFERENCES schedule_types (id),
    CONSTRAINT fk_schedules_recurring_schedule FOREIGN KEY (recurring_schedule_id) REFERENCES recurring_schedules (id),
    CONSTRAINT fk_schedules_visit_info FOREIGN KEY (visit_info_id) REFERENCES visit_infos (id)
);

CREATE TABLE schedule_cancels (
    id          CHAR(26)     NOT NULL,
    schedule_id CHAR(26)     NOT NULL,
    reason      VARCHAR(255) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_schedule_cancels_schedule (schedule_id),
    CONSTRAINT fk_schedule_cancels_schedule FOREIGN KEY (schedule_id) REFERENCES schedules (id) ON DELETE CASCADE
);
