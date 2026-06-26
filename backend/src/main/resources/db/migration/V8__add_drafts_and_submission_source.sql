-- One draft per (student, exercise); overwrite on save.
CREATE TABLE exercise_drafts (
    id            BIGINT          AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT          NOT NULL,
    exercise_id   BIGINT          NOT NULL,
    exercise_type VARCHAR(20)     NOT NULL COMMENT 'BLOCKLY | PYTHON',
    answer_data   MEDIUMTEXT      COMMENT 'Python code (restore editor)',
    workspace_xml MEDIUMTEXT      COMMENT 'Blockly DOM (restore blocks)',
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_draft_user_exercise (user_id, exercise_id),
    CONSTRAINT fk_draft_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_draft_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Distinguish student submissions from tutor imports. Existing rows are imports.
ALTER TABLE submissions
    ADD COLUMN source  VARCHAR(20) NOT NULL DEFAULT 'IMPORT' COMMENT 'STUDENT | IMPORT';

ALTER TABLE submissions
    ADD COLUMN user_id BIGINT      NULL COMMENT 'FK users(id); set for STUDENT source';

ALTER TABLE submissions
    ADD CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id);

CREATE INDEX idx_sub_user_exercise ON submissions (user_id, exercise_id, created_at);
