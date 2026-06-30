# My Progress Filters — Design Spec

**Date:** 2026-07-01
**Scope:** Student "My Progress" page — add Exercise / Type / Source query filters, backed by a new filtered backend query.

---

## Problem

`ProgressPage.jsx` (student) shows a flat, unfiltered, paginated list of the logged-in student's submissions. The table already displays Exercise, Type, and Source columns, but there is no way to filter by them — students with many submissions across courses/exercise types have no way to narrow the list. The backend endpoint (`GET /v1/student/progress`) also has no filter parameters; `StudentProgressService.getProgress` always calls the unfiltered `findByUserIdAndDeletedFalseOrderByCreatedAtDesc`.

The user explicitly requires: every click of the Search button triggers a backend call, even if the filter values are unchanged from the previous search.

---

## Design

### Pattern: Pending/Committed Filters + explicit `load()`

Follows the established pattern in `ExerciseListPage.jsx` (see `2026-06-27-search-filter-defer-design.md`): a `pendingFilters` state holds in-progress UI selections (no fetch), a committed `filters` state plus an explicit `load(page, filters)` function drives the actual API call. Because `load()` is called directly from the Search button's `onClick` (not via a `useEffect` watching committed state), clicking Search always re-fetches — even with identical filter values — satisfying the requirement.

### Filters

| Filter | UI | Values | Maps to |
|--------|-----|--------|---------|
| Exercise | text input | free text | `exercise.title LIKE %text%` (partial, case-insensitive via MySQL default collation) |
| Type | `<select>` | All / Blockly / Python | `submissions.exercise_type = 'BLOCKLY'｜'PYTHON'` |
| Source | `<select>` | All / Submitted / Imported | `submissions.source = 'STUDENT'｜'IMPORT'` |

Empty/All → parameter omitted (null), meaning "no filter on that field" — consistent with the existing `(:param IS NULL OR ...)` convention used throughout the codebase (`SubmissionRepository.findFiltered`, `ExerciseRepository.findAllFiltered`).

---

## Backend changes

### `SubmissionRepository`

New native query method, joining `exercises` (exercise title isn't denormalized onto `submissions`):

```java
@Query(value = """
        SELECT s.* FROM submissions s
        LEFT JOIN exercises e ON e.id = s.exercise_id
        WHERE s.user_id = :userId
          AND s.is_deleted = false
          AND (:exerciseTitle IS NULL OR e.title LIKE CONCAT('%', :exerciseTitle, '%'))
          AND (:exerciseType IS NULL OR s.exercise_type = :exerciseType)
          AND (:source IS NULL OR s.source = :source)
        ORDER BY s.created_at DESC
        """,
        countQuery = """
        SELECT COUNT(*) FROM submissions s
        LEFT JOIN exercises e ON e.id = s.exercise_id
        WHERE s.user_id = :userId
          AND s.is_deleted = false
          AND (:exerciseTitle IS NULL OR e.title LIKE CONCAT('%', :exerciseTitle, '%'))
          AND (:exerciseType IS NULL OR s.exercise_type = :exerciseType)
          AND (:source IS NULL OR s.source = :source)
        """,
        nativeQuery = true)
Page<Submission> findByUserIdFiltered(
        @Param("userId") Long userId,
        @Param("exerciseTitle") String exerciseTitle,
        @Param("exerciseType") String exerciseType,
        @Param("source") String source,
        Pageable pageable);
```

The existing unfiltered `findByUserIdAndDeletedFalseOrderByCreatedAtDesc` stays (no other callers depend on it being removed, but it becomes unused by `StudentProgressService` — left in place since repository methods are cheap and removing it is out of scope).

### `StudentProgressService.getProgress`

Signature becomes:

```java
public StudentProgressDto getProgress(Long userId, int page, int size,
                                       String exerciseTitle, String exerciseType, String source)
```

Calls `submissionRepository.findByUserIdFiltered(userId, exerciseTitle, exerciseType, source, PageRequest.of(page, size))`. The rest of the method (title-map lookup, DTO mapping) is unchanged.

### `StudentProgressController.getProgress`

Adds three optional request params, blank-trimmed to `null`:

```java
@RequestParam(required = false) String exercise,
@RequestParam(required = false) String type,
@RequestParam(required = false) String source
```

Blank-string handling (`""` → `null`) happens in the controller before calling the service, consistent with how other controllers in this codebase avoid passing empty-string filters through to `LIKE '%%'`.

---

## Frontend changes

### `progressApi.js`

`getProgress` takes a single params object instead of positional `(page, size)`:

```js
getProgress: (params) =>
  axiosInstance.get('/v1/student/progress', { params }).then(r => r.data),
```

Callers pass `{ page, size, exercise, type, source }`, omitting empty fields.

### `ProgressPage.jsx`

- `EMPTY_FILTERS = { exercise: '', type: '', source: '' }`
- `filters` / `pendingFilters` state (mirrors `ExerciseListPage.jsx`)
- `load(p, f)` async function: builds params from `f` (omitting empty strings), calls `progressApi.getProgress`, sets `data`/`page`/`loading`/`error`.
- On mount: `load(0, filters)`.
- New filter bar above the table (same visual style as `ExerciseListPage.jsx`'s filter row):
  - Exercise: `<input>` bound to `pendingFilters.exercise`
  - Type: `<select>` — All Types / Blockly / Python — bound to `pendingFilters.type`
  - Source: `<select>` — All Sources / Submitted / Imported — bound to `pendingFilters.source`
  - Search `<button>`: `onClick` → `setFilters(pendingFilters); load(0, pendingFilters)`
- `Pagination`'s `onPageChange` calls `load(p, filters)` (committed filters, not pending).
- Labels associated via `<label>` wrapping each `<select>`/`<input>` so RTL's `getByRole('combobox'/'textbox', { name: ... })` works, consistent with `ExerciseListPage.jsx`.

---

## Testing (TDD — written before implementation)

### Backend

`StudentProgressServiceTest`:
- `getProgress` passes filter args through to `submissionRepository.findByUserIdFiltered` and maps the result correctly (extend/replace existing mock-based tests).

`StudentProgressControllerTest` (integration, `@SpringBootTest` + `MockMvc`):
- Filter by `exercise` substring returns only matching-title submissions.
- Filter by `type=PYTHON` / `type=BLOCKLY` returns only that type.
- Filter by `source=STUDENT` / `source=IMPORT` returns only that source.
- Combined filters (exercise + type + source) narrow correctly.
- No match → empty page, 200 OK.
- Filters never leak another user's submissions (existing `otherUserSubmissions_notIncluded` pattern extended with filters applied).

### Frontend

New `ProgressPage.test.jsx` (mirrors `ExerciseListPage.test.jsx`):
- Mounts and calls `progressApi.getProgress` once on initial load.
- Changing the Exercise input / Type select / Source select alone does **not** trigger another call.
- Clicking Search calls `progressApi.getProgress` with the pending filter values.
- Clicking Search a second time with **unchanged** filter values still triggers a new call (call count increments) — this directly covers the user's explicit requirement.

---

## Out of Scope

- No changes to the tutor-side `SubmissionListPage` or its filters.
- No debounce or URL-sync behavior for filters.
- No new "exercise dropdown" endpoint — Exercise filter is free-text title search, not a select populated from an exercise list.
- No changes to `findByUserIdAndDeletedFalseOrderByCreatedAtDesc` (left unused but in place).
