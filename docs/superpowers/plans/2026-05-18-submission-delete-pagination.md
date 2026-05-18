# Submission Delete + Universal Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add soft-delete to submissions (list + detail pages) and show pagination on every list in the app, always visible.

**Architecture:** Shared `<Pagination>` component handles all pagination UI. Four backend endpoints gain `page`/`size` params and return `PageResponse<T>`. Submissions get a `is_deleted` column via Flyway migration; all queries filter it out. Existing paginated pages swap inline buttons for the shared component and fix the `totalPages > 1` → `totalPages >= 1` condition.

**Tech Stack:** React 18, Spring Boot 3.2, Spring Data JPA, MySQL 8 / H2 (test), Flyway, MockMvc, React Testing Library.

---

## File Map

**Create:**
- `frontend/src/components/Pagination.jsx` — shared pagination UI component
- `frontend/src/components/Pagination.test.jsx` — unit tests for Pagination
- `backend/src/main/resources/db/migration/V4__add_submission_soft_delete.sql` — adds `is_deleted` column

**Modify:**
- `backend/…/domain/Submission.java` — add `isDeleted` field
- `backend/…/repository/SubmissionRepository.java` — all queries gain `is_deleted = false` filter; duplicate-check method renamed
- `backend/…/submission/SubmissionService.java` — add `delete()`, guard `getById`/`grade` against deleted, update CSV export
- `backend/…/submission/SubmissionController.java` — add `DELETE /v1/submissions/{id}`
- `backend/…/submission/FileImportService.java` — call renamed duplicate-check method
- `backend/…/repository/CategoryRepository.java` — add pageable query `findPagedWithExerciseCount`
- `backend/…/category/CategoryService.java` — `listAll(Pageable)` returns `PageResponse<CategoryDto>`
- `backend/…/category/CategoryController.java` — add `page`/`size` params, return `PageResponse`
- `backend/…/repository/CourseRepository.java` — add `findPagedStudentsByCourse`, `findPagedExercisesByCourse`
- `backend/…/course/CourseService.java` — `listStudents`/`listExercises` accept `Pageable`, return `PageResponse`
- `backend/…/course/CourseController.java` — add `page`/`size` to students/exercises endpoints
- `backend/…/student/StudentProgressDto.java` — change `exercises` field to `PageResponse<ProgressExerciseDto>`
- `backend/…/student/StudentProgressService.java` — accept `page`/`size`, manually paginate result list
- `backend/…/student/StudentProgressController.java` — add `page`/`size` params
- `frontend/src/api/submissionApi.js` — add `delete(id)`
- `frontend/src/api/categoryApi.js` — `list(page, size)` with params
- `frontend/src/api/courseApi.js` — `listStudents`/`listExercises` accept `page`/`size`
- `frontend/src/api/progressApi.js` — `getProgress(page, size)` with params
- `frontend/src/pages/tutor/SubmissionListPage.jsx` — delete button + use `<Pagination>`
- `frontend/src/pages/tutor/SubmissionDetailPage.jsx` — delete button
- `frontend/src/pages/tutor/ExerciseManagementPage.jsx` — use `<Pagination>`
- `frontend/src/pages/tutor/CourseManagementPage.jsx` — use `<Pagination>`
- `frontend/src/pages/tutor/CourseDetailPage.jsx` — paginate students + exercises tabs
- `frontend/src/pages/tutor/CategoryManagementPage.jsx` — paginate categories
- `frontend/src/pages/admin/UserManagementPage.jsx` — use `<Pagination>`
- `frontend/src/pages/student/ExerciseListPage.jsx` — use `<Pagination>`
- `frontend/src/pages/student/ProgressPage.jsx` — paginate exercises table
- `backend/…/submission/SubmissionControllerTest.java` — add delete tests

---

## Task 1: Shared Pagination Component

**Files:**
- Create: `frontend/src/components/Pagination.jsx`
- Create: `frontend/src/components/Pagination.test.jsx`

- [ ] **Step 1.1: Create Pagination component**

```jsx
// frontend/src/components/Pagination.jsx
export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages < 1) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 0}
        style={{ padding: '4px 12px', cursor: page === 0 ? 'default' : 'pointer' }}
      >
        ← Prev
      </button>
      <span style={{ padding: '4px 8px' }}>Page {page + 1} of {totalPages}</span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages - 1}
        style={{ padding: '4px 12px', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}
      >
        Next →
      </button>
    </div>
  );
}
```

- [ ] **Step 1.2: Write failing tests**

```jsx
// frontend/src/components/Pagination.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from './Pagination';

test('renders page info', () => {
  render(<Pagination page={0} totalPages={3} onPageChange={() => {}} />);
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
});

test('prev disabled on first page', () => {
  render(<Pagination page={0} totalPages={3} onPageChange={() => {}} />);
  expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
});

test('next disabled on last page', () => {
  render(<Pagination page={2} totalPages={3} onPageChange={() => {}} />);
  expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
});

test('calls onPageChange with prev page', () => {
  const fn = jest.fn();
  render(<Pagination page={1} totalPages={3} onPageChange={fn} />);
  fireEvent.click(screen.getByRole('button', { name: /prev/i }));
  expect(fn).toHaveBeenCalledWith(0);
});

test('calls onPageChange with next page', () => {
  const fn = jest.fn();
  render(<Pagination page={1} totalPages={3} onPageChange={fn} />);
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(fn).toHaveBeenCalledWith(2);
});

test('renders when totalPages is 1', () => {
  render(<Pagination page={0} totalPages={1} onPageChange={() => {}} />);
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
});

test('renders nothing when totalPages is 0', () => {
  const { container } = render(<Pagination page={0} totalPages={0} onPageChange={() => {}} />);
  expect(container.firstChild).toBeNull();
});
```

- [ ] **Step 1.3: Run tests**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=Pagination.test
```
Expected: 7 tests pass.

- [ ] **Step 1.4: Commit**

```bash
git add frontend/src/components/Pagination.jsx frontend/src/components/Pagination.test.jsx
git commit -m "feat(ui): add shared Pagination component"
```

---

## Task 2: Submission Soft Delete — Backend

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__add_submission_soft_delete.sql`
- Modify: `backend/…/domain/Submission.java`
- Modify: `backend/…/repository/SubmissionRepository.java`
- Modify: `backend/…/submission/SubmissionService.java`
- Modify: `backend/…/submission/SubmissionController.java`
- Modify: `backend/…/submission/FileImportService.java`
- Modify: `backend/…/submission/SubmissionControllerTest.java`

- [ ] **Step 2.1: Write failing tests**

Add these tests to `backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java` — inside the class, after the existing tests:

```java
@Test
@WithMockUser(username = "tutor1", roles = "TUTOR")
void deleteSubmission_returns204() throws Exception {
    Submission sub = new Submission();
    sub.setExerciseId(blocklyExercise.getId());
    sub.setGradedVersionId(blocklyVersion.getId());
    sub.setStudentName("Alex");
    sub.setExerciseType("BLOCKLY");
    sub.setAnswerData("print('Hello');");
    sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
    Submission saved = submissionRepository.save(sub);

    mockMvc.perform(delete("/v1/submissions/" + saved.getId()))
        .andExpect(status().isNoContent());

    Submission updated = submissionRepository.findById(saved.getId()).orElseThrow();
    assertThat(updated.isDeleted()).isTrue();
}

@Test
@WithMockUser(username = "tutor1", roles = "TUTOR")
void deleteSubmission_notFound_returns404() throws Exception {
    mockMvc.perform(delete("/v1/submissions/99999"))
        .andExpect(status().isNotFound());
}

@Test
@WithMockUser(username = "tutor1", roles = "TUTOR")
void listSubmissions_excludesDeletedSubmissions() throws Exception {
    Submission sub = new Submission();
    sub.setExerciseId(blocklyExercise.getId());
    sub.setGradedVersionId(blocklyVersion.getId());
    sub.setStudentName("Alex");
    sub.setExerciseType("BLOCKLY");
    sub.setAnswerData("print('Hello');");
    sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
    sub.setDeleted(true);
    submissionRepository.save(sub);

    mockMvc.perform(get("/v1/submissions"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content").isEmpty());
}

@Test
@WithMockUser(username = "tutor1", roles = "TUTOR")
void importAfterDelete_treatedAsNewSubmission() throws Exception {
    MockMultipartFile file = new MockMultipartFile("files", "alex.json", "application/json",
        blocklyExportJson(blocklyExercise.getId(), "Alex", 1).getBytes());

    // Import once
    mockMvc.perform(multipart("/v1/submissions/import").file(file)).andExpect(status().isOk());

    // Soft-delete it
    Submission sub = submissionRepository.findAll().get(0);
    sub.setDeleted(true);
    submissionRepository.save(sub);

    // Re-import same file — should succeed as new import, not duplicate
    mockMvc.perform(multipart("/v1/submissions/import")
            .file(new MockMultipartFile("files", "alex.json", "application/json",
                blocklyExportJson(blocklyExercise.getId(), "Alex", 1).getBytes())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.results[0].status").value("IMPORTED"));
}
```

- [ ] **Step 2.2: Run tests — confirm they fail**

```bash
cd backend && mvn test -Dtest=SubmissionControllerTest 2>&1 | grep -E "FAIL|ERROR|Tests run"
```
Expected: compilation error or test failures (method/endpoint not found yet).

- [ ] **Step 2.3: Create Flyway migration**

```sql
-- backend/src/main/resources/db/migration/V4__add_submission_soft_delete.sql
ALTER TABLE submissions
  ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_submissions_is_deleted ON submissions (is_deleted);
```

- [ ] **Step 2.4: Add `isDeleted` to Submission entity**

In `backend/src/main/java/com/platform/exercise/domain/Submission.java`, add after the `createdAt` field:

```java
@Column(name = "is_deleted", nullable = false)
private boolean deleted = false;
```

(Lombok `@Data` generates `isDeleted()` getter and `setDeleted(boolean)` setter for boolean fields named `deleted`.)

- [ ] **Step 2.5: Update SubmissionRepository**

Replace the full contents of `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`:

```java
package com.platform.exercise.repository;

import com.platform.exercise.domain.Submission;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface SubmissionRepository extends JpaRepository<Submission, Long> {

    @Query("""
            SELECT COUNT(s) > 0 FROM Submission s
            WHERE s.studentName = :studentName
              AND s.exerciseId = :exerciseId
              AND s.exportTimestamp = :exportTimestamp
              AND s.deleted = false
            """)
    boolean existsActiveByStudentNameAndExerciseIdAndExportTimestamp(
            @Param("studentName") String studentName,
            @Param("exerciseId") Long exerciseId,
            @Param("exportTimestamp") LocalDateTime exportTimestamp);

    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
              AND is_deleted = false
            ORDER BY created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
              AND is_deleted = false
            """,
            nativeQuery = true)
    Page<Submission> findFiltered(
            @Param("exerciseId") Long exerciseId,
            @Param("studentName") String studentName,
            Pageable pageable);

    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND is_deleted = false
            ORDER BY created_at DESC
            """,
            nativeQuery = true)
    List<Submission> findAllForExport(@Param("exerciseId") Long exerciseId);

    List<Submission> findByStudentNameAndDeletedFalse(String studentName);
}
```

- [ ] **Step 2.6: Update FileImportService duplicate check**

In `backend/src/main/java/com/platform/exercise/submission/FileImportService.java`, find the call to the old method and replace:

Old:
```java
submissionRepository.existsByStudentNameAndExerciseIdAndExportTimestamp(
    studentName, exerciseId, exportedAt)
```

New:
```java
submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(
    studentName, exerciseId, exportedAt)
```

- [ ] **Step 2.7: Update SubmissionService**

Replace `SubmissionService.java` with the following (adds `delete()`, guards `getById`/`grade` against deleted records, updates `StudentProgressService` call site):

In `getById()`, change:
```java
Submission sub = submissionRepository.findById(id)
    .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND,
        "Submission not found."));
```
to:
```java
Submission sub = submissionRepository.findById(id)
    .filter(s -> !s.isDeleted())
    .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND,
        "Submission not found."));
```

Apply the same `.filter(s -> !s.isDeleted())` change inside `grade()`.

Add this new method to `SubmissionService`:

```java
@Transactional
public void delete(Long id) {
    Submission sub = submissionRepository.findById(id)
        .filter(s -> !s.isDeleted())
        .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND,
            "Submission not found."));
    sub.setDeleted(true);
    submissionRepository.save(sub);
}
```

- [ ] **Step 2.8: Update StudentProgressService**

In `backend/…/student/StudentProgressService.java`, change:

```java
List<Submission> submissions = submissionRepository.findByStudentName(displayName);
```
to:
```java
List<Submission> submissions = submissionRepository.findByStudentNameAndDeletedFalse(displayName);
```

- [ ] **Step 2.9: Add DELETE endpoint to SubmissionController**

In `SubmissionController.java`, add after the `grade` endpoint:

```java
@DeleteMapping("/{id}")
public ResponseEntity<Void> delete(@PathVariable Long id) {
    submissionService.delete(id);
    return ResponseEntity.noContent().build();
}
```

- [ ] **Step 2.10: Run tests**

```bash
cd backend && mvn test -Dtest=SubmissionControllerTest 2>&1 | grep -E "Tests run|FAIL|ERROR|BUILD"
```
Expected: `Tests run: 11, Failures: 0, Errors: 0`.

- [ ] **Step 2.11: Run full backend test suite**

```bash
cd backend && mvn test 2>&1 | tail -5
```
Expected: `BUILD SUCCESS`.

- [ ] **Step 2.12: Commit**

```bash
git add backend/src/main/resources/db/migration/V4__add_submission_soft_delete.sql \
        backend/src/main/java/com/platform/exercise/domain/Submission.java \
        backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java \
        backend/src/main/java/com/platform/exercise/submission/SubmissionService.java \
        backend/src/main/java/com/platform/exercise/submission/SubmissionController.java \
        backend/src/main/java/com/platform/exercise/submission/FileImportService.java \
        backend/src/main/java/com/platform/exercise/student/StudentProgressService.java \
        backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java
git commit -m "feat(submission): soft-delete endpoint and is_deleted filtering"
```

---

## Task 3: Submission Delete — Frontend

**Files:**
- Modify: `frontend/src/api/submissionApi.js`
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx`
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.jsx`

- [ ] **Step 3.1: Add `delete` to submissionApi**

In `frontend/src/api/submissionApi.js`, add to the `submissionApi` object:

```js
delete: (id) =>
  axiosInstance.delete(`/v1/submissions/${id}`).then(r => r.data),
```

- [ ] **Step 3.2: Update SubmissionListPage**

Replace the full file `frontend/src/pages/tutor/SubmissionListPage.jsx`:

```jsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { submissionApi, csvExportUrl } from '../../api/submissionApi';
import Pagination from '../../components/Pagination';

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export default function SubmissionListPage() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [studentName, setStudentName] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSubmissions = useCallback(async (params) => {
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
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedFetch = useCallback(debounce(fetchSubmissions, 300), [fetchSubmissions]);

  useEffect(() => {
    const params = { page, size: 20 };
    if (studentName.trim()) params.studentName = studentName.trim();
    if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
    debouncedFetch(params);
  }, [page, studentName, exerciseId, debouncedFetch]);

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!window.confirm('Delete this submission? This cannot be undone.')) return;
    try {
      await submissionApi.delete(id);
      const newPage = submissions.length === 1 && page > 0 ? page - 1 : page;
      setPage(newPage);
      const params = { page: newPage, size: 20 };
      if (studentName.trim()) params.studentName = studentName.trim();
      if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
      fetchSubmissions(params);
    } catch {
      alert('Failed to delete submission.');
    }
  }

  const csvHref = csvExportUrl(exerciseId.trim() || null);

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Submissions</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href={csvHref} download style={{
            background: '#388e3c', color: '#fff', padding: '8px 18px', borderRadius: 4,
            textDecoration: 'none', fontSize: 14,
          }}>
            Export CSV
          </a>
          <button
            onClick={() => navigate('/tutor/submissions/import')}
            style={{
              background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4,
              padding: '8px 18px', cursor: 'pointer', fontSize: 14,
            }}
          >
            Import Files
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Filter by student name…"
          value={studentName}
          onChange={e => { setStudentName(e.target.value); setPage(0); }}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', flex: 1 }}
        />
        <input
          placeholder="Filter by exercise ID…"
          value={exerciseId}
          onChange={e => { setExerciseId(e.target.value); setPage(0); }}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', width: 180 }}
        />
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
              {['Student Name', 'Exercise', 'Type', 'Auto Score', 'Tutor Score', 'Mismatch', 'Date', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No submissions found.</td></tr>
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
                  {sub.versionMismatch && (
                    <span style={{
                      background: '#fff3e0', color: '#e65100', padding: '2px 8px',
                      borderRadius: 4, fontSize: 12, fontWeight: 600,
                    }}>Mismatch</span>
                  )}
                </td>
                <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                  {new Date(sub.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <button
                    onClick={e => handleDelete(e, sub.id)}
                    style={{
                      padding: '3px 10px', color: '#c62828', background: 'none',
                      border: '1px solid #c62828', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    Delete
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

- [ ] **Step 3.3: Update SubmissionDetailPage**

In `frontend/src/pages/tutor/SubmissionDetailPage.jsx`, add `navigate` is already imported. Add delete handler and button.

After the `handleSave` function definition, add:

```jsx
async function handleDelete() {
  if (!window.confirm('Delete this submission? This cannot be undone.')) return;
  try {
    await submissionApi.delete(id);
    navigate('/tutor/submissions');
  } catch {
    alert('Failed to delete submission.');
  }
}
```

After the closing `</div>` of the "Manual Grade" section (before the final `</div>`), add:

```jsx
<div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #eee' }}>
  <button
    onClick={handleDelete}
    style={{
      background: 'none', color: '#c62828', border: '1px solid #c62828',
      borderRadius: 4, padding: '8px 20px', cursor: 'pointer',
    }}
  >
    Delete Submission
  </button>
</div>
```

- [ ] **Step 3.4: Run frontend tests**

```bash
cd frontend && npm test -- --watchAll=false 2>&1 | tail -10
```
Expected: all existing tests pass (no regressions).

- [ ] **Step 3.5: Commit**

```bash
git add frontend/src/api/submissionApi.js \
        frontend/src/pages/tutor/SubmissionListPage.jsx \
        frontend/src/pages/tutor/SubmissionDetailPage.jsx
git commit -m "feat(submission): delete button on list and detail pages"
```

---

## Task 4: Fix Existing Paginated Pages

Replace the `totalPages > 1` condition with the `<Pagination>` component on the four remaining pages.

**Files:**
- Modify: `frontend/src/pages/tutor/ExerciseManagementPage.jsx`
- Modify: `frontend/src/pages/tutor/CourseManagementPage.jsx`
- Modify: `frontend/src/pages/admin/UserManagementPage.jsx`
- Modify: `frontend/src/pages/student/ExerciseListPage.jsx`

For **each** of the four files:

- [ ] **Step 4.1: Add import** at the top of the file:
```jsx
import Pagination from '../../components/Pagination';
```
(adjust the relative path: `../..` for tutor/admin pages, `../..` for student pages — all one level up from `pages/<role>/` to `components/`)

- [ ] **Step 4.2: Replace inline pagination block**

Find and remove the block that looks like:
```jsx
{totalPages > 1 && (
  <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
    <button onClick={...} disabled={page === 0} style={...}>←</button>
    <span>Page {page + 1} of {totalPages}</span>
    <button onClick={...} disabled={page >= totalPages - 1} style={...}>→</button>
  </div>
)}
```

Replace with:
```jsx
<Pagination page={page} totalPages={totalPages} onPageChange={(p) => load(p)} />
```

For `UserManagementPage`, which uses `setPage` directly instead of `load(p)`:
```jsx
<Pagination page={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} />
```

- [ ] **Step 4.3: Run frontend tests**

```bash
cd frontend && npm test -- --watchAll=false 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 4.4: Commit**

```bash
git add frontend/src/pages/tutor/ExerciseManagementPage.jsx \
        frontend/src/pages/tutor/CourseManagementPage.jsx \
        frontend/src/pages/admin/UserManagementPage.jsx \
        frontend/src/pages/student/ExerciseListPage.jsx
git commit -m "feat(ui): use shared Pagination component on existing list pages"
```

---

## Task 5: Category Pagination

**Files:**
- Modify: `backend/…/repository/CategoryRepository.java`
- Modify: `backend/…/category/CategoryService.java`
- Modify: `backend/…/category/CategoryController.java`
- Modify: `frontend/src/api/categoryApi.js`
- Modify: `frontend/src/pages/tutor/CategoryManagementPage.jsx`

- [ ] **Step 5.1: Add pageable query to CategoryRepository**

In `backend/src/main/java/com/platform/exercise/repository/CategoryRepository.java`, add:

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
```

Add new method after `findAllWithExerciseCount()`:

```java
@Query(value = """
        SELECT c.id, c.name,
               COUNT(e.id) AS exercise_count
        FROM categories c
        LEFT JOIN exercises e
               ON e.category_id = c.id AND e.is_deleted = false
        GROUP BY c.id, c.name
        ORDER BY c.name
        """,
        countQuery = "SELECT COUNT(*) FROM categories",
        nativeQuery = true)
Page<CategoryView> findPagedWithExerciseCount(Pageable pageable);
```

- [ ] **Step 5.2: Update CategoryService**

In `CategoryService.java`, add import and update `listAll`:

```java
import com.platform.exercise.common.PageResponse;
import org.springframework.data.domain.Pageable;
```

Change:
```java
@Transactional(readOnly = true)
public List<CategoryDto> listAll() {
    return categoryRepository.findAllWithExerciseCount().stream()
            .map(CategoryDto::from)
            .toList();
}
```
to:
```java
@Transactional(readOnly = true)
public PageResponse<CategoryDto> listAll(Pageable pageable) {
    return PageResponse.of(
        categoryRepository.findPagedWithExerciseCount(pageable)
            .map(CategoryDto::from));
}
```

Remove the `List` import if it becomes unused.

- [ ] **Step 5.3: Update CategoryController**

In `CategoryController.java`, add imports:

```java
import com.platform.exercise.common.PageResponse;
import org.springframework.data.domain.PageRequest;
```

Change `listCategories`:
```java
@GetMapping
@PreAuthorize("isAuthenticated()")
public ResponseEntity<PageResponse<CategoryDto>> listCategories(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
    return ResponseEntity.ok(categoryService.listAll(PageRequest.of(page, size)));
}
```

Remove the `List` import.

- [ ] **Step 5.4: Update categoryApi**

In `frontend/src/api/categoryApi.js`, change:
```js
list: () => axiosInstance.get('/v1/categories').then(r => r.data),
```
to:
```js
list: (page = 0, size = 20) =>
  axiosInstance.get('/v1/categories', { params: { page, size } }).then(r => r.data),
```

- [ ] **Step 5.5: Update CategoryManagementPage**

Replace the full file `frontend/src/pages/tutor/CategoryManagementPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { categoryApi } from '../../api/categoryApi';
import Pagination from '../../components/Pagination';

export default function CategoryManagementPage() {
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(p = page) {
    setLoading(true);
    try {
      const data = await categoryApi.list(p, 20);
      setCategories(data.content);
      setTotalPages(data.totalPages);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(0); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddError('');
    try {
      await categoryApi.create(newName.trim());
      setNewName('');
      load(0);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setAddError(code === 'CATEGORY_DUPLICATE'
        ? 'This category already exists.'
        : 'Failed to create category.');
    }
  }

  async function handleDelete(cat) {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await categoryApi.delete(cat.id);
      load(page);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      alert(code === 'CATEGORY_HAS_EXERCISES'
        ? 'This category has exercises — please remove associations first.'
        : 'Failed to delete category.');
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Category Management</h1>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginTop: 24, marginBottom: 4 }}>
        <input
          value={newName}
          onChange={e => { setNewName(e.target.value); setAddError(''); }}
          placeholder="New category name"
          style={{ padding: 8, width: 240, border: '1px solid #ccc', borderRadius: 4 }}
        />
        <button type="submit"
          style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
          + Add
        </button>
      </form>
      {addError && <p style={{ color: '#c62828', margin: '4px 0 0' }}>{addError}</p>}

      {loading ? <p style={{ marginTop: 16 }}>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Exercise Count</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{cat.name}</td>
                <td style={{ padding: 8 }}>{cat.exerciseCount}</td>
                <td style={{ padding: 8 }}>
                  <button
                    onClick={() => handleDelete(cat)}
                    disabled={cat.exerciseCount > 0}
                    title={cat.exerciseCount > 0 ? 'Has exercises — remove associations first' : ''}
                    style={{
                      padding: '4px 10px',
                      cursor: cat.exerciseCount > 0 ? 'not-allowed' : 'pointer',
                      opacity: cat.exerciseCount > 0 ? 0.4 : 1,
                    }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 16, color: '#999', textAlign: 'center' }}>
                  No categories yet.
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

- [ ] **Step 5.6: Run backend tests**

```bash
cd backend && mvn test 2>&1 | tail -5
```
Expected: `BUILD SUCCESS`.

- [ ] **Step 5.7: Run frontend tests**

```bash
cd frontend && npm test -- --watchAll=false 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 5.8: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/CategoryRepository.java \
        backend/src/main/java/com/platform/exercise/category/CategoryService.java \
        backend/src/main/java/com/platform/exercise/category/CategoryController.java \
        frontend/src/api/categoryApi.js \
        frontend/src/pages/tutor/CategoryManagementPage.jsx
git commit -m "feat(category): paginate category list endpoint and UI"
```

---

## Task 6: Course Sub-List Pagination (Students + Exercises)

**Files:**
- Modify: `backend/…/repository/CourseRepository.java`
- Modify: `backend/…/course/CourseService.java`
- Modify: `backend/…/course/CourseController.java`
- Modify: `frontend/src/api/courseApi.js`
- Modify: `frontend/src/pages/tutor/CourseDetailPage.jsx`

- [ ] **Step 6.1: Add pageable queries to CourseRepository**

In `CourseRepository.java`, add imports:

```java
// already present: import org.springframework.data.domain.Page;
// already present: import org.springframework.data.domain.Pageable;
```

Add two new methods after the existing `findStudentsByCourse` and `findExercisesByCourse`:

```java
@Query(value = """
        SELECT e.id, ev.title, e.type AS exercise_type
        FROM exercises e
        JOIN exercise_versions ev ON ev.id = e.current_version_id
        JOIN course_exercises ce ON ce.exercise_id = e.id
        WHERE ce.course_id = :courseId AND e.is_deleted = false
        ORDER BY ev.title
        """,
        countQuery = """
        SELECT COUNT(*) FROM course_exercises ce
        JOIN exercises e ON ce.exercise_id = e.id
        WHERE ce.course_id = :courseId AND e.is_deleted = false
        """,
        nativeQuery = true)
Page<ExerciseSummaryView> findPagedExercisesByCourse(
        @Param("courseId") Long courseId, Pageable pageable);

@Query(value = """
        SELECT u.id, u.username, u.display_name
        FROM users u
        JOIN course_students cs ON cs.user_id = u.id
        WHERE cs.course_id = :courseId
        ORDER BY u.display_name
        """,
        countQuery = """
        SELECT COUNT(*) FROM course_students WHERE course_id = :courseId
        """,
        nativeQuery = true)
Page<UserSummaryView> findPagedStudentsByCourse(
        @Param("courseId") Long courseId, Pageable pageable);
```

- [ ] **Step 6.2: Update CourseService**

In `CourseService.java`, add imports:

```java
import com.platform.exercise.common.PageResponse;
import org.springframework.data.domain.Pageable;
```

Change `listExercises` signature and body:
```java
public PageResponse<ExerciseSummaryDto> listExercises(Long courseId, Long userId, Pageable pageable) {
    findAndValidateOwnership(courseId, userId);
    return PageResponse.of(
        courseRepository.findPagedExercisesByCourse(courseId, pageable)
            .map(ExerciseSummaryDto::from));
}
```

Change `listStudents` signature and body:
```java
public PageResponse<UserSummaryDto> listStudents(Long courseId, Long userId, Pageable pageable) {
    findAndValidateOwnership(courseId, userId);
    return PageResponse.of(
        courseRepository.findPagedStudentsByCourse(courseId, pageable)
            .map(UserSummaryDto::from));
}
```

- [ ] **Step 6.3: Update CourseController**

In `CourseController.java`, add import:
```java
import org.springframework.data.domain.PageRequest;
```

Change `listExercises` endpoint:
```java
@GetMapping("/{id}/exercises")
public ResponseEntity<PageResponse<ExerciseSummaryDto>> listExercises(
        @PathVariable Long id,
        Authentication authentication,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
    Long userId = getCurrentUserId(authentication);
    return ResponseEntity.ok(courseService.listExercises(id, userId, PageRequest.of(page, size)));
}
```

Change `listStudents` endpoint:
```java
@GetMapping("/{id}/students")
public ResponseEntity<PageResponse<UserSummaryDto>> listStudents(
        @PathVariable Long id,
        Authentication authentication,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
    Long userId = getCurrentUserId(authentication);
    return ResponseEntity.ok(courseService.listStudents(id, userId, PageRequest.of(page, size)));
}
```

Remove `List` import from the controller's return types if it becomes unused.

- [ ] **Step 6.4: Update courseApi**

In `frontend/src/api/courseApi.js`, change:
```js
listExercises: (id) =>
  axiosInstance.get(`/v1/courses/${id}/exercises`).then(r => r.data),
```
to:
```js
listExercises: (id, page = 0, size = 20) =>
  axiosInstance.get(`/v1/courses/${id}/exercises`, { params: { page, size } }).then(r => r.data),
```

Change:
```js
listStudents: (id) =>
  axiosInstance.get(`/v1/courses/${id}/students`).then(r => r.data),
```
to:
```js
listStudents: (id, page = 0, size = 20) =>
  axiosInstance.get(`/v1/courses/${id}/students`, { params: { page, size } }).then(r => r.data),
```

- [ ] **Step 6.5: Update CourseDetailPage**

Replace the full file `frontend/src/pages/tutor/CourseDetailPage.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';
import Breadcrumb from '../../components/Breadcrumb';
import Pagination from '../../components/Pagination';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [tab, setTab] = useState('students');
  const [loadingCourse, setLoadingCourse] = useState(true);

  // Students state
  const [students, setStudents] = useState([]);
  const [studentsTotalElements, setStudentsTotalElements] = useState(0);
  const [studentsPage, setStudentsPage] = useState(0);
  const [studentsTotalPages, setStudentsTotalPages] = useState(0);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  const debouncedQ = useDebounce(searchQ, 300);

  // Exercises state
  const [exercises, setExercises] = useState([]);
  const [exercisesTotalPages, setExercisesTotalPages] = useState(0);
  const [exercisesPage, setExercisesPage] = useState(0);

  useEffect(() => {
    courseApi.get(id)
      .then(setCourse)
      .catch(() => navigate('/tutor/courses'))
      .finally(() => setLoadingCourse(false));
  }, [id, navigate]);

  useEffect(() => {
    if (tab === 'students') loadStudents(0);
    if (tab === 'exercises') loadExercises(0);
  }, [tab, id]);

  async function loadStudents(p) {
    const data = await courseApi.listStudents(id, p, 20).catch(() => ({ content: [], totalPages: 0, totalElements: 0 }));
    setStudents(data.content);
    setStudentsTotalPages(data.totalPages);
    setStudentsTotalElements(data.totalElements);
    setStudentsPage(p);
  }

  async function loadExercises(p) {
    const data = await courseApi.listExercises(id, p, 20).catch(() => ({ content: [], totalPages: 0 }));
    setExercises(data.content);
    setExercisesTotalPages(data.totalPages);
    setExercisesPage(p);
  }

  useEffect(() => {
    if (!debouncedQ.trim()) { setSearchResults([]); return; }
    setSearching(true);
    courseApi.searchAvailableStudents(id, debouncedQ)
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }, [debouncedQ, id]);

  async function handleEnroll(userId) {
    setEnrollError('');
    setEnrolling(true);
    try {
      const result = await courseApi.enrollStudents(id, [userId]);
      if (result.enrolled > 0) {
        setSearchQ('');
        setSearchResults([]);
        loadStudents(studentsPage);
      } else {
        setEnrollError(result.errors?.[0] || 'Could not enroll student.');
      }
    } catch {
      setEnrollError('Failed to enroll student.');
    } finally {
      setEnrolling(false);
    }
  }

  async function handleRemoveStudent(studentId) {
    if (!confirm('Remove this student from the course?')) return;
    try {
      await courseApi.removeStudent(id, studentId);
      loadStudents(students.length === 1 && studentsPage > 0 ? studentsPage - 1 : studentsPage);
    } catch {
      alert('Failed to remove student.');
    }
  }

  async function handleRemoveExercise(exerciseId) {
    if (!confirm('Remove this exercise from the course?')) return;
    try {
      await courseApi.removeExercise(id, exerciseId);
      loadExercises(exercises.length === 1 && exercisesPage > 0 ? exercisesPage - 1 : exercisesPage);
    } catch {
      alert('Failed to remove exercise.');
    }
  }

  if (loadingCourse) return <div style={{ padding: 32 }}>Loading…</div>;

  const tabStyle = (active) => ({
    padding: '8px 20px', cursor: 'pointer', background: 'none', border: 'none',
    borderBottom: active ? '2px solid #1976d2' : '2px solid transparent',
    color: active ? '#1976d2' : '#333', fontWeight: active ? 600 : 400, fontSize: 15,
  });

  return (
    <div style={{ padding: 32 }}>
      {course && (
        <Breadcrumb items={[
          { label: 'Courses', to: '/tutor/courses' },
          { label: course.name },
        ]} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0 }}>{course?.name}</h1>
          {course?.description && <p style={{ color: '#666', marginTop: 4 }}>{course.description}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(`/tutor/courses/${id}/edit`)}
            style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
            Edit
          </button>
          <button onClick={() => navigate('/tutor/courses')}
            style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
            ← Back
          </button>
        </div>
      </div>

      <div style={{ marginTop: 32, borderBottom: '1px solid #eee' }}>
        <button style={tabStyle(tab === 'students')} onClick={() => setTab('students')}>Students</button>
        <button style={tabStyle(tab === 'exercises')} onClick={() => setTab('exercises')}>Exercises</button>
      </div>

      {tab === 'students' && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Enroll Students</h3>
          <div style={{ position: 'relative', maxWidth: 360 }}>
            <input
              value={searchQ}
              onChange={e => { setSearchQ(e.target.value); setEnrollError(''); }}
              placeholder="Search by username or name…"
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
            />
            {(searching || searchResults.length > 0) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 4, zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}>
                {searching && <div style={{ padding: 8, color: '#999' }}>Searching…</div>}
                {!searching && searchResults.length === 0 && searchQ.trim() && (
                  <div style={{ padding: 8, color: '#999' }}>No students found.</div>
                )}
                {searchResults.map(u => (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                    <span>{u.displayName} <span style={{ color: '#999', fontSize: 13 }}>@{u.username}</span></span>
                    <button disabled={enrolling} onClick={() => handleEnroll(u.id)}
                      style={{ padding: '2px 10px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      Enroll
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {enrollError && <p style={{ color: '#c62828', marginTop: 8 }}>{enrollError}</p>}

          <h3 style={{ marginTop: 32, marginBottom: 12 }}>Enrolled Students ({studentsTotalElements})</h3>
          {students.length === 0 ? (
            <p style={{ color: '#999' }}>No students enrolled yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Name</th>
                  <th style={{ padding: 8 }}>Username</th>
                  <th style={{ padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8 }}>{s.displayName}</td>
                    <td style={{ padding: 8 }}>@{s.username}</td>
                    <td style={{ padding: 8 }}>
                      <button onClick={() => handleRemoveStudent(s.id)}
                        style={{ padding: '3px 10px', color: '#c62828', background: 'none', border: '1px solid #c62828', borderRadius: 4, cursor: 'pointer' }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination page={studentsPage} totalPages={studentsTotalPages} onPageChange={(p) => loadStudents(p)} />
        </div>
      )}

      {tab === 'exercises' && (
        <div style={{ marginTop: 24 }}>
          {exercises.length === 0 ? (
            <p style={{ color: '#999' }}>No exercises linked to this course yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Title</th>
                  <th style={{ padding: 8 }}>Type</th>
                  <th style={{ padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map(ex => (
                  <tr key={ex.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8 }}>{ex.title}</td>
                    <td style={{ padding: 8 }}>{ex.exerciseType}</td>
                    <td style={{ padding: 8 }}>
                      <button onClick={() => handleRemoveExercise(ex.id)}
                        style={{ padding: '3px 10px', color: '#c62828', background: 'none', border: '1px solid #c62828', borderRadius: 4, cursor: 'pointer' }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination page={exercisesPage} totalPages={exercisesTotalPages} onPageChange={(p) => loadExercises(p)} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.6: Run backend and frontend tests**

```bash
cd backend && mvn test 2>&1 | tail -5
cd frontend && npm test -- --watchAll=false 2>&1 | tail -10
```
Expected: both `BUILD SUCCESS` / all tests pass.

- [ ] **Step 6.7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/CourseRepository.java \
        backend/src/main/java/com/platform/exercise/course/CourseService.java \
        backend/src/main/java/com/platform/exercise/course/CourseController.java \
        frontend/src/api/courseApi.js \
        frontend/src/pages/tutor/CourseDetailPage.jsx
git commit -m "feat(course): paginate students and exercises sub-lists"
```

---

## Task 7: Progress Pagination

**Files:**
- Modify: `backend/…/student/StudentProgressDto.java`
- Modify: `backend/…/student/StudentProgressService.java`
- Modify: `backend/…/student/StudentProgressController.java`
- Modify: `frontend/src/api/progressApi.js`
- Modify: `frontend/src/pages/student/ProgressPage.jsx`

- [ ] **Step 7.1: Update StudentProgressDto**

Replace the file `backend/src/main/java/com/platform/exercise/student/StudentProgressDto.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;

public record StudentProgressDto(
        SummaryDto summary,
        PageResponse<ProgressExerciseDto> exercises) {

    public record SummaryDto(
            int totalExercises,
            int attemptedCount,
            int gradedCount,
            double averageScore,
            double passRate) {}
}
```

- [ ] **Step 7.2: Update StudentProgressService**

Replace `StudentProgressService.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class StudentProgressService {

    private final StudentExerciseService studentExerciseService;
    private final SubmissionRepository submissionRepository;

    public StudentProgressDto getProgress(Long userId, String displayName, int page, int size) {
        List<StudentExerciseListDto> exercises =
                studentExerciseService.listExercises(null, null, null, 0, 1000, userId).content();

        List<Submission> submissions = submissionRepository.findByStudentNameAndDeletedFalse(displayName);

        Map<Long, Submission> bestByExercise = new HashMap<>();
        for (Submission s : submissions) {
            bestByExercise.merge(s.getExerciseId(), s, (existing, candidate) -> {
                BigDecimal ex = effectiveScore(existing);
                BigDecimal ca = effectiveScore(candidate);
                if (ca != null && (ex == null || ca.compareTo(ex) > 0)) return candidate;
                return existing;
            });
        }

        List<ProgressExerciseDto> result = new ArrayList<>();
        int attemptedCount = 0, gradedCount = 0, passCount = 0;
        double scoreSum = 0.0;

        for (StudentExerciseListDto ex : exercises) {
            Submission best = bestByExercise.get(ex.id());
            ProgressExerciseDto dto;
            if (best == null) {
                dto = new ProgressExerciseDto(ex.id(), ex.title(), ex.type(), "NOT_ATTEMPTED", null, null);
            } else {
                BigDecimal eff = effectiveScore(best);
                if (eff == null) {
                    attemptedCount++;
                    dto = new ProgressExerciseDto(ex.id(), ex.title(), ex.type(), "ATTEMPTED", null, null);
                } else {
                    gradedCount++;
                    double score = eff.doubleValue();
                    scoreSum += score;
                    if (score >= 60.0) passCount++;
                    String source = best.getTutorScore() != null ? "TUTOR" : "AUTO";
                    dto = new ProgressExerciseDto(ex.id(), ex.title(), ex.type(), "GRADED", score, source);
                }
            }
            result.add(dto);
        }

        double averageScore = gradedCount > 0
                ? Math.round((scoreSum / gradedCount) * 10.0) / 10.0 : 0.0;
        double passRate = gradedCount > 0
                ? Math.round(((double) passCount / gradedCount * 100) * 10.0) / 10.0 : 0.0;

        // Manually paginate the result list; summary is computed over all exercises
        int total = result.size();
        int fromIdx = Math.min(page * size, total);
        int toIdx = Math.min(fromIdx + size, total);
        int totalPages = size > 0 ? (int) Math.ceil((double) total / size) : 1;
        PageResponse<ProgressExerciseDto> pageResponse =
                new PageResponse<>(result.subList(fromIdx, toIdx), page, size, total, totalPages);

        return new StudentProgressDto(
                new StudentProgressDto.SummaryDto(
                        exercises.size(), attemptedCount, gradedCount, averageScore, passRate),
                pageResponse);
    }

    private BigDecimal effectiveScore(Submission s) {
        return s.getTutorScore() != null ? s.getTutorScore() : s.getAutoScore();
    }
}
```

- [ ] **Step 7.3: Update StudentProgressController**

In `StudentProgressController.java`, change `getProgress`:

```java
@GetMapping
public ResponseEntity<StudentProgressDto> getProgress(
        Authentication authentication,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
    User user = (authentication.getPrincipal() instanceof User u) ? u
            : userRepository.findByUsername(authentication.getName())
                    .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND));
    return ResponseEntity.ok(
            studentProgressService.getProgress(user.getId(), user.getDisplayName(), page, size));
}
```

- [ ] **Step 7.4: Update progressApi**

In `frontend/src/api/progressApi.js`, change:
```js
getProgress: () => axiosInstance.get('/v1/student/progress').then(r => r.data),
```
to:
```js
getProgress: (page = 0, size = 20) =>
  axiosInstance.get('/v1/student/progress', { params: { page, size } }).then(r => r.data),
```

- [ ] **Step 7.5: Update ProgressPage**

Replace the full file `frontend/src/pages/student/ProgressPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { progressApi } from '../../api/progressApi';
import Pagination from '../../components/Pagination';

function chipStyle(status, score) {
  if (status === 'GRADED') {
    return score >= 60
      ? { label: 'Graded', bg: '#16a34a', color: '#fff' }
      : { label: 'Graded', bg: '#dc2626', color: '#fff' };
  }
  if (status === 'ATTEMPTED') return { label: 'Attempted', bg: '#f59e0b', color: '#fff' };
  return { label: 'Not Attempted', bg: '#9e9e9e', color: '#fff' };
}

function SummaryCard({ label, value }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, border: '1px solid #e0e0e0', borderRadius: 8,
      padding: '16px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#1976d2' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function ProgressPage() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    progressApi.getProgress(page, 20)
      .then(setData)
      .catch(() => setError('Failed to load progress.'))
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;
  if (error)   return <div style={{ padding: 32, color: 'red' }}>{error}</div>;

  const { summary, exercises } = data;

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>My Progress</h2>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <SummaryCard label="Total Exercises" value={summary.totalExercises} />
        <SummaryCard label="Attempted" value={summary.attemptedCount} />
        <SummaryCard label="Graded" value={summary.gradedCount} />
        <SummaryCard
          label="Avg Score / Pass Rate"
          value={`${summary.averageScore.toFixed(1)} / ${summary.passRate.toFixed(1)}%`}
        />
      </div>

      {exercises.totalElements === 0 ? (
        <p style={{ color: '#888' }}>No exercises available.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Exercise</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {exercises.content.map(ex => {
              const chip = chipStyle(ex.status, ex.score);
              return (
                <tr key={ex.exerciseId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{ex.exerciseTitle}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: ex.exerciseType === 'BLOCKLY' ? '#ede9fe' : '#dbeafe',
                      color: ex.exerciseType === 'BLOCKLY' ? '#7c3aed' : '#1d4ed8',
                      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                    }}>
                      {ex.exerciseType}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: chip.bg, color: chip.color,
                      borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {chip.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {ex.score != null ? (
                      <>
                        <span style={{ fontWeight: 600 }}>{ex.score.toFixed(1)} / 100</span>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {ex.scoreSource === 'TUTOR' ? 'Tutor Score' : 'Auto Score'}
                        </div>
                      </>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={exercises.totalPages} onPageChange={setPage} />
    </div>
  );
}
```

- [ ] **Step 7.6: Run all tests**

```bash
cd backend && mvn test 2>&1 | tail -5
cd frontend && npm test -- --watchAll=false 2>&1 | tail -10
```
Expected: both pass.

- [ ] **Step 7.7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentProgressDto.java \
        backend/src/main/java/com/platform/exercise/student/StudentProgressService.java \
        backend/src/main/java/com/platform/exercise/student/StudentProgressController.java \
        frontend/src/api/progressApi.js \
        frontend/src/pages/student/ProgressPage.jsx
git commit -m "feat(progress): paginate exercise list in student progress page"
```

---

## Task 8: Rebuild and Deploy

- [ ] **Step 8.1: Rebuild backend container**

```bash
docker compose build api-server
```

- [ ] **Step 8.2: Restart**

```bash
docker compose up -d api-server
```

- [ ] **Step 8.3: Verify startup**

```bash
docker compose logs api-server --tail=5
```
Expected: `Started ExerciseApplication in X seconds`.

- [ ] **Step 8.4: Rebuild frontend (if served via Nginx from a build)**

```bash
docker compose build nginx && docker compose up -d nginx
```
