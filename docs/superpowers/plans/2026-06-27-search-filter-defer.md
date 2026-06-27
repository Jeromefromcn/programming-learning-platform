# Search Filter Defer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop filter changes from triggering API calls immediately — both the Source dropdown on SubmissionListPage and all three dropdowns on ExerciseListPage should only fire a fetch when the Search button is clicked.

**Architecture:** Each page maintains a "pending" state that reflects the UI and a "committed" state that drives fetches. Only the Search button (or Enter key for text inputs) copies pending → committed, which triggers the fetch. This pattern already exists in SubmissionListPage for text inputs; we extend it to cover the Source dropdown and to ExerciseListPage.

**Tech Stack:** React 18, Vitest, @testing-library/react, react-router-dom (MemoryRouter for tests)

## Global Constraints

- No backend changes.
- No new dependencies.
- Follow the pending/committed state pattern already used in `SubmissionListPage` for `pendingStudentName` / `studentName`.
- Tests use Vitest + @testing-library/react. Mocks use `vi.mock` / `vi.fn()`.
- Run tests with: `cd frontend && npm test -- --run` (all tests) or `npx vitest run <file>` (single file).

---

### Task 1: Fix SubmissionListPage — Source dropdown must not auto-fetch

**Spec:** The Source `<select>` currently sets `source` state directly, which the `useEffect` depends on, causing an immediate fetch. We introduce `pendingSource` so the dropdown only updates pending state; Search commits it.

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx`
- Modify: `frontend/src/pages/tutor/SubmissionListPage.test.jsx`

**Interfaces:**
- Produces: `SubmissionListPage` where changing the Source dropdown alone never calls `submissionApi.list`; clicking Search with a new source calls it with `{ source: 'STUDENT' }`.

- [ ] **Step 1: Update the existing test that expects the old (wrong) behaviour**

Open `frontend/src/pages/tutor/SubmissionListPage.test.jsx`. The test `'requests IMPORT source by default and STUDENT after switching'` currently asserts that changing the dropdown immediately fires a new call — that is the bug. Replace it with two tests: one that verifies changing the dropdown alone does NOT re-fetch, and one that verifies clicking Search with the new source DOES fetch.

Replace from line 72 to end of file with:

```jsx
it('does not call submissionApi.list when source dropdown changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'STUDENT' } });

  expect(submissionApi.list).toHaveBeenCalledTimes(1);
});

it('calls submissionApi.list with new source after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'STUDENT' } });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
  expect(submissionApi.list).toHaveBeenLastCalledWith(
    expect.objectContaining({ source: 'STUDENT', page: 0 })
  );
});

it('calls submissionApi.list with IMPORT source by default on mount', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledWith(
    expect.objectContaining({ source: 'IMPORT' })
  ));
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx
```

Expected: the first new test (`does not call ... without clicking Search`) FAILS because the current implementation auto-fetches.

- [ ] **Step 3: Implement the fix in SubmissionListPage.jsx**

In `frontend/src/pages/tutor/SubmissionListPage.jsx`, make these changes:

1. Add `pendingSource` state (line 15, after `const [source, setSource] = useState('IMPORT');`):
```jsx
const [pendingSource, setPendingSource] = useState('IMPORT');
```

2. In `handleSearch` (line 39), add `setSource(pendingSource)`:
```jsx
function handleSearch() {
  setPage(0);
  setStudentName(pendingStudentName);
  setExerciseId(pendingExerciseId);
  setSource(pendingSource);
}
```

3. Update the Source `<select>` (around line 108) to use `pendingSource` and `setPendingSource`:
```jsx
<label>
  Source:
  <select value={pendingSource} onChange={e => setPendingSource(e.target.value)} style={{ marginLeft: 8 }}>
    <option value="IMPORT">Imported</option>
    <option value="STUDENT">Student</option>
  </select>
</label>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionListPage.jsx \
        frontend/src/pages/tutor/SubmissionListPage.test.jsx
git commit -m "fix(submission): defer source filter fetch until Search is clicked"
```

---

### Task 2: Fix ExerciseListPage — add pending state and Search button

**Spec:** All three dropdowns (type, difficulty, categoryId) call `load()` directly on change. We add `pendingFilters` state and a Search button. Dropdowns update only `pendingFilters`; the Search button commits to `filters` and calls `load()`.

**Files:**
- Modify: `frontend/src/pages/student/ExerciseListPage.jsx`
- Create: `frontend/src/pages/student/ExerciseListPage.test.jsx`

**Interfaces:**
- Consumes: `studentApi.listExercises(params)` → `{ content: [], totalPages: 0 }` and `categoryApi.list(0, 200)` → `{ content: [] }`
- Produces: `ExerciseListPage` where changing any dropdown alone never calls `studentApi.listExercises`; clicking Search calls it with the selected filter values.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/student/ExerciseListPage.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ExerciseListPage from './ExerciseListPage';
import { studentApi } from '../../api/studentApi';
import { categoryApi } from '../../api/categoryApi';

vi.mock('../../api/studentApi', () => ({
  studentApi: { listExercises: vi.fn() },
}));

vi.mock('../../api/categoryApi', () => ({
  categoryApi: { list: vi.fn() },
}));

const emptyPage = { content: [], totalPages: 0 };

beforeEach(() => {
  studentApi.listExercises = vi.fn().mockResolvedValue(emptyPage);
  categoryApi.list = vi.fn().mockResolvedValue({ content: [] });
});

const renderPage = () =>
  render(<MemoryRouter><ExerciseListPage /></MemoryRouter>);

it('calls studentApi.listExercises once on mount', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));
});

it('does not call studentApi.listExercises when type dropdown changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /type/i }), {
    target: { value: 'BLOCKLY' },
  });

  expect(studentApi.listExercises).toHaveBeenCalledTimes(1);
});

it('does not call studentApi.listExercises when difficulty dropdown changes without clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /difficulty/i }), {
    target: { value: 'EASY' },
  });

  expect(studentApi.listExercises).toHaveBeenCalledTimes(1);
});

it('calls studentApi.listExercises with selected type after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /type/i }), {
    target: { value: 'PYTHON' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(2));
  expect(studentApi.listExercises).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'PYTHON', page: 0 })
  );
});

it('calls studentApi.listExercises with selected difficulty after clicking Search', async () => {
  renderPage();
  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /difficulty/i }), {
    target: { value: 'HARD' },
  });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(studentApi.listExercises).toHaveBeenCalledTimes(2));
  expect(studentApi.listExercises).toHaveBeenLastCalledWith(
    expect.objectContaining({ difficulty: 'HARD', page: 0 })
  );
});
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/student/ExerciseListPage.test.jsx
```

Expected: the "does not call … without clicking Search" tests FAIL because the current implementation auto-fetches on every change, and the Search button tests FAIL because no Search button exists.

- [ ] **Step 3: Implement the fix in ExerciseListPage.jsx**

Replace the contents of `frontend/src/pages/student/ExerciseListPage.jsx` with:

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { categoryApi } from '../../api/categoryApi';
import Pagination from '../../components/Pagination';

const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const TYPE_LABELS = { BLOCKLY: 'Blockly', PYTHON: 'Python' };

const EMPTY_FILTERS = { type: '', categoryId: '', difficulty: '' };

export default function ExerciseListPage() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pendingFilters, setPendingFilters] = useState(EMPTY_FILTERS);

  async function load(p = 0, f = filters) {
    setLoading(true);
    try {
      const params = { page: p, size: 20 };
      if (f.type) params.type = f.type;
      if (f.categoryId) params.categoryId = f.categoryId;
      if (f.difficulty) params.difficulty = f.difficulty;
      const data = await studentApi.listExercises(params);
      setExercises(data.content);
      setTotalPages(data.totalPages);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    categoryApi.list(0, 200).then(d => setCategories(d.content));
    load(0);
  }, []);

  function handleSearch() {
    setFilters(pendingFilters);
    load(0, pendingFilters);
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Exercises</h1>

      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          Type:
          <select
            value={pendingFilters.type}
            onChange={e => setPendingFilters(prev => ({ ...prev, type: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value="">All Types</option>
            <option value="BLOCKLY">Blockly</option>
            <option value="PYTHON">Python</option>
          </select>
        </label>
        <label>
          Difficulty:
          <select
            value={pendingFilters.difficulty}
            onChange={e => setPendingFilters(prev => ({ ...prev, difficulty: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value="">All Difficulties</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </label>
        <label>
          Category:
          <select
            value={pendingFilters.categoryId}
            onChange={e => setPendingFilters(prev => ({ ...prev, categoryId: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button
          onClick={handleSearch}
          style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Search
        </button>
      </div>

      {loading ? <p style={{ marginTop: 24 }}>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Title</th>
              <th style={{ padding: 8 }}>Type</th>
              <th style={{ padding: 8 }}>Difficulty</th>
              <th style={{ padding: 8 }}>Category</th>
              <th style={{ padding: 8 }}>Version</th>
              <th style={{ padding: 8 }}>Likes</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map(ex => (
              <tr key={ex.id}
                onClick={() => navigate(`/student/exercises/${ex.id}/practice`)}
                style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: 8, color: '#1976d2', fontWeight: 500 }}>{ex.title}</td>
                <td style={{ padding: 8 }}>{TYPE_LABELS[ex.type] || ex.type}</td>
                <td style={{ padding: 8 }}>{DIFFICULTY_LABELS[ex.difficulty] || ex.difficulty}</td>
                <td style={{ padding: 8 }}>{ex.category?.name || '—'}</td>
                <td style={{ padding: 8 }}>v{ex.currentVersionNumber}</td>
                <td style={{ padding: 8 }}>{ex.likeCount}</td>
              </tr>
            ))}
            {exercises.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, color: '#999', textAlign: 'center' }}>
                  No exercises available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={(p) => load(p)} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/pages/student/ExerciseListPage.test.jsx
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full frontend test suite to check for regressions**

```bash
cd frontend && npm test -- --run
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/student/ExerciseListPage.jsx \
        frontend/src/pages/student/ExerciseListPage.test.jsx
git commit -m "fix(student): defer exercise filter fetch until Search is clicked"
```
