# Group Submission Batch Delete — Design Spec

**Date:** 2026-06-28
**Branch:** feature/multidimensional-grading-batches

## Summary

Add a Delete button to each row on the Group Submissions page (`GroupSubmissionPage`). Clicking it physically (hard) deletes the import batch record and all associated submission rows, including any that were previously soft-deleted individually.

## Requirements

- Confirmation dialog always shows the number of imported submissions that will be deleted (`importedCount` from the batch DTO).
- If the batch is fully graded (`gradedStatus === 'ALL'`), the dialog prepends a warning line: "Warning: This batch is fully graded."
- Deletion is hard (physical): removes all `submissions` rows with `batch_id = {id}` regardless of `is_deleted`, then removes the `import_batches` row.
- Only TUTOR (and above) role can delete a batch.
- The list refreshes after successful deletion.

## Confirmation Dialog (Option A — single `window.confirm`)

```
Warning: This batch is fully graded.   ← only when gradedStatus === 'ALL'

Delete batch #12 and its 25 imported submissions?
This cannot be undone.
```

## Backend Changes

### `ErrorCode` enum
Add: `BATCH_NOT_FOUND`

### `SubmissionRepository`
Add hard-delete query:
```java
@Modifying
@Transactional
@Query("DELETE FROM Submission s WHERE s.batchId = :batchId")
int deleteAllByBatchId(@Param("batchId") Long batchId);
```

### `ImportBatchService`
Add `deleteBatch(Long id)`:
1. Load batch by id — throw `PlatformException(BATCH_NOT_FOUND)` if absent.
2. Call `submissionRepository.deleteAllByBatchId(id)` (hard-deletes all rows regardless of `is_deleted`).
3. Call `importBatchRepository.deleteById(id)`.
4. Returns void.

### `ImportBatchController`
Add endpoint:
```
DELETE /v1/import-batches/{id}
@PreAuthorize("hasRole('TUTOR')")
→ 204 No Content on success
→ 404 on BATCH_NOT_FOUND
```

## Frontend Changes

### `frontend/src/api/importBatchApi.js`
Add to `importBatchApi` object:
```js
delete: (id) => axiosInstance.delete(`/v1/import-batches/${id}`).then(r => r.data)
```

### `frontend/src/pages/tutor/GroupSubmissionPage.jsx`
- Add `deletingId` state (tracks which batch id is in-flight).
- Add `handleDelete(batch)`:
  - Builds confirm message from `batch.importedCount`; prepends graded warning if `batch.gradedStatus === 'ALL'`.
  - On confirm: sets `deletingId`, calls `importBatchApi.delete(batch.id)`, re-fetches current page, clears `deletingId`.
  - On error: alerts "Failed to delete batch." and clears `deletingId`.
- Table: add empty `''` header for new action column (8 → 9 columns, `colSpan` in empty-state row updated to 9).
- Each row: add Delete button after Export CSV button. Style: red outlined (`color: '#c62828', border: '1px solid #c62828'`), disabled + dimmed while `deletingId === batch.id`.

## Tests

### Backend — `ImportBatchControllerTest.java` (new file)
- `DELETE /v1/import-batches/{id}` returns 204 for TUTOR role.
- `DELETE /v1/import-batches/{id}` returns 404 when batch not found.
- `DELETE /v1/import-batches/{id}` returns 403 for STUDENT role.

### Backend — `ImportBatchServiceTest.java` (update)
- `deleteBatch` calls `deleteAllByBatchId` then `deleteById`.
- `deleteBatch` throws `BATCH_NOT_FOUND` when batch is absent.

### Frontend — `GroupSubmissionPage.test.jsx` (new file)
- Delete button renders for each batch row.
- Confirmation message contains submission count.
- Graded warning line appears when `gradedStatus === 'ALL'`.
- On confirm, `importBatchApi.delete` is called with the correct batch id, then list re-fetches.
- On cancel, `importBatchApi.delete` is not called.

## Out of Scope

- Deleting individual submissions from the group submission page (already exists on `SubmissionListPage`).
- Soft-delete pathway for batches (no `is_deleted` column on `import_batches`).
- Role restriction beyond TUTOR (SUPER_ADMIN inherits TUTOR permissions).
