# F-7 Student Progress — Design Spec

**Date:** 2026-05-09
**Feature:** F-7 Student Progress
**Status:** Approved

---

## Overview

Students can view their own practice history and grades on a "My Progress" page. The page shows a summary (total exercises, attempted, graded, average score, pass rate) and a per-exercise status list. "Attempted" and "Graded" statuses are derived from submissions imported by tutors. Multiple submissions for the same exercise resolve to the highest effective score (tutor score takes priority over auto score).

---

## Status Semantics

| Status | Condition |
|---|---|
| `NOT_ATTEMPTED` | No submission row in `submissions` table for this student + exercise |
| `ATTEMPTED` | Submission row exists but `COALESCE(tutor_score, auto_score) IS NULL` |
| `GRADED` | Submission row exists and `COALESCE(tutor_score, auto_score) IS NOT NULL` |

Submissions are matched by `student_name = users.display_name` (not by user ID — students may not have accounts).

---

## Backend

### Query Strategy: Two queries + Java merge

1. Fetch the visible exercise list via the existing `StudentExerciseService` logic (page 0, size 1000 — bounded by exercise count). Respects `course_filter_enabled`.
2. Fetch all submissions for the student in a single bulk query: `SubmissionRepository.findByStudentName(studentName)`.
3. Merge in the service layer: group submissions by `exerciseId`, pick best effective score per exercise, derive status, compute summary.

This avoids duplicating the course-filter SQL and keeps logic readable and unit-testable.

### New Files (`student` package)

**`StudentProgressController`**
- `GET /api/v1/student/progress`
- `@PreAuthorize("hasRole('STUDENT')")`
- Resolves authenticated user, calls `StudentProgressService.getProgress(userId, displayName)`

**`StudentProgressService`**
- Calls `StudentExerciseService.listExercises(...)` (page 0, size 1000) to get the exercise list visible to the student
- Calls `SubmissionRepository.findByStudentName(displayName)` to bulk-fetch all submissions
- Merges: for each exercise, find submissions with matching `exerciseId`; pick the one with the highest `COALESCE(tutorScore, autoScore)`
- Derives status: no match → `NOT_ATTEMPTED`; match with null effective score → `ATTEMPTED`; match with non-null score → `GRADED`
- Computes summary

**`StudentProgressDto`**
```java
record StudentProgressDto(SummaryDto summary, List<ProgressExerciseDto> exercises)
record SummaryDto(int totalExercises, int attemptedCount, int gradedCount, double averageScore, double passRate)
```

**`ProgressExerciseDto`**
```java
record ProgressExerciseDto(
    Long exerciseId, String exerciseTitle, String exerciseType,
    String status,         // NOT_ATTEMPTED | ATTEMPTED | GRADED
    Double score,          // null if not graded
    String scoreSource     // TUTOR | AUTO | null
)
```

### Modified Files

**`SubmissionRepository`** — add:
```java
List<Submission> findByStudentName(String studentName);
```

### Summary Computation

- `totalExercises` = size of exercise list
- `attemptedCount` = exercises with status `ATTEMPTED`
- `gradedCount` = exercises with status `GRADED`
- `averageScore` = mean of effective scores across `GRADED` exercises; `0.0` if gradedCount = 0
- `passRate` = `(graded exercises with score ≥ 60 / gradedCount) × 100`, one decimal place; `0.0` if gradedCount = 0

### Score Resolution

For a given exercise, when multiple submissions exist:
1. Compute effective score for each: `COALESCE(tutorScore, autoScore)`
2. Pick the submission with the highest effective score
3. `scoreSource` = `"TUTOR"` if `tutorScore != null`, else `"AUTO"`

---

## Frontend

### New Files

**`src/api/progressApi.js`**
- `getProgress()` — `GET /api/v1/student/progress`

**`src/pages/student/ProgressPage.jsx`**
- **Summary bar**: four stat cards in a row — Total Exercises, Attempted, Graded, Average Score + Pass Rate
- **Exercise list**: one row per exercise with:
  - Exercise title
  - Type badge (BLOCKLY / PYTHON)
  - Status chip: grey (`NOT_ATTEMPTED`), amber (`ATTEMPTED`), green (`GRADED` score ≥ 60), red (`GRADED` score < 60)
  - Score display: `80 / 100` with `Tutor Score` or `Auto Score` label; blank if no score
- Loading spinner while fetching
- Error message on failure
- Empty state if no exercises visible

### Modified Files

**`src/pages/student/StudentPage.jsx`** — add "My Progress" nav link to `/student/progress`

**`src/App.jsx`** — add route `/student/progress` → `<ProgressPage>` inside the `STUDENT` `<ProtectedRoute>` / `<StudentPage>` outlet

---

## Testing

### Backend — `StudentProgressControllerTest` (integration, H2)

| Scenario | Expected |
|---|---|
| Student with no submissions | All `NOT_ATTEMPTED`, summary all zeros |
| Student with submission with null effective score | Status `ATTEMPTED`, score null |
| Student with submission with auto score | Status `GRADED`, `scoreSource: AUTO` |
| Student with both auto and tutor score | Status `GRADED`, tutor wins, `scoreSource: TUTOR` |
| Multiple submissions for same exercise | Highest effective score returned |
| Course filter enabled, student not enrolled | All `NOT_ATTEMPTED` |
| TUTOR role calls endpoint | 403 |

### Frontend

No dedicated unit tests — consistent with other student pages in this project.

---

## File Map

**Backend — new:**
- `student/StudentProgressController.java`
- `student/StudentProgressService.java`
- `student/StudentProgressDto.java`
- `student/ProgressExerciseDto.java`

**Backend — modified:**
- `repository/SubmissionRepository.java` — add `findByStudentName`

**Backend — tests:**
- `student/StudentProgressControllerTest.java`

**Frontend — new:**
- `src/api/progressApi.js`
- `src/pages/student/ProgressPage.jsx`

**Frontend — modified:**
- `src/pages/student/StudentPage.jsx` — add My Progress nav link
- `src/App.jsx` — add `/student/progress` route

---

## Dependencies

- F-5 (Student Practice) — exercise visibility logic reused
- F-6 (Submission & Grading) — submissions must exist in DB
