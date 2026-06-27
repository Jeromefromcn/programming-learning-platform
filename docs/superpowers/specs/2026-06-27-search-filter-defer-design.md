# Search Filter Defer — Design Spec

**Date:** 2026-06-27
**Scope:** Two frontend pages — `SubmissionListPage` (tutor) and `ExerciseListPage` (student)

---

## Problem

### SubmissionListPage
The `source` dropdown (`IMPORT` / `STUDENT`) is wired directly to committed state. The `useEffect` depends on `source`, so any change fires an API fetch immediately — bypassing the existing pending-state pattern already used for student name and exercise ID text inputs.

### ExerciseListPage
All three filter dropdowns (type, difficulty, category) call `load()` directly on `onChange`. There is no Search button and no pending state, so every single dropdown interaction triggers an API call.

---

## Design

### Pattern: Pending State (Option A)

Both pages adopt the same pattern already established in `SubmissionListPage` for text inputs:
- A **pending** state holds the user's in-progress selection (UI-only, no fetch).
- A **committed** state drives the `useEffect` / `load()` call.
- Clicking **Search** (or pressing Enter) copies pending → committed, which triggers the fetch.

---

### SubmissionListPage changes

File: `frontend/src/pages/tutor/SubmissionListPage.jsx`

| What | Change |
|------|--------|
| New state | `pendingSource` (default `'IMPORT'`) |
| Source `<select>` | `onChange` → sets `pendingSource` only |
| `handleSearch` | Also calls `setSource(pendingSource)` |
| `useEffect` deps | Unchanged: `[page, studentName, exerciseId, source]` |

No structural change — only adds one state variable and one setter call.

---

### ExerciseListPage changes

File: `frontend/src/pages/student/ExerciseListPage.jsx`

| What | Change |
|------|--------|
| New state | `pendingFilters` — same shape as `filters`: `{ type, categoryId, difficulty }` |
| All three dropdowns | `onChange` → sets `pendingFilters` only, no `load()` call |
| `handleFilterChange` | Removed (replaced by direct `pendingFilters` setter) |
| New `handleSearch` | Commits `pendingFilters` → `setFilters(pendingFilters)` then `load(0, pendingFilters)` |
| Search button | Added next to the filter dropdowns |
| Initial load | `useEffect` on mount still calls `load(0)` once — unchanged |

---

## Testing

- `SubmissionListPage.test.jsx`: verify changing the Source dropdown alone does **not** call the API; verify clicking Search with a new source **does**.
- `ExerciseListPage` (no existing test file): add a test file verifying that changing a dropdown alone does **not** call the API; clicking Search **does**.

---

## Out of Scope

- No changes to any API endpoints or backend code.
- No changes to the tutor `ExerciseManagementPage` (it has its own search pattern already).
- No debounce or URL-sync behaviour.
