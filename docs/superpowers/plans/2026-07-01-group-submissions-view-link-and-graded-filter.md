# Group Submissions View Link + Graded Filter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "View Submissions" button per Group Submission row that navigates to SubmissionListPage with the batch ID pre-filled, and add a Graded filter dropdown to SubmissionListPage backed by a new backend filter param.

**Architecture:** URL query params pass `batchId` from GroupSubmissionPage to SubmissionListPage, which reads them via `useSearchParams` on mount. A new `Boolean graded` param threads through Controller → Service → Repository's native SQL query.

**Tech Stack:** React 18 · react-router-dom v6 (`useSearchParams`) · Vitest/RTL · Spring Boot 3.5 · Spring Data JPA native query · H2 (test) · MySQL 8 (prod)

## Global Constraints

- All frontend tests use Vitest + React Testing Library. Run with `cd frontend && npm test`.
- All backend tests are Spring Boot integration tests (`@SpringBootTest`) or DataJPA tests (`@DataJpaTest`). Run with `cd backend && mvn test`.
- No DB migration needed — `graded` column already exists on `submissions`.
- TDD: write failing test, verify it fails, implement, verify it passes, then commit.
- Follow existing coding patterns exactly (inline params object in effects, pending+committed filter state pairs, native SQL queries).
- Date format rule does not apply here (no user-facing dates touched).

---

## File Map

| File | Change |
|------|--------|
| `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java` | Add `Boolean graded` param to `findFiltered` SQL + method signature |
| `backend/src/main/java/com/platform/exercise/submission/SubmissionController.java` | Add `@RequestParam(required = false) Boolean graded` to `list()` |
| `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java` | Add `Boolean graded` param to `list()`, pass to `findFiltered` |
| `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java` | Add graded-filter test; update existing `findFiltered` calls to new 6-param arity |
| `backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java` | Add graded-filter integration test |
| `frontend/src/pages/tutor/GroupSubmissionPage.jsx` | Add "View Submissions" button per row |
| `frontend/src/pages/tutor/GroupSubmissionPage.test.jsx` | Add navigation test for new button |
| `frontend/src/pages/tutor/SubmissionListPage.jsx` | Read `batchId` from URL; add "All" to source dropdown; add Graded filter |
| `frontend/src/pages/tutor/SubmissionListPage.test.jsx` | Update `renderPage` helper; add 3 new tests |

---

### Task 1: Backend — graded filter in `findFiltered`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java:29-52`
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionController.java:43-52`
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java:176-184`
- Test: `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java`
- Test: `backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java`

**Interfaces:**
- Produces: `SubmissionRepository.findFiltered(Long, String, String, Long, Boolean, Pageable)` — the `Boolean graded` param is `null` (no filter), `true` (graded only), or `false` (ungraded only).

- [ ] **Step 1: Write failing repository test**

  Add at the end of `SubmissionRepositoryTest.java`, before the closing `}`:

  ```java
  @Test
  void findFiltered_byGraded_returnsOnlyMatchingGradedState() {
      Submission gradedSub = sub("IMPORT", null, exerciseId);
      gradedSub.setGraded(true);
      repository.save(gradedSub);
      repository.save(sub("IMPORT", null, exerciseId));

      Page<Submission> gradedOnly = repository.findFiltered(null, null, null, null, true, PageRequest.of(0, 20));
      assertEquals(1, gradedOnly.getTotalElements());
      assertTrue(gradedOnly.getContent().get(0).isGraded());

      Page<Submission> ungradedOnly = repository.findFiltered(null, null, null, null, false, PageRequest.of(0, 20));
      assertEquals(1, ungradedOnly.getTotalElements());
      assertFalse(ungradedOnly.getContent().get(0).isGraded());

      Page<Submission> all = repository.findFiltered(null, null, null, null, null, PageRequest.of(0, 20));
      assertEquals(2, all.getTotalElements());
  }
  ```

  Also update the three existing `findFiltered` calls in the same file to add the new `null` graded arg before `PageRequest.of(...)`:

  - Line 100: `repository.findFiltered(null, null, "IMPORT", null, PageRequest.of(0, 20))` → `repository.findFiltered(null, null, "IMPORT", null, null, PageRequest.of(0, 20))`
  - Line 104: `repository.findFiltered(null, null, null, null, PageRequest.of(0, 20))` → `repository.findFiltered(null, null, null, null, null, PageRequest.of(0, 20))`
  - Line 236: `repository.findFiltered(null, null, null, batchId, PageRequest.of(0, 20))` → `repository.findFiltered(null, null, null, batchId, null, PageRequest.of(0, 20))`
  - Line 240: `repository.findFiltered(null, null, null, null, PageRequest.of(0, 20))` → `repository.findFiltered(null, null, null, null, null, PageRequest.of(0, 20))`

- [ ] **Step 2: Run to verify compilation fails**

  ```bash
  cd backend && mvn test -Dtest=SubmissionRepositoryTest 2>&1 | tail -20
  ```

  Expected: compilation error — `findFiltered` called with wrong number of arguments.

- [ ] **Step 3: Update `SubmissionRepository.findFiltered`**

  Replace the `findFiltered` query block (lines 29–52) in `SubmissionRepository.java`:

  ```java
  @Query(value = """
          SELECT * FROM submissions
          WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
            AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
            AND (:source IS NULL OR source = :source)
            AND (:batchId IS NULL OR batch_id = :batchId)
            AND (:graded IS NULL OR graded = :graded)
            AND is_deleted = false
          ORDER BY created_at DESC
          """,
          countQuery = """
          SELECT COUNT(*) FROM submissions
          WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
            AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
            AND (:source IS NULL OR source = :source)
            AND (:batchId IS NULL OR batch_id = :batchId)
            AND (:graded IS NULL OR graded = :graded)
            AND is_deleted = false
          """,
          nativeQuery = true)
  Page<Submission> findFiltered(
          @Param("exerciseId") Long exerciseId,
          @Param("studentName") String studentName,
          @Param("source") String source,
          @Param("batchId") Long batchId,
          @Param("graded") Boolean graded,
          Pageable pageable);
  ```

- [ ] **Step 4: Update `SubmissionService.list`**

  Replace the `list` method signature and repo call in `SubmissionService.java`:

  ```java
  public PageResponse<SubmissionListItemDto> list(Long exerciseId, String studentName,
                                                   String source, Long batchId,
                                                   Boolean graded,
                                                   int page, int size) {
      Page<Submission> submissionPage = submissionRepository.findFiltered(
          exerciseId,
          (studentName != null && studentName.isBlank()) ? null : studentName,
          (source != null && source.isBlank()) ? null : source,
          batchId,
          graded,
          PageRequest.of(page, size));
  ```

  Leave all lines after `PageRequest.of(page, size));` unchanged.

- [ ] **Step 5: Update `SubmissionController.list`**

  Replace the `list` method (lines 43–52) in `SubmissionController.java`:

  ```java
  @GetMapping
  public ResponseEntity<PageResponse<SubmissionListItemDto>> list(
          @RequestParam(required = false) Long exerciseId,
          @RequestParam(required = false) String studentName,
          @RequestParam(defaultValue = "IMPORT") String source,
          @RequestParam(required = false) Long batchId,
          @RequestParam(required = false) Boolean graded,
          @RequestParam(defaultValue = "0") int page,
          @RequestParam(defaultValue = "20") int size) {
      return ResponseEntity.ok(submissionService.list(exerciseId, studentName, source, batchId, graded, page, size));
  }
  ```

- [ ] **Step 6: Run repository test to verify it passes**

  ```bash
  cd backend && mvn test -Dtest=SubmissionRepositoryTest 2>&1 | tail -20
  ```

  Expected: `BUILD SUCCESS`, all tests in that class pass.

- [ ] **Step 7: Write failing controller test**

  Add at the end of `SubmissionControllerTest.java`, before the closing `}`:

  ```java
  @Test
  @WithMockUser(username = "tutor1", roles = "TUTOR")
  void listSubmissions_filterByGraded_returnsOnlyMatchingGradedState() throws Exception {
      Submission gradedSub = new Submission();
      gradedSub.setExerciseId(blocklyExercise.getId());
      gradedSub.setGradedVersionId(blocklyVersion.getId());
      gradedSub.setStudentName("Alice");
      gradedSub.setExerciseType("BLOCKLY");
      gradedSub.setAnswerData("code");
      gradedSub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
      gradedSub.setGraded(true);
      gradedSub.setAutoScore(new BigDecimal("100.00"));
      submissionRepository.save(gradedSub);

      Submission ungradedSub = new Submission();
      ungradedSub.setExerciseId(blocklyExercise.getId());
      ungradedSub.setGradedVersionId(blocklyVersion.getId());
      ungradedSub.setStudentName("Bob");
      ungradedSub.setExerciseType("BLOCKLY");
      ungradedSub.setAnswerData("code");
      ungradedSub.setExportTimestamp(LocalDateTime.of(2026, 5, 2, 10, 0));
      submissionRepository.save(ungradedSub);

      mockMvc.perform(get("/v1/submissions").param("graded", "true"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content.length()").value(1))
          .andExpect(jsonPath("$.content[0].studentName").value("Alice"));

      mockMvc.perform(get("/v1/submissions").param("graded", "false"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.content.length()").value(1))
          .andExpect(jsonPath("$.content[0].studentName").value("Bob"));
  }
  ```

- [ ] **Step 8: Run all backend tests**

  ```bash
  cd backend && mvn test 2>&1 | tail -30
  ```

  Expected: `BUILD SUCCESS`, no test failures.

- [ ] **Step 9: Commit**

  ```bash
  git add backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java \
           backend/src/main/java/com/platform/exercise/submission/SubmissionController.java \
           backend/src/main/java/com/platform/exercise/submission/SubmissionService.java \
           backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java \
           backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java
  git commit -m "feat(submissions): add graded filter to list endpoint"
  ```

---

### Task 2: GroupSubmissionPage — "View Submissions" button

**Files:**
- Modify: `frontend/src/pages/tutor/GroupSubmissionPage.jsx:159`
- Test: `frontend/src/pages/tutor/GroupSubmissionPage.test.jsx`

**Interfaces:**
- Consumes: `navigate` from `useNavigate` (already imported).
- Produces: clicking "View Submissions" on batch row calls `navigate('/tutor/submissions?batchId=<id>')`.

- [ ] **Step 1: Write failing test**

  At the top of `GroupSubmissionPage.test.jsx`, after the existing imports, add a `mockNavigate` setup. Replace the top of the file up to `beforeEach`:

  ```jsx
  import { render, screen, fireEvent, waitFor } from '@testing-library/react';
  import { vi } from 'vitest';
  import { MemoryRouter } from 'react-router-dom';
  import GroupSubmissionPage from './GroupSubmissionPage';
  import { importBatchApi } from '../../api/importBatchApi';

  vi.mock('../../api/importBatchApi', () => ({
    importBatchApi: { list: vi.fn(), delete: vi.fn() },
    downloadBatchExport: vi.fn(),
  }));

  const mockNavigate = vi.fn();
  vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
  });

  const batch = (id, gradedStatus, importedCount = 3) => ({
    id,
    createdAt: '2026-06-01T10:00:00',
    fileCount: importedCount,
    importedCount,
    duplicateCount: 0,
    failedCount: 0,
    gradedStatus,
  });

  beforeEach(() => {
    importBatchApi.list = vi.fn().mockResolvedValue({ content: [], totalPages: 0 });
    importBatchApi.delete = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockNavigate.mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  const renderPage = () => render(<MemoryRouter><GroupSubmissionPage /></MemoryRouter>);
  ```

  Then add a new test at the end of the file:

  ```jsx
  it('View Submissions button navigates to submissions page filtered by batch id', async () => {
    importBatchApi.list = vi.fn().mockResolvedValue({
      content: [batch(5, 'PARTIAL')],
      totalPages: 1,
    });
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /view submissions/i }));

    fireEvent.click(screen.getByRole('button', { name: /view submissions/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/tutor/submissions?batchId=5');
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  cd frontend && npm test -- GroupSubmissionPage.test.jsx 2>&1 | tail -20
  ```

  Expected: test fails — "View Submissions" button not found.

- [ ] **Step 3: Add "View Submissions" button to GroupSubmissionPage**

  In `GroupSubmissionPage.jsx`, replace the action `<td>` (currently line 159–182):

  ```jsx
  <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
    <button
      onClick={() => navigate(`/tutor/submissions?batchId=${b.id}`)}
      style={{
        padding: '4px 14px', background: '#1976d2', color: '#fff',
        border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
      }}
    >
      View Submissions
    </button>
    <button
      onClick={() => handleExport(b)}
      style={{
        padding: '4px 14px', background: '#388e3c', color: '#fff',
        border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
      }}
    >
      Export CSV
    </button>
    <button
      onClick={() => handleDelete(b)}
      disabled={deletingId === b.id}
      style={{
        padding: '4px 14px', color: '#c62828', background: 'none',
        border: '1px solid #c62828', borderRadius: 4,
        cursor: deletingId === b.id ? 'default' : 'pointer', fontSize: 12,
        opacity: deletingId === b.id ? 0.5 : 1,
      }}
    >
      {deletingId === b.id ? 'Deleting…' : 'Delete'}
    </button>
  </td>
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd frontend && npm test -- GroupSubmissionPage.test.jsx 2>&1 | tail -20
  ```

  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/tutor/GroupSubmissionPage.jsx \
           frontend/src/pages/tutor/GroupSubmissionPage.test.jsx
  git commit -m "feat(group-submissions): add View Submissions navigation button"
  ```

---

### Task 3: SubmissionListPage — URL param init, Source "All" option, Graded filter

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx`
- Test: `frontend/src/pages/tutor/SubmissionListPage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/v1/submissions` — now accepts optional `graded=true|false` param (from Task 1).
- Consumes: `?batchId=<id>` URL param — read via `useSearchParams` on mount.

- [ ] **Step 1: Write failing tests**

  Update the `renderPage` helper and add three new tests in `SubmissionListPage.test.jsx`.

  Replace the `renderPage` line (currently line 17–18):

  ```jsx
  const renderPage = (url = '/') =>
    render(<MemoryRouter initialEntries={[url]}><SubmissionListPage /></MemoryRouter>);
  ```

  Add three new tests at the end of the file:

  ```jsx
  it('pre-fills batchId and uses all sources when batchId is in the URL', async () => {
    renderPage('/tutor/submissions?batchId=42');
    await waitFor(() => expect(submissionApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: '42', source: '' })
    ));
    expect(screen.getByPlaceholderText(/filter by batch id/i).value).toBe('42');
  });

  it('does not call submissionApi.list when graded dropdown changes without clicking Search', async () => {
    renderPage();
    await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/graded/i), { target: { value: 'true' } });

    expect(submissionApi.list).toHaveBeenCalledTimes(1);
  });

  it('calls submissionApi.list with graded=true after clicking Search', async () => {
    renderPage();
    await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/graded/i), { target: { value: 'true' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));

    await waitFor(() => expect(submissionApi.list).toHaveBeenCalledTimes(2));
    expect(submissionApi.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ graded: 'true', page: 0 })
    );
  });
  ```

- [ ] **Step 2: Run to verify new tests fail**

  ```bash
  cd frontend && npm test -- SubmissionListPage.test.jsx 2>&1 | tail -30
  ```

  Expected: the 3 new tests fail; all existing tests still pass.

- [ ] **Step 3: Implement SubmissionListPage changes**

  Replace the entire content of `SubmissionListPage.jsx` with:

  ```jsx
  import { useEffect, useState } from 'react';
  import { useNavigate, useSearchParams } from 'react-router-dom';
  import { submissionApi } from '../../api/submissionApi';
  import Pagination from '../../components/Pagination';
  import { formatDate } from '../../utils/dateFormat';

  export default function SubmissionListPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const initialBatchId = searchParams.get('batchId') || '';
    const hasUrlBatchId = Boolean(initialBatchId);

    const [submissions, setSubmissions] = useState([]);
    const [totalPages, setTotalPages] = useState(0);
    const [page, setPage] = useState(0);
    const [pendingStudentName, setPendingStudentName] = useState('');
    const [pendingExerciseId, setPendingExerciseId] = useState('');
    const [pendingBatchId, setPendingBatchId] = useState(initialBatchId);
    const [studentName, setStudentName] = useState('');
    const [exerciseId, setExerciseId] = useState('');
    const [batchId, setBatchId] = useState(initialBatchId);
    const [source, setSource] = useState(hasUrlBatchId ? '' : 'IMPORT');
    const [pendingSource, setPendingSource] = useState(hasUrlBatchId ? '' : 'IMPORT');
    const [pendingGraded, setPendingGraded] = useState('');
    const [graded, setGraded] = useState('');
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [searchTrigger, setSearchTrigger] = useState(0);

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

    useEffect(() => {
      const params = { page, size: 20, source };
      if (studentName.trim()) params.studentName = studentName.trim();
      if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
      if (batchId.trim()) params.batchId = batchId.trim();
      if (graded !== '') params.graded = graded;
      fetchSubmissions(params);
    }, [page, studentName, exerciseId, batchId, source, graded, searchTrigger]);

    function handleSearch() {
      setPage(0);
      setStudentName(pendingStudentName);
      setExerciseId(pendingExerciseId);
      setBatchId(pendingBatchId);
      setSource(pendingSource);
      setGraded(pendingGraded);
      setSearchTrigger(s => s + 1);
    }

    async function handleDelete(e, id) {
      e.stopPropagation();
      if (!window.confirm('Delete this submission? This cannot be undone.')) return;
      setDeletingId(id);
      try {
        await submissionApi.delete(id);
        if (submissions.length === 1 && page > 0) {
          setPage(page - 1);
        } else {
          const params = { page, size: 20, source };
          if (studentName.trim()) params.studentName = studentName.trim();
          if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
          if (batchId.trim()) params.batchId = batchId.trim();
          if (graded !== '') params.graded = graded;
          fetchSubmissions(params);
        }
      } catch {
        alert('Failed to delete submission.');
      } finally {
        setDeletingId(null);
      }
    }

    return (
      <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0 }}>Submissions</h1>
        </div>

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
          <input
            placeholder="Filter by batch ID…"
            value={pendingBatchId}
            onChange={e => setPendingBatchId(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', width: 160 }}
          />
          <label>
            Source:
            <select value={pendingSource} onChange={e => setPendingSource(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="">All</option>
              <option value="IMPORT">Imported</option>
              <option value="STUDENT">Student</option>
            </select>
          </label>
          <label>
            Graded:
            <select value={pendingGraded} onChange={e => setPendingGraded(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="">All</option>
              <option value="true">Graded</option>
              <option value="false">Not Graded</option>
            </select>
          </label>
          <button
            onClick={handleSearch}
            style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            Search
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>Loading…</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                {['Student Name', 'Exercise', 'Type', 'Auto Score', 'Tutor Score', 'Graded', 'Mismatch', 'Batch', 'Date', ''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No submissions found.</td></tr>
              ) : submissions.map(sub => (
                <tr
                  key={sub.id}
                  onClick={() => navigate(`/tutor/submissions/${sub.id}`)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #eee' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <td style={{ padding: '10px 12px' }}>{sub.studentName}</td>
                  <td style={{ padding: '10px 12px' }}>{sub.exerciseTitle}</td>
                  <td style={{ padding: '10px 12px' }}>{sub.exerciseType}</td>
                  <td style={{ padding: '10px 12px' }}>{sub.autoScore ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{sub.tutorScore ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {sub.graded ? (
                      <span style={{
                        background: '#e3f2fd', color: '#1565c0',
                        borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                      }}>Graded</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {sub.versionMismatch && (
                      <span style={{
                        background: '#fff3e0', color: '#e65100', padding: '2px 8px',
                        borderRadius: 4, fontSize: 12, fontWeight: 600,
                      }}>Mismatch</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                    {sub.batchId ?? ''}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                    {formatDate(sub.createdAt)}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={e => handleDelete(e, sub.id)}
                      disabled={deletingId === sub.id}
                      style={{
                        padding: '3px 10px', color: '#c62828', background: 'none',
                        border: '1px solid #c62828', borderRadius: 4,
                        cursor: deletingId === sub.id ? 'default' : 'pointer', fontSize: 12,
                        opacity: deletingId === sub.id ? 0.5 : 1,
                      }}
                    >
                      {deletingId === sub.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    );
  }
  ```

- [ ] **Step 4: Run all frontend tests**

  ```bash
  cd frontend && npm test 2>&1 | tail -30
  ```

  Expected: all tests pass, including the 3 new ones and all existing ones.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/tutor/SubmissionListPage.jsx \
           frontend/src/pages/tutor/SubmissionListPage.test.jsx
  git commit -m "feat(submissions): URL batchId pre-fill, Source All option, Graded filter"
  ```
