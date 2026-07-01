# Design: Group Submissions → View Submissions Link + Graded Filter

**Date:** 2026-07-01

## Overview

Two related UX improvements to the tutor submission workflow:

1. **GroupSubmissionPage**: Add a "View Submissions" button per row that navigates to SubmissionListPage with the batch ID pre-applied as a filter.
2. **SubmissionListPage**: Read `batchId` from URL query params on mount; add a new "Graded" filter dropdown.

## Section 1 — GroupSubmissionPage: "View Submissions" button

**File:** `frontend/src/pages/tutor/GroupSubmissionPage.jsx`

Add a third action button in each row's action cell, alongside the existing "Export CSV" and "Delete" buttons:

```jsx
<button onClick={() => navigate(`/tutor/submissions?batchId=${b.id}`)}>
  View Submissions
</button>
```

No API or backend changes required for this section.

## Section 2 — SubmissionListPage: URL param initialisation

**File:** `frontend/src/pages/tutor/SubmissionListPage.jsx`

On mount, read `useSearchParams` from react-router-dom. If `batchId` is present in the URL:

- Pre-fill both `pendingBatchId` and `batchId` state with the value.
- Set `source` / `pendingSource` to `''` (all sources, no filter) instead of the default `'IMPORT'`.
- Trigger an immediate search via `searchTrigger`.

If no URL `batchId` param is present, behaviour is unchanged — `source` defaults to `'IMPORT'` as today.

The backend already accepts `batchId` as an optional param, so no backend change is needed for this part.

**Source dropdown change:** The source dropdown must expose an "All" option (value `''`) in addition to "Imported" and "Student", so users can manually clear the source filter too.

## Section 3 — SubmissionListPage: "Graded" filter dropdown

**File:** `frontend/src/pages/tutor/SubmissionListPage.jsx`

Add a `pendingGraded` / `graded` state pair (same pending-commit pattern as other filters).

New dropdown in the filter bar:

| Label | Value sent to API |
|-------|-------------------|
| All | `''` (omitted) |
| Graded | `'true'` |
| Not Graded | `'false'` |

The selected value is included as `graded=true` or `graded=false` in the `GET /api/v1/submissions` call. Default is blank (no filter).

## Section 4 — Backend: `graded` filter

### SubmissionRepository

**File:** `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`

Add `graded` param to the native SQL `findFiltered` query and count query:

```sql
AND (:graded IS NULL OR graded = :graded)
```

Add `@Param("graded") Boolean graded` to the method signature.

### SubmissionController

**File:** `backend/src/main/java/com/platform/exercise/submission/SubmissionController.java`

Add optional request param:

```java
@RequestParam(required = false) Boolean graded
```

Pass it through to `submissionService.list(...)`.

### SubmissionService

**File:** `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java`

Accept `Boolean graded` in the `list(...)` method signature and pass it to `submissionRepository.findFiltered(...)`.

No DB migration needed — the `graded` column already exists on the `submissions` table.

## Testing

- **SubmissionListPage tests**: verify URL param pre-fill behaviour (batchId from URL → state initialised, source reset to ''), and that the Graded dropdown sends the correct param.
- **SubmissionController/Service tests**: verify `graded=true`, `graded=false`, and omitted behave correctly.
- **GroupSubmissionPage tests**: verify "View Submissions" button navigates to the correct URL.

## Out of scope

- No changes to the student-facing pages.
- No changes to export/import logic.
- No changes to the DB schema.
