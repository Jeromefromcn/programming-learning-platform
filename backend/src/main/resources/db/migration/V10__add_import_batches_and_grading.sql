CREATE TABLE import_batches (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36)  NOT NULL,
    imported_by     BIGINT       NULL,
    file_count      INT          NOT NULL DEFAULT 0,
    imported_count  INT          NOT NULL DEFAULT 0,
    duplicate_count INT          NOT NULL DEFAULT 0,
    failed_count    INT          NOT NULL DEFAULT 0,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX uk_import_batches_uuid (uuid),
    CONSTRAINT fk_batch_user FOREIGN KEY (imported_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE submissions
    ADD COLUMN batch_id BIGINT NULL COMMENT 'FK import_batches(id); IMPORT source only';

ALTER TABLE submissions
    ADD COLUMN tutor_grade_details JSON NULL COMMENT 'Per-dimension scores [{name,weight,score}]';

ALTER TABLE submissions
    ADD COLUMN graded BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Tutor has saved a grade';

ALTER TABLE submissions
    ADD CONSTRAINT fk_sub_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id);

CREATE INDEX idx_sub_batch ON submissions (batch_id);
