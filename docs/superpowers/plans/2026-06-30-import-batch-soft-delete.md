# Import Batch Soft Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `DELETE /v1/import-batches/{id}` from physically deleting the `import_batches` row to soft-deleting it (`is_deleted = true`), matching the existing soft-delete pattern used by `exercises`/`courses`/`submissions`.

**Architecture:** Add an `is_deleted` column to `import_batches` via a new Flyway migration. Add a `deleted` field to the `ImportBatch` entity and two derived-query repository methods (`findByIdAndDeletedFalse`, `findAllByDeletedFalseOrderByCreatedAtDesc`), following the exact naming convention already used by `ExerciseRepository`. `ImportBatchService.deleteBatch()` switches from `existsById`/`deleteById` to `findByIdAndDeletedFalse`/`save(deleted=true)`; `list()` switches from `findAllByOrderByCreatedAtDesc` to the new deleted-excluding variant.

**Tech Stack:** Spring Boot 3.5.0, Spring Data JPA, Flyway 9, JUnit 5 + Mockito + AssertJ, H2 (test) / MySQL 8.0 (prod).

## Global Constraints

- No restore/undo feature for soft-deleted batches — out of scope.
- `V11__fk_sub_batch_set_null_on_delete.sql`'s `ON DELETE SET NULL` constraint stays unchanged.
- No frontend changes — `DELETE /v1/import-batches/{id}` must keep returning `204` on success, `404` on missing/already-deleted, `403` for non-TUTOR roles.
- `exportBatchCsv()` is not modified — it already filters via `submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc`, independent of the batch row's own state.
- TDD mandatory: failing test before implementation code, every task.

---

### Task 1: Add `is_deleted` column to `import_batches`

**Files:**
- Create: `backend/src/main/resources/db/migration/V12__add_import_batches_soft_delete.sql`
- Modify: `backend/src/test/java/com/platform/exercise/MigrationTest.java`

**Interfaces:**
- Produces: `import_batches.is_deleted` column (`BOOLEAN NOT NULL DEFAULT FALSE`), consumed by Task 2's entity/repository changes.

- [ ] **Step 1: Write the failing test**

Add this test method to `backend/src/test/java/com/platform/exercise/MigrationTest.java`, placed after `v10AddsImportBatchesTableAndSubmissionColumns`:

```java
    @Test
    void v12AddsImportBatchesSoftDeleteColumn() throws Exception {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT LOWER(COLUMN_NAME) FROM INFORMATION_SCHEMA.COLUMNS " +
                 "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='import_batches'")) {
            ResultSet rs = stmt.executeQuery();
            Set<String> cols = new HashSet<>();
            while (rs.next()) cols.add(rs.getString(1));
            assertTrue(cols.contains("is_deleted"), "import_batches.is_deleted should exist");
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=MigrationTest`
Expected: FAIL — `import_batches.is_deleted should exist` (column doesn't exist yet).

- [ ] **Step 3: Write the migration**

Create `backend/src/main/resources/db/migration/V12__add_import_batches_soft_delete.sql`:

```sql
ALTER TABLE import_batches ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=MigrationTest`
Expected: PASS, all `MigrationTest` tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V12__add_import_batches_soft_delete.sql backend/src/test/java/com/platform/exercise/MigrationTest.java
git commit -m "feat(db): add is_deleted column to import_batches (V12)"
```

---

### Task 2: Soft-delete `deleteBatch()` and exclude deleted batches from `list()`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/domain/ImportBatch.java`
- Modify: `backend/src/main/java/com/platform/exercise/repository/ImportBatchRepository.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java:44-46` (the `list()` method's repository call)
- Modify: `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java:183-190` (the `deleteBatch()` method)
- Test: `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java:169-186`

**Interfaces:**
- Consumes: `ErrorCode.BATCH_NOT_FOUND` (already exists in `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`), `PlatformException` (already exists).
- Produces: `ImportBatch.isDeleted()` / `ImportBatch.setDeleted(boolean)`, `ImportBatchRepository.findByIdAndDeletedFalse(Long)`, `ImportBatchRepository.findAllByDeletedFalseOrderByCreatedAtDesc()`. Task 3's controller test relies on `ImportBatchRepository.findById(Long)` (inherited from `JpaRepository`, unchanged) still finding the row after a soft delete, and on `findByIdAndDeletedFalse` returning empty after one.

- [ ] **Step 1: Write the failing tests**

Replace the two `deleteBatch` tests in `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java` (currently at lines 169–186, `deleteBatch_callsDeleteAllByBatchIdThenDeleteById` and `deleteBatch_throwsBatchNotFound_whenBatchAbsent`) with:

```java
    @Test
    void deleteBatch_softDeletesSubmissionsThenSoftDeletesBatch() {
        ImportBatch batch = new ImportBatch();
        batch.setId(5L);
        batch.setDeleted(false);
        when(importBatchRepository.findByIdAndDeletedFalse(5L)).thenReturn(Optional.of(batch));

        service.deleteBatch(5L);

        verify(submissionRepository).softDeleteAllByBatchId(5L);
        assertThat(batch.isDeleted()).isTrue();
        verify(importBatchRepository).save(batch);
    }

    @Test
    void deleteBatch_throwsBatchNotFound_whenBatchAbsentOrAlreadyDeleted() {
        when(importBatchRepository.findByIdAndDeletedFalse(99L)).thenReturn(Optional.empty());

        PlatformException ex = assertThrows(PlatformException.class,
            () -> service.deleteBatch(99L));
        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.BATCH_NOT_FOUND);
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=ImportBatchServiceTest`
Expected: FAIL — compilation error, `ImportBatchRepository.findByIdAndDeletedFalse(Long)` does not exist; `ImportBatch.setDeleted`/`isDeleted` do not exist.

- [ ] **Step 3: Add the `deleted` field to `ImportBatch`**

In `backend/src/main/java/com/platform/exercise/domain/ImportBatch.java`, add after the `createdAt` field (the existing `@Lombok @Data` annotation on the class auto-generates `isDeleted()`/`setDeleted(boolean)` for this primitive `boolean` field — matches the same convention already used on `Submission.deleted`):

```java
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "is_deleted", nullable = false)
    private boolean deleted = false;
}
```

(This replaces the existing closing lines 36-38 of the file — the new field is inserted before the final `}`.)

- [ ] **Step 4: Add repository methods**

Replace the full contents of `backend/src/main/java/com/platform/exercise/repository/ImportBatchRepository.java`:

```java
package com.platform.exercise.repository;

import com.platform.exercise.domain.ImportBatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ImportBatchRepository extends JpaRepository<ImportBatch, Long> {
    Optional<ImportBatch> findByUuid(String uuid);
    List<ImportBatch> findAllByOrderByCreatedAtDesc();
    Optional<ImportBatch> findByIdAndDeletedFalse(Long id);
    List<ImportBatch> findAllByDeletedFalseOrderByCreatedAtDesc();
}
```

- [ ] **Step 5: Update `list()` to exclude soft-deleted batches**

In `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java`, change line 46:

```java
        List<ImportBatch> all = importBatchRepository.findAllByOrderByCreatedAtDesc();
```
to:
```java
        List<ImportBatch> all = importBatchRepository.findAllByDeletedFalseOrderByCreatedAtDesc();
```

- [ ] **Step 6: Update `deleteBatch()` to soft-delete**

In the same file, replace the existing `deleteBatch` method (lines 183-190):

```java
    @Transactional
    public void deleteBatch(Long id) {
        if (!importBatchRepository.existsById(id)) {
            throw new PlatformException(ErrorCode.BATCH_NOT_FOUND, "Batch not found.");
        }
        submissionRepository.softDeleteAllByBatchId(id);
        importBatchRepository.deleteById(id);
    }
```
with:
```java
    @Transactional
    public void deleteBatch(Long id) {
        ImportBatch batch = importBatchRepository.findByIdAndDeletedFalse(id)
            .orElseThrow(() -> new PlatformException(ErrorCode.BATCH_NOT_FOUND, "Batch not found."));
        submissionRepository.softDeleteAllByBatchId(id);
        batch.setDeleted(true);
        importBatchRepository.save(batch);
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=ImportBatchServiceTest`
Expected: PASS, all tests green.

Run the full suite to see the expected fallout: `cd backend && mvn test`
Expected: `ImportBatchControllerTest.delete_returnsNoContent_andHardDeletesBatchAndAllSubmissions` now FAILS — its assertion `assertThat(importBatchRepository.findById(batch.getId())).isEmpty()` no longer holds, because `deleteBatch()` no longer physically removes the row. This is expected and is fixed in Task 3; do not modify `ImportBatchControllerTest.java` in this task.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/domain/ImportBatch.java backend/src/main/java/com/platform/exercise/repository/ImportBatchRepository.java backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java
git commit -m "feat(submission): soft-delete import batches instead of hard-deleting"
```

---

### Task 3: Update integration tests for soft-deleted batch behavior

**Files:**
- Modify: `backend/src/test/java/com/platform/exercise/submission/ImportBatchControllerTest.java`

**Interfaces:**
- Consumes: `ImportBatchRepository.findById(Long)` (inherited, unchanged), `ImportBatchRepository.findByIdAndDeletedFalse(Long)` (Task 2), `ImportBatch.isDeleted()` (Task 2), the `GET /v1/import-batches` endpoint (unchanged, already exists at `ImportBatchController.java:20-27`), `PageResponse<ImportBatchDto>`'s JSON shape (`content` array, same shape used in `SubmissionControllerTest`'s `$.content[...]` assertions).

- [ ] **Step 1: Write the failing tests**

In `backend/src/test/java/com/platform/exercise/submission/ImportBatchControllerTest.java`, add this import alongside the existing static imports:

```java
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
```

Replace the existing `delete_returnsNoContent_andHardDeletesBatchAndAllSubmissions` test (lines 97-117) with:

```java
    @Test
    @WithMockUser(username = "batch_tutor", roles = "TUTOR")
    void delete_returnsNoContent_andSoftDeletesBatchAndAllSubmissions() throws Exception {
        ImportBatch batch = savedBatch();
        Long aliceId = submissionRepository.save(submission("Alice", batch.getId(), false)).getId();
        Long bobId = submissionRepository.save(submission("Bob", batch.getId(), true)).getId(); // already soft-deleted

        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isNoContent());
        entityManager.flush();
        entityManager.clear();

        // batch row still physically exists, but is flagged deleted
        ImportBatch reloaded = importBatchRepository.findById(batch.getId()).orElseThrow();
        assertThat(reloaded.isDeleted()).isTrue();
        assertThat(importBatchRepository.findByIdAndDeletedFalse(batch.getId())).isEmpty();

        Submission alice = submissionRepository.findById(aliceId).orElseThrow();
        Submission bob = submissionRepository.findById(bobId).orElseThrow();
        assertThat(alice.isDeleted()).isTrue();
        assertThat(bob.isDeleted()).isTrue();
        // the deleted batch must not leave a dangling FK on surviving (soft-deleted) submissions
        assertThat(alice.getBatchId()).isNull();
        assertThat(bob.getBatchId()).isNull();
    }

    @Test
    @WithMockUser(username = "batch_tutor", roles = "TUTOR")
    void delete_thenBatchExcludedFromList() throws Exception {
        ImportBatch batch = savedBatch();

        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/v1/import-batches"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.id==" + batch.getId() + ")]").isEmpty());
    }

    @Test
    @WithMockUser(username = "batch_tutor", roles = "TUTOR")
    void delete_alreadyDeletedBatch_returnsNotFound() throws Exception {
        ImportBatch batch = savedBatch();
        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isNoContent());

        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isNotFound());
    }
```

- [ ] **Step 2: Confirm the pre-existing failure this step fixes**

Before making this edit, the full suite (per Task 2 Step 7) has exactly one failure: `delete_returnsNoContent_andHardDeletesBatchAndAllSubmissions`, because Task 2 already changed `deleteBatch()` to soft-delete but this test file still asserts the old hard-delete behavior. This task's Step 1 edit replaces that stale test with `delete_returnsNoContent_andSoftDeletesBatchAndAllSubmissions` (correct assertions for the new behavior) and adds two new tests for previously-uncovered behavior (`delete_thenBatchExcludedFromList`, `delete_alreadyDeletedBatch_returnsNotFound`). Since `deleteBatch()` and `list()` were already implemented in Task 2, all three are expected to pass as soon as they compile — there is no further red state to chase here, only the one this step's edit directly resolves.

- [ ] **Step 3: Confirm tests pass**

Run: `cd backend && mvn test -Dtest=ImportBatchControllerTest`
Expected: PASS, all 5 tests in the file green (`delete_returnsNoContent_andSoftDeletesBatchAndAllSubmissions`, `delete_thenBatchExcludedFromList`, `delete_alreadyDeletedBatch_returnsNotFound`, `delete_returnsNotFound_whenBatchMissing`, `delete_returnsForbidden_forStudentRole`).

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && mvn test`
Expected: PASS, 0 failures, 0 errors (baseline before this plan was 282 tests passing; this plan adds 2 new tests and modifies 2 existing ones, so expect 284 total).

- [ ] **Step 5: Commit**

```bash
git add backend/src/test/java/com/platform/exercise/submission/ImportBatchControllerTest.java
git commit -m "test(submission): verify import batch soft-delete excludes it from list and is idempotent-404"
```

---

### Task 4: Deploy

**Files:** none (operational task)

- [ ] **Step 1: Push to remote**

```bash
git push origin main
```

- [ ] **Step 2: Rebuild and redeploy api-server**

```bash
docker compose build api-server
docker compose up -d api-server
```

- [ ] **Step 3: Verify clean startup and migration**

```bash
sleep 15
docker logs programming-learning-platform-api-server-1 --since 25s 2>&1 | grep -iE "flyway|migrat|started|error|exception|V12"
```
Expected: log line `Migrating schema \`exercise_db\` to version "12 - add import batches soft delete"`, followed by `Successfully applied 1 migration`, followed by `Started ExerciseApplication`, with no ERROR/Exception lines.

- [ ] **Step 4: Verify column exists on live MySQL**

```bash
docker exec programming-learning-platform-mysql-1 mysql -uroot -p"$(docker exec programming-learning-platform-mysql-1 printenv MYSQL_ROOT_PASSWORD)" exercise_db -e "DESCRIBE import_batches;" 2>&1 | grep -v Warning
```
Expected: output includes a row for `is_deleted | tinyint(1) | NO | | 0 |`.

---

## Self-Review Notes

- **Spec coverage:** every requirement in `docs/superpowers/specs/2026-06-30-import-batch-soft-delete-design.md` maps to a task — schema change (Task 1), entity/repository/service changes (Task 2), list-exclusion behavior (Task 2 Step 5 + Task 3's `delete_thenBatchExcludedFromList`), 404-on-already-deleted (Task 2 Step 6 + Task 3's `delete_alreadyDeletedBatch_returnsNotFound`), no `exportBatchCsv`/frontend changes (confirmed out of scope, untouched by any task), `V11` left as-is (no task touches it).
- **Type consistency:** `ImportBatch.isDeleted()`/`setDeleted(boolean)` (Task 2) used consistently in Task 3's assertions. `ImportBatchRepository.findByIdAndDeletedFalse(Long)` (Task 2) used consistently in Task 2's own service code and Task 3's test assertions. No naming drift.
