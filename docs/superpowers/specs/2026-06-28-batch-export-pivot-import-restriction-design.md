# Batch Export Pivot & Single-Exercise Import Restriction

**Date:** 2026-06-28
**Branch:** feature/multidimensional-grading-batches

## Overview

Two related changes to the group-submission (import batch) workflow:

1. **Export pivot** — batch CSV export produces one row per submission with dynamic dimension columns instead of one row per dimension.
2. **Import restriction** — all files in a single import batch must belong to the same exercise; mixed batches are rejected before any writes.

These changes are complementary: the restriction guarantees a batch is always single-exercise, which makes it safe to build a consistent per-batch CSV header from the exercise's rubric config.

---

## Feature 1 — Single-Exercise Import Restriction

### Where

`SubmissionService.importFiles()` — between the existing phase 1 validation pass and phase 2 commit.

### Logic

After all files are validated (schema + username checks pass), extract `exerciseId` from each parsed JSON file. Collect distinct IDs. If more than one distinct ID is found, abort immediately:

- No `ImportBatch` row is created.
- No submissions are written.
- Return `ImportResponseDto.validationFailed(problems)` with one `ImportProblemDto` per offending file.

The first exerciseId encountered is treated as the expected value. Every file with a different exerciseId gets a problem entry:

```
filename: "alice.json" → "Exercise mismatch: this file belongs to exercise #3, but the batch expects exercise #1"
```

### Error presentation

Uses the existing `validationFailed` response shape. The frontend's red problem block renders this with no changes.

### What does NOT change

- Files with a missing or unparseable `exerciseId` are already caught earlier by the required-fields check (`REQUIRED_FIELDS` list includes `"exerciseId"`).
- The force-import path (`forceImport`) is unaffected — it operates on a single cached file, not a new batch.

---

## Feature 2 — Export Pivot (One Row per Submission)

### Where

`ImportBatchService.exportBatchCsv()`.

### Current behaviour

One row per dimension per submission (rubric mode), or one row per submission with empty dimension columns (instant-feedback mode). Header is always fixed: `Student Name, Display Name, Exercise Title, Dimension, Weight, Dimension Score, Total Score`.

### New behaviour

#### Header construction

1. Load all non-deleted submissions for the batch.
2. Get `exerciseId` from the first submission.
3. Look up the exercise's current `ExerciseVersion` → parse `config` JSON → read `rubric.dimensions[]`.
4. Each dimension entry has `name` (String) and `weight` (double, 0–1).

**Rubric mode** (dimensions list non-empty):

```
Student Name, Display Name, Exercise Title, "Logic (40%)", "Clarity (30%)", "Efficiency (30%)", Total Score
```

Weight formatting: `(int) Math.round(weight * 100)` → `"40%"`.

**Instant-feedback mode** (empty or absent dimensions):

```
Student Name, Display Name, Exercise Title, Total Score
```

#### Row construction

For each submission:
- Parse `tutorGradeDetails` JSON array `[{name, weight, score}]` into `Map<String, Double>` keyed by dimension name.
- Write one CSV row. For each dimension column, look up the score by name; write empty string if the submission is not yet graded or the dimension is missing from the grade details.
- `Total Score` = `tutorScore` if non-null, else `autoScore`, else empty string.

### Edge cases

| Case | Handling |
|------|----------|
| Batch has no submissions | Empty CSV body, no header output needed (stream is empty) |
| Exercise deleted | `exerciseRepository.findById()` returns empty → no dimensions → instant-feedback header |
| Submission ungraded | Dimension cells are empty; Total Score is empty |
| Dimension name in gradeDetails doesn't match config | Score for that cell is empty (lookup miss) |

---

## Testing

### Import restriction (`SubmissionServiceTest` or new `SubmissionImportRestrictionTest`)

- **Happy path:** two files with same `exerciseId` → no restriction problem, batch proceeds normally.
- **Mixed batch:** two files with different `exerciseIds` → `validationFailed` returned, problems list contains one entry per mismatched file, no `ImportBatch` row persisted, no submissions written.
- **Single file:** always passes the restriction check.

### Export pivot (`ImportBatchServiceTest`)

- **Rubric case:** build submissions with `tutorGradeDetails`, mock exercise config with 2 dimensions → verify CSV has exactly `4 + N` columns (Student Name, Display Name, Exercise Title, N dim columns, Total Score), verify one row per submission.
- **Instant-feedback case:** submissions without `tutorGradeDetails`, exercise config with empty dimensions → verify header is `Student Name, Display Name, Exercise Title, Total Score`.
- **Ungraded submission:** `tutorGradeDetails` null, `tutorScore` null, `autoScore` null → dimension cells and Total Score are empty strings.
- **Partially graded batch:** mix of graded and ungraded → verify each row is independent.

Existing `exportBatchCsv` tests must be updated to match new header and row format.

---

## Files to Change

| File | Change |
|------|--------|
| `SubmissionService.java` | Add exerciseId uniqueness check between phase 1 and phase 2 |
| `ImportBatchService.java` | Rewrite `exportBatchCsv` — dynamic header, one row per submission |
| `ImportBatchServiceTest.java` | Update existing export tests, add new pivot cases |
| `SubmissionServiceTest.java` (or new test class) | Add import restriction tests |

No schema changes. No frontend changes.
