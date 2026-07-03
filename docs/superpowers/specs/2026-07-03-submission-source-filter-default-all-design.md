# Design: Fix Submission Source Filter Bug + Default to "All"

**Date:** 2026-07-03

## Overview

Tutors could not find student-submitted (direct, `source = STUDENT`) submissions when using the "All" option on the Submissions page. Root cause: a Spring MVC gotcha where `@RequestParam(defaultValue = "IMPORT")` silently rewrites an explicit **empty-string** query value back to `"IMPORT"`, not just a genuinely absent parameter. So `GET /v1/submissions?source=` (what "All" sends) never reaches `SubmissionService.list()` as blank — it arrives as `"IMPORT"`, and the `source.isBlank() ? null : source` guard downstream never fires.

This fixes the underlying bug (so "All" works for any caller of the endpoint) and changes the tutor UI's default filter from "Imported" to "All", since submissions can now come from two sources (import and direct student submission) and hiding one by default is misleading.

## Section 1 — Backend: stop clobbering empty `source`

**File:** `backend/src/main/java/com/platform/exercise/submission/SubmissionController.java`

```java
// Before
@GetMapping
public ResponseEntity<PageResponse<SubmissionListItemDto>> list(
        @RequestParam(required = false) Long exerciseId,
        @RequestParam(required = false) String studentName,
        @RequestParam(defaultValue = "IMPORT") String source,
        ...

// After
@GetMapping
public ResponseEntity<PageResponse<SubmissionListItemDto>> list(
        @RequestParam(required = false) Long exerciseId,
        @RequestParam(required = false) String studentName,
        @RequestParam(required = false) String source,
        ...
```

No change needed in `SubmissionService.list()` — it already treats `null`/blank `source` as "no filter" via `(source != null && source.isBlank()) ? null : source`. Once the controller stops substituting `"IMPORT"` for an empty value, that existing guard behaves correctly for the first time.

This is the complete backend fix. It's a one-line change but the failure mode is subtle (framework-level parameter binding, not application logic), so it needs a regression test to lock in the corrected behavior.

## Section 2 — Frontend: default to "All", simplify batchId special-case

**File:** `frontend/src/pages/tutor/SubmissionListPage.jsx`

```js
// Before
const [source, setSource] = useState(hasUrlBatchId ? '' : 'IMPORT');
const [pendingSource, setPendingSource] = useState(hasUrlBatchId ? '' : 'IMPORT');

// After
const [source, setSource] = useState('');
const [pendingSource, setPendingSource] = useState('');
```

Since the general default is now also `''` ("All"), the `hasUrlBatchId` conditional on these two lines becomes redundant and is removed. `hasUrlBatchId` itself stays in the file (it still gates other batchId-prefill behavior); only its use for `source`/`pendingSource` initialization is dropped.

No change to the Source `<select>` options — "All" (`''`), "Imported" (`IMPORT`), "Student" (`STUDENT`) already exist.

## Testing (TDD — tests written first, must fail before the fix)

**Backend** (`SubmissionControllerTest` or `SubmissionServiceTest`, whichever the existing suite favors for this endpoint):
- New test: seed one `IMPORT` submission (soft-deleted) and one active `STUDENT` submission; call `GET /v1/submissions` with `source=` (explicit empty string, matching what the frontend sends); assert the response includes the active `STUDENT` submission. This must fail on current code (returns empty) and pass after the fix.

**Frontend** (`SubmissionListPage.test.jsx`):
- Update/add a test asserting the initial `submissionApi.list` call is made with `source: ''` on mount, both with and without a `batchId` URL param (previously only the `batchId`-present case defaulted to `''`).

## Out of scope

- No other endpoint uses `defaultValue` on `source`, so no other controller needs changes.
- No DB schema or migration changes.
- No changes to the import or direct-student-submit write paths — this is read-path (list/filter) only.
