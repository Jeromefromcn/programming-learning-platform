-- ============================================================
-- V1__create_schema.sql
-- ============================================================

-- -----------------------------------------------------------
-- 1. users
-- -----------------------------------------------------------
CREATE TABLE users (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(64)     NOT NULL,
    display_name    VARCHAR(128)    NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    role            VARCHAR(20)     NOT NULL COMMENT 'STUDENT | TUTOR | SUPER_ADMIN',
    status          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE | DISABLED',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_username (username),
    INDEX idx_users_role (role),
    INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 2. refresh_tokens
-- -----------------------------------------------------------
CREATE TABLE refresh_tokens (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT          NOT NULL,
    token_hash      VARCHAR(255)    NOT NULL COMMENT 'SHA-256 hash of refresh token',
    expires_at      DATETIME        NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_refresh_tokens_user_id (user_id),
    INDEX idx_refresh_tokens_expires_at (expires_at),
    CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 3. categories
-- -----------------------------------------------------------
CREATE TABLE categories (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100)    NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_category_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 4. courses
-- -----------------------------------------------------------
CREATE TABLE courses (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(200)    NOT NULL,
    description     TEXT,
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE,
    created_by      BIGINT          NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_courses_is_deleted (is_deleted),
    CONSTRAINT fk_course_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 5. exercises
-- -----------------------------------------------------------
CREATE TABLE exercises (
    id                  BIGINT          AUTO_INCREMENT PRIMARY KEY,
    title               VARCHAR(255)    NOT NULL,
    description         TEXT            NOT NULL,
    type                VARCHAR(20)     NOT NULL COMMENT 'BLOCKLY | PYTHON',
    difficulty          VARCHAR(20)     NOT NULL COMMENT 'EASY | MEDIUM | HARD',
    category_id         BIGINT,
    status              VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT | PUBLISHED',
    current_version_id  BIGINT          COMMENT 'FK to exercise_versions.id — set after first version created',
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,
    like_count          INT             NOT NULL DEFAULT 0 COMMENT 'Denormalized counter for display',
    created_by          BIGINT          NOT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_exercises_status (status),
    INDEX idx_exercises_type (type),
    INDEX idx_exercises_is_deleted (is_deleted),
    INDEX idx_exercises_category_id (category_id),
    CONSTRAINT fk_ex_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_ex_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 6. exercise_versions
-- -----------------------------------------------------------
CREATE TABLE exercise_versions (
    id                  BIGINT          AUTO_INCREMENT PRIMARY KEY,
    exercise_id         BIGINT          NOT NULL,
    version_number      INT             NOT NULL COMMENT 'Monotonically increasing per exercise',
    title               VARCHAR(255)    NOT NULL,
    description         TEXT            NOT NULL,
    difficulty          VARCHAR(20)     NOT NULL,
    hints               JSON            COMMENT '["hint1", "hint2", ...]',
    config              JSON            NOT NULL COMMENT 'Type-specific config — see below',
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_exercise_version (exercise_id, version_number),
    CONSTRAINT fk_ev_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Now add the FK from exercises.current_version_id
ALTER TABLE exercises
    ADD CONSTRAINT fk_ex_current_version
    FOREIGN KEY (current_version_id) REFERENCES exercise_versions(id) ON DELETE SET NULL;

-- -----------------------------------------------------------
-- 7. course_exercises (many-to-many)
-- -----------------------------------------------------------
CREATE TABLE course_exercises (
    course_id       BIGINT          NOT NULL,
    exercise_id     BIGINT          NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (course_id, exercise_id),
    CONSTRAINT fk_ce_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_ce_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 8. course_students (many-to-many)
-- -----------------------------------------------------------
CREATE TABLE course_students (
    course_id       BIGINT          NOT NULL,
    user_id         BIGINT          NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (course_id, user_id),
    CONSTRAINT fk_cs_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_cs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 9. submissions
-- -----------------------------------------------------------
CREATE TABLE submissions (
    id                      BIGINT          AUTO_INCREMENT PRIMARY KEY,
    exercise_id             BIGINT          NOT NULL,
    graded_version_id       BIGINT          NOT NULL COMMENT 'Version used for grading (current at import time)',
    student_name            VARCHAR(128)    NOT NULL COMMENT 'From exported JSON — not FK to users',
    exercise_type           VARCHAR(20)     NOT NULL COMMENT 'BLOCKLY | PYTHON — denormalized for query efficiency',
    answer_data             MEDIUMTEXT      NOT NULL COMMENT 'Blockly XML or Python code',
    export_timestamp        DATETIME        NOT NULL COMMENT 'Timestamp from exported JSON file',
    version_mismatch        BOOLEAN         NOT NULL DEFAULT FALSE COMMENT 'True if student version != grading version',
    student_version_number  INT             COMMENT 'Version number from the exported file, if available',
    auto_score              DECIMAL(5,2)    COMMENT '0.00–100.00, NULL if grading failed',
    auto_grade_details      JSON            COMMENT 'Per-aspect or per-test-case breakdown',
    tutor_score             DECIMAL(5,2)    COMMENT '0.00–100.00, NULL if not manually graded',
    tutor_comment           TEXT,
    import_batch_id         VARCHAR(36)     COMMENT 'UUID grouping files from one import operation',
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_submissions_exercise_id (exercise_id),
    INDEX idx_submissions_student_name (student_name),
    INDEX idx_submissions_import_batch (import_batch_id),
    INDEX idx_submissions_duplicate_check (student_name, exercise_id, export_timestamp),
    CONSTRAINT fk_sub_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
    CONSTRAINT fk_sub_version FOREIGN KEY (graded_version_id) REFERENCES exercise_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 10. exercise_likes (P1)
-- -----------------------------------------------------------
CREATE TABLE exercise_likes (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    exercise_id     BIGINT          NOT NULL,
    user_id         BIGINT          COMMENT 'NULL if anonymous (not logged in)',
    browser_id      VARCHAR(128)    COMMENT 'Browser fingerprint for anonymous dedup',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_like_user (exercise_id, user_id),
    UNIQUE INDEX uk_like_browser (exercise_id, browser_id),
    CONSTRAINT fk_el_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
    CONSTRAINT fk_el_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 11. global_settings
-- -----------------------------------------------------------
CREATE TABLE global_settings (
    setting_key     VARCHAR(100)    PRIMARY KEY,
    setting_value   VARCHAR(1000)   NOT NULL,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data
INSERT INTO global_settings (setting_key, setting_value) VALUES
    ('course_filter_enabled', 'false');
