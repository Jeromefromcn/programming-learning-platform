# Dimension Description + Export Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional description field to scoring dimensions (shown in both the exercise editor and the grading panel), remove the standalone Export CSV button from the Submission List page, and include the tutor comment as the last column in the group-submission batch CSV export.

**Architecture:** All four changes are independent. Dimension `description` is stored inside the existing `config` JSON column on `exercise_versions` — no migration needed. The batch export change is a pure Java service edit. Frontend changes are in isolated component/page files.

**Tech Stack:** React 18 + Vitest + @testing-library/react (frontend); Java 25 + Spring Boot 3.5 + JUnit 5 + Mockito (backend)

## Global Constraints

- Never hard-delete submissions or exercises (`is_deleted` flag only).
- No new dependencies, no new API endpoints, no new DB migrations.
- TDD: write the failing test first, then implement.
- Conventional Commits: `feat(...)`, `fix(...)`, `test(...)`, etc.
- Run `cd frontend && npx vitest run` for frontend tests; `cd backend && mvn test` for backend tests.

---

### Task 1: RubricEditor — add description field per dimension

**Files:**
- Modify: `frontend/src/components/RubricEditor.jsx`
- Create: `frontend/src/components/RubricEditor.test.jsx`

**Interfaces:**
- Consumes: `dimensions` prop — array of `{ name: string, weight: string|number, description?: string }`
- Produces: `onChange` called with array of `{ name, weight, description }` — downstream callers (`ExerciseFormPage`, `SubmissionDetailPage`) read `d.description` from these objects

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/RubricEditor.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import RubricEditor from './RubricEditor';

it('renders a description input for each existing dimension', () => {
  const dims = [{ name: 'Logic', weight: '0.6', description: 'Algorithm correctness' }];
  render(<RubricEditor dimensions={dims} onChange={() => {}} />);
  expect(screen.getByPlaceholderText('Description (optional)')).toBeInTheDocument();
  expect(screen.getByDisplayValue('Algorithm correctness')).toBeInTheDocument();
});

it('calls onChange with updated description when description input changes', () => {
  const onChange = vi.fn();
  const dims = [{ name: 'Logic', weight: '0.6', description: '' }];
  render(<RubricEditor dimensions={dims} onChange={onChange} />);

  fireEvent.change(screen.getByPlaceholderText('Description (optional)'), {
    target: { value: 'The logic score' },
  });

  expect(onChange).toHaveBeenCalledWith([
    { name: 'Logic', weight: '0.6', description: 'The logic score' },
  ]);
});

it('new dimension added by + Add Dimension includes empty description', () => {
  const onChange = vi.fn();
  render(<RubricEditor dimensions={[]} onChange={onChange} />);

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Dimension/i }));

  expect(onChange).toHaveBeenCalledWith([
    { name: '', weight: '', description: '' },
  ]);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/RubricEditor.test.jsx
```

Expected: 3 failures — `description` input does not exist yet.

- [ ] **Step 3: Implement the description field in RubricEditor**

Replace the full content of `frontend/src/components/RubricEditor.jsx`:

```jsx
export default function RubricEditor({ dimensions, onChange }) {
  const sum = dimensions.reduce((acc, d) => acc + (parseFloat(d.weight) || 0), 0);
  const sumValid = Math.abs(sum - 1) < 1e-6;

  function updateDim(index, field, value) {
    const next = dimensions.map((d, i) =>
      i === index ? { ...d, [field]: value } : d
    );
    onChange(next);
  }

  function addDim() {
    onChange([...dimensions, { name: '', weight: '', description: '' }]);
  }

  function removeDim(index) {
    onChange(dimensions.filter((_, i) => i !== index));
  }

  return (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ marginBottom: 8 }}>Scoring Dimensions</h4>
      {dimensions.map((d, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <input
              placeholder="Dimension name"
              value={d.name}
              onChange={e => updateDim(i, 'name', e.target.value)}
              style={{ flex: 2, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }}
            />
            <input
              type="number"
              placeholder="Weight (0–1)"
              min="0"
              max="1"
              step="0.01"
              value={d.weight}
              onChange={e => updateDim(i, 'weight', e.target.value)}
              style={{ width: 120, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }}
            />
            <button
              type="button"
              onClick={() => removeDim(i)}
              style={{
                padding: '4px 10px', color: '#c62828', background: 'none',
                border: '1px solid #c62828', borderRadius: 4, cursor: 'pointer', fontSize: 12,
              }}
            >
              Remove
            </button>
          </div>
          <input
            placeholder="Description (optional)"
            value={d.description || ''}
            onChange={e => updateDim(i, 'description', e.target.value)}
            style={{
              width: '100%', padding: '6px 8px', border: '1px solid #ccc',
              borderRadius: 4, boxSizing: 'border-box',
            }}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={addDim}
        style={{
          padding: '5px 14px', background: '#fff', border: '1px solid #1976d2',
          color: '#1976d2', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginTop: 4,
        }}
      >
        + Add Dimension
      </button>
      <div style={{
        marginTop: 8, fontSize: 13,
        color: sumValid ? '#2e7d32' : '#c62828',
        fontWeight: 600,
      }}>
        Total weight: {sum.toFixed(4)}
        {!sumValid && dimensions.length > 0 && ' — must equal exactly 1.0'}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/RubricEditor.test.jsx
```

Expected: 3 passed.

- [ ] **Step 5: Run full frontend test suite to check for regressions**

```bash
cd frontend && npx vitest run
```

Expected: all pass. (ExerciseFormPage tests still work because they query by `placeholder` which is unchanged.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/RubricEditor.jsx frontend/src/components/RubricEditor.test.jsx
git commit -m "feat(exercise): add optional description field to scoring dimensions"
```

---

### Task 2: SubmissionDetailPage — show dimension description in grading panel

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.jsx`
- Create: `frontend/src/pages/tutor/SubmissionDetailPage.test.jsx`

**Interfaces:**
- Consumes: `rubricDimensions` array (loaded from `exerciseApi.get` response) — each element may have `description?: string` from Task 1's JSON schema
- Produces: visible `<span>` with description text rendered below the dimension label, only when `d.description` is truthy

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/tutor/SubmissionDetailPage.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubmissionDetailPage from './SubmissionDetailPage';
import { submissionApi } from '../../api/submissionApi';
import { exerciseApi } from '../../api/exerciseApi';

vi.mock('../../api/submissionApi', () => ({
  submissionApi: { getById: vi.fn(), grade: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../api/exerciseApi', () => ({
  exerciseApi: { get: vi.fn() },
}));
vi.mock('../../components/BlocklySubmissionViewer', () => ({
  default: () => <div data-testid="blockly-viewer" />,
}));
vi.mock('../../components/Breadcrumb', () => ({
  default: () => null,
}));
vi.mock('../../api/axiosInstance', () => ({
  isReauthCancelled: () => false,
}));

const baseSubmission = {
  id: 1,
  exerciseId: 42,
  exerciseType: 'BLOCKLY',
  exerciseTitle: 'Test Exercise',
  studentName: 'alice',
  workspaceXml: '<xml/>',
  graded: false,
  versionMismatch: false,
  tutorScore: null,
  autoScore: null,
  tutorComment: null,
  tutorGradeDetails: null,
  autoGradeDetails: null,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/tutor/submissions/1']}>
      <Routes>
        <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

it('shows dimension description below the dimension label in the grading panel', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({
    currentVersion: {
      config: {
        showResult: false,
        rubric: {
          dimensions: [
            { name: 'Logic', weight: 0.6, description: 'Correctness of the algorithm' },
          ],
        },
      },
    },
  });

  renderPage();

  await waitFor(() => screen.getByText('Correctness of the algorithm'));
  expect(screen.getByText('Correctness of the algorithm')).toBeInTheDocument();
});

it('does not render description text when description is absent', async () => {
  submissionApi.getById.mockResolvedValue(baseSubmission);
  exerciseApi.get.mockResolvedValue({
    currentVersion: {
      config: {
        showResult: false,
        rubric: {
          dimensions: [{ name: 'Logic', weight: 0.6 }],
        },
      },
    },
  });

  renderPage();

  await waitFor(() => screen.getByText(/Logic/));
  expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  expect(screen.queryByText('null')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx
```

Expected: first test fails — description text not rendered yet.

- [ ] **Step 3: Add description rendering to the grading panel**

In `frontend/src/pages/tutor/SubmissionDetailPage.jsx`, locate the rubric dimension mapping block (around line 235) and replace it:

Old:
```jsx
{rubricDimensions.map(d => (
  <label key={d.name} style={{ fontSize: 14 }}>
    {d.name} <span style={{ color: '#888', fontSize: 12 }}>(weight: {d.weight})</span>:
    <input
      type="number" min="0" max="100" step="0.01"
      value={dimensionScores[d.name] ?? ''}
      onChange={e => setDimensionScores(prev => ({ ...prev, [d.name]: e.target.value }))}
      style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
    />
  </label>
))}
```

New:
```jsx
{rubricDimensions.map(d => (
  <label key={d.name} style={{ fontSize: 14 }}>
    {d.name} <span style={{ color: '#888', fontSize: 12 }}>(weight: {d.weight})</span>:
    {d.description && (
      <span style={{ display: 'block', color: '#666', fontSize: 12, marginTop: 2 }}>
        {d.description}
      </span>
    )}
    <input
      type="number" min="0" max="100" step="0.01"
      value={dimensionScores[d.name] ?? ''}
      onChange={e => setDimensionScores(prev => ({ ...prev, [d.name]: e.target.value }))}
      style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
    />
  </label>
))}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx
```

Expected: 2 passed.

- [ ] **Step 5: Run full frontend suite**

```bash
cd frontend && npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionDetailPage.jsx frontend/src/pages/tutor/SubmissionDetailPage.test.jsx
git commit -m "feat(submission): display dimension description in grading panel"
```

---

### Task 3: SubmissionListPage — remove Export CSV button

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx`
- Modify: `frontend/src/pages/tutor/SubmissionListPage.test.jsx`

**Interfaces:**
- Produces: no change to other components; `csvExportUrl` import is dropped from this file only — the backend endpoint remains

- [ ] **Step 1: Write the failing test**

Add to the bottom of `frontend/src/pages/tutor/SubmissionListPage.test.jsx`:

```js
it('does not render an Export CSV button or link', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/export csv/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx --reporter=verbose
```

Expected: the new test fails — "Export CSV" text is still in the DOM.

- [ ] **Step 3: Remove the Export CSV button from SubmissionListPage**

In `frontend/src/pages/tutor/SubmissionListPage.jsx`:

1. Change the import on line 3 from:
```js
import { submissionApi, csvExportUrl } from '../../api/submissionApi';
```
to:
```js
import { submissionApi } from '../../api/submissionApi';
```

2. Remove line 73:
```js
const csvHref = csvExportUrl(exerciseId.trim() || null);
```

3. Replace the header block (lines 77–87) — remove the `<div>` containing the Export CSV `<a>`:

Old:
```jsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
  <h1 style={{ margin: 0 }}>Submissions</h1>
  <div style={{ display: 'flex', gap: 12 }}>
    <a href={csvHref} download style={{
      background: '#388e3c', color: '#fff', padding: '8px 18px', borderRadius: 4,
      textDecoration: 'none', fontSize: 14,
    }}>
      Export CSV
    </a>
  </div>
</div>
```

New:
```jsx
<div style={{ marginBottom: 24 }}>
  <h1 style={{ margin: 0 }}>Submissions</h1>
</div>
```

- [ ] **Step 4: Remove the `csvExportUrl` mock from the test file**

In `frontend/src/pages/tutor/SubmissionListPage.test.jsx`, update the mock on lines 7–10:

Old:
```js
vi.mock('../../api/submissionApi', () => ({
  submissionApi: { list: vi.fn(), delete: vi.fn() },
  csvExportUrl: () => '/api/v1/submissions/export.csv',
}));
```

New:
```js
vi.mock('../../api/submissionApi', () => ({
  submissionApi: { list: vi.fn(), delete: vi.fn() },
}));
```

- [ ] **Step 5: Run all SubmissionListPage tests**

```bash
cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx
```

Expected: all tests pass (8 existing + 1 new = 9 total).

- [ ] **Step 6: Run full frontend suite**

```bash
cd frontend && npx vitest run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionListPage.jsx frontend/src/pages/tutor/SubmissionListPage.test.jsx
git commit -m "feat(submission): remove Export CSV button from submission list page"
```

---

### Task 4: ImportBatchService — add Tutor Comment as last CSV column

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java`
- Modify: `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java`

**Interfaces:**
- Consumes: `Submission.getTutorComment()` — already exists on the entity, returns `String` (nullable)
- Produces: CSV output gains a trailing `Tutor Comment` column in every export

- [ ] **Step 1: Add a new failing test for the Tutor Comment column**

In `ImportBatchServiceTest.java`, add this test after the existing export tests:

```java
@Test
void exportBatchCsv_includesTutorCommentAsLastColumn() throws IOException {
    Exercise ex = exercise(4L, 40L, "Exercise With Comment");
    ExerciseVersion ver = version(40L, "{\"rubric\":{\"dimensions\":[]}}");
    Submission sub = submission("dave", 4L, null, new BigDecimal("88.00"), null);
    sub.setTutorComment("Good effort");

    when(submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc(1L))
        .thenReturn(List.of(sub));
    when(exerciseRepository.findById(4L)).thenReturn(Optional.of(ex));
    when(versionRepository.findById(40L)).thenReturn(Optional.of(ver));
    when(exerciseRepository.findAllById(List.of(4L))).thenReturn(List.of(ex));

    MockHttpServletResponse response = new MockHttpServletResponse();
    service.exportBatchCsv(1L, response);

    String[] lines = response.getContentAsString().split("\\r?\\n");
    assertThat(lines[0]).endsWith(",Tutor Comment");
    assertThat(lines[1]).endsWith(",Good effort");
}
```

- [ ] **Step 2: Update the two existing tests that will break**

`exportBatchCsv_instantFeedbackMode_noDimColumns` currently asserts an exact header. Update it:

Old assertion (line ~144):
```java
assertThat(lines[0]).isEqualTo("Student Name,Display Name,Exercise Title,Total Score");
```

New:
```java
assertThat(lines[0]).isEqualTo("Student Name,Display Name,Exercise Title,Total Score,Tutor Comment");
```

`exportBatchCsv_ungradedSubmission_dimAndTotalCellsEmpty` currently asserts the row ends with `,,`. After adding a third empty trailing column, update it:

Old assertion (line ~189):
```java
assertThat(lines[1]).endsWith(",,");
```

New:
```java
assertThat(lines[1]).endsWith(",,,");
```

- [ ] **Step 3: Run the tests to confirm the new test fails and the updated tests also fail**

```bash
cd backend && mvn test -Dtest=ImportBatchServiceTest -q
```

Expected: 3 failures (new test + 2 updated assertions) before implementation.

- [ ] **Step 4: Implement the Tutor Comment column in ImportBatchService**

In `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java`:

1. In `buildHeaders()`, add `"Tutor Comment"` after `"Total Score"`:

Old:
```java
private List<String> buildHeaders(List<DimensionDef> dimensions) {
    List<String> h = new ArrayList<>(List.of("Student Name", "Display Name", "Exercise Title"));
    for (DimensionDef d : dimensions) {
        h.add(d.name() + " (" + (int) Math.round(d.weight() * 100) + "%)");
    }
    h.add("Total Score");
    return h;
}
```

New:
```java
private List<String> buildHeaders(List<DimensionDef> dimensions) {
    List<String> h = new ArrayList<>(List.of("Student Name", "Display Name", "Exercise Title"));
    for (DimensionDef d : dimensions) {
        h.add(d.name() + " (" + (int) Math.round(d.weight() * 100) + "%)");
    }
    h.add("Total Score");
    h.add("Tutor Comment");
    return h;
}
```

2. In `exportBatchCsv()`, after `row.add(totalScore)` add the comment:

Old block (inside the for loop, after `row.add(totalScore)`):
```java
row.add(totalScore);
printer.printRecord(row);
```

New:
```java
row.add(totalScore);
row.add(sub.getTutorComment() != null ? sub.getTutorComment() : "");
printer.printRecord(row);
```

- [ ] **Step 5: Run the tests to confirm all pass**

```bash
cd backend && mvn test -Dtest=ImportBatchServiceTest -q
```

Expected: all tests pass (7 existing + 1 new = 8 total).

- [ ] **Step 6: Run the full backend test suite**

```bash
cd backend && mvn test -q
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java \
        backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java
git commit -m "feat(submission): add tutor comment as last column in batch CSV export"
```
