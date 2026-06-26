# Search Button for Filter Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace immediate-fire filter queries with explicit Search button (+ Enter key) on UserManagementPage, ExerciseManagementPage, and SubmissionListPage.

**Architecture:** Each page splits its state into "pending filters" (what the user is typing/selecting) and "committed filters" (what was last searched). The `useEffect` / `load()` call is decoupled from filter input changes; it only fires on committed filter state changes or page navigation. A Search button commits pending → committed and resets to page 0.

**Tech Stack:** React 18, plain inline styles (matching existing codebase conventions), no new dependencies.

## Global Constraints

- No new dependencies.
- Follow existing inline-style conventions — no CSS classes.
- Enter key in any text input triggers search (standard form UX).
- Pagination page changes still trigger re-fetch (navigating existing results, not a new search).
- Initial mount still loads data (no change to startup behaviour).

---

### Task 1: UserManagementPage — Search Button

**Files:**
- Modify: `frontend/src/pages/admin/UserManagementPage.jsx`
- Test: `frontend/src/pages/admin/UserManagementPage.test.jsx`

**Interfaces:**
- Produces: same exported default component, no API changes.

- [ ] **Step 1: Read the existing test file to understand current test patterns**

Run: `cat -n frontend/src/pages/admin/UserManagementPage.test.jsx`

- [ ] **Step 2: Write the failing test — Search button triggers load, not filter change**

Open `frontend/src/pages/admin/UserManagementPage.test.jsx`. Add (or replace existing filter-change tests with) the following test cases. Keep any existing tests that don't conflict.

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import UserManagementPage from './UserManagementPage';
import { userApi } from '../../api/userApi';
import { AuthContext } from '../../contexts/AuthContext';

vi.mock('../../api/userApi');
vi.mock('../../api/axiosInstance', () => ({ isReauthCancelled: () => false }));

const emptyPage = { content: [], totalPages: 0 };
const wrapper = ({ children }) => (
  <AuthContext.Provider value={{ user: { id: 99 } }}>
    {children}
  </AuthContext.Provider>
);

beforeEach(() => {
  userApi.list = vi.fn().mockResolvedValue(emptyPage);
  userApi.updateRole = vi.fn();
  userApi.updateStatus = vi.fn();
  userApi.updateExpiration = vi.fn();
  userApi.resetPassword = vi.fn();
});

it('does not call userApi.list again when name input changes without clicking Search', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/search by username/i), {
    target: { value: 'alice' },
  });

  // Still only 1 call (the initial mount call)
  expect(userApi.list).toHaveBeenCalledTimes(1);
});

it('calls userApi.list with name filter after clicking Search', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/search by username/i), {
    target: { value: 'alice' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(2));
  expect(userApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'alice', page: 0 }));
});

it('calls userApi.list with name filter after pressing Enter in text input', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(1));

  const input = screen.getByPlaceholderText(/search by username/i);
  fireEvent.change(input, { target: { value: 'bob' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(2));
  expect(userApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'bob', page: 0 }));
});

it('does not call userApi.list when dropdown changes without clicking Search', async () => {
  render(<UserManagementPage />, { wrapper });
  await waitFor(() => expect(userApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByDisplayValue('All Roles'), {
    target: { value: 'TUTOR' },
  });

  expect(userApi.list).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd frontend && npm test -- --run UserManagementPage
```

Expected: tests fail (Search button not found / filter still fires immediately).

- [ ] **Step 4: Implement the change in UserManagementPage.jsx**

Replace the filter section and related state/effect with the pending-filter pattern:

```jsx
// Replace state declarations for filters:
const [pendingName, setPendingName] = useState('');
const [pendingRole, setPendingRole] = useState('');
const [pendingStatus, setPendingStatus] = useState('');
// These are the "committed" values that actually drive the query:
const [nameFilter, setNameFilter] = useState('');
const [roleFilter, setRoleFilter] = useState('');
const [statusFilter, setStatusFilter] = useState('');

// Replace useEffect:
useEffect(() => { load(); }, [page, nameFilter, roleFilter, statusFilter]);

// Add search handler (call this from button and Enter):
function handleSearch() {
  setPage(0);
  setNameFilter(pendingName);
  setRoleFilter(pendingRole);
  setStatusFilter(pendingStatus);
}

// Replace the filter div (lines 127-146):
<div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
  <input
    type="text"
    placeholder="Search by username or name"
    value={pendingName}
    onChange={e => setPendingName(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
    style={{ padding: 8, minWidth: 220 }}
  />
  <select value={pendingRole} onChange={e => setPendingRole(e.target.value)}
    style={{ padding: 8 }}>
    <option value="">All Roles</option>
    {['STUDENT', 'TUTOR', 'SUPER_ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
  </select>
  <select value={pendingStatus} onChange={e => setPendingStatus(e.target.value)}
    style={{ padding: 8 }}>
    <option value="">All Statuses</option>
    <option value="ACTIVE">ACTIVE</option>
    <option value="DISABLED">DISABLED</option>
  </select>
  <button
    onClick={handleSearch}
    style={{ padding: '8px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
    Search
  </button>
</div>
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd frontend && npm test -- --run UserManagementPage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/admin/UserManagementPage.jsx \
        frontend/src/pages/admin/UserManagementPage.test.jsx
git commit -m "feat(user): replace live filter with Search button on user management page"
```

---

### Task 2: ExerciseManagementPage — Search Button

**Files:**
- Modify: `frontend/src/pages/tutor/ExerciseManagementPage.jsx`

**Interfaces:**
- Produces: same exported default component, no API changes.

Note: there is no existing test file for ExerciseManagementPage. Create one.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/tutor/ExerciseManagementPage.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ExerciseManagementPage from './ExerciseManagementPage';
import { exerciseApi } from '../../api/exerciseApi';
import { categoryApi } from '../../api/categoryApi';

vi.mock('../../api/exerciseApi');
vi.mock('../../api/categoryApi');

const emptyPage = { content: [], totalPages: 0 };

beforeEach(() => {
  exerciseApi.list = vi.fn().mockResolvedValue(emptyPage);
  categoryApi.list = vi.fn().mockResolvedValue({ content: [] });
});

const renderPage = () =>
  render(<MemoryRouter><ExerciseManagementPage /></MemoryRouter>);

it('does not call exerciseApi.list again when title input changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/search title/i), {
    target: { value: 'loops' },
  });

  expect(exerciseApi.list).toHaveBeenCalledTimes(1);
});

it('calls exerciseApi.list with title after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/search title/i), {
    target: { value: 'loops' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(2));
  expect(exerciseApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'loops', page: 0 }));
});

it('calls exerciseApi.list after pressing Enter in title input', async () => {
  renderPage();
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  const input = screen.getByPlaceholderText(/search title/i);
  fireEvent.change(input, { target: { value: 'variables' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(2));
  expect(exerciseApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'variables' }));
});

it('does not call exerciseApi.list when type dropdown changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByDisplayValue('All Types'), {
    target: { value: 'PYTHON' },
  });

  expect(exerciseApi.list).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- --run ExerciseManagementPage
```

Expected: tests fail (Search button not found / filter fires immediately).

- [ ] **Step 3: Implement the change in ExerciseManagementPage.jsx**

Replace the filter handling with the pending-filter pattern. Remove the `debounceRef` and `handleFilterChange` function entirely.

```jsx
// Remove: import { useEffect, useRef, useState } from 'react';
// Replace with:
import { useEffect, useState } from 'react';

// Replace filters state with two sets:
const [pendingFilters, setPendingFilters] = useState({
  type: '', status: '', categoryId: '', difficulty: '', title: '',
});
const [filters, setFilters] = useState({
  type: '', status: '', categoryId: '', difficulty: '', title: '',
});

// Remove debounceRef entirely.

// load() stays the same, driven by the committed `filters` state.
// Replace useEffect:
useEffect(() => {
  categoryApi.list(0, 200).then(d => setCategories(d.content));
  load(0);
}, []);

useEffect(() => { load(0); }, [filters]);
// Note: load uses the `filters` parameter, so pass it explicitly:
async function load(p = 0, f = filters) { ... } // no change needed here

// Add search handler:
function handleSearch() {
  setPage(0);
  setFilters({ ...pendingFilters });
}

// Replace filter div (lines 91-122) — change all onChange to update pendingFilters,
// add onKeyDown on the title input, add Search button:
<div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
  <input
    placeholder="Search title…"
    value={pendingFilters.title}
    onChange={e => setPendingFilters(p => ({ ...p, title: e.target.value }))}
    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
    style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, width: 200 }}
  />
  <select value={pendingFilters.type}
    onChange={e => setPendingFilters(p => ({ ...p, type: e.target.value }))}
    style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
    <option value="">All Types</option>
    <option value="BLOCKLY">Blockly</option>
    <option value="PYTHON">Python</option>
  </select>
  <select value={pendingFilters.status}
    onChange={e => setPendingFilters(p => ({ ...p, status: e.target.value }))}
    style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
    <option value="">All Statuses</option>
    <option value="DRAFT">Draft</option>
    <option value="PUBLISHED">Published</option>
  </select>
  <select value={pendingFilters.difficulty}
    onChange={e => setPendingFilters(p => ({ ...p, difficulty: e.target.value }))}
    style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
    <option value="">All Difficulties</option>
    <option value="EASY">Easy</option>
    <option value="MEDIUM">Medium</option>
    <option value="HARD">Hard</option>
  </select>
  <select value={pendingFilters.categoryId}
    onChange={e => setPendingFilters(p => ({ ...p, categoryId: e.target.value }))}
    style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
    <option value="">All Categories</option>
    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
  </select>
  <button
    onClick={handleSearch}
    style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
    Search
  </button>
</div>
```

Also update the `Pagination` `onPageChange` to pass the committed filters:
```jsx
<Pagination page={page} totalPages={totalPages} onPageChange={(p) => load(p, filters)} />
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm test -- --run ExerciseManagementPage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/ExerciseManagementPage.jsx \
        frontend/src/pages/tutor/ExerciseManagementPage.test.jsx
git commit -m "feat(exercise): replace live filter with Search button on exercise management page"
```

---

### Task 3: SubmissionListPage — Search Button

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx`

**Interfaces:**
- Produces: same exported default component, no API changes.

Note: there is no existing test file for SubmissionListPage. Create one.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/tutor/SubmissionListPage.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SubmissionListPage from './SubmissionListPage';
import { submissionApi } from '../../api/submissionApi';

vi.mock('../../api/submissionApi', () => ({
  submissionApi: { list: vi.fn(), delete: vi.fn() },
  csvExportUrl: () => '/api/v1/submissions/export.csv',
}));

const emptyPage = { content: [], totalPages: 0 };

beforeEach(() => {
  submissionApi.list = vi.fn().mockResolvedValue(emptyPage);
});

const renderPage = () =>
  render(<MemoryRouter><SubmissionListPage /></MemoryRouter>);

it('does not call submissionApi.list again when student name input changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/filter by student name/i), {
    target: { value: 'alice' },
  });

  expect(submissionApi.list).toHaveBeenCalledTimes(1);
});

it('calls submissionApi.list with studentName after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/filter by student name/i), {
    target: { value: 'alice' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
  expect(submissionApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ studentName: 'alice', page: 0 })
  );
});

it('calls submissionApi.list after pressing Enter in student name input', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  const input = screen.getByPlaceholderText(/filter by student name/i);
  fireEvent.change(input, { target: { value: 'bob' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
  expect(submissionApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ studentName: 'bob' })
  );
});

it('does not call submissionApi.list when exercise ID input changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByPlaceholderText(/filter by exercise id/i), {
    target: { value: '42' },
  });

  expect(submissionApi.list).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- --run SubmissionListPage
```

Expected: tests fail (Search button not found / filter still fires immediately).

- [ ] **Step 3: Implement the change in SubmissionListPage.jsx**

Replace the debounce + effect pattern with pending-filter state:

```jsx
// Remove: import { useEffect, useState, useCallback } from 'react';
// Remove the debounce helper function entirely.
// Replace with:
import { useEffect, useState } from 'react';

// Replace state declarations:
const [pendingStudentName, setPendingStudentName] = useState('');
const [pendingExerciseId, setPendingExerciseId] = useState('');
const [studentName, setStudentName] = useState('');
const [exerciseId, setExerciseId] = useState('');

// Replace fetchSubmissions + debouncedFetch with a simple async function:
async function fetchSubmissions(params) {
  setLoading(true);
  try {
    const data = await submissionApi.list(params);
    setSubmissions(data.content);
    setTotalPages(data.totalPages);
  } catch {
    // ignore
  } finally {
    setLoading(false);
  }
}

// Replace useEffect:
useEffect(() => {
  const params = { page, size: 20 };
  if (studentName.trim()) params.studentName = studentName.trim();
  if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
  fetchSubmissions(params);
}, [page, studentName, exerciseId]);

// Add search handler:
function handleSearch() {
  setPage(0);
  setStudentName(pendingStudentName);
  setExerciseId(pendingExerciseId);
}

// Replace the filter div (lines 90-103):
<div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
  <input
    placeholder="Filter by student name…"
    value={pendingStudentName}
    onChange={e => setPendingStudentName(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
    style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', flex: 1 }}
  />
  <input
    placeholder="Filter by exercise ID…"
    value={pendingExerciseId}
    onChange={e => setPendingExerciseId(e.target.value)}
    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
    style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', width: 180 }}
  />
  <button
    onClick={handleSearch}
    style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
    Search
  </button>
</div>

// Update handleDelete to reference committed state (not pending):
// Inside handleDelete, replace references to studentName/exerciseId (they already
// refer to committed state after the refactor, so no change needed there).

// Update csvHref line:
const csvHref = csvExportUrl(exerciseId.trim() || null);
// (exerciseId here is the committed state, which is correct — export uses last searched ID)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm test -- --run SubmissionListPage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionListPage.jsx \
        frontend/src/pages/tutor/SubmissionListPage.test.jsx
git commit -m "feat(submission): replace live filter with Search button on submission list page"
```

---

### Task 4: Full test suite verification

- [ ] **Step 1: Run entire frontend test suite**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: Smoke-test in browser (manual)**

Start the dev server:
```bash
cd frontend && npm run dev
```

For each page, verify:
1. Typing/selecting filters does **not** reload the table.
2. Clicking **Search** loads results matching the filters.
3. Pressing **Enter** in any text field triggers search.
4. Clicking a pagination page still loads the correct page.
5. Clearing all filters and clicking Search returns the full list.

- [ ] **Step 3: Final commit (if any cleanup needed)**

```bash
git add -p
git commit -m "chore: cleanup after search button refactor"
```
