# Return to Filtered Submissions List After Grading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a tutor filters the Submissions list and opens a submission to grade it, all four "return to list" actions on the grading page (Back to Submissions, Breadcrumb link, Save Grade, Delete Submission) return to the list with the same filters and page re-applied, re-executing the query.

**Architecture:** `SubmissionListPage` becomes URL-driven — filters and page live in `useSearchParams` (not just local state), so remounting at the same URL reproduces the same query. When a row is clicked, the current filtered URL is captured and handed to `SubmissionDetailPage` via `navigate(..., { state: { backTo } })`. The grading page reads `backTo` once (`location.state?.backTo ?? '/tutor/submissions'`) and uses it for all four return-to-list actions.

**Tech Stack:** React 18.3.1, react-router-dom (`useSearchParams`, `useLocation`, `useNavigate`), Vitest + Testing Library.

## Global Constraints

- No backend changes — `submissionApi.list` already accepts `studentName`, `exerciseId`, `batchId`, `source`, `graded`, `page`.
- No changes to `GroupSubmissionPage.jsx` — unrelated navigation flow, out of scope.
- This app runs each sidebar section in its own `MemoryRouter` (`AppShell.jsx`) — there is no real browser address bar. "URL" means the in-memory route location.
- No deep-linking/bookmarking support beyond what already exists for `batchId`.
- On a failed Save, the page must still show `saveError` and stay put (no navigation on error) — only success navigates.
- All four return-to-list actions (Breadcrumb, Back button, Save success, Delete success) must use the exact same fallback: `location.state?.backTo ?? '/tutor/submissions'`.
- Commits follow Conventional Commits, scoped `submission`, e.g. `feat(submission): ...`.

---

## Task 1: List page reads all filters + page from the URL on mount

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx:9-25`
- Test: `frontend/src/pages/tutor/SubmissionListPage.test.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: on mount, `page`, `studentName`, `exerciseId`, `batchId`, `source`, `graded` (and their `pending*` counterparts) are initialized from `searchParams` instead of being blank/zero (except `batchId`, which already worked this way). Later tasks rely on this being the single source of truth for "what the list currently shows."

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/pages/tutor/SubmissionListPage.test.jsx`:

```js
it('pre-fills all filters and page from the URL on mount', async () => {
  renderPage('/tutor/submissions?studentName=alice&exerciseId=42&source=STUDENT&graded=true&page=2');

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledWith(
    expect.objectContaining({
      studentName: 'alice', exerciseId: '42', source: 'STUDENT', graded: 'true', page: 2,
    })
  ));
  expect(screen.getByPlaceholderText(/filter by student name/i).value).toBe('alice');
  expect(screen.getByPlaceholderText(/filter by exercise id/i).value).toBe('42');
  expect(screen.getByLabelText(/source/i).value).toBe('STUDENT');
  expect(screen.getByLabelText(/graded/i).value).toBe('true');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx -t "pre-fills all filters"`
Expected: FAIL — `submissionApi.list` is called with `studentName: ''`, `exerciseId: ''`, `source: ''`, `page: 0` (URL params are ignored today except `batchId`).

- [ ] **Step 3: Initialize all filter state from the URL**

In `frontend/src/pages/tutor/SubmissionListPage.jsx`, replace:

```js
  const initialBatchId = searchParams.get('batchId') || '';

  const [submissions, setSubmissions] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [pendingStudentName, setPendingStudentName] = useState('');
  const [pendingExerciseId, setPendingExerciseId] = useState('');
  const [pendingBatchId, setPendingBatchId] = useState(initialBatchId);
  const [studentName, setStudentName] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [batchId, setBatchId] = useState(initialBatchId);
  const [source, setSource] = useState('');
  const [pendingSource, setPendingSource] = useState('');
  const [pendingGraded, setPendingGraded] = useState('');
  const [graded, setGraded] = useState('');
```

with:

```js
  const initialStudentName = searchParams.get('studentName') || '';
  const initialExerciseId = searchParams.get('exerciseId') || '';
  const initialBatchId = searchParams.get('batchId') || '';
  const initialSource = searchParams.get('source') || '';
  const initialGraded = searchParams.get('graded') || '';
  const initialPage = Number(searchParams.get('page')) || 0;

  const [submissions, setSubmissions] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [pendingStudentName, setPendingStudentName] = useState(initialStudentName);
  const [pendingExerciseId, setPendingExerciseId] = useState(initialExerciseId);
  const [pendingBatchId, setPendingBatchId] = useState(initialBatchId);
  const [studentName, setStudentName] = useState(initialStudentName);
  const [exerciseId, setExerciseId] = useState(initialExerciseId);
  const [batchId, setBatchId] = useState(initialBatchId);
  const [source, setSource] = useState(initialSource);
  const [pendingSource, setPendingSource] = useState(initialSource);
  const [pendingGraded, setPendingGraded] = useState(initialGraded);
  const [graded, setGraded] = useState(initialGraded);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx`
Expected: PASS (all tests in the file, including the new one and the pre-existing `batchId`-only prefill test).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionListPage.jsx frontend/src/pages/tutor/SubmissionListPage.test.jsx
git commit -m "feat(submission): pre-fill all list filters and page from the URL"
```

---

## Task 2: List page writes applied filters + page back into the URL

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx:1-2, :7-9, :43-50`
- Test: `frontend/src/pages/tutor/SubmissionListPage.test.jsx`

**Interfaces:**
- Consumes: `page`, `studentName`, `exerciseId`, `batchId`, `source`, `graded` state from Task 1.
- Produces: the route's search string always mirrors the applied filters (non-empty ones only, `page` omitted when `0`). Task 3 relies on `location.search` reflecting this.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/pages/tutor/SubmissionListPage.test.jsx`. Add `useLocation` to the existing `react-router-dom` import at the top of the file:

```js
import { MemoryRouter, useLocation } from 'react-router-dom';
```

Then add:

```js
it('updates the location search to match applied filters after clicking Search', async () => {
  let capturedSearch;
  function LocationSpy() {
    capturedSearch = useLocation().search;
    return null;
  }

  render(
    <MemoryRouter initialEntries={['/tutor/submissions']}>
      <SubmissionListPage />
      <LocationSpy />
    </MemoryRouter>
  );
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'STUDENT' } });
  fireEvent.change(screen.getByLabelText(/graded/i), { target: { value: 'true' } });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
  const params = new URLSearchParams(capturedSearch);
  expect(params.get('source')).toBe('STUDENT');
  expect(params.get('graded')).toBe('true');
  expect(params.get('page')).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx -t "updates the location search"`
Expected: FAIL — `capturedSearch` stays `''`; nothing writes to the URL today.

- [ ] **Step 3: Sync filters + page into the URL**

In `frontend/src/pages/tutor/SubmissionListPage.jsx`, change the `useSearchParams` destructure from:

```js
  const [searchParams] = useSearchParams();
```

to:

```js
  const [searchParams, setSearchParams] = useSearchParams();
```

Then, immediately after the existing fetch-triggering `useEffect` (the one with dependency array `[page, studentName, exerciseId, batchId, source, graded, searchTrigger]`), add a new effect:

```js
  useEffect(() => {
    const params = {};
    if (studentName.trim()) params.studentName = studentName.trim();
    if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
    if (batchId.trim()) params.batchId = batchId.trim();
    if (source) params.source = source;
    if (graded !== '') params.graded = graded;
    if (page > 0) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [page, studentName, exerciseId, batchId, source, graded, setSearchParams]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionListPage.jsx frontend/src/pages/tutor/SubmissionListPage.test.jsx
git commit -m "feat(submission): keep list filters and page in sync with the URL"
```

---

## Task 3: List page hands the filtered URL to the grading page

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx:1-2, :151-157`
- Test: `frontend/src/pages/tutor/SubmissionListPage.test.jsx`

**Interfaces:**
- Consumes: `location.search` (kept accurate by Task 2).
- Produces: clicking a row navigates with `state: { backTo: '/tutor/submissions' + location.search }`. Task 4 reads `location.state.backTo` on the receiving end.

- [ ] **Step 1: Write the failing test**

Add `Routes, Route` to the `react-router-dom` import in the test file (alongside `MemoryRouter, useLocation` from Task 2):

```js
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
```

Then add:

```js
it('navigates to a clicked submission with backTo set to the current filtered URL', async () => {
  submissionApi.list = vi.fn().mockResolvedValue({
    content: [{
      id: 5, studentName: 'Alice', exerciseTitle: 'Ex1', exerciseType: 'BLOCKLY',
      autoScore: 100, tutorScore: null, graded: false, versionMismatch: false,
      createdAt: '2026-05-01T10:00:00', batchId: null,
    }],
    totalPages: 1,
  });

  let capturedState;
  function StateSpy() {
    capturedState = useLocation().state;
    return null;
  }

  render(
    <MemoryRouter initialEntries={['/tutor/submissions?source=STUDENT']}>
      <Routes>
        <Route path="/tutor/submissions" element={<SubmissionListPage />} />
        <Route path="/tutor/submissions/:id" element={<StateSpy />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Alice'));
  fireEvent.click(screen.getByText('Alice'));

  await waitFor(() => expect(capturedState).toEqual({ backTo: '/tutor/submissions?source=STUDENT' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx -t "backTo set to the current filtered URL"`
Expected: FAIL — `capturedState` is `null` (row click navigates with no state today).

- [ ] **Step 3: Pass `backTo` on row click**

In `frontend/src/pages/tutor/SubmissionListPage.jsx`, add `useLocation` to the import:

```js
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
```

Add, alongside the existing `navigate`/`searchParams` hooks near the top of the component:

```js
  const location = useLocation();
```

Then change the row's `onClick`:

```js
                onClick={() => navigate(`/tutor/submissions/${sub.id}`)}
```

to:

```js
                onClick={() => navigate(`/tutor/submissions/${sub.id}`, { state: { backTo: `/tutor/submissions${location.search}` } })}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionListPage.jsx frontend/src/pages/tutor/SubmissionListPage.test.jsx
git commit -m "feat(submission): carry the filtered list URL into the grading page"
```

---

## Task 4: Grading page reads `backTo` for the Breadcrumb and Back button

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.jsx:1-2, :172-180`
- Test: `frontend/src/pages/tutor/SubmissionDetailPage.test.jsx`

**Interfaces:**
- Consumes: `location.state.backTo` (produced by Task 3), falls back to `/tutor/submissions` when absent.
- Produces: a `backTo` constant in `SubmissionDetailPage`, used here and relied on by Tasks 5 and 6.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/pages/tutor/SubmissionDetailPage.test.jsx`, change the `Breadcrumb` mock to a spy so its props can be inspected, and import it:

```js
vi.mock('../../components/Breadcrumb', () => ({
  default: vi.fn(() => null),
}));
```

```js
import Breadcrumb from '../../components/Breadcrumb';
```

Add `useLocation` to the existing `react-router-dom` import (it's already `MemoryRouter, Route, Routes`):

```js
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
```

Add these three tests:

```js
it('passes backTo as the Submissions breadcrumb link when present', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });

  render(
    <MemoryRouter initialEntries={[{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?source=STUDENT' } }]}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(Breadcrumb).toHaveBeenCalled());
  const lastProps = Breadcrumb.mock.calls.at(-1)[0];
  expect(lastProps.items).toContainEqual({ label: 'Submissions', to: '/tutor/submissions?source=STUDENT' });
});

it('navigates to backTo when Back to Submissions is clicked', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });

  function ListPageStub() {
    return <div>List Page {useLocation().search}</div>;
  }

  render(
    <MemoryRouter initialEntries={[{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?source=STUDENT' } }]}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/tutor/submissions" element={<ListPageStub />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Test Exercise'));
  fireEvent.click(screen.getByText(/back to submissions/i));

  await waitFor(() => screen.getByText('List Page ?source=STUDENT'));
});

it('falls back to /tutor/submissions when no backTo state is present', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });

  render(
    <MemoryRouter initialEntries={['/tutor/submissions/1']}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/tutor/submissions" element={<div>List Page</div>} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Test Exercise'));
  fireEvent.click(screen.getByText(/back to submissions/i));

  await waitFor(() => screen.getByText('List Page'));
});
```

`fireEvent` must be imported in the test file — it already is not currently imported there (only `render, screen, waitFor`). Update the import:

```js
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx`
Expected: FAIL for two of the three new tests — the Breadcrumb always receives `to: '/tutor/submissions'` (not the filtered `backTo`), so the breadcrumb-props test fails; the Back-button test fails because it navigates to a bare `/tutor/submissions` (no query string), so the stub never renders `'List Page ?source=STUDENT'`. The fallback test (no `backTo` state) already passes today — that's expected, it's regression coverage for behavior that isn't changing.

- [ ] **Step 3: Compute and use `backTo`**

In `frontend/src/pages/tutor/SubmissionDetailPage.jsx`, change the import:

```js
import { useParams, useNavigate } from 'react-router-dom';
```

to:

```js
import { useParams, useNavigate, useLocation } from 'react-router-dom';
```

Add, alongside the existing `navigate` hook near the top of the component:

```js
  const location = useLocation();
  const backTo = location.state?.backTo ?? '/tutor/submissions';
```

Change the Breadcrumb:

```js
      <Breadcrumb items={[
        { label: 'Submissions', to: '/tutor/submissions' },
        { label: 'Submission Detail' },
      ]} />
```

to:

```js
      <Breadcrumb items={[
        { label: 'Submissions', to: backTo },
        { label: 'Submission Detail' },
      ]} />
```

Change the Back button:

```js
      <button onClick={() => navigate('/tutor/submissions')}
```

to:

```js
      <button onClick={() => navigate(backTo)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionDetailPage.jsx frontend/src/pages/tutor/SubmissionDetailPage.test.jsx
git commit -m "feat(submission): return to the filtered list from the grading page breadcrumb and back button"
```

---

## Task 5: Save Grade navigates to `backTo` on success

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.jsx:68-108`
- Test: `frontend/src/pages/tutor/SubmissionDetailPage.test.jsx`

**Interfaces:**
- Consumes: `backTo` from Task 4.
- Produces: n/a (terminal behavior for this task).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/pages/tutor/SubmissionDetailPage.test.jsx`:

```js
it('navigates to backTo after a successful save', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });
  submissionApi.grade.mockResolvedValue({ ...baseSubmission, tutorScore: 90, graded: true });

  render(
    <MemoryRouter initialEntries={[{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?graded=false' } }]}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/tutor/submissions" element={<div>List Page</div>} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Test Exercise'));
  fireEvent.change(screen.getByLabelText(/score/i), { target: { value: '90' } });
  fireEvent.click(screen.getByRole('button', { name: /save grade/i }));

  await waitFor(() => screen.getByText('List Page'));
  expect(submissionApi.grade).toHaveBeenCalledWith('1', { tutorScore: 90, tutorComment: null });
});

it('stays on the page and shows an error when save fails', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });
  submissionApi.grade.mockRejectedValue({ response: { data: { error: { message: 'Save failed.' } } } });

  render(
    <MemoryRouter initialEntries={[{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?graded=false' } }]}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/tutor/submissions" element={<div>List Page</div>} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Test Exercise'));
  fireEvent.change(screen.getByLabelText(/score/i), { target: { value: '90' } });
  fireEvent.click(screen.getByRole('button', { name: /save grade/i }));

  await waitFor(() => screen.getByText('Save failed.'));
  expect(screen.queryByText('List Page')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify the first one fails**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx -t "after a successful save"`
Expected: FAIL — today, a successful save calls `setSubmission(data)` and stays on the page; `'List Page'` never appears. The "stays on the page and shows an error" test already passes today (no behavior change for the failure path) — that's expected, it's regression coverage.

- [ ] **Step 3: Navigate to `backTo` on success**

In `frontend/src/pages/tutor/SubmissionDetailPage.jsx`, in `handleSave`, change:

```js
      const data = await submissionApi.grade(id, payload);
      setSubmission(data);
```

to:

```js
      await submissionApi.grade(id, payload);
      navigate(backTo);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionDetailPage.jsx frontend/src/pages/tutor/SubmissionDetailPage.test.jsx
git commit -m "feat(submission): return to the filtered list after saving a grade"
```

---

## Task 6: Delete Submission navigates to `backTo` on success

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.jsx:110-120`
- Test: `frontend/src/pages/tutor/SubmissionDetailPage.test.jsx`

**Interfaces:**
- Consumes: `backTo` from Task 4.
- Produces: n/a (terminal behavior for this task).

- [ ] **Step 1: Write the failing test**

The fallback path (`/tutor/submissions`, no query) is the same string whether `backTo` is used or not, so a route stub that just renders `'List Page'` wouldn't distinguish "fixed" from "unfixed." Assert on the query string itself instead, via a stub that renders `location.search`.

Add `useLocation` to the test file's existing `react-router-dom` import (alongside `MemoryRouter, Route, Routes`):

```js
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
```

Add to `frontend/src/pages/tutor/SubmissionDetailPage.test.jsx`:

```js
it('navigates to backTo after a successful delete', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({ currentVersion: { config: {} } });
  submissionApi.delete.mockResolvedValue({});
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  function ListPageStub() {
    return <div>List Page {useLocation().search}</div>;
  }

  render(
    <MemoryRouter initialEntries={[{ pathname: '/tutor/submissions/1', state: { backTo: '/tutor/submissions?source=STUDENT' } }]}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        <Route path="/tutor/submissions" element={<ListPageStub />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Test Exercise'));
  fireEvent.click(screen.getByRole('button', { name: /delete submission/i }));

  await waitFor(() => screen.getByText('List Page ?source=STUDENT'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx -t "after a successful delete"`
Expected: FAIL — `handleDelete` navigates to a bare `/tutor/submissions` (no search string) today, so the text never becomes `'List Page ?source=STUDENT'`.

- [ ] **Step 3: Navigate to `backTo` on successful delete**

In `frontend/src/pages/tutor/SubmissionDetailPage.jsx`, in `handleDelete`, change:

```js
      await submissionApi.delete(id);
      navigate('/tutor/submissions');
```

to:

```js
      await submissionApi.delete(id);
      navigate(backTo);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS — no regressions in other suites.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionDetailPage.jsx frontend/src/pages/tutor/SubmissionDetailPage.test.jsx
git commit -m "feat(submission): return to the filtered list after deleting a submission"
```
