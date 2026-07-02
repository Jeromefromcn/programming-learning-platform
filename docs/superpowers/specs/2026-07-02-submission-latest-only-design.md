# Submissions: Keep Only the Latest Per Source — Design Spec

**Date:** 2026-07-02
**Branch:** main

## Summary

Today, every student submit or tutor import creates a brand-new `submissions` row; nothing ever replaces an earlier one, so a student re-submitting (or being re-imported) the same exercise accumulates multiple visible rows in "My Progress" and in tutor submission lists. This spec makes each new submission for a given `(exercise, student)` pair supersede the previous one **within the same source** (`STUDENT` direct submit vs. tutor `IMPORT`), via soft-delete — with one exception: a `STUDENT` submission that has already been manually graded by a tutor cannot be superseded by a new student resubmission.

## Background

- `StudentSubmissionService.submit()` (`backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java:59-73`) always does `new Submission(); ...; submissionRepository.save(sub)`. No lookup of prior submissions.
- `FileImportService.processSingleFile()` (`backend/src/main/java/com/platform/exercise/submission/FileImportService.java:99-194`) only checks for an **exact** duplicate (`existsActiveByStudentNameAndExerciseIdAndExportTimestamp` — same student, exercise, and `export_timestamp`); any import with a different timestamp always inserts a new row alongside prior ones.
- `submissions.is_deleted` already exists and is the established mechanism for removing a submission from all active views (`SubmissionRepository.softDeleteAllByBatchId`, `softDeleteByFilters`) without a hard delete, matching CLAUDE.md's "no hard deletes" rule.
- `Submission.graded` (boolean) is set `true` only by `SubmissionService.grade()` (tutor manual review, line 236) — never by auto-grading.
- STUDENT-source submissions are tied to an authenticated `userId`; IMPORT-source submissions are tied to `studentName` (students may lack accounts — see CLAUDE.md). The two sources are kept independent: a student's direct in-platform submission and a tutor's offline-import of that same student's work are treated as separate tracks that don't overwrite each other.

## Requirements

1. **STUDENT source** (`StudentSubmissionService.submit`): when a student submits exercise `E`:
   - Look up the current active `STUDENT` submission for `(userId, E)`, if any.
   - If it exists and `graded == true` → reject the new submission entirely (no row written) with a new error, `SUBMISSION_ALREADY_GRADED` (409 Conflict). The tutor's graded record is preserved untouched.
   - If it exists and `graded == false` → soft-delete it (`is_deleted = true`), then insert the new submission as today.
   - If none exists → insert as today.
2. **IMPORT source** (`FileImportService.processSingleFile`): unaffected by the graded-lock in (1). After the existing exact-duplicate check (unchanged):
   - Soft-delete any active `IMPORT` submission for `(studentName, E)`, regardless of its `graded` state.
   - Insert the new row as today.
   - Rationale: tutors retain full authority to re-import corrected files at any time, even after grading — matching the existing precedent that tutor import already bypasses the `PUBLISHED` status check that gates student submission.
3. `My Progress`, tutor submission lists, and CSV export all already query only non-deleted (`is_deleted = false`) submissions, so they automatically show at most one row per `(student, exercise, source)` once this lands — no changes needed there.
4. The existing `GET /v1/student/exercises/{exerciseId}/submissions` "history" endpoint (`StudentSubmissionService.history()`) becomes trivially ≤1 item per exercise. It has no frontend caller today (confirmed via `grep` across `frontend/src`), so it is left as-is — out of scope to remove or repurpose.

## Backend Changes

### `ErrorCode.java`
Add `SUBMISSION_ALREADY_GRADED(HttpStatus.CONFLICT)`.

### `SubmissionRepository.java`
Add:
```java
Optional<Submission> findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(
    Long userId, Long exerciseId, String source);

@Modifying(clearAutomatically = true)
@Query("UPDATE Submission s SET s.deleted = true " +
       "WHERE s.studentName = :studentName AND s.exerciseId = :exerciseId " +
       "AND s.source = :source AND s.deleted = false")
int softDeleteActiveByStudentNameAndExerciseIdAndSource(
    @Param("studentName") String studentName, @Param("exerciseId") Long exerciseId,
    @Param("source") String source);
```
(Mirrors the existing `softDeleteAllByBatchId` pattern.)

### `StudentSubmissionService.submit()`
Before building the new `Submission`, insert:
```java
submissionRepository.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(userId, exerciseId, "STUDENT")
    .ifPresent(existing -> {
        if (existing.isGraded()) {
            throw new PlatformException(ErrorCode.SUBMISSION_ALREADY_GRADED,
                "This exercise has already been graded and cannot be resubmitted.");
        }
        existing.setDeleted(true);
        submissionRepository.save(existing);
    });
```
(Method stays `@Transactional`, so the soft-delete and the new insert commit atomically.)

### `FileImportService.processSingleFile()`
After the existing exact-duplicate check and before `submissionRepository.save(sub)`, insert:
```java
submissionRepository.softDeleteActiveByStudentNameAndExerciseIdAndSource(studentName, exerciseId, "IMPORT");
```

## Frontend Changes

`BlocklyPracticePage.jsx` / `PythonPracticePage.jsx` — `handleSubmit` currently has no `catch` around `studentApi.submit(...)`, so any submit error (including the new `SUBMISSION_ALREADY_GRADED` case) fails silently with no user feedback. Add error handling:
```js
try {
  const res = await studentApi.submit(exercise.id, { ... });
  setSubmitResult(res);
} catch (e) {
  setSubmitError(e.response?.data?.error?.message || 'Failed to submit.');
} finally {
  setSubmitting(false);
}
```
Render `submitError` near the existing result area (same visual treatment as other inline errors on these pages). This is scoped narrowly to surfacing the new error clearly, not a general error-handling overhaul.

## Out of Scope

- Removing/changing the unused submission-history endpoint.
- Any change to how CSV export or My Progress query submissions (they're already correct).
- Applying the "already graded" resubmission lock to the IMPORT source.

## Tests

### Backend
- `StudentSubmissionServiceTest`:
  - First submission for `(userId, exerciseId)` → inserts normally, no prior row touched.
  - Second submission where prior `STUDENT` row exists with `graded=false` → prior row is soft-deleted, new row inserted, exactly one active `STUDENT` submission remains.
  - Second submission where prior `STUDENT` row exists with `graded=true` → throws `PlatformException(SUBMISSION_ALREADY_GRADED)`, no new row written, prior row untouched (`is_deleted` still `false`).
  - A prior `IMPORT`-source submission for the same `(userId/studentName, exerciseId)` does not block or get touched by a `STUDENT` submission (independent-source invariant).
- `FileImportServiceTest`:
  - Importing a new (non-duplicate-timestamp) file for a student+exercise that already has an active `IMPORT` submission → old row soft-deleted, new row inserted, regardless of old row's `graded` value.
  - A prior `STUDENT`-source submission for the same student+exercise is untouched by an import.
  - Exact-duplicate-timestamp behavior (existing `duplicate`/force-reimport flow) is unchanged.

### Frontend
- `BlocklyPracticePage.test.jsx` / `PythonPracticePage.test.jsx`: `studentApi.submit` rejecting with a `SUBMISSION_ALREADY_GRADED`-shaped error response renders the error message instead of failing silently.
