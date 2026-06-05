ALTER TABLE users
    ADD COLUMN expiration_date DATETIME NULL COMMENT 'NULL = never expires; when set and past, account is treated as expired' AFTER status;
