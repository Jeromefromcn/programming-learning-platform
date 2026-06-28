# Multi-Dimensional Grading & Batch Management — Design Spec

**Date:** 2026-06-28
**Feature:** Rubric-based manual grading, import batches (Group Submission), grade export, My Progress rebuild
**Status:** Draft (pending user review)

---

## Context

Today every exercise grades the same way: a single 0–100 score (auto from `showResult` config, optionally overridden by a tutor). This feature splits exercises into two grading modes and reorganizes the import/grade/export/progress flow around them.

- **Instant-feedback exercises** (`showResult = true`): keep the current auto-grading config and the current single 0–100 manual override on the grading page. **No change to their behavior.**
- **Manual-rubric exercises** (`showResult = false`): the tutor defines weighted scoring **dimensions** at authoring time; at grading time the tutor scores each dimension 0–100 and the system computes a weighted final score.

Around this, four things change: a new **Group Submission** page that owns import and lists import batches, a per-batch **grade export**, a **graded** status surfaced on submissions, and a **rebuilt My Progress** page that shows only the student's own (submitted or imported-and-matched) submissions.

### Decisions locked during brainstorming

1. Rubric editor appears when "Show instant result feedback" is **unchecked**. (The original note had grading-page dimension scoring on the checked branch — that was a typo; it belongs to the unchecked/rubric branch.)
2. Instant-feedback exercises keep the existing single 0–100 manual override on the grading page — unchanged.
3. Import batches get a **friendly incremental id** via a new `import_batches` table.
4. **"Graded" = a tutor has saved a grade** (either mode). Surfaced as a status chip and used for the export completeness check.
5. Export columns: raw `student_name` **+** display name (from the matched user) + exercise title + per-dimension name/weight/score + total. **Long format** (one row per submission × dimension).
6. **Import is atomic with a username pre-flight gate.** Each file's `studentName` must match a `users.username`. If *any* file is unmatched (or otherwise invalid), **nothing is imported** — the response reports exactly which files/rows failed, and the tutor fixes and re-imports.
7. **My Progress** is rebuilt to list only submissions where `user_id = me`; the old per-exercise overview is removed.

---

## Data Model (Flyway `V10`)

### New table `import_batches`

```sql
CREATE TABLE import_batches (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,  -- friendly import id
    uuid            VARCHAR(36) NOT NULL,               -- correlates with force-import cache
    imported_by     BIGINT      NULL,                   -- tutor user id
    file_count      INT         NOT NULL DEFAULT 0,
    imported_count  INT         NOT NULL DEFAULT 0,
    duplicate_count INT         NOT NULL DEFAULT 0,
    failed_count    INT         NOT NULL DEFAULT 0,
    created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX uk_import_batches_uuid (uuid),
    CONSTRAINT fk_batch_user FOREIGN KEY (imported_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### `submissions` additions

```sql
ALTER TABLE submissions
    ADD COLUMN batch_id            BIGINT  NULL COMMENT 'FK import_batches(id); IMPORT source only',
    ADD COLUMN tutor_grade_details JSON    NULL COMMENT 'Per-dimension scores [{name,weight,score}] for rubric exercises',
    ADD COLUMN graded              BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'A tutor has saved a grade',
    ADD CONSTRAINT fk_sub_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id);

CREATE INDEX idx_sub_batch ON submissions (batch_id);
```

`user_id` (already present from V8) is now populated on import via username match.

> Note: existing imported rows keep `import_batch_id` (UUID) but have `batch_id = NULL` and `graded = FALSE`. They will not appear in any My Progress (matched by `user_id`) nor under a friendly batch id — acceptable, since old progress data is being replaced.

---

## Exercise Config Schema

`exercise_versions.config` gains a `rubric` block, used **only when `showResult = false`**:

```json
"rubric": {
  "dimensions": [
    { "name": "Correctness", "weight": 0.6 },
    { "name": "Code style",  "weight": 0.4 }
  ]
}
```

Validation (frontend + backend on save):
- At least one dimension.
- Each `name` non-empty; names unique within the exercise.
- Each `weight` a number with `0 < weight ≤ 1`.
- `Σ weight = 1` (compare with a small epsilon, e.g. `abs(sum - 1) < 1e-6`, to absorb float drift).
- Violation → block save, `VALIDATION_ERROR`.

When `showResult = true`, `rubric` is absent/ignored.

---

## Frontend

### 1. Exercise form — `ExerciseFormPage.jsx`

Below the existing "Show instant result feedback" checkbox:
- **Checked** → render the current grading config (Blockly grading rules / Python test cases). Unchanged.
- **Unchecked** → render a new **`RubricEditor`** component (used for both Blockly and Python):
  - Rows of `{ name, weight }`, add/remove buttons, starts empty.
  - Live "Total weight: X.XX" indicator; red when `≠ 1`.
  - Submit blocked with an inline error until valid.

Config assembly in `handleSubmit`: include `rubric` only when `showResult === false`; strip it otherwise.

### 2. Grading page — `SubmissionDetailPage.jsx`

Branch on whether the graded version's config has a `rubric`:
- **No rubric (auto/instant)** → current UI unchanged (single 0–100 + comment).
- **Rubric present** → render one 0–100 input per dimension (label shows weight). On save:
  - Validate each dimension score is a number in `[0, 100]`.
  - `finalScore = round2(Σ score_i × weight_i)`.
  - Send `{ dimensionScores: [{name, weight, score}], tutorComment }`.
- Show a **"Tutor Graded"** chip whenever `submission.graded` is true, in both modes.

### 3. Group Submission page (new) — `GroupSubmissionPage.jsx`

Route: `/tutor/group-submissions` (added to tutor nav; "Import Files" removed from the Submissions page).
- **Import Files** button → existing import UI (moved here; same drop zone / `SubmissionImportPage` content, relocated).
- Table of batches (`import_batches`): import id, created date, file/imported/duplicate/failed counts, **graded status** badge:
  - `ALL` — every non-failed submission in the batch has `graded = true`
  - `PARTIAL` — some graded
  - `NONE` — none graded
- Filters: import id (text/number) + graded status (All / Fully graded / Not fully graded).
- Per-row **Export** button:
  - If not fully graded → `confirm("N of M submissions graded. Export anyway?")`; on confirm, export.
  - If fully graded → export directly.

### 4. Submissions list — `SubmissionListPage.jsx`

Add a **"Graded"** column (chip: "Tutor Graded" / "—") driven by `submission.graded`. Remove the "Import Files" button (now on Group Submission). Keep existing student-name / exercise / source filters.

### 5. My Progress — `ProgressPage.jsx` (rebuild)

Replace the per-exercise overview entirely with a list of the **student's own submissions** (`user_id = me`, not deleted; both STUDENT and matched IMPORT sources). Columns: exercise title, type, **source** (Submitted / Imported), score, graded status, date. Row click → **read-only** answer view:
- Blockly → `BlocklySubmissionViewer` (read-only) + a **Run** button using the existing `blockly-runner` worker.
- Python → Monaco read-only + a **Run** button using the existing `pyodide-runner` worker.
- No editing, no submitting.

---

## Backend

### Import (atomic, two-phase) — `FileImportService` / `SubmissionService`

`POST /api/v1/submissions/import` becomes a **validate-then-commit** flow:

1. **Phase 1 — validate (no writes):** parse every file (and ZIP entry). For each, run existing schema validation **plus** username resolution: `users.findByUsername(studentName)`. Collect failures with a stable identifier (filename, and ZIP entry path / row).
2. **Gate:** if any file fails schema validation or username resolution → **abort, persist nothing**, return `{ ok: false, problems: [{ file, reason }], unmatchedNames: [...] }`. UI shows "Fix these and re-import."
3. **Phase 2 — commit:** all valid → create one `import_batches` row, then save all submissions with `user_id` set from the matched user and `batch_id` set. Duplicate handling keeps the existing per-file `DUPLICATE` + force-import path (force-import attaches to the same batch).

> Duplicates are not a hard-abort condition (existing force-import UX stays). The hard-abort gate is specifically schema/username validation failures.

### Grading — `SubmissionService.grade`

`GradeRequest` accepts either shape:
- Auto mode: `{ tutorScore, tutorComment }` (unchanged).
- Rubric mode: `{ dimensionScores: [{name, weight, score}], tutorComment }`.

On rubric save: validate each score ∈ [0,100] and that dimension names/weights match the graded version's rubric; compute `tutorScore = round2(Σ score×weight)`; persist `tutorScore`, `tutorComment`, `tutorGradeDetails` (JSON), `graded = true`. On auto save: set `tutorScore`, `tutorComment`, `graded = true`.

### Batch export — `SubmissionService.exportBatchCsv(batchId, response)`

`GET /api/v1/import-batches/{id}/export` → CSV, **long format**:

| Column | Source |
|--------|--------|
| Student Name | `submission.student_name` |
| Display Name | matched `user.display_name` (blank if unmatched) |
| Exercise Title | exercise title |
| Dimension | dimension name (blank for auto-type) |
| Weight | dimension weight (blank for auto-type) |
| Dimension Score | tutor's per-dimension score (blank for auto-type) |
| Total Score | `tutor_score` (or `auto_score` if no tutor score) |

One row per submission × dimension; auto-type or ungraded submissions emit a single row with blank dimension columns. Export works regardless of graded completeness (frontend handles the confirm).

### Batch listing — new `ImportBatchController` / service

`GET /api/v1/import-batches?page&size&id&gradedStatus` → batches with counts and a derived `gradedStatus` (ALL/PARTIAL/NONE) computed from member submissions' `graded`.

### My Progress — `StudentProgressService`

Replace `findByStudentNameAndDeletedFalse(displayName)` + per-exercise rollup with a paginated query of submissions `WHERE user_id = :userId AND is_deleted = false ORDER BY created_at DESC`. Return list items: exercise title, type, source, score (`tutorScore ?? autoScore`), `graded`, `createdAt`, plus `answerData` / `workspaceXml` for the read-only viewer. Old summary/overview DTOs are removed.

---

## Error Handling

- Rubric weights not summing to 1, or out-of-range scores → `VALIDATION_ERROR` (no save).
- Import with any unmatched username / invalid file → `IMPORT_FILE_INVALID` (or a structured 200 body listing problems — see open item) — **no rows written**.
- Export of a non-existent batch → 404.
- Grading a deleted/missing submission → `SUBMISSION_NOT_FOUND` (existing).

---

## Testing (TDD)

Backend:
- Rubric config validation (sum=1, ranges, uniqueness).
- Import gate: one unmatched username aborts the whole batch; nothing persisted; problems reported.
- Import success: batch row created, `user_id` + `batch_id` populated.
- Rubric grade: weighted `tutorScore`, `tutorGradeDetails` stored, `graded=true`.
- Auto grade: unchanged behavior, `graded=true`.
- Batch graded-status derivation (ALL/PARTIAL/NONE).
- Batch CSV: long format, display name resolution, auto-type rows.
- My Progress: only `user_id = me`, both sources, pagination.

Frontend:
- `RubricEditor`: add/remove, live sum, error gating.
- Grading page branches by rubric presence; weighted total preview.
- Group Submission: filters, export confirm when partial.
- Submissions list: graded column.
- My Progress: list + read-only run, no edit.

---

## Open Items (resolve at implementation)

1. Import-failure response shape: reuse `IMPORT_FILE_INVALID` error envelope vs. a 200 body with a `problems[]` array. Leaning toward a structured 200 body so the UI can render a per-file fix list (the existing import response already returns per-file results).
2. Exact tutor nav placement/label for "Group Submission".
3. Whether `RubricEditor` lives as a shared component or inline in `ExerciseFormPage`.
