# Design: Submission Delete + Universal Pagination

**Date:** 2026-05-18
**Scope:** Two independent features shipped together — soft-delete for submissions, and consistent pagination across all list views.

---

## 1. Submission Soft Delete

### Motivation
Tutors need to remove incorrectly imported submissions. CLAUDE.md prohibits hard deletes on submissions; a soft-delete flag is required.

### Database
Flyway `V4__add_submission_soft_delete.sql`:
```sql
ALTER TABLE submissions
  ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_submissions_is_deleted ON submissions (is_deleted);
```

### Backend
- `Submission` entity: add `isDeleted` boolean field.
- `SubmissionRepository`: all existing queries gain `AND is_deleted = false` filtering. Any custom JPQL/derived methods updated accordingly.
- `SubmissionService.delete(Long id)`: load submission (404 if not found or already deleted), set `isDeleted = true`, save.
- `SubmissionController`: `DELETE /v1/submissions/{id}` — TUTOR role, returns `204 No Content`.
- `submissionApi.js`: add `delete(id)` → `DELETE /v1/submissions/{id}`.

### Frontend
- **SubmissionListPage**: each row gets a Delete button (red, small). Clicks `window.confirm`, calls `submissionApi.delete(id)`, then re-fetches current page. Row click (navigate to detail) still works — click target is the row excluding the Delete cell.
- **SubmissionDetailPage**: Delete button at bottom of page. Same confirm flow, then `navigate('/tutor/submissions')`.

---

## 2. Universal Pagination

### Problem
All paginated list pages use `{totalPages > 1 && <pagination>}` — controls are hidden when data fits on one page. Users cannot see their position or navigate. Four backend endpoints return plain `List` with no pagination at all.

### Shared `<Pagination>` Component
New file: `frontend/src/components/Pagination.jsx`

Props: `page` (0-based), `totalPages`, `onPageChange(newPage)`.

Renders: `← Prev | Page {page+1} of {totalPages} | Next →`
- Visible when `totalPages >= 1`.
- Prev disabled when `page === 0`.
- Next disabled when `page >= totalPages - 1`.
- Consistent style across all pages.

### Pages Updated (already had pagination logic)
Fix condition `totalPages > 1` → `totalPages >= 1`, replace inline buttons with `<Pagination>`:

| Page | Location |
|------|----------|
| SubmissionListPage | `frontend/src/pages/tutor/SubmissionListPage.jsx` |
| ExerciseManagementPage | `frontend/src/pages/tutor/ExerciseManagementPage.jsx` |
| CourseManagementPage | `frontend/src/pages/tutor/CourseManagementPage.jsx` |
| UserManagementPage | `frontend/src/pages/admin/UserManagementPage.jsx` |
| ExerciseListPage | `frontend/src/pages/student/ExerciseListPage.jsx` |

### Backend + Frontend: New Pagination (4 endpoints)

#### `GET /v1/categories`
- **Before:** `List<CategoryDto>` — no params.
- **After:** `PageResponse<CategoryDto>` — add `page` (default 0), `size` (default 20).
- `CategoryService.listAll(Pageable)` uses Spring Data `Page`.
- `CategoryManagementPage`: add `page` state, fetch with `{ page, size: 20 }`, render `<Pagination>`.

#### `GET /v1/courses/{id}/students`
- **Before:** `List<UserSummaryDto>`.
- **After:** `PageResponse<UserSummaryDto>` — add `page`, `size` (default 20).
- `CourseService.listStudents(id, userId, Pageable)`.
- `CourseDetailPage` Students tab: add `studentsPage` state, reset to 0 on tab switch, render `<Pagination>`.

#### `GET /v1/courses/{id}/exercises`
- **Before:** `List<ExerciseSummaryDto>`.
- **After:** `PageResponse<ExerciseSummaryDto>` — add `page`, `size` (default 20).
- `CourseService.listExercises(id, userId, Pageable)`.
- `CourseDetailPage` Exercises tab: add `exercisesPage` state, reset to 0 on tab switch, render `<Pagination>`.

#### `GET /v1/progress`
- **Before:** `StudentProgressDto { summary, List<ProgressExerciseDto> exercises }`.
- **After:** `StudentProgressDto { summary, PageResponse<ProgressExerciseDto> exercises }`. Summary (totals, averages) is computed over ALL exercises regardless of page — only the displayed list is paginated.
- `StudentProgressService.getProgress(displayName, Pageable)`.
- `ProgressPage`: add `page` state, fetch with `{ page, size: 20 }`, render `<Pagination>` below the table.

---

## 3. Error Handling

- Delete 404: submission not found or already deleted → backend throws `SUBMISSION_NOT_FOUND`, frontend shows alert.
- Deleting while on a now-empty page: after delete, if `submissions.length === 0 && page > 0`, decrement page by 1 and re-fetch.
- Pagination on empty result: `totalPages === 0` → `<Pagination>` not rendered (guard: `totalPages >= 1`).

---

## 4. Testing

### Backend
- `SubmissionControllerTest`: `DELETE /v1/submissions/{id}` returns 204; second delete returns 404; `GET` list excludes deleted.
- `BlocklyGraderTest` (existing): unaffected.
- Category / Course / Progress service/controller tests: verify `PageResponse` shape returned with correct `totalPages`.

### Frontend
- `SubmissionListPage`: delete button renders; clicking confirm calls API and re-fetches; row navigation still works.
- `SubmissionDetailPage`: delete button navigates back on success.
- `Pagination` component unit test: renders correct page info; Prev/Next disabled states correct.

---

## 5. Out of Scope

- Bulk delete of submissions.
- Restore (un-delete) of soft-deleted submissions.
- Search/filter within `CourseDetailPage` student or exercise tabs.
- Page size selector (fixed at 20 throughout).
