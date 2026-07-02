# Group Submissions: Real-Time Grading Check on CSV Export — Design Spec

**Date:** 2026-07-02
**Branch:** main

## Summary

`GroupSubmissionPage.jsx`'s export button warns the tutor when a batch isn't fully graded, but the check uses `batch.gradedStatus` from the page's already-loaded list state, which can be stale (e.g. grading happened in another tab, or the list was fetched minutes ago). This spec makes the check re-fetch the batch's current graded status immediately before deciding whether to show the warning, so the confirmation is always based on live data.

## Background

`handleExport` (`frontend/src/pages/tutor/GroupSubmissionPage.jsx:75-82`):

```js
function handleExport(batch) {
  if (batch.gradedStatus !== 'ALL') {
    if (!window.confirm('Not all submissions in this batch are graded.\nExport anyway?')) return;
  }
  downloadBatchExport(batch.id);
}
```

`batch` here comes from the `batches` state array populated by the last `fetchBatches()` call (page load, search, or pagination) — not re-queried at export time. `GET /v1/import-batches?batchId={id}` (`ImportBatchService.list()`) already computes `gradedStatus` fresh from the DB on every call (`buildCountMap` → `countGradedGroupByBatchId`), so no backend change is needed — only the frontend needs to call it at the right moment. The CSV export endpoint itself (`ImportBatchService.exportBatchCsv`) performs no graded-completeness check and continues to export whatever the tutor confirms, unchanged.

## Requirements

- Immediately before deciding whether to show the "not fully graded" warning, fetch the batch's current `gradedStatus` from the server (not from page state).
- If the fresh status is `ALL`, export proceeds without a prompt (same as today).
- If the fresh status is `PARTIAL` or `NONE`, show the same confirm dialog as today; tutor can still proceed (export is not hard-blocked — matches existing UX).
- Show a loading indicator on the specific batch's Export action while the fresh check is in flight (single in-flight export at a time is fine; no need to disable other rows).
- If the fresh-status fetch itself fails (network error), show an error alert and do not proceed with export.

## Backend Changes

None. `GET /v1/import-batches?batchId={id}&page=0&size=1` already returns a freshly-computed `gradedStatus` for that single batch.

## Frontend Changes

`GroupSubmissionPage.jsx`:
- Add `exportingId` state (batch id currently being checked/exported), mirroring the existing `deletingId` pattern.
- `handleExport` becomes async:
  ```js
  async function handleExport(batch) {
    setExportingId(batch.id);
    try {
      const fresh = await importBatchApi.list({ batchId: batch.id, page: 0, size: 1 });
      const status = fresh.content[0]?.gradedStatus;
      if (status !== 'ALL' &&
          !window.confirm('Not all submissions in this batch are graded.\nExport anyway?')) {
        return;
      }
      downloadBatchExport(batch.id);
    } catch {
      alert('Failed to check batch status. Please try again.');
    } finally {
      setExportingId(null);
    }
  }
  ```
- Export button: `disabled={exportingId === batch.id}`, label shows a brief "Checking…" state while `exportingId === batch.id`.

## Out of Scope

- Hard-blocking export server-side for incomplete batches (explicitly declined — tutors may legitimately export partial results).
- Polling or auto-refreshing the batch list in the background.
- Changing what the CSV export itself contains.

## Tests

### Frontend
- `GroupSubmissionPage.test.jsx`:
  - Stale page state shows `gradedStatus: 'PARTIAL'`, but the fresh fetch (mocked) returns `ALL` → export proceeds with no `window.confirm` call.
  - Stale page state shows `ALL`, but fresh fetch returns `PARTIAL` → `window.confirm` is called; confirming triggers `downloadBatchExport`, cancelling does not.
  - Fresh fetch rejects (network error) → `alert` shown, `downloadBatchExport` not called.
  - Export button is disabled and shows a checking state while the fresh-fetch promise is pending.
