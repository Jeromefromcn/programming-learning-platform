-- V9__add_data_section_to_menu_config.sql
-- Appends the "data" section to the SUPER_ADMIN menu config for existing deployments.
-- The WHERE guard makes this idempotent: it only matches the old value (without "data").
UPDATE global_settings
SET    setting_value = REPLACE(
           setting_value,
           '"users","settings"]}',
           '"users","settings","data"]}'
       ),
       updated_at = NOW()
WHERE  setting_key = 'menu_config'
  AND  setting_value LIKE '%"users","settings"]}';
