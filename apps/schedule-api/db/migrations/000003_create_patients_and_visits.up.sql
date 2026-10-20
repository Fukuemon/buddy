CREATE TABLE service_codes (
    id                       CHAR(26)     NOT NULL,
    code                     VARCHAR(255) NOT NULL,
    service_time_range_start INT          NOT NULL,
    service_time_range_end   INT          NOT NULL,
    created_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_service_codes_code (code)
);

CREATE TABLE visit_categories (
    id         CHAR(26)     NOT NULL,
    name       VARCHAR(255) NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_visit_categories_name (name)
);

CREATE TABLE patients (
    id                CHAR(26)     NOT NULL,
    facility_id       CHAR(26)     NOT NULL,
    name              VARCHAR(255) NOT NULL,
    preferred_time    VARCHAR(8)   NOT NULL,
    preferred_gender  VARCHAR(8)   NOT NULL,
    service_code_id   CHAR(26)     NOT NULL,
    assigned_staff_id CHAR(26)     NOT NULL,
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_patients_facility (facility_id),
    CONSTRAINT chk_patients_preferred_time CHECK (preferred_time IN ('午前', '午後')),
    CONSTRAINT chk_patients_preferred_gender CHECK (preferred_gender IN ('男性', '女性')),
    CONSTRAINT fk_patients_facility FOREIGN KEY (facility_id) REFERENCES facilities (id),
    CONSTRAINT fk_patients_service_code FOREIGN KEY (service_code_id) REFERENCES service_codes (id),
    CONSTRAINT fk_patients_assigned_staff FOREIGN KEY (assigned_staff_id) REFERENCES users (id)
);

CREATE TABLE visit_infos (
    id                CHAR(26) NOT NULL,
    patient_id        CHAR(26) NOT NULL,
    assigned_staff_id CHAR(26) NOT NULL,
    companion_id      CHAR(26) NULL,
    service_code_id   CHAR(26) NOT NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_visit_infos_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
    CONSTRAINT fk_visit_infos_assigned_staff FOREIGN KEY (assigned_staff_id) REFERENCES users (id),
    CONSTRAINT fk_visit_infos_companion FOREIGN KEY (companion_id) REFERENCES users (id),
    CONSTRAINT fk_visit_infos_service_code FOREIGN KEY (service_code_id) REFERENCES service_codes (id)
);

CREATE TABLE visit_info_visit_categories (
    visit_info_id     CHAR(26) NOT NULL,
    visit_category_id CHAR(26) NOT NULL,
    PRIMARY KEY (visit_info_id, visit_category_id),
    CONSTRAINT fk_vivc_visit_info FOREIGN KEY (visit_info_id) REFERENCES visit_infos (id) ON DELETE CASCADE,
    CONSTRAINT fk_vivc_visit_category FOREIGN KEY (visit_category_id) REFERENCES visit_categories (id)
);
