CREATE TABLE facilities (
    id         CHAR(26)     NOT NULL,
    name       VARCHAR(255) NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE departments (
    id          CHAR(26)     NOT NULL,
    facility_id CHAR(26)     NOT NULL,
    name        VARCHAR(255) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_departments_facility_name (facility_id, name),
    CONSTRAINT fk_departments_facility FOREIGN KEY (facility_id) REFERENCES facilities (id)
);

CREATE TABLE teams (
    id          CHAR(26)     NOT NULL,
    facility_id CHAR(26)     NOT NULL,
    name        VARCHAR(255) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_teams_facility_name (facility_id, name),
    CONSTRAINT fk_teams_facility FOREIGN KEY (facility_id) REFERENCES facilities (id)
);

CREATE TABLE positions (
    id          CHAR(26)     NOT NULL,
    facility_id CHAR(26)     NOT NULL,
    name        VARCHAR(255) NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_positions_facility_name (facility_id, name),
    CONSTRAINT fk_positions_facility FOREIGN KEY (facility_id) REFERENCES facilities (id)
);

CREATE TABLE policies (
    id         CHAR(26)     NOT NULL,
    name       VARCHAR(255) NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_policies_name (name)
);

CREATE TABLE position_policies (
    position_id CHAR(26) NOT NULL,
    policy_id   CHAR(26) NOT NULL,
    PRIMARY KEY (position_id, policy_id),
    CONSTRAINT fk_position_policies_position FOREIGN KEY (position_id) REFERENCES positions (id) ON DELETE CASCADE,
    CONSTRAINT fk_position_policies_policy FOREIGN KEY (policy_id) REFERENCES policies (id)
);
