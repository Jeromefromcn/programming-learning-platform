-- V3__add_menu_config.sql
-- Add menu configuration to global_settings for role-based navigation
INSERT INTO global_settings (setting_key, setting_value, updated_at) VALUES (
  'menu_config',
  '{"STUDENT":["exercises","progress"],"TUTOR":["exercises","courses","categories","submissions"],"SUPER_ADMIN":["exercises","courses","categories","submissions","users","settings"]}',
  NOW()
);
