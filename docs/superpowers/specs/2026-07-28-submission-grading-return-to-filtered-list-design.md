# Design: Return to Filtered Submissions List After Grading

**Date:** 2026-07-28

## Overview

On the tutor Submissions page, a tutor typically filters the list (e.g. Source = Imported, Graded = Not Graded) before opening a submission to grade it. Today, none of the "return to list" actions on the grading page carry those filters back:

- **Back to Submissions** button and the Breadcrumb's "Submissions" link both navigate to a bare `/tutor/submissions`, resetting all filters.
- **Save Grade** doesn't navigate at all — it updates the submission in place and the tutor stays on the grading page.
- **Delete Submission** navigates to a bare `/tutor/submissions` after a successful delete, same as Back.

This makes re-grading a filtered batch tedious: after grading one submission, the tutor has to re-enter the same filters to see whether the record dropped out of (e.g.) the "Not Graded" view.

This change makes all four actions (Back, Breadcrumb, Save, Delete) return to the list with the same filters and page re-applied, and re-execute the query so the tutor immediately sees the updated result set. It also changes **Save Grade** to navigate back to the list on success, instead of staying on the grading page — confirmed as the desired new behavior.

Note: this app renders each sidebar section inside its own `MemoryRouter` (see `AppShell.jsx`), so there is no real browser address bar — "URL" below refers to the in-memory route location, not a bookmarkable link.

## Section 1 — List page: make filters + page part of the route

**File:** `frontend/src/pages/tutor/SubmissionListPage.jsx`

Currently only `batchId` is read from `useSearchParams()` on mount; `studentName`, `exerciseId`, `source`, `graded`, and `page` are pure local state and are never written back to the URL.

Changes:
1. On mount, initialize `studentName`, `exerciseId`, `source`, `graded`, and `page` from `searchParams`, the same way `batchId` already is. `pending*` fields mirror the same initial values (as they already do for `batchId`).
2. Add a `useEffect` that writes the applied filters + page into the URL via `setSearchParams(...)` whenever any of `[page, studentName, exerciseId, batchId, source, graded]` changes — same dependency list as the existing fetch effect. Only non-empty values are included (mirrors the existing `if (x.trim())` guard used when building the API request params), and `page` is omitted when `0`, to keep the query string minimal.
3. When navigating to a submission row, pass the current location's search string forward as router state:
   ```js
   navigate(`/tutor/submissions/${sub.id}`, { state: { backTo: `/tutor/submissions${location.search}` } })
   ```
   (`location` from `useLocation()`.)

No change to `fetchSubmissions` or the existing fetch-triggering `useEffect` — they already react to filter/page state, which now happens to be initialized from and mirrored to the URL.

## Section 2 — Grading page: use `backTo` for every "return to list" action

**File:** `frontend/src/pages/tutor/SubmissionDetailPage.jsx`

```js
const location = useLocation();
const backTo = location.state?.backTo ?? '/tutor/submissions';
```

- **Breadcrumb**: `{ label: 'Submissions', to: backTo }` instead of the hardcoded path.
- **Back to Submissions button**: `onClick={() => navigate(backTo)}`.
- **handleSave**: on success (after `submissionApi.grade(...)` resolves), call `navigate(backTo)` instead of `setSubmission(data)`. Error handling is unchanged — on failure the tutor stays on the page with `saveError` shown.
- **handleDelete**: replace `navigate('/tutor/submissions')` with `navigate(backTo)`.

If `backTo` is absent (no prior list-page state — e.g. a future direct link to the grading page), all four actions fall back to plain `/tutor/submissions`, matching today's behavior.

## Data flow example

1. Tutor sets Source = Imported, Graded = Not Graded, clicks Search. List page fetches, and the URL becomes `/tutor/submissions?source=IMPORT&graded=false`.
2. Tutor clicks a row. Detail page opens with `state.backTo = '/tutor/submissions?source=IMPORT&graded=false'`.
3. Tutor enters a score and clicks Save Grade. On success, the app navigates to `/tutor/submissions?source=IMPORT&graded=false`.
4. The list page remounts at that URL, initializes filters from it, and fetches immediately — the just-graded submission no longer appears, since it now has `graded = true`.

## Testing (TDD — tests written first, must fail before the fix)

**`SubmissionListPage.test.jsx`:**
- After clicking Search with a filter set (e.g. `source = STUDENT`, `graded = 'true'`), assert the resulting location search reflects those params (render with a route wrapper that exposes `location.search`, or assert via `MemoryRouter` history).
- Mounting at `/tutor/submissions?source=STUDENT&graded=true&studentName=alice&exerciseId=42` pre-fills all corresponding inputs and calls `submissionApi.list` with those values on first load (extends the existing `batchId`-only prefill test).
- Clicking a submission row navigates with `state.backTo` equal to the current location's path + search.

**`SubmissionDetailPage.test.jsx`:**
- Rendering the route with `initialEntries: [{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?source=STUDENT' } }]`, then clicking Save Grade after `submissionApi.grade` resolves, navigates to that `backTo` path (assert via a sibling `<Route path="/tutor/submissions" element={...} />` rendering a marker, or by inspecting the memory history).
- Same for clicking **Back to Submissions** and for a successful **Delete Submission**.
- When rendered with no `state` (direct entry, as today's tests already do), all three actions still navigate to plain `/tutor/submissions` — regression coverage for the fallback.

## Out of scope

- No backend changes — `submissionApi.list` already accepts all these filter params.
- No change to `GroupSubmissionPage.jsx` — it has its own unrelated navigation flow and isn't part of the grading return-to-list path.
- No deep-linking / bookmarking support beyond what already exists for `batchId` — this only fixes in-app navigation within a tab's `MemoryRouter`.
