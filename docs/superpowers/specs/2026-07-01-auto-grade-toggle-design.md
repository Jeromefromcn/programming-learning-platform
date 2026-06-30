# Auto-Grade Toggle (rename `showResult` → `autoGrade`) — Design Spec

**Date:** 2026-07-01
**Branch:** main

## Summary

The exercise config field currently named `showResult` ("Show instant result feedback") was originally designed to mean "whether this exercise is auto-graded." Today it only controls front-end display: `BlocklyGrader`/`PythonGrader` run unconditionally on every student submission and every tutor import, regardless of this flag. This spec renames the field to `autoGrade` and makes it actually gate whether auto-grading runs, in both submission paths.

## Background

`exercise_versions.config` (JSON) already has two parallel grading concepts wired into the tutor authoring UI ([ExerciseFormPage.jsx](frontend/src/pages/tutor/ExerciseFormPage.jsx)):
- When the toggle is checked: tutor configures rule-based grading (`gradingRules.outputMatch`, `blockCountLimit`, Python `testCases`).
- When unchecked: tutor configures a `rubric.dimensions` instead, for manual tutor scoring via `SubmissionService.grade()` (`tutorScore`/`tutorGradeDetails`/`tutorComment`/`graded` fields on `Submission`).

The backend, however, never reads this flag for grading decisions:
- `StudentSubmissionService.submit()` always calls `blocklyGrader.grade()` / `pythonGrader.grade()`, then separately reads `showResult` only to decide what to put in the API response (`SubmitResultDto`).
- `FileImportService` always calls the graders with no check at all.

This means rubric-mode (manual-grading) exercises still trigger Rhino execution or a sandbox HTTP call on every submission/import, and pollute `grading_blockly_result_total` / `grading_python_result_total` with `no_rules_configured` outcomes (since `gradingRules.outputMatch.enabled` is never set in rubric mode).

`autoScore` being `null` is already a safe, handled state everywhere it's read (`SubmissionService` CSV export, `ImportBatchService`, `ProgressSubmissionDto` falls back to `tutorScore`), so gating the grader call introduces no null-handling gaps.

## Requirements

- Rename the config field from `showResult` to `autoGrade`. No backward-compat fallback for the old key — historical `exercise_versions.config` rows are migrated directly (per immutable-versions convention, this is a one-time data fix, not a runtime compat shim).
- `autoGrade: true` (or field missing/unparseable, for safety) → grading runs exactly as today.
- `autoGrade: false` → `BlocklyGrader`/`PythonGrader` are never called, for both:
  - `StudentSubmissionService.submit()` (student self-submission)
  - `FileImportService` (tutor batch import)
- `autoScore`/`autoGradeDetails` are `null` when auto-grading is skipped.
- The student-facing submit response (`SubmitResultDto.showResult` field — name unchanged) mirrors the same `autoGrade` value, preserving today's "Submitted" vs. pass/fail+score modal behavior with zero frontend logic changes in `BlocklyPracticePage.jsx`/`PythonPracticePage.jsx`.
- Tutor authoring UI checkbox label changes from "Show instant result feedback" to "Enable automatic grading"; underlying behavior (show grading-rules UI vs. rubric UI) is unchanged, only the bound config key changes.

## Schema Change

New migration `V13__rename_show_result_to_auto_grade.sql`, following the text-`REPLACE` pattern from `V9__add_data_section_to_menu_config.sql` (not MySQL-only `JSON_SET`/`JSON_REMOVE`, since tests run against H2 in `MODE=MySQL`, which doesn't support MySQL's native JSON functions):

```sql
UPDATE exercise_versions
SET config = REPLACE(config, '"showResult":', '"autoGrade":')
WHERE config LIKE '%"showResult":%';
```

Applies uniformly to both `BLOCKLY` and `PYTHON` configs since both use the same top-level key name.

## Backend Changes

### New: `AutoGradeConfigResolver`
A small shared component (`exercise/grading` package, alongside `BlocklyGrader`/`PythonGrader`/`GradingMetrics`) so the JSON-reading logic isn't duplicated between `StudentSubmissionService` and `FileImportService`:

```java
@Component
@RequiredArgsConstructor
public class AutoGradeConfigResolver {
    private final ObjectMapper objectMapper;

    public boolean isEnabled(String configJson) {
        try {
            JsonNode config = objectMapper.readTree(configJson);
            if (config.isTextual()) config = objectMapper.readTree(config.asText());
            JsonNode node = config.get("autoGrade");
            return node == null || node.asBoolean(true);
        } catch (Exception e) {
            return true;
        }
    }
}
```

### `StudentSubmissionService.submit()`
- Remove the private `showResult(String)` method; inject `AutoGradeConfigResolver` instead.
- Compute `boolean autoGrade = autoGradeConfigResolver.isEnabled(version.getConfig())` once, before the grading branch.
- Only call `blocklyGrader.grade(...)` / `pythonGrader.grade(...)` when `autoGrade` is true; otherwise `autoScore = null`, `autoGradeDetails = null`.
- `SubmitResultDto` is built using `autoGrade` directly in place of the old `showResult` local variable (response field name unchanged).

### `FileImportService`
- Inject `AutoGradeConfigResolver`.
- Before the `if ("BLOCKLY".equals(exerciseType))` / `else if ("PYTHON"...)` branch, compute `autoGrade` from `currentVersion.getConfig()`.
- When `autoGrade` is false: skip both grader calls, set `autoScore = null`, `autoGradeDetails = null`. The "Unknown exercise type" error branch is unaffected (type validation still happens regardless of `autoGrade`).

## Frontend Changes

- `ExerciseFormPage.jsx`: `EMPTY_BLOCKLY_CONFIG`/`EMPTY_PYTHON_CONFIG` default `showResult: true` → `autoGrade: true`; form-validation check (rubric-required-when-manual) keys off `activeConfig.autoGrade`; checkbox `checked`/`onChange` bind to `autoGrade`; conditional render (grading-rules UI vs. `RubricEditor`) keys off `autoGrade`; label text → "Enable automatic grading".
- `SubmissionDetailPage.jsx`: `config.showResult === false` → `config.autoGrade === false` (decides whether the tutor review page shows rubric-dimension inputs or a single score field).
- `BlocklyPracticePage.jsx` / `PythonPracticePage.jsx`: **no change** — both read `submitResult.showResult` from the API response, which keeps its name.

## Out of Scope

- New Prometheus metrics/outcome labels for "skipped — manual grading mode." The `no_rules_configured` Blockly outcome and overall throughput on the Grading Pipeline dashboard will drop for rubric-mode exercises now that the grader is never invoked for them — this is an expected, intentional change in what the dashboard measures (it now reflects only real auto-grading load), not a regression.
- Any change to the manual-grading flow itself (`SubmissionService.grade()`, `GradeRequest`, rubric scoring) — already works correctly and is unaffected.
- Backward-compatible reading of the old `showResult` key.

## Tests

### Backend
- `AutoGradeConfigResolverTest` (new): returns `true` for `{"autoGrade":true}`, `{"autoGrade":false}` → `false`, missing key → `true` (default), malformed JSON → `true` (default), double-encoded (textual) config → parses correctly.
- `StudentSubmissionServiceTest`: extend/add cases — `autoGrade:false` exercise → `submit()` never invokes `blocklyGrader`/`pythonGrader` (verify zero interactions), saved `Submission.autoScore`/`autoGradeDetails` are `null`, response `showResult` is `false` with `score`/`passed` both `null`. Existing `autoGrade:true` (or field-absent) cases continue to assert grading runs.
- `FileImportServiceTest`: extend/add cases mirroring the above for the import path — `autoGrade:false` exercise import results in `autoScore = null` and zero grader invocations; existing `autoGrade:true` import tests still pass with the renamed config key.
- Migration test or manual verification: a `V13` migration test (or extending existing Flyway migration test coverage if present) confirming `{"showResult":true,...}` becomes `{"autoGrade":true,...}` and `{"showResult":false,...}` becomes `{"autoGrade":false,...}`.

### Frontend
- `ExerciseFormPage.test.jsx`: update existing `showResult` assertions to `autoGrade`; checkbox `getByRole('checkbox', { name: /Enable automatic grading/ })`.
- `SubmissionDetailPage.test.jsx`: update `config.showResult` fixtures to `config.autoGrade`.
- `BlocklyPracticePage.test.jsx` / `PythonPracticePage.test.jsx` / `studentApi.test.js`: no change needed (response field name `showResult` is preserved).
