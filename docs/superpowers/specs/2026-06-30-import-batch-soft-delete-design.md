# Import Batch Soft Delete — Design Spec

**Date:** 2026-06-30
**Branch:** main

## Summary

Change `import_batches` deletion from a hard (physical) delete to a soft delete (`is_deleted` flag), matching the soft-delete pattern already used by `exercises`, `courses`, and `submissions`. This removes the only remaining hard-delete-on-user-action path in the submission/grading flow and makes batch deletion symmetric with how its submissions are already deleted (soft).

## Background

`DELETE /v1/import-batches/{id}` previously hard-deleted the `import_batches` row while soft-deleting its submissions (`is_deleted = true`, but the rows — and their `batch_id` FK — remained). This caused a foreign-key violation (MySQL error 1451) whenever a batch with submissions was deleted, fixed in `V11__fk_sub_batch_set_null_on_delete.sql` by adding `ON DELETE SET NULL` to `fk_sub_batch`.

That fix resolves the crash, but the underlying asymmetry remains: submissions are preserved (soft-deleted) for audit purposes, while the batch record that groups them is destroyed outright. This spec closes that gap.

## Requirements

- Deleting a batch sets `is_deleted = true` on the `import_batches` row instead of physically removing it.
- Soft-deleted batches disappear from `GET /v1/import-batches` (the Group Submissions list) — identical UX to today.
- Deleting an already-deleted (or nonexistent) batch returns `404 BATCH_NOT_FOUND`.
- No restore/undo feature — soft-deleted batches are permanently hidden from all normal read paths, consistent with how `exercises`/`courses` work (no UI anywhere shows or restores soft-deleted rows).
- `V11`'s `fk_sub_batch ON DELETE SET NULL` is left in place as a defensive constraint (cheap insurance against any future hard-delete path), even though this change makes it unreachable via the current `deleteBatch()` flow.
- No frontend changes — `DELETE /v1/import-batches/{id}` still returns `204` on success, `404` on missing/already-deleted, `403` for non-TUTOR roles. Confirmation dialog and list-refresh behavior are unchanged.

## Schema Change

New migration `V12__add_import_batches_soft_delete.sql`:
```sql
ALTER TABLE import_batches ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
```

## Backend Changes

### `ImportBatch` entity
Add field, following the existing `Exercise`/`Submission` convention:
```java
@Column(name = "is_deleted", nullable = false)
private boolean deleted = false;
```

### `ImportBatchRepository`
Add, mirroring `ExerciseRepository.findByIdAndDeletedFalse`:
```java
Optional<ImportBatch> findByIdAndDeletedFalse(Long id);
List<ImportBatch> findAllByDeletedFalseOrderByCreatedAtDesc();
```

### `ImportBatchService`
- `list()`: replace `importBatchRepository.findAllByOrderByCreatedAtDesc()` with `findAllByDeletedFalseOrderByCreatedAtDesc()`.
- `deleteBatch(Long id)`:
  ```java
  @Transactional
  public void deleteBatch(Long id) {
      ImportBatch batch = importBatchRepository.findByIdAndDeletedFalse(id)
          .orElseThrow(() -> new PlatformException(ErrorCode.BATCH_NOT_FOUND, "Batch not found."));
      submissionRepository.softDeleteAllByBatchId(id);
      batch.setDeleted(true);
      importBatchRepository.save(batch);
  }
  ```
- `exportBatchCsv()`: no change — it already filters via `submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc`, which naturally returns nothing once the batch's submissions are soft-deleted, independent of the batch row's own `is_deleted` state.

## Out of Scope

- Restore/undo for soft-deleted batches.
- A "show deleted" admin view.
- Any change to `V11`'s FK constraint or to submission soft-delete behavior.
- Frontend changes (none required).

## Tests

### Backend — `ImportBatchControllerTest.java` (update existing `delete_returnsNoContent_andHardDeletesBatchAndAllSubmissions` test)
Rename to `delete_returnsNoContent_andSoftDeletesBatchAndAllSubmissions`. Assert:
- Response is `204`.
- `importBatchRepository.findById(batch.getId())` still returns the row (it's not physically gone), with `isDeleted() == true`.
- `importBatchRepository.findByIdAndDeletedFalse(batch.getId())` returns empty.
- Submissions previously in the batch: `isDeleted() == true`, `getBatchId()` unchanged (still equals the batch's id). Now that batch deletion is soft, the `import_batches` row is never physically removed, so `V11`'s `ON DELETE SET NULL` trigger never fires — `batch_id` is deliberately left intact rather than nulled, preserving the audit trail (consistent with how `Submission`'s own soft-delete leaves `exerciseId`/`gradedVersionId` untouched). No FK risk: the parent row always exists once deletion is soft.

### Backend — `ImportBatchServiceTest.java` (update)
- `deleteBatch` calls `softDeleteAllByBatchId` then saves the batch with `deleted = true` (no longer calls `importBatchRepository.deleteById`).
- `deleteBatch` throws `BATCH_NOT_FOUND` when batch is absent *or already soft-deleted*.

### Backend — `ImportBatchService` list test (new or extend existing)
- A soft-deleted batch does not appear in `list()`'s results.
