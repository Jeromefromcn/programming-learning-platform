ALTER TABLE submissions
  ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_submissions_is_deleted ON submissions (is_deleted);
