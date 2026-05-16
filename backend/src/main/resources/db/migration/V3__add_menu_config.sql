-- V3__add_menu_config.sql
-- Seeds the default per-role menu visibility config.
-- Valid section keys: exercises, progress, courses, categories, submissions, users, settings
INSERT INTO global_settings (setting_key, setting_value, updated_at)
VALUES (
  'menu_config',
  '{"STUDENT":["exercises","progress"],"TUTOR":["exercises","courses","categories","submissions"],"SUPER_ADMIN":["exercises","courses","categories","submissions","users","settings"]}',
  NOW()
)
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value),
  updated_at    = NOW();
