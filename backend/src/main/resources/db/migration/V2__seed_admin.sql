-- Default SUPER_ADMIN account for first login.
-- Username: admin  Password: admin123
-- Change the password immediately after first login.
INSERT INTO users (username, display_name, password_hash, role, status, created_at, updated_at)
VALUES ('admin', 'Administrator', '$2b$12$9dGPsQ4LGq5MQYZfm2qLPO4oHJTv6se.G8Cyake7G0EfbHjPeQZKi', 'SUPER_ADMIN', 'ACTIVE', NOW(), NOW());
