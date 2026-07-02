ALTER TABLE exercises
    ADD COLUMN deadline DATETIME NULL COMMENT 'Optional submission deadline; NULL = no deadline' AFTER status;
