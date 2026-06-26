# Design — Student Save Draft & Submit (with tutor result-visibility toggle)

Date: 2026-06-26
Status: Approved (pending spec review)

## Goal

Let authenticated students, while practicing an exercise:

1. **Save a working draft** of the current workspace and resume it later.
2. **Submit** an answer and immediately learn whether it is correct (score + pass/fail).

Tutors can toggle, per exercise, whether the immediate correctness result is shown to
students. Student submissions must be kept separate from tutor-imported submissions.

## Decisions (from brainstorming)

- **Identity:** logged-in `STUDENT` accounts only (tied to `users.id`). The existing
  anonymous file-export flow is unchanged and out of scope.
- **Draft model:** one draft per `(student, exercise)`, manual save, overwrite.
- **Correctness:** server-side auto-grading (reusing existing graders); student sees
  **score + pass/fail** (not per-test-case breakdown).
- **Tutor toggle off:** student can still submit; the server still grades and stores the
  result for the tutor, but the student does not see score/pass.
- **History:** keep **all** student submission attempts.
- **Separation:** same `submissions` table + a `source` discriminator column.

## Why server-side grading

Grading config (`gradingRules`, hidden `testCases`) is stripped from the student detail
DTO (`StudentExerciseService.stripConfig`), so it is not available in the browser.
"Immediately know if correct" must therefore be a server-side grade call. Both graders
already expose `grade(studentCode, configJson) -> Result(autoScore, autoGradeDetailsJson)`
and are reused directly (`BlocklyGrader`, `PythonGrader`).

## Section 1 — Data model

### New table `exercise_drafts` (one draft per student per exercise)

```
id            BIGINT PK
user_id       BIGINT NOT NULL  -> FK users(id)
exercise_id   BIGINT NOT NULL  -> FK exercises(id)
exercise_type VARCHAR(20) NOT NULL        -- BLOCKLY | PYTHON
answer_data   MEDIUMTEXT                  -- Python code (restore editor)
workspace_xml MEDIUMTEXT                  -- Blockly DOM (restore blocks)
updated_at    DATETIME NOT NULL
UNIQUE (user_id, exercise_id)             -- upsert / overwrite on save
```

### Alter `submissions` (separate student submissions from imports)

```
ADD source   VARCHAR(20) NOT NULL DEFAULT 'IMPORT'   -- existing rows become IMPORT
ADD user_id  BIGINT NULL  -> FK users(id)            -- set for STUDENT, null for IMPORT
ADD INDEX idx_sub_user_exercise (user_id, exercise_id, created_at)
```

Student submission rows: `source='STUDENT'`, `user_id` set, `import_batch_id` null,
`version_mismatch=false` (always graded against the current version),
`export_timestamp=created_at`.

### Tutor toggle

Stored as a top-level `config.showResult` boolean inside `exercise_versions.config`
(default `true` when absent). Versioned naturally with the exercise; no schema change.
It survives student-side config stripping (which only removes `gradingRules` and hidden
`testCases`), so the student frontend can read it.

*Alternative considered:* a dedicated `show_result` column on the version. Rejected
because tutors already submit `config` as one `JsonNode` and the config-JSON approach
needs no migration and survives stripping for free.

## Section 2 — Backend API & grading

All student endpoints require the `STUDENT` role (higher roles inherit).

### Draft endpoints

- `GET /v1/student/exercises/{id}/draft`
  -> `{ answerData, workspaceXml, updatedAt }`, or `204 No Content` if none.
- `PUT /v1/student/exercises/{id}/draft`
  body `{ answerData?, workspaceXml? }` -> upsert (overwrite). Returns the saved draft.

### Submit endpoints

- `POST /v1/student/exercises/{id}/submissions` body `{ answerData, workspaceXml? }`:
  1. Load exercise + current version. Reject if not `PUBLISHED` / not found
     (`EXERCISE_NOT_FOUND`).
  2. Validate answer non-blank, else `VALIDATION_ERROR`.
  3. Grade server-side, reusing `BlocklyGrader.grade()` / `PythonGrader.grade()` with the
     **full** `config` (hidden rules / test cases).
  4. Persist a `submissions` row (`source=STUDENT`, `user_id`, `auto_score`,
     `auto_grade_details`).
  5. Read `config.showResult` and build the response:
     - `showResult=true`  -> `{ submissionId, showResult: true, score, passed }`
       where `passed = (score != null && score >= 100)`.
     - `showResult=false` -> `{ submissionId, showResult: false }`.
  - The response **never** includes `auto_grade_details` or hidden test cases — only
    `score` + `passed`.
- `GET /v1/student/exercises/{id}/submissions`
  -> the requesting student's own attempt history for this exercise (filtered to their own
  `user_id`). Score visibility per item respects `showResult`.

### Rate limiting

- Submit runs sandboxed execution (nsjail / Rhino) and gets its own limit:
  **20/min per user**.
- Draft save uses the general **60/min per user** limit.

### Tutor side (separation)

- The existing tutor submission list (`SubmissionController`) gains a `source` filter,
  **defaulting to `IMPORT`** so existing import-grading screens are unchanged. Tutors can
  pass `source=STUDENT` to view student submissions. Grading and CSV export work on both
  sources unchanged.

## Section 3 — Frontend & tutor authoring

### Student practice pages (`BlocklyPracticePage.jsx`, `PythonPracticePage.jsx`)

- On mount: `GET .../draft`; if present, restore (Blockly from `workspaceXml`, Python from
  `answerData`).
- **保存 (Save)** button -> `PUT .../draft` with the current workspace; toast "已保存".
- **提交 (Submit)** button -> `POST .../submissions`. On response:
  - `showResult: true`  -> result modal showing score + 通過/未通過 badge.
  - `showResult: false` -> toast "已提交".
- Existing **Export** flow is untouched.

### Tutor authoring form (exercise create / edit)

- Add a **「即時提示是否做對」** checkbox -> writes `config.showResult` (default checked);
  reads back from `config.showResult` on edit.

### Tutor submission list

- Add a source filter control (Imported / Student), defaulting to Imported.

## Edge cases

- `showResult` absent (legacy exercises) -> treated as `true`.
- Submit always grades against the **current** version -> no version mismatch.
- Empty answer -> `VALIDATION_ERROR`.
- Draft stores blocks/code only (version-agnostic) -> safe across tutor edits.
- Disabled user / auth -> existing per-request DB status check applies.

## Testing (TDD)

Backend:
- Draft upsert overwrites and is isolated per user.
- Submit grades, persists a row with `source=STUDENT` and `user_id`.
- `showResult=false` hides score in both the submit response and the history response.
- Hidden grading details never leak in any student response.
- Tutor submission list `source` filter (default `IMPORT`).
- Submit rate limit (20/min per user).

Frontend:
- Draft restore on mount (Blockly and Python).
- Save and Submit buttons issue the correct calls.
- Result modal vs silent toast driven by `showResult`.
