ALTER TABLE submissions
  ADD COLUMN workspace_xml MEDIUMTEXT NULL
  COMMENT 'Blockly workspace XML for visual replay; null for pre-V6 submissions';
