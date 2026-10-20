CREATE TABLE users (
    id            CHAR(26)     NOT NULL,
    sub           VARCHAR(255) NULL,
    username      VARCHAR(128) NOT NULL,
    email         VARCHAR(320) NOT NULL,
    phone_number  VARCHAR(16)  NULL,
    facility_id   CHAR(26)     NOT NULL,
    department_id CHAR(26)     NOT NULL,
    team_id       CHAR(26)     NOT NULL,
    position_id   CHAR(26)     NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_sub (sub),
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_facility (facility_id),
    CONSTRAINT fk_users_facility FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments (id),
    CONSTRAINT fk_users_team FOREIGN KEY (team_id) REFERENCES teams (id),
    CONSTRAINT fk_users_position FOREIGN KEY (position_id) REFERENCES positions (id)
);

CREATE TABLE user_policies (
    id        CHAR(26) NOT NULL,
    user_id   CHAR(26) NOT NULL,
    policy_id CHAR(26) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_policies_user_policy (user_id, policy_id),
    CONSTRAINT fk_user_policies_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_policies_policy FOREIGN KEY (policy_id) REFERENCES policies (id)
);

CREATE TABLE user_policy_targets (
    user_policy_id CHAR(26) NOT NULL,
    target_user_id CHAR(26) NOT NULL,
    PRIMARY KEY (user_policy_id, target_user_id),
    CONSTRAINT fk_user_policy_targets_user_policy FOREIGN KEY (user_policy_id) REFERENCES user_policies (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_policy_targets_target FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE CASCADE
);
