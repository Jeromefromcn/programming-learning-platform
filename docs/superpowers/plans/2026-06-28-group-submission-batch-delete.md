# Group Submission Batch Delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Delete button to every row on the Group Submissions page that physically removes the import batch and all its associated submissions (including previously soft-deleted ones), with a confirmation dialog that shows the submission count and a graded warning when applicable.

**Architecture:** New `DELETE /v1/import-batches/{id}` endpoint delegates to `ImportBatchService.deleteBatch`, which hard-deletes all `submissions` rows for that batch then removes the `import_batches` row. The frontend adds a Delete button alongside the existing Export CSV button in the action cell; a single `window.confirm` dialog carries the count and optional graded warning.

**Tech Stack:** Spring Boot 3.5 / Spring Data JPA / H2 (tests) on the backend; React 18 / Vitest / React Testing Library on the frontend.

## Global Constraints

- Role gate: `TUTOR` (same as existing batch endpoints).
- Hard delete: `DELETE FROM Submission WHERE batchId = ?` — no `is_deleted` filter, removes all rows.
- Confirmation UX: single `window.confirm`; graded warning prepended only when `gradedStatus === 'ALL'`.
- No new npm packages, no new Maven dependencies.
- Backend tests: `@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Transactional`.
- Frontend tests: Vitest + React Testing Library, mock API modules with `vi.mock`.

---

## File Map

| File | Change |
|---|---|
| `backend/src/main/java/com/platform/exercise/common/ErrorCode.java` | Add `BATCH_NOT_FOUND` |
| `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java` | Add `deleteAllByBatchId` |
| `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java` | Add `deleteBatch` |
| `backend/src/main/java/com/platform/exercise/submission/ImportBatchController.java` | Add `DELETE /{id}` |
| `backend/src/test/java/com/platform/exercise/submission/ImportBatchControllerTest.java` | **Create** — integration tests |
| `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java` | Add two unit tests for `deleteBatch` |
| `frontend/src/api/importBatchApi.js` | Add `delete` method |
| `frontend/src/pages/tutor/GroupSubmissionPage.jsx` | Add `deletingId` state + `handleDelete` + Delete button |
| `frontend/src/pages/tutor/GroupSubmissionPage.test.jsx` | **Create** — four frontend tests |

---

## Task 1: Backend — Delete Batch Endpoint (TDD)

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`
- Modify: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/ImportBatchController.java`
- Modify: `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java`
- Create: `backend/src/test/java/com/platform/exercise/submission/ImportBatchControllerTest.java`

**Interfaces:**
- Produces: `DELETE /v1/import-batches/{id}` → 204, 404, 403
- Produces: `ImportBatchService.deleteBatch(Long id)` — void, throws `PlatformException(BATCH_NOT_FOUND)` when absent

- [ ] **Step 1: Write the failing controller integration test**

Create `backend/src/test/java/com/platform/exercise/submission/ImportBatchControllerTest.java`:

```java
package com.platform.exercise.submission;

import com.platform.exercise.domain.*;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ImportBatchControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ImportBatchRepository importBatchRepository;
    @Autowired SubmissionRepository submissionRepository;
    @Autowired ExerciseRepository exerciseRepository;
    @Autowired ExerciseVersionRepository versionRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @MockBean SandboxClient sandboxClient;

    private Long exerciseId;
    private Long gradedVersionId;

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("batch_tutor");
        tutor.setDisplayName("Batch Tutor");
        tutor.setPasswordHash(passwordEncoder.encode("pw"));
        tutor.setRole(User.Role.TUTOR);
        tutor.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(tutor);

        Exercise ex = new Exercise();
        ex.setTitle("Batch Test Exercise");
        ex.setDescription("desc");
        ex.setType(Exercise.ExerciseType.BLOCKLY);
        ex.setDifficulty(Exercise.Difficulty.EASY);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCreatedBy(tutor.getId());
        exerciseId = exerciseRepository.save(ex).getId();

        ExerciseVersion ver = new ExerciseVersion();
        ver.setExerciseId(exerciseId);
        ver.setVersionNumber(1);
        ver.setTitle("Batch Test Exercise");
        ver.setDescription("desc");
        ver.setDifficulty("EASY");
        ver.setConfig("{}");
        gradedVersionId = versionRepository.save(ver).getId();
    }

    private ImportBatch savedBatch() {
        ImportBatch b = new ImportBatch();
        b.setUuid("test-uuid-1");
        b.setFileCount(2);
        b.setImportedCount(2);
        b.setDuplicateCount(0);
        b.setFailedCount(0);
        return importBatchRepository.save(b);
    }

    private Submission submission(String student, Long batchId, boolean deleted) {
        Submission s = new Submission();
        s.setExerciseId(exerciseId);
        s.setGradedVersionId(gradedVersionId);
        s.setStudentName(student);
        s.setExerciseType("BLOCKLY");
        s.setAnswerData("{}");
        s.setExportTimestamp(LocalDateTime.now());
        s.setBatchId(batchId);
        s.setSource("IMPORT");
        s.setDeleted(deleted);
        return s;
    }

    @Test
    @WithMockUser(username = "batch_tutor", roles = "TUTOR")
    void delete_returnsNoContent_andHardDeletesBatchAndAllSubmissions() throws Exception {
        ImportBatch batch = savedBatch();
        submissionRepository.save(submission("Alice", batch.getId(), false));
        submissionRepository.save(submission("Bob", batch.getId(), true)); // already soft-deleted

        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isNoContent());

        assertThat(importBatchRepository.findById(batch.getId())).isEmpty();
        assertThat(submissionRepository.findAll().stream()
            .filter(s -> batch.getId().equals(s.getBatchId()))
            .toList()).isEmpty();
    }

    @Test
    @WithMockUser(username = "batch_tutor", roles = "TUTOR")
    void delete_returnsNotFound_whenBatchMissing() throws Exception {
        mockMvc.perform(delete("/v1/import-batches/{id}", 99999L))
            .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void delete_returnsForbidden_forStudentRole() throws Exception {
        ImportBatch batch = savedBatch();

        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && mvn test -pl . -Dtest=ImportBatchControllerTest -q 2>&1 | tail -20
```

Expected: compilation error (endpoint doesn't exist yet) or 404/405 responses.

- [ ] **Step 3: Add `BATCH_NOT_FOUND` to `ErrorCode`**

In `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`, add before `ACCOUNT_EXPIRED`:

```java
    BATCH_NOT_FOUND(HttpStatus.NOT_FOUND),
```

- [ ] **Step 4: Add `deleteAllByBatchId` to `SubmissionRepository`**

In `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`, add after the `hardDeleteByFilters` method:

```java
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("DELETE FROM Submission s WHERE s.batchId = :batchId")
    int deleteAllByBatchId(@Param("batchId") Long batchId);
```

- [ ] **Step 5: Add `deleteBatch` to `ImportBatchService`**

Add these imports to `ImportBatchService.java` (after the existing imports):

```java
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import org.springframework.transaction.annotation.Transactional;
```

Add this method to `ImportBatchService` (after `exportBatchCsv`):

```java
    @Transactional
    public void deleteBatch(Long id) {
        if (!importBatchRepository.existsById(id)) {
            throw new PlatformException(ErrorCode.BATCH_NOT_FOUND, "Batch not found.");
        }
        submissionRepository.deleteAllByBatchId(id);
        importBatchRepository.deleteById(id);
    }
```

- [ ] **Step 6: Add `DELETE /{id}` to `ImportBatchController`**

Add this method to `ImportBatchController.java` (after `exportCsv`):

```java
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        importBatchService.deleteBatch(id);
        return ResponseEntity.noContent().build();
    }
```

The import `org.springframework.http.ResponseEntity` is already present. Add `org.springframework.web.bind.annotation.PathVariable` if not already imported — check the existing imports at the top of the file; if `PathVariable` is missing, add it.

- [ ] **Step 7: Run the controller tests to confirm they pass**

```bash
cd backend && mvn test -pl . -Dtest=ImportBatchControllerTest -q 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`, 3 tests pass.

- [ ] **Step 8: Add service unit tests to `ImportBatchServiceTest`**

Add these imports to `ImportBatchServiceTest.java` (at the top of the import block):

```java
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
```

Add these two test methods at the end of the class (inside the closing `}`):

```java
    @Test
    void deleteBatch_callsDeleteAllByBatchIdThenDeleteById() {
        when(importBatchRepository.existsById(5L)).thenReturn(true);

        service.deleteBatch(5L);

        verify(submissionRepository).deleteAllByBatchId(5L);
        verify(importBatchRepository).deleteById(5L);
    }

    @Test
    void deleteBatch_throwsBatchNotFound_whenBatchAbsent() {
        when(importBatchRepository.existsById(99L)).thenReturn(false);

        PlatformException ex = assertThrows(PlatformException.class,
            () -> service.deleteBatch(99L));
        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.BATCH_NOT_FOUND);
    }
```

- [ ] **Step 9: Run full backend test suite**

```bash
cd backend && mvn test -q 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/common/ErrorCode.java \
        backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java \
        backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java \
        backend/src/main/java/com/platform/exercise/submission/ImportBatchController.java \
        backend/src/test/java/com/platform/exercise/submission/ImportBatchControllerTest.java \
        backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java
git commit -m "feat(batch): add DELETE /v1/import-batches/{id} with hard-delete of submissions"
```

---

## Task 2: Frontend — Delete Button on Group Submissions Page (TDD)

**Files:**
- Modify: `frontend/src/api/importBatchApi.js`
- Create: `frontend/src/pages/tutor/GroupSubmissionPage.test.jsx`
- Modify: `frontend/src/pages/tutor/GroupSubmissionPage.jsx`

**Interfaces:**
- Consumes: `importBatchApi.delete(id: number)` → Promise (added in this task)
- Consumes: `batch.importedCount: number`, `batch.gradedStatus: string` (already in DTO)

- [ ] **Step 1: Write the failing frontend tests**

Create `frontend/src/pages/tutor/GroupSubmissionPage.test.jsx`:

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
});

afterEach(() => vi.restoreAllMocks());

const renderPage = () => render(<MemoryRouter><GroupSubmissionPage /></MemoryRouter>);

it('renders a Delete button for each batch row', async () => {
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(1, 'NONE')],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));
  expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
});

it('confirmation message includes submission count', async () => {
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(1, 'NONE', 7)],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('7'));
});

it('confirmation message includes graded warning when gradedStatus is ALL', async () => {
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(2, 'ALL', 5)],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  expect(window.confirm).toHaveBeenCalledWith(
    expect.stringContaining('fully graded')
  );
});

it('calls importBatchApi.delete with batch id when user confirms', async () => {
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(3, 'PARTIAL', 4)],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  await waitFor(() => expect(importBatchApi.delete).toHaveBeenCalledWith(3));
});

it('does not call importBatchApi.delete when user cancels', async () => {
  window.confirm.mockReturnValue(false);
  importBatchApi.list = vi.fn().mockResolvedValue({
    content: [batch(4, 'NONE', 2)],
    totalPages: 1,
  });
  renderPage();
  await waitFor(() => screen.getByRole('button', { name: /^delete$/i }));

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

  expect(importBatchApi.delete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- --reporter=verbose GroupSubmissionPage 2>&1 | tail -30
```

Expected: test file fails — `importBatchApi.delete` is not a function / Delete button not found.

- [ ] **Step 3: Add `delete` to `importBatchApi`**

In `frontend/src/api/importBatchApi.js`, replace the `importBatchApi` object:

```js
export const importBatchApi = {
  list: (params) =>
    axiosInstance.get('/v1/import-batches', { params }).then(r => r.data),
  delete: (id) =>
    axiosInstance.delete(`/v1/import-batches/${id}`).then(r => r.data),
};
```

- [ ] **Step 4: Add `deletingId` state and `handleDelete` to `GroupSubmissionPage`**

In `frontend/src/pages/tutor/GroupSubmissionPage.jsx`, add `deletingId` state after the existing `loading` state declaration:

```js
  const [deletingId, setDeletingId] = useState(null);
```

Add `handleDelete` function after `handleExport`:

```js
  async function handleDelete(batch) {
    let msg = `Delete batch #${batch.id} and its ${batch.importedCount} imported submissions?\nThis cannot be undone.`;
    if (batch.gradedStatus === 'ALL') {
      msg = `Warning: This batch is fully graded.\n\n` + msg;
    }
    if (!window.confirm(msg)) return;
    setDeletingId(batch.id);
    try {
      await importBatchApi.delete(batch.id);
      const params = { page, size: 20 };
      if (batchId.trim()) params.batchId = batchId.trim();
      if (gradedStatus) params.gradedStatus = gradedStatus;
      fetchBatches(params);
    } catch {
      alert('Failed to delete batch.');
    } finally {
      setDeletingId(null);
    }
  }
```

- [ ] **Step 5: Add Delete button to each batch row**

In `GroupSubmissionPage.jsx`, replace the last `<td>` in the row (the one containing the Export CSV button) with a cell that holds both buttons:

Find this block (inside the `batches.map(b => {...})` return):

```jsx
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      onClick={() => handleExport(b)}
                      style={{
                        padding: '4px 14px', background: '#388e3c', color: '#fff',
                        border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                      }}
                    >
                      Export CSV
                    </button>
                  </td>
```

Replace it with:

```jsx
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
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

- [ ] **Step 6: Run frontend tests to confirm they pass**

```bash
cd frontend && npm test -- --reporter=verbose GroupSubmissionPage 2>&1 | tail -30
```

Expected: 5 tests pass.

- [ ] **Step 7: Run full frontend test suite**

```bash
cd frontend && npm test 2>&1 | tail -20
```

Expected: all tests pass, no regressions.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/importBatchApi.js \
        frontend/src/pages/tutor/GroupSubmissionPage.jsx \
        frontend/src/pages/tutor/GroupSubmissionPage.test.jsx
git commit -m "feat(batch): add delete button to group submission page with confirmation"
```
