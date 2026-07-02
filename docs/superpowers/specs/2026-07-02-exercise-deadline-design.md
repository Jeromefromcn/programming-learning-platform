# Exercise Deadline — Design Spec

**Date:** 2026-07-02
**Branch:** main

## Summary

Exercises have no notion of a submission deadline today. This spec adds an optional `deadline` (date + time) to each exercise. Once passed, students can no longer submit that exercise through the platform, but tutors can still batch-import files for it at any time — matching the existing precedent that tutor import already bypasses student-facing gates (e.g. the `PUBLISHED` status check).

## Background

- `Exercise.java` currently has no date/deadline field; `exercise_versions.config` (JSON) is exercise *version* content (grading rules, rubric) and is not the right place for operational metadata like a deadline, since editing it would force a new immutable version on every deadline change (per CLAUDE.md's immutable-versions rule). A deadline belongs on `Exercise` directly, alongside `status`/`categoryId`, which are already mutable exercise-level fields.
- The only gate on student submission today is in `StudentSubmissionService.submit()`:
  ```java
  Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
      .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
      .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
  ```
- `FileImportService.processSingleFile()` looks up the exercise with `exerciseRepository.findByIdAndDeletedFalse(exerciseId).orElse(null)` — it doesn't even filter by `PUBLISHED`, confirming tutor import already bypasses the one student-facing gate that exists today. A new deadline check follows the same precedent: student path only.
- Latest Flyway migration is `V13__rename_show_result_to_auto_grade.sql`; this spec adds `V15`.

## Requirements

- `deadline` is optional (nullable) per exercise. No deadline set → unrestricted submission, exactly like today. Existing exercises get `NULL` (no backfill needed).
- `deadline` is a specific date+time (not date-only), consistent with CLAUDE.md's `dd/MM/yyyy HH:mm` user-facing format for dates that carry a time component.
- Tutors set/edit `deadline` on the exercise create/edit form; it is **not** part of `exercise_versions.config` and does not trigger a new version.
- Once `LocalDateTime.now()` is after the deadline, `StudentSubmissionService.submit()` rejects the submission with a new error, `EXERCISE_DEADLINE_PASSED` (409 Conflict). No row is written.
- `FileImportService` (tutor batch import) is **not** gated by the deadline — tutors can import at any time, before or after.
- Students see the deadline on the exercise practice page and the Submit button is disabled (with an explanatory message) once it has passed, as a frontend UX precaution — the backend check remains the actual enforcement point (the frontend check alone is not trustworthy, since a stale page load could otherwise allow a client to attempt a submit past the deadline).

## Schema Change

New migration `V15__add_exercise_deadline.sql`:
```sql
ALTER TABLE exercises
    ADD COLUMN deadline DATETIME NULL COMMENT 'Optional submission deadline; NULL = no deadline' AFTER status;
```

## Backend Changes

### `Exercise.java`
Add:
```java
@Column(name = "deadline")
private LocalDateTime deadline;
```

### `CreateExerciseRequest` / `UpdateExerciseRequest`
Add optional `LocalDateTime deadline` field (no validation constraint beyond standard `@NotNull`-free optionality — any value, past or future, is accepted; a past deadline is a valid tutor choice, e.g. to immediately close submissions).

### `ExerciseService.java`
- `createExercise`: persist `request.deadline()` onto the new `Exercise` (defaults to `null` if omitted).
- `updateExercise`: persist `request.deadline()` onto the existing `Exercise` (allows clearing it back to `null`).

### `ErrorCode.java`
Add `EXERCISE_DEADLINE_PASSED(HttpStatus.CONFLICT)`.

### `StudentSubmissionService.submit()`
Immediately after the existing `PUBLISHED` filter/`orElseThrow`, add:
```java
if (exercise.getDeadline() != null && LocalDateTime.now().isAfter(exercise.getDeadline())) {
    throw new PlatformException(ErrorCode.EXERCISE_DEADLINE_PASSED,
        "The submission deadline for this exercise has passed.");
}
```

### `FileImportService.processSingleFile()`
No change — deadline is intentionally not checked here.

### `StudentExerciseDetailDto.java`
Add `LocalDateTime deadline` field, populated from `Exercise.getDeadline()` in `StudentExerciseService` wherever this DTO is built.

## Frontend Changes

### `ExerciseFormPage.jsx` (tutor create/edit)
- Add a `deadline` field to form state, initialized from the loaded exercise when editing (or `''`/unset when creating).
- Render a `datetime-local` input near the existing Title/Difficulty/Category fields, labeled "Deadline (optional)".
- Include `deadline` (or `null` if left blank) in the create/update request payload.

### Student practice pages (`ExercisePracticeRouter.jsx` and/or `BlocklyPracticePage.jsx` / `PythonPracticePage.jsx`)
- Read `exercise.deadline` from `StudentExerciseDetailDto`.
- If present, display it near the exercise title using `formatDateTime` (`dd/MM/yyyy HH:mm`, per CLAUDE.md).
- If `deadline` is in the past, disable the Submit button and show a short message (e.g. "The deadline for this exercise has passed — submissions are closed.").
- Submitting after the deadline still needs the backend's `EXERCISE_DEADLINE_PASSED` handling from the "submission-latest-only" spec's error-surfacing change (`catch` around `studentApi.submit`) as the ultimate fallback if the client-side clock/check is stale.

## Out of Scope

- Deadlines scoped per-course (`course_exercises`) rather than per-exercise — `course_exercises` is a plain many-to-many join table with no extra columns today; adding per-course overrides is a larger schema change not requested here. This spec's deadline is exercise-global.
- Any grace-period, extension-request, or per-student deadline-override mechanism.
- Applying the deadline check to tutor batch import.

## Tests

### Backend
- `ExerciseServiceTest`: create/update exercise with a `deadline` persists it; update with `deadline: null` clears a previously-set deadline.
- `StudentSubmissionServiceTest`:
  - Exercise with `deadline = null` → submission succeeds regardless of current time (unchanged behavior).
  - Exercise with `deadline` in the future → submission succeeds.
  - Exercise with `deadline` in the past → `submit()` throws `PlatformException(EXERCISE_DEADLINE_PASSED)`, no `Submission` row written.
- `FileImportServiceTest`: importing a file for an exercise with a past `deadline` still succeeds (deadline not checked on this path).

### Frontend
- `ExerciseFormPage.test.jsx`: deadline input renders, round-trips through create/update payloads, supports clearing to no-deadline.
- Practice page test(s): exercise with a past `deadline` renders it and disables the Submit button with the explanatory message; exercise with no `deadline` or a future one behaves exactly as before.
