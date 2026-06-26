# Admin Submission Purge — Design Spec

**Date:** 2026-06-27
**Status:** Approved

---

## Overview

Add a "Data Management" admin page (`/admin/data`) that allows `SUPER_ADMIN` users to bulk-delete submission records created before a specified date, optionally filtered by exercise and source. Both soft delete (reversible) and hard delete (permanent) modes are supported.

---

## Access Control

- Route `/admin/data` is restricted to `SUPER_ADMIN` only (route guard + backend `@PreAuthorize`).
- The page must be registered in the menu config system so it can be toggled in `GlobalSettingsPage` like other sections.
- All new API endpoints carry `@PreAuthorize("hasRole('SUPER_ADMIN')")`.

---

## UI / UX Flow

### Filter Form (on page load)

All filters are optional except `before` (the date cutoff):

| Field | Type | Notes |
|-------|------|-------|
| Before date | Date picker | Required. Cutoff for `created_at`. Records with `created_at < before-date T00:00:00` are matched (e.g., "before 2025-06-01" matches everything through May 31st). |
| Exercise | Dropdown | Optional. Populated from the exercise list API. "All exercises" by default. |
| Source | Select | Optional. Options: All / IMPORT / ONLINE. Default: All. |

### Preview Step

- Admin clicks **Preview** → sends `GET /api/v1/submissions/purge/preview` with current filter params.
- A count badge appears: `"N submissions match these filters"`.
- The two Purge buttons are **disabled** until a preview has been successfully run (prevents blind deletes).
- Changing any filter input resets the count badge and re-disables the Purge buttons, requiring a fresh Preview.

### Purge Buttons (enabled after preview)

Two distinct buttons:

- **Soft Delete (N records)** — marks `is_deleted = true`. Reversible.
- **Hard Delete (N records)** — permanently removes rows from the database. Shown in red with a warning label ("Permanent — cannot be undone").

### Confirmation Dialog

Both buttons trigger `window.confirm()` with a clear summary before proceeding. Example for hard delete:

> "Permanently delete 123 submissions created before 2025-06-01 (source: IMPORT)? This cannot be undone and rows will be removed from the database."

### Result Toast

On success: `"N submissions soft-deleted."` / `"N submissions permanently deleted."`
On error: `"Purge failed — please try again."`

---

## API Design

### Preview

```
GET /api/v1/submissions/purge/preview
  ?before=2025-06-01        (required, ISO date YYYY-MM-DD)
  &exerciseId=42            (optional)
  &source=IMPORT            (optional: IMPORT | ONLINE)

Response 200: { "count": 123 }
```

### Purge

```
DELETE /api/v1/submissions/purge
  ?before=2025-06-01        (required, ISO date)
  &exerciseId=42            (optional)
  &source=IMPORT            (optional)
  &mode=SOFT                (required: SOFT | HARD)

Response 200: { "deletedCount": 123 }
```

**Date handling:** `before` is converted to `LocalDateTime` at midnight (`before.atStartOfDay()`), so `before=2025-06-01` matches `created_at < 2025-06-01T00:00:00`.

**Validation:**
- `before` is required; return `400 VALIDATION_ERROR` if missing or invalid format.
- `mode` is required; return `400 VALIDATION_ERROR` if not `SOFT` or `HARD`.
- `source` must be `IMPORT` or `ONLINE` if provided; return `400 VALIDATION_ERROR` otherwise.

---

## Backend Design

### New Controller

`SubmissionPurgeController` (new class, separate from `SubmissionController`):
- `GET /api/v1/submissions/purge/preview` → `submissionPurgeService.preview(...)`
- `DELETE /api/v1/submissions/purge` → `submissionPurgeService.purge(...)`
- Both annotated `@PreAuthorize("hasRole('SUPER_ADMIN')")`

### New Service

`SubmissionPurgeService`:
- `preview(before, exerciseId, source)` → returns `{ count }`
- `purge(before, exerciseId, source, mode)` → runs soft or hard delete, returns `{ deletedCount }`

### Repository Additions (on `SubmissionRepository`)

Three new methods using `@Modifying @Query` for bulk efficiency (no entity loading):

```java
// Count matching (for preview)
@Query("SELECT COUNT(s) FROM Submission s WHERE s.createdAt < :before ...")
long countForPurge(@Param("before") LocalDateTime before,
                   @Param("exerciseId") Long exerciseId,
                   @Param("source") String source);

// Soft delete
@Modifying
@Query("UPDATE Submission s SET s.deleted = true WHERE s.createdAt < :before ...")
int softDeleteByFilters(...);

// Hard delete
@Modifying
@Query("DELETE FROM Submission s WHERE s.createdAt < :before ...")
int hardDeleteByFilters(...);
```

All three queries apply the same optional filter logic:
- `exerciseId` filter: only applied when non-null
- `source` filter: only applied when non-null
- Soft delete and count only target rows where `s.deleted = false`
- Hard delete removes all matching rows (including already-soft-deleted ones)

### DTOs

- `PurgePreviewResponse { long count; }`
- `PurgeResultResponse { long deletedCount; }`

---

## Frontend Files

| File | Action |
|------|--------|
| `frontend/src/pages/admin/DataManagementPage.jsx` | New page |
| `frontend/src/api/submissionApi.js` (or new `purgeApi.js`) | Add `previewPurge()` and `purge()` calls |
| `frontend/src/components/sectionConfig.js` | Register `data` section for menu config |
| Router config | Add `/admin/data` route |

---

## Out of Scope

- Purge of draft records (separate concern).
- Audit log of purge operations.
- Scheduled/automatic purge.
- Undo/recovery for hard deletes.
