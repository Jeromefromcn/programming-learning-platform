ALTER TABLE submissions
    ADD COLUMN student_active_key VARCHAR(160) NULL COMMENT 'STUDENT:{exerciseId}:{userId} on the active STUDENT submission for that exercise+user; NULL otherwise. Backs a concurrency-safe uniqueness guard.';

ALTER TABLE submissions
    ADD COLUMN import_active_key VARCHAR(160) NULL COMMENT 'IMPORT:{exerciseId}:{studentName} on the active IMPORT submission for that exercise+student; NULL otherwise. Backs a concurrency-safe uniqueness guard.';

ALTER TABLE submissions
    ADD UNIQUE INDEX uk_submissions_student_active (student_active_key);

ALTER TABLE submissions
    ADD UNIQUE INDEX uk_submissions_import_active (import_active_key);
