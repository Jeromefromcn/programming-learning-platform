UPDATE exercise_versions
SET config = REPLACE(config, '"showResult":', '"autoGrade":')
WHERE config LIKE '%"showResult":%';
