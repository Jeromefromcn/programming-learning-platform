# Group Submission Export Real-Time Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before exporting a batch's CSV, re-fetch that batch's `gradedStatus` from the server so the "not fully graded" warning is always based on live data, not the page's possibly-stale list state.

**Architecture:** `GroupSubmissionPage.jsx`'s `handleExport` currently reads `batch.gradedStatus` from React state populated by the last list fetch. This plan makes `handleExport` async: it first calls the existing `GET /v1/import-batches?batchId={id}&page=0&size=1` endpoint (which already computes `gradedStatus` fresh from the DB on every call — no backend change needed), then uses that fresh value to decide whether to show `window.confirm`.

**Tech Stack:** React 18.3.1, Vitest + Testing Library, axios.

## Global Constraints

- No backend changes — `ImportBatchService.list()` already computes `gradedStatus` fresh on every call.
- Export is never hard-blocked — a tutor can still confirm through a `PARTIAL`/`NONE` status, matching today's UX.
- Spec: `docs/superpowers/specs/2026-07-02-group-submission-export-realtime-check-design.md`

---

### Task 1: Frontend — re-fetch fresh `gradedStatus` before export, with loading state

**Files:**
- Modify: `frontend/src/pages/tutor/GroupSubmissionPage.jsx:20` (state), `:75-82` (handleExport), `:171-179` (Export button)
- Modify: `frontend/src/pages/tutor/GroupSubmissionPage.test.jsx`

**Interfaces:**
- Consumes: `importBatchApi.list({ batchId, page: 0, size: 1 })` → `{ content: [{ id, gradedStatus, ... }], totalPages }` (existing API, unchanged).
- Produces: `handleExport(batch)` — now `async`; no other component relies on its return value.

- [ ] **Step 1: Write failing tests**

Add to `frontend/src/pages/tutor/GroupSubmissionPage.test.jsx` (after the existing `View Submissions` test, before the closing of the file):

```jsx
it('re-fetches gradedStatus before export and skips the confirm dialog when the fresh status is ALL', async () => {
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(1, 'PARTIAL')], totalPages: 1 })
    .mockResolvedValueOnce({ content: [batch(1, 'ALL')], totalPages: 1 });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(downloadBatchExport).toHaveBeenCalledWith(1));
  expect(window.confirm).not.toHaveBeenCalled();
  expect(importBatchApi.list).toHaveBeenLastCalledWith({ batchId: 1, page: 0, size: 1 });
});

it('shows the confirm dialog when the fresh status is PARTIAL even though the page state says ALL', async () => {
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(2, 'ALL')], totalPages: 1 })
    .mockResolvedValueOnce({ content: [batch(2, 'PARTIAL')], totalPages: 1 });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining('Not all submissions in this batch are graded')
  ));
  expect(downloadBatchExport).toHaveBeenCalledWith(2);
});

it('does not export when the tutor cancels the confirm dialog for a fresh PARTIAL status', async () => {
  window.confirm.mockReturnValue(false);
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(3, 'ALL')], totalPages: 1 })
    .mockResolvedValueOnce({ content: [batch(3, 'PARTIAL')], totalPages: 1 });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(importBatchApi.list).toHaveBeenCalledTimes(2));
  expect(downloadBatchExport).not.toHaveBeenCalled();
});

it('alerts and does not export when the fresh status fetch fails', async () => {
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(4, 'ALL')], totalPages: 1 })
    .mockRejectedValueOnce(new Error('network error'));
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(window.alert).toHaveBeenCalledWith(
    'Failed to check batch status. Please try again.'
  ));
  expect(downloadBatchExport).not.toHaveBeenCalled();
});

it('shows a checking state on the export button while the fresh-status fetch is pending', async () => {
  let resolveFresh;
  const freshPromise = new Promise(resolve => { resolveFresh = resolve; });
  importBatchApi.list = vi.fn()
    .mockResolvedValueOnce({ content: [batch(5, 'ALL')], totalPages: 1 })
    .mockReturnValueOnce(freshPromise);
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /export csv/i }));

  fireEvent.click(screen.getByRole('button', { name: /export csv/i }));

  await waitFor(() => expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled());

  resolveFresh({ content: [batch(5, 'ALL')], totalPages: 1 });
  await waitFor(() => expect(downloadBatchExport).toHaveBeenCalledWith(5));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/tutor/GroupSubmissionPage.test.jsx 2>&1 | tail -80`
Expected: the 5 new tests FAIL — `handleExport` currently reads `batch.gradedStatus` synchronously from state and never calls `importBatchApi.list` a second time, and there is no "Checking…" button state.

- [ ] **Step 3: Add `exportingId` state and rewrite `handleExport`**

In `frontend/src/pages/tutor/GroupSubmissionPage.jsx`, add a new state variable next to `deletingId` (line 25):

```jsx
  const [deletingId, setDeletingId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
```

Replace `handleExport` (lines 75-82):

```jsx
  async function handleExport(batch) {
    setExportingId(batch.id);
    try {
      const fresh = await importBatchApi.list({ batchId: batch.id, page: 0, size: 1 });
      const status = fresh.content[0]?.gradedStatus;
      if (status !== 'ALL' && !window.confirm(
        `Not all submissions in this batch are graded.\nExport anyway?`
      )) return;
      downloadBatchExport(batch.id);
    } catch {
      alert('Failed to check batch status. Please try again.');
    } finally {
      setExportingId(null);
    }
  }
```

- [ ] **Step 4: Wire the loading state into the Export button**

Replace the Export CSV button (lines 171-179):

```jsx
                    <button
                      onClick={() => handleExport(b)}
                      disabled={exportingId === b.id}
                      style={{
                        padding: '4px 14px', background: '#388e3c', color: '#fff',
                        border: 'none', borderRadius: 4, cursor: exportingId === b.id ? 'default' : 'pointer',
                        fontSize: 12, opacity: exportingId === b.id ? 0.5 : 1,
                      }}
                    >
                      {exportingId === b.id ? 'Checking…' : 'Export CSV'}
                    </button>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/tutor/GroupSubmissionPage.test.jsx 2>&1 | tail -80`
Expected: all tests pass, including the 5 new ones and all pre-existing Delete/View-Submissions tests (unaffected — they only ever call `importBatchApi.list` once, via `mockResolvedValue`, which still works for a single call).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/tutor/GroupSubmissionPage.jsx frontend/src/pages/tutor/GroupSubmissionPage.test.jsx
git commit -m "feat(group-submissions): re-fetch fresh graded status before CSV export"
```

---

## Self-Review Notes

- Spec coverage: fresh fetch before decision (Step 3), confirm-if-not-ALL kept (Step 3), loading indicator (Step 4), error alert on fetch failure (Step 3's `catch`) — all covered in Task 1.
- No placeholders — all steps show full code.
- Type consistency: `handleExport(batch)` signature and `exportingId`/`setExportingId` names are used consistently between Steps 3 and 4 and match the button's `onClick={() => handleExport(b)}` call site already in the file.
