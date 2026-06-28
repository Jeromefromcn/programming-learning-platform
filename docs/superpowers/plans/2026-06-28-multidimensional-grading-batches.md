# Multi-Dimensional Grading & Batch Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rubric-based manual grading, atomic batch imports with username validation, a Group Submission management page, and rebuild My Progress to show only the student's own submissions.

**Architecture:** Backend: new `import_batches` table + three new domain classes; atomic two-phase import replaces current per-file-write flow; grading endpoint extended to handle weighted dimensions. Frontend: new `RubricEditor` component, `GroupSubmissionPage`, and a fully rebuilt `ProgressPage`.

**Tech Stack:** Java 25, Spring Boot 3.5, Spring Data JPA, Flyway 9, React 18, Vite 5, Axios.

## Global Constraints

- No Redis, Kafka, or extra infra — single-server tool.
- All `@DataJpaTest` tests use `@ActiveProfiles("test")` and `@AutoConfigureTestDatabase(replace = NONE)`.
- Backend package root: `com.platform.exercise`.
- Frontend API base: `/v1/` (Nginx proxies `/api/v1/` → Spring Boot `/v1/`).
- Flyway migration files: `backend/src/main/resources/db/migration/V{n}__description.sql`.
- No hard-deletes on submissions; use `is_deleted` flag.
- TDD: write failing test first, then implement.

---

## File Map

### New backend files
| File | Purpose |
|------|---------|
| `db/migration/V10__add_import_batches_and_grading.sql` | New table + new columns on submissions |
| `domain/ImportBatch.java` | JPA entity for import_batches |
| `repository/ImportBatchRepository.java` | JPA repository for ImportBatch |
| `submission/ImportProblemDto.java` | Validation failure record (filename, reason) |
| `submission/DimensionScoreDto.java` | Per-dimension score record (name, weight, score) |
| `submission/ImportBatchDto.java` | API response for batch listing |
| `submission/ImportBatchService.java` | Batch listing, export CSV, graded-status logic |
| `submission/ImportBatchController.java` | GET /v1/import-batches, GET /v1/import-batches/{id}/export |
| `student/ProgressSubmissionDto.java` | Item in new My Progress list |

### Modified backend files
| File | Change |
|------|--------|
| `domain/Submission.java` | Add `batchId`, `tutorGradeDetails`, `graded` |
| `submission/GradeRequest.java` | Add `dimensionScores` field |
| `submission/ImportResponseDto.java` | Add `ok`, `importBatchId`, `problems` |
| `submission/SubmissionListItemDto.java` | Add `graded` |
| `submission/SubmissionDetailDto.java` | Add `graded`, `tutorGradeDetails` |
| `submission/FileImportService.java` | Add `UserRepository`, add `validateFile()` |
| `submission/SubmissionService.java` | Rewrite `importFiles()`, update `grade()` |
| `repository/SubmissionRepository.java` | Add `findByUserIdAndDeletedFalse`, `countGradedGroupByBatchId` |
| `student/StudentProgressService.java` | Rewrite `getProgress()` |
| `student/StudentProgressDto.java` | Change shape to `PageResponse<ProgressSubmissionDto>` |

### New frontend files
| File | Purpose |
|------|---------|
| `src/components/RubricEditor.jsx` | Add/remove dimension rows with live weight sum |
| `src/pages/tutor/GroupSubmissionPage.jsx` | Batch list + import button |
| `src/api/importBatchApi.js` | API calls for batch listing and export URL |

### Modified frontend files
| File | Change |
|------|--------|
| `src/pages/tutor/ExerciseFormPage.jsx` | Show RubricEditor when `showResult=false` |
| `src/pages/tutor/SubmissionDetailPage.jsx` | Dimension scoring UI + graded chip |
| `src/pages/tutor/SubmissionListPage.jsx` | Add graded column, remove Import button |
| `src/pages/tutor/SubmissionImportPage.jsx` | Update breadcrumb, handle `ok=false` response |
| `src/pages/student/ProgressPage.jsx` | Complete rebuild — submission list + read-only viewer |
| `src/components/SectionRouter.jsx` | Add `group-submissions` routes |
| `src/components/sectionConfig.js` | Add `group-submissions` section for TUTOR |

---

## Task 1: DB Migration + ImportBatch Entity + Repository

**Files:**
- Create: `backend/src/main/resources/db/migration/V10__add_import_batches_and_grading.sql`
- Create: `backend/src/main/java/com/platform/exercise/domain/ImportBatch.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/ImportBatchRepository.java`
- Modify: `backend/src/main/java/com/platform/exercise/domain/Submission.java`
- Modify: `backend/src/test/java/com/platform/exercise/MigrationTest.java`

**Interfaces:**
- Produces: `ImportBatch` entity with fields `id`, `uuid`, `importedBy`, `fileCount`, `importedCount`, `duplicateCount`, `failedCount`, `createdAt`
- Produces: `Submission` gains `batchId` (Long), `tutorGradeDetails` (String), `graded` (boolean default false)

- [ ] **Step 1: Write the failing migration test**

In `MigrationTest.java`, add this test method:

```java
@Test
void v10AddsImportBatchesTableAndSubmissionColumns() throws Exception {
    try (Connection conn = dataSource.getConnection()) {
        // import_batches table exists
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
                "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='import_batches'")) {
            ResultSet rs = stmt.executeQuery();
            rs.next();
            assertEquals(1, rs.getInt(1), "import_batches table should exist");
        }
        // submissions has new columns
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT LOWER(COLUMN_NAME) FROM INFORMATION_SCHEMA.COLUMNS " +
                "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='submissions'")) {
            ResultSet rs = stmt.executeQuery();
            Set<String> cols = new HashSet<>();
            while (rs.next()) cols.add(rs.getString(1));
            assertTrue(cols.contains("batch_id"), "submissions.batch_id should exist");
            assertTrue(cols.contains("tutor_grade_details"), "submissions.tutor_grade_details should exist");
            assertTrue(cols.contains("graded"), "submissions.graded should exist");
        }
    }
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && mvn test -pl . -Dtest=MigrationTest#v10AddsImportBatchesTableAndSubmissionColumns -q 2>&1 | tail -10
```
Expected: `FAILED` — table does not exist.

- [ ] **Step 3: Write the migration SQL**

Create `backend/src/main/resources/db/migration/V10__add_import_batches_and_grading.sql`:

```sql
CREATE TABLE import_batches (
    id              BIGINT       AUTO_INCREMENT PRIMARY KEY,
    uuid            VARCHAR(36)  NOT NULL,
    imported_by     BIGINT       NULL,
    file_count      INT          NOT NULL DEFAULT 0,
    imported_count  INT          NOT NULL DEFAULT 0,
    duplicate_count INT          NOT NULL DEFAULT 0,
    failed_count    INT          NOT NULL DEFAULT 0,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX uk_import_batches_uuid (uuid),
    CONSTRAINT fk_batch_user FOREIGN KEY (imported_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE submissions
    ADD COLUMN batch_id            BIGINT  NULL COMMENT 'FK import_batches(id); IMPORT source only',
    ADD COLUMN tutor_grade_details JSON    NULL COMMENT 'Per-dimension scores [{name,weight,score}]',
    ADD COLUMN graded              BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Tutor has saved a grade';

ALTER TABLE submissions
    ADD CONSTRAINT fk_sub_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id);

CREATE INDEX idx_sub_batch ON submissions (batch_id);
```

- [ ] **Step 4: Write the ImportBatch entity**

Create `backend/src/main/java/com/platform/exercise/domain/ImportBatch.java`:

```java
package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "import_batches")
@Data
@NoArgsConstructor
public class ImportBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "uuid", nullable = false, length = 36)
    private String uuid;

    @Column(name = "imported_by")
    private Long importedBy;

    @Column(name = "file_count", nullable = false)
    private int fileCount;

    @Column(name = "imported_count", nullable = false)
    private int importedCount;

    @Column(name = "duplicate_count", nullable = false)
    private int duplicateCount;

    @Column(name = "failed_count", nullable = false)
    private int failedCount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
```

- [ ] **Step 5: Write the ImportBatchRepository**

Create `backend/src/main/java/com/platform/exercise/repository/ImportBatchRepository.java`:

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
}
```

- [ ] **Step 6: Update Submission entity**

In `backend/src/main/java/com/platform/exercise/domain/Submission.java`, add after the `importBatchId` field (the old UUID string field):

```java
    @Column(name = "batch_id")
    private Long batchId;

    @Column(name = "tutor_grade_details", columnDefinition = "JSON")
    private String tutorGradeDetails;

    @Column(name = "graded", nullable = false)
    private boolean graded = false;
```

- [ ] **Step 7: Run migration test to confirm it passes**

```bash
cd backend && mvn test -pl . -Dtest=MigrationTest -q 2>&1 | tail -10
```
Expected: `BUILD SUCCESS`, all MigrationTest methods pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/resources/db/migration/V10__add_import_batches_and_grading.sql \
        backend/src/main/java/com/platform/exercise/domain/ImportBatch.java \
        backend/src/main/java/com/platform/exercise/repository/ImportBatchRepository.java \
        backend/src/main/java/com/platform/exercise/domain/Submission.java \
        backend/src/test/java/com/platform/exercise/MigrationTest.java
git commit -m "feat(db): add import_batches table and grading columns to submissions (V10)"
```

---

## Task 2: Submission DTOs + Repository Queries

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionListItemDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionDetailDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`
- Modify: `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java`

**Interfaces:**
- Produces: `SubmissionListItemDto` with added `boolean graded`
- Produces: `SubmissionDetailDto` with added `boolean graded`, `String tutorGradeDetails`
- Produces: `SubmissionRepository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(Long, Pageable)` → `Page<Submission>`
- Produces: `SubmissionRepository.countGradedGroupByBatchId(List<Long>)` → `List<Object[]>` where `[0]=batchId(Long)`, `[1]=total(Long)`, `[2]=graded(Long)`

- [ ] **Step 1: Write failing repository tests**

In `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java`, add:

```java
@Test
void findByUserIdAndDeletedFalse_paginates_userSubmissions() {
    // Save 3 subs for userId7, 1 for userId8
    for (int i = 0; i < 3; i++) repository.save(sub("STUDENT", userId7, exerciseId));
    repository.save(sub("STUDENT", userId8, exerciseId));

    Page<Submission> page = repository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(
            userId7, PageRequest.of(0, 2));
    assertEquals(3, page.getTotalElements());
    assertEquals(2, page.getContent().size());
}

@Test
void findByUserIdAndDeletedFalse_excludesDeletedRows() {
    Submission s = sub("STUDENT", userId7, exerciseId);
    s.setDeleted(true);
    repository.save(s);
    repository.save(sub("STUDENT", userId7, exerciseId));

    Page<Submission> page = repository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(
            userId7, PageRequest.of(0, 20));
    assertEquals(1, page.getTotalElements());
}

@Test
void countGradedGroupByBatchId_returnsBulkStats() {
    // The batch_id column is NULL by default; we need to set it via native SQL or reflection.
    // Use em.createNativeQuery to set batch_id directly.
    Submission s1 = repository.save(sub("IMPORT", null, exerciseId));
    Submission s2 = repository.save(sub("IMPORT", null, exerciseId));
    Submission s3 = repository.save(sub("IMPORT", null, exerciseId));
    Long batchA = 999L; // a fake batch id; just testing the aggregation query structure
    em.getEntityManager().createNativeQuery(
        "UPDATE submissions SET batch_id = :b WHERE id IN (:ids)")
        .setParameter("b", batchA)
        .setParameter("ids", List.of(s1.getId(), s2.getId(), s3.getId()))
        .executeUpdate();
    em.getEntityManager().createNativeQuery(
        "UPDATE submissions SET graded = true WHERE id = :id")
        .setParameter("id", s1.getId())
        .executeUpdate();
    em.flush(); em.clear();

    List<Object[]> rows = repository.countGradedGroupByBatchId(List.of(batchA));
    assertEquals(1, rows.size());
    Object[] row = rows.get(0);
    assertEquals(batchA, ((Number) row[0]).longValue());
    assertEquals(3L, ((Number) row[1]).longValue()); // total
    assertEquals(1L, ((Number) row[2]).longValue()); // graded
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && mvn test -pl . -Dtest=SubmissionRepositoryTest -q 2>&1 | tail -15
```
Expected: 3 new tests FAILED.

- [ ] **Step 3: Add repository methods**

In `SubmissionRepository.java`, add these methods:

```java
    Page<Submission> findByUserIdAndDeletedFalseOrderByCreatedAtDesc(Long userId, Pageable pageable);

    @Query(value = """
            SELECT s.batch_id, COUNT(*) AS total,
                   SUM(CASE WHEN s.graded = 1 THEN 1 ELSE 0 END) AS graded
            FROM submissions s
            WHERE s.batch_id IN (:batchIds) AND s.is_deleted = false
            GROUP BY s.batch_id
            """, nativeQuery = true)
    List<Object[]> countGradedGroupByBatchId(@Param("batchIds") List<Long> batchIds);
```

- [ ] **Step 4: Update SubmissionListItemDto**

Replace the full record in `SubmissionListItemDto.java`:

```java
package com.platform.exercise.submission;

import com.platform.exercise.domain.Submission;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SubmissionListItemDto(
    Long id,
    String studentName,
    String exerciseTitle,
    String exerciseType,
    BigDecimal autoScore,
    BigDecimal tutorScore,
    boolean versionMismatch,
    boolean graded,
    LocalDateTime createdAt
) {
    public static SubmissionListItemDto of(Submission sub, String exerciseTitle) {
        return new SubmissionListItemDto(
            sub.getId(), sub.getStudentName(), exerciseTitle,
            sub.getExerciseType(), sub.getAutoScore(), sub.getTutorScore(),
            sub.isVersionMismatch(), sub.isGraded(), sub.getCreatedAt());
    }
}
```

- [ ] **Step 5: Update SubmissionDetailDto**

Replace the full record in `SubmissionDetailDto.java`:

```java
package com.platform.exercise.submission;

import com.platform.exercise.domain.Submission;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SubmissionDetailDto(
    Long id,
    String studentName,
    String exerciseTitle,
    String exerciseType,
    String answerData,
    String workspaceXml,
    LocalDateTime exportTimestamp,
    boolean versionMismatch,
    Integer studentVersionNumber,
    Integer gradedVersionNumber,
    BigDecimal autoScore,
    String autoGradeDetails,
    BigDecimal tutorScore,
    String tutorComment,
    String tutorGradeDetails,
    boolean graded,
    LocalDateTime createdAt
) {
    public static SubmissionDetailDto of(Submission sub, String exerciseTitle, int gradedVersionNumber) {
        return new SubmissionDetailDto(
            sub.getId(), sub.getStudentName(), exerciseTitle,
            sub.getExerciseType(), sub.getAnswerData(), sub.getWorkspaceXml(),
            sub.getExportTimestamp(),
            sub.isVersionMismatch(), sub.getStudentVersionNumber(), gradedVersionNumber,
            sub.getAutoScore(), sub.getAutoGradeDetails(),
            sub.getTutorScore(), sub.getTutorComment(), sub.getTutorGradeDetails(),
            sub.isGraded(), sub.getCreatedAt());
    }
}
```

- [ ] **Step 6: Run tests**

```bash
cd backend && mvn test -pl . -Dtest=SubmissionRepositoryTest -q 2>&1 | tail -10
```
Expected: `BUILD SUCCESS`.

- [ ] **Step 7: Run full backend test suite to catch DTO breakage**

```bash
cd backend && mvn test -q 2>&1 | tail -20
```
Expected: `BUILD SUCCESS`. If any test fails due to the DTO changes (e.g. a test that constructs `SubmissionDetailDto` or `SubmissionListItemDto` directly), update that test's constructor call to include the new `graded` / `tutorGradeDetails` fields (both default to `false` / `null`).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/SubmissionListItemDto.java \
        backend/src/main/java/com/platform/exercise/submission/SubmissionDetailDto.java \
        backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java \
        backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java
git commit -m "feat(submission): add graded/tutorGradeDetails to DTOs and bulk-count query"
```

---

## Task 3: Atomic Two-Phase Import

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/submission/ImportProblemDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/ImportResponseDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/FileImportService.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java`

**Interfaces:**
- Consumes: `ImportBatchRepository` (from Task 1), `UserRepository` (existing)
- Produces: `POST /v1/submissions/import` now returns `ImportResponseDto` with `ok=false` + `problems` list when any file fails username/schema validation; otherwise `ok=true` + `importBatchId` (Long) + existing `batchId` (UUID for force-import).

- [ ] **Step 1: Create ImportProblemDto**

Create `backend/src/main/java/com/platform/exercise/submission/ImportProblemDto.java`:

```java
package com.platform.exercise.submission;

public record ImportProblemDto(String filename, String reason) {}
```

- [ ] **Step 2: Update ImportResponseDto**

Replace `ImportResponseDto.java` completely:

```java
package com.platform.exercise.submission;

import java.util.List;

public record ImportResponseDto(
    boolean ok,
    Long importBatchId,
    String batchId,
    List<ImportResultDto> results,
    Summary summary,
    List<ImportProblemDto> problems
) {
    public record Summary(int total, int imported, int duplicates, int failed) {}

    static ImportResponseDto success(Long importBatchId, String batchId,
                                     List<ImportResultDto> results, Summary summary) {
        return new ImportResponseDto(true, importBatchId, batchId, results, summary, null);
    }

    static ImportResponseDto validationFailed(List<ImportProblemDto> problems) {
        return new ImportResponseDto(false, null, null, null, null, problems);
    }
}
```

- [ ] **Step 3: Add validateFile to FileImportService**

In `FileImportService.java`:

1. Add `UserRepository` to the constructor injections:
```java
    private final UserRepository userRepository;
```

2. Add the import at the top of the file:
```java
import com.platform.exercise.repository.UserRepository;
```

3. Add this new package-private method after the existing `processSingleFile` method:

```java
    /**
     * Phase-1 validation only — no writes. Returns a problem description if the file is invalid,
     * or null if the file is valid and its studentName resolves to a known username.
     */
    ImportProblemDto validateFile(String filename, byte[] content) {
        try {
            JsonNode node = objectMapper.readTree(content);
            List<String> missing = REQUIRED_FIELDS.stream()
                .filter(f -> node.path(f).isMissingNode())
                .toList();
            if (!missing.isEmpty()) {
                return new ImportProblemDto(filename,
                    "Missing required fields: " + String.join(", ", missing));
            }
            String studentName = node.path("studentName").asText();
            if (studentName.isBlank()) {
                return new ImportProblemDto(filename, "Field 'studentName' is blank.");
            }
            if (!userRepository.existsByUsername(studentName)) {
                return new ImportProblemDto(filename,
                    "Username '" + studentName + "' not found in the system.");
            }
            return null; // valid
        } catch (Exception e) {
            return new ImportProblemDto(filename, "Parse error: " + e.getMessage());
        }
    }
```

- [ ] **Step 4: Update SubmissionService to two-phase import**

In `SubmissionService.java`:

1. Add imports:
```java
import com.platform.exercise.domain.ImportBatch;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.ImportBatchRepository;
import com.platform.exercise.repository.UserRepository;
```

2. Add fields to the `@RequiredArgsConstructor` class:
```java
    private final ImportBatchRepository importBatchRepository;
    private final UserRepository userRepository;
```

3. Replace the `importFiles` method entirely:

```java
    @Transactional
    public ImportResponseDto importFiles(List<MultipartFile> files, Long importedByUserId) throws IOException {
        // --- Phase 1: collect all file bytes and validate (no writes) ---
        record FileEntry(String name, byte[] bytes) {}
        List<FileEntry> entries = new ArrayList<>();
        List<ImportProblemDto> problems = new ArrayList<>();

        for (MultipartFile file : files) {
            String originalName = file.getOriginalFilename() != null
                ? file.getOriginalFilename() : "unknown";
            byte[] fileBytes = file.getBytes();

            if (originalName.toLowerCase().endsWith(".zip")) {
                // Expand ZIP and validate each entry
                try (java.util.zip.ZipInputStream zis =
                         new java.util.zip.ZipInputStream(
                             new java.io.ByteArrayInputStream(fileBytes))) {
                    java.util.zip.ZipEntry entry;
                    long totalBytes = 0;
                    int fileCount = 0;
                    while ((entry = zis.getNextEntry()) != null) {
                        if (entry.isDirectory()) { zis.closeEntry(); continue; }
                        String entryName = entry.getName();
                        if (entryName.contains("..")) {
                            throw new com.platform.exercise.common.PlatformException(
                                com.platform.exercise.common.ErrorCode.ZIP_PATH_TRAVERSAL,
                                "Path traversal detected: " + entryName);
                        }
                        if (++fileCount > 500) {
                            throw new com.platform.exercise.common.PlatformException(
                                com.platform.exercise.common.ErrorCode.ZIP_TOO_LARGE,
                                "ZIP contains more than 500 files.");
                        }
                        byte[] content = zis.readAllBytes();
                        totalBytes += content.length;
                        if (totalBytes > 100L * 1024 * 1024) {
                            throw new com.platform.exercise.common.PlatformException(
                                com.platform.exercise.common.ErrorCode.ZIP_TOO_LARGE,
                                "Decompressed ZIP exceeds 100 MB.");
                        }
                        String filename = new java.io.File(entryName).getName();
                        if (filename.toLowerCase().endsWith(".json")) {
                            entries.add(new FileEntry(filename, content));
                        }
                        zis.closeEntry();
                    }
                }
            } else if (originalName.toLowerCase().endsWith(".json")) {
                entries.add(new FileEntry(originalName, fileBytes));
            } else {
                problems.add(new ImportProblemDto(originalName, "Unsupported file type."));
            }
        }

        // Validate each JSON entry (schema + username)
        for (FileEntry e : entries) {
            ImportProblemDto problem = fileImportService.validateFile(e.name(), e.bytes());
            if (problem != null) problems.add(problem);
        }

        if (!problems.isEmpty()) {
            return ImportResponseDto.validationFailed(problems);
        }

        // --- Phase 2: commit — create batch row, then save each submission ---
        String batchUuid = UUID.randomUUID().toString();
        ImportBatch batch = new ImportBatch();
        batch.setUuid(batchUuid);
        batch.setImportedBy(importedByUserId);
        batch.setFileCount(entries.size());
        batch = importBatchRepository.save(batch);

        List<ImportResultDto> results = new ArrayList<>();
        for (FileEntry e : entries) {
            results.add(fileImportService.processSingleFile(e.name(), e.bytes(), batchUuid, false));
        }

        // Update batch counts
        long imported = results.stream().filter(r -> "IMPORTED".equals(r.status())).count();
        long duplicates = results.stream().filter(r -> "DUPLICATE".equals(r.status())).count();
        long failed = results.stream().filter(r -> "FAILED".equals(r.status())).count();
        batch.setImportedCount((int) imported);
        batch.setDuplicateCount((int) duplicates);
        batch.setFailedCount((int) failed);
        importBatchRepository.save(batch);

        return ImportResponseDto.success(batch.getId(), batchUuid, results,
            new ImportResponseDto.Summary(results.size(), (int) imported, (int) duplicates, (int) failed));
    }
```

4. Update `forceImport` to also link submissions to the correct batch (look up batch by UUID):

```java
    @Transactional
    public ImportResultDto forceImport(ForceImportRequest req) throws IOException {
        byte[] bytes = batchCache.get(req.batchId(), req.filename())
            .orElseThrow(() -> new PlatformException(ErrorCode.IMPORT_FILE_INVALID,
                "Batch expired — please re-import the file."));
        return fileImportService.processSingleFile(req.filename(), bytes, req.batchId(), true);
    }
```

(Force-import is unchanged behaviorally; the UUID-based cache key is already there.)

- [ ] **Step 5: Update FileImportService.processSingleFile to set batchId and userId on saved Submission**

In `FileImportService.processSingleFile`, after setting other fields on the `Submission`, add:

```java
            // Resolve user_id from studentName
            userRepository.findByUsername(studentName)
                .ifPresent(u -> submission.setUserId(u.getId()));
            // Link to ImportBatch row via UUID
            importBatchRepository.findByUuid(batchId)
                .ifPresent(b -> submission.setBatchId(b.getId()));
```

Add `ImportBatchRepository importBatchRepository` to `FileImportService` fields and constructor, plus the import:

```java
    private final ImportBatchRepository importBatchRepository;
```
```java
import com.platform.exercise.repository.ImportBatchRepository;
```

- [ ] **Step 6: Update SubmissionController to pass authenticated user ID**

In `SubmissionController.importFiles`, inject `Authentication` and resolve user:

```java
    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportResponseDto> importFiles(
            @RequestParam("files") List<MultipartFile> files,
            Authentication authentication) throws IOException {
        Long userId = null;
        if (authentication != null && authentication.getPrincipal() instanceof User u) {
            userId = u.getId();
        }
        return ResponseEntity.ok(submissionService.importFiles(files, userId));
    }
```

Add import at top:
```java
import com.platform.exercise.domain.User;
import org.springframework.security.core.Authentication;
```

- [ ] **Step 7: Run full backend test suite**

```bash
cd backend && mvn test -q 2>&1 | tail -20
```
Expected: `BUILD SUCCESS`. Fix any compile errors (the `importFiles` signature changed — update any test that calls it directly, passing `null` as `importedByUserId`).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/ImportProblemDto.java \
        backend/src/main/java/com/platform/exercise/submission/ImportResponseDto.java \
        backend/src/main/java/com/platform/exercise/submission/FileImportService.java \
        backend/src/main/java/com/platform/exercise/submission/SubmissionService.java \
        backend/src/main/java/com/platform/exercise/submission/SubmissionController.java
git commit -m "feat(import): atomic two-phase import with username validation and ImportBatch creation"
```

---

## Task 4: Rubric Grading Endpoint

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/submission/DimensionScoreDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/GradeRequest.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java`

**Interfaces:**
- Produces: `PUT /v1/submissions/{id}/grade` accepts `{ dimensionScores: [{name, weight, score}], tutorComment }` for rubric exercises OR `{ tutorScore: 0-100, tutorComment }` for instant-feedback exercises
- Produces: `Submission.graded` set to `true` on save in both modes; `tutorGradeDetails` JSON stored for rubric mode

- [ ] **Step 1: Create DimensionScoreDto**

Create `backend/src/main/java/com/platform/exercise/submission/DimensionScoreDto.java`:

```java
package com.platform.exercise.submission;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

public record DimensionScoreDto(
    @NotBlank String name,
    @DecimalMin("0") @DecimalMax("1") double weight,
    @DecimalMin("0") @DecimalMax("100") double score
) {}
```

- [ ] **Step 2: Update GradeRequest**

Replace `GradeRequest.java`:

```java
package com.platform.exercise.submission;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

public record GradeRequest(
    @DecimalMin("0") @DecimalMax("100") BigDecimal tutorScore,
    @Valid List<DimensionScoreDto> dimensionScores,
    @Size(max = 500) String tutorComment
) {}
```

- [ ] **Step 3: Write failing test for rubric grade**

Create `backend/src/test/java/com/platform/exercise/submission/SubmissionGradeTest.java`:

```java
package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Submission;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class SubmissionGradeTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void rubricGrade_computesWeightedTotal() {
        // 70 * 0.6 + 90 * 0.4 = 42 + 36 = 78.00
        List<DimensionScoreDto> dims = List.of(
            new DimensionScoreDto("Correctness", 0.6, 70.0),
            new DimensionScoreDto("Style", 0.4, 90.0)
        );
        BigDecimal total = computeWeighted(dims);
        assertEquals(new BigDecimal("78.00"), total);
    }

    @Test
    void rubricGrade_roundsToTwoDecimals() {
        // 33.33... * 0.333 + 33.33... * 0.333 + 33.33... * 0.334
        List<DimensionScoreDto> dims = List.of(
            new DimensionScoreDto("A", 0.333, 100.0),
            new DimensionScoreDto("B", 0.333, 100.0),
            new DimensionScoreDto("C", 0.334, 100.0)
        );
        BigDecimal total = computeWeighted(dims);
        assertEquals(new BigDecimal("100.00"), total);
    }

    private BigDecimal computeWeighted(List<DimensionScoreDto> dims) {
        double sum = dims.stream()
            .mapToDouble(d -> d.score() * d.weight())
            .sum();
        return BigDecimal.valueOf(sum).setScale(2, RoundingMode.HALF_UP);
    }
}
```

- [ ] **Step 4: Run test to confirm it passes (pure math, no DB)**

```bash
cd backend && mvn test -pl . -Dtest=SubmissionGradeTest -q 2>&1 | tail -10
```
Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Update SubmissionService.grade()**

Replace the `grade` method in `SubmissionService.java`:

```java
    @Transactional
    public SubmissionDetailDto grade(Long id, GradeRequest req) {
        Submission sub = submissionRepository.findById(id)
            .filter(s -> !s.isDeleted())
            .orElseThrow(() -> new PlatformException(ErrorCode.SUBMISSION_NOT_FOUND,
                "Submission not found."));

        if (req.dimensionScores() != null && !req.dimensionScores().isEmpty()) {
            // Rubric mode: compute weighted total, store dimension breakdown
            double weightedSum = req.dimensionScores().stream()
                .mapToDouble(d -> d.score() * d.weight())
                .sum();
            BigDecimal total = BigDecimal.valueOf(weightedSum).setScale(2, java.math.RoundingMode.HALF_UP);
            sub.setTutorScore(total);
            try {
                sub.setTutorGradeDetails(
                    new com.fasterxml.jackson.databind.ObjectMapper()
                        .writeValueAsString(req.dimensionScores()));
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new RuntimeException("Failed to serialize dimension scores", e);
            }
        } else if (req.tutorScore() != null) {
            // Instant-feedback mode: direct score override
            sub.setTutorScore(req.tutorScore());
            sub.setTutorGradeDetails(null);
        }

        sub.setTutorComment(req.tutorComment());
        sub.setGraded(true);
        submissionRepository.save(sub);
        return getById(id);
    }
```

Add `import java.math.BigDecimal;` if not already present.

- [ ] **Step 6: Run full backend tests**

```bash
cd backend && mvn test -q 2>&1 | tail -20
```
Expected: `BUILD SUCCESS`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/DimensionScoreDto.java \
        backend/src/main/java/com/platform/exercise/submission/GradeRequest.java \
        backend/src/main/java/com/platform/exercise/submission/SubmissionService.java \
        backend/src/test/java/com/platform/exercise/submission/SubmissionGradeTest.java
git commit -m "feat(grading): rubric dimension scoring with weighted total"
```

---

## Task 5: Import Batch Listing + Export API

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/submission/ImportBatchDto.java`
- Create: `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java`
- Create: `backend/src/main/java/com/platform/exercise/submission/ImportBatchController.java`
- Create: `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java`

**Interfaces:**
- Consumes: `ImportBatchRepository` (Task 1), `SubmissionRepository.countGradedGroupByBatchId` (Task 2), `UserRepository`, `ExerciseRepository`
- Produces: `GET /v1/import-batches?batchId=&gradedStatus=&page=&size=` → `PageResponse<ImportBatchDto>`
- Produces: `GET /v1/import-batches/{id}/export` → CSV stream (permit-all, direct download)

- [ ] **Step 1: Create ImportBatchDto**

Create `backend/src/main/java/com/platform/exercise/submission/ImportBatchDto.java`:

```java
package com.platform.exercise.submission;

import java.time.LocalDateTime;

public record ImportBatchDto(
    Long id,
    LocalDateTime createdAt,
    int fileCount,
    int importedCount,
    int duplicateCount,
    int failedCount,
    String gradedStatus   // ALL | PARTIAL | NONE
) {}
```

- [ ] **Step 2: Write failing service test**

Create `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java`:

```java
package com.platform.exercise.submission;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ImportBatchServiceTest {

    @Test
    void gradedStatus_ALL_whenAllSubmissionsGraded() {
        assertEquals("ALL", ImportBatchService.computeGradedStatus(3L, 3L));
    }

    @Test
    void gradedStatus_ALL_whenNoBatchSubmissions() {
        assertEquals("ALL", ImportBatchService.computeGradedStatus(0L, 0L));
    }

    @Test
    void gradedStatus_PARTIAL_whenSomeGraded() {
        assertEquals("PARTIAL", ImportBatchService.computeGradedStatus(3L, 1L));
    }

    @Test
    void gradedStatus_NONE_whenNoneGraded() {
        assertEquals("NONE", ImportBatchService.computeGradedStatus(3L, 0L));
    }
}
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
cd backend && mvn test -pl . -Dtest=ImportBatchServiceTest -q 2>&1 | tail -10
```
Expected: compile error / FAILED.

- [ ] **Step 4: Create ImportBatchService**

Create `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java`:

```java
package com.platform.exercise.submission;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.ImportBatch;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.exercise.ExerciseRepository;
import com.platform.exercise.repository.ImportBatchRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ImportBatchService {

    private final ImportBatchRepository importBatchRepository;
    private final SubmissionRepository submissionRepository;
    private final UserRepository userRepository;
    private final ExerciseRepository exerciseRepository;

    public PageResponse<ImportBatchDto> list(Long batchId, String gradedStatus, int page, int size) {
        // Load all batches (university scale — manageable without SQL-level gradedStatus filter)
        List<ImportBatch> all = importBatchRepository.findAllByOrderByCreatedAtDesc();
        if (batchId != null) {
            all = all.stream().filter(b -> b.getId().equals(batchId)).toList();
        }

        // Bulk-load graded counts
        List<Long> ids = all.stream().map(ImportBatch::getId).toList();
        Map<Long, long[]> countMap = buildCountMap(ids);

        // Build DTOs with gradedStatus
        List<ImportBatchDto> dtos = all.stream().map(b -> {
            long[] counts = countMap.getOrDefault(b.getId(), new long[]{0L, 0L});
            return new ImportBatchDto(b.getId(), b.getCreatedAt(),
                b.getFileCount(), b.getImportedCount(), b.getDuplicateCount(), b.getFailedCount(),
                computeGradedStatus(counts[0], counts[1]));
        }).toList();

        // Apply gradedStatus filter in-memory
        if (gradedStatus != null && !gradedStatus.isBlank()) {
            dtos = dtos.stream().filter(d -> d.gradedStatus().equals(gradedStatus)).toList();
        }

        // Manual pagination
        int total = dtos.size();
        int from = Math.min(page * size, total);
        int to   = Math.min(from + size, total);
        int totalPages = size > 0 ? (int) Math.ceil((double) total / size) : 1;
        return new PageResponse<>(dtos.subList(from, to), page, size, total, totalPages);
    }

    public void exportBatchCsv(Long batchId, HttpServletResponse response) throws IOException {
        List<Submission> subs = submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc(batchId);

        // Build lookup maps
        List<Long> exerciseIds = subs.stream().map(Submission::getExerciseId).distinct().toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(e -> e.getId(), e -> e.getTitle()));
        Map<Long, String> displayNameMap = subs.stream()
            .filter(s -> s.getUserId() != null)
            .map(Submission::getUserId)
            .distinct()
            .flatMap(uid -> userRepository.findById(uid).stream())
            .collect(Collectors.toMap(User::getId, u ->
                u.getDisplayName() != null ? u.getDisplayName() : u.getUsername()));

        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition",
            "attachment; filename=\"batch_" + batchId + "_" + LocalDate.now() + ".csv\"");

        try (CSVPrinter printer = new CSVPrinter(
                new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8),
                CSVFormat.DEFAULT.builder()
                    .setHeader("Student Name", "Display Name", "Exercise Title",
                               "Dimension", "Weight", "Dimension Score", "Total Score")
                    .build())) {
            for (Submission sub : subs) {
                String displayName = sub.getUserId() != null
                    ? displayNameMap.getOrDefault(sub.getUserId(), "") : "";
                String title = titleMap.getOrDefault(sub.getExerciseId(), "");
                String totalScore = sub.getTutorScore() != null
                    ? sub.getTutorScore().toPlainString()
                    : (sub.getAutoScore() != null ? sub.getAutoScore().toPlainString() : "");

                if (sub.getTutorGradeDetails() != null) {
                    // Rubric: one row per dimension
                    try {
                        com.fasterxml.jackson.databind.ObjectMapper om =
                            new com.fasterxml.jackson.databind.ObjectMapper();
                        com.fasterxml.jackson.databind.JavaType listType = om.getTypeFactory()
                            .constructCollectionType(List.class, DimensionScoreDto.class);
                        List<DimensionScoreDto> dims = om.readValue(sub.getTutorGradeDetails(), listType);
                        for (DimensionScoreDto d : dims) {
                            printer.printRecord(sub.getStudentName(), displayName, title,
                                d.name(), d.weight(), d.score(), totalScore);
                        }
                    } catch (Exception e) {
                        printer.printRecord(sub.getStudentName(), displayName, title,
                            "", "", "", totalScore);
                    }
                } else {
                    // Auto/instant-feedback: single row, empty dimension columns
                    printer.printRecord(sub.getStudentName(), displayName, title,
                        "", "", "", totalScore);
                }
            }
        }
    }

    // package-private for unit test
    static String computeGradedStatus(long total, long graded) {
        if (total == 0 || total == graded) return "ALL";
        if (graded == 0) return "NONE";
        return "PARTIAL";
    }

    private Map<Long, long[]> buildCountMap(List<Long> batchIds) {
        if (batchIds.isEmpty()) return Map.of();
        return submissionRepository.countGradedGroupByBatchId(batchIds).stream()
            .collect(Collectors.toMap(
                row -> ((Number) row[0]).longValue(),
                row -> new long[]{((Number) row[1]).longValue(), ((Number) row[2]).longValue()}
            ));
    }
}
```

- [ ] **Step 5: Add `findByBatchIdAndDeletedFalseOrderByStudentNameAsc` to SubmissionRepository**

In `SubmissionRepository.java`:

```java
    List<Submission> findByBatchIdAndDeletedFalseOrderByStudentNameAsc(Long batchId);
```

- [ ] **Step 6: Add ExerciseRepository import to FileImportService / check package**

The `ExerciseRepository` is in package `com.platform.exercise.exercise`. Check the existing import in `SubmissionService.java` to confirm the correct package path, then use the same import in `ImportBatchService.java`:

```java
import com.platform.exercise.exercise.ExerciseRepository;
```

(Also add this import to `ImportBatchService.java` if not already done in Step 4.)

- [ ] **Step 7: Create ImportBatchController**

Create `backend/src/main/java/com/platform/exercise/submission/ImportBatchController.java`:

```java
package com.platform.exercise.submission;

import com.platform.exercise.common.PageResponse;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/v1/import-batches")
@RequiredArgsConstructor
@PreAuthorize("hasRole('TUTOR')")
public class ImportBatchController {

    private final ImportBatchService importBatchService;

    @GetMapping
    public ResponseEntity<PageResponse<ImportBatchDto>> list(
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) String gradedStatus,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(importBatchService.list(batchId, gradedStatus, page, size));
    }

    @GetMapping("/{id}/export")
    @PreAuthorize("permitAll()")
    public void exportCsv(@PathVariable Long id, HttpServletResponse response) throws IOException {
        importBatchService.exportBatchCsv(id, response);
    }
}
```

- [ ] **Step 8: Run service test and full backend test suite**

```bash
cd backend && mvn test -pl . -Dtest=ImportBatchServiceTest -q 2>&1 | tail -10
cd backend && mvn test -q 2>&1 | tail -20
```
Expected: both `BUILD SUCCESS`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/ImportBatchDto.java \
        backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java \
        backend/src/main/java/com/platform/exercise/submission/ImportBatchController.java \
        backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java \
        backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java
git commit -m "feat(batches): import batch listing API and CSV export by batch"
```

---

## Task 6: My Progress API Rebuild

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentProgressDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentProgressService.java`
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentProgressController.java`

**Interfaces:**
- Consumes: `SubmissionRepository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(Long, Pageable)` (Task 2)
- Produces: `GET /v1/student/progress?page=&size=` → `{ submissions: PageResponse<ProgressSubmissionDto> }` where each item has `submissionId`, `exerciseId`, `exerciseTitle`, `exerciseType`, `source`, `graded`, `score`, `answerData`, `workspaceXml`, `createdAt`

- [ ] **Step 1: Create ProgressSubmissionDto**

Create `backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.Exercise;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ProgressSubmissionDto(
    Long submissionId,
    Long exerciseId,
    String exerciseTitle,
    String exerciseType,
    String source,        // STUDENT | IMPORT
    boolean graded,
    BigDecimal score,     // tutorScore if present, else autoScore, else null
    String answerData,
    String workspaceXml,
    LocalDateTime createdAt
) {
    public static ProgressSubmissionDto of(Submission sub, String exerciseTitle) {
        BigDecimal score = sub.getTutorScore() != null ? sub.getTutorScore() : sub.getAutoScore();
        return new ProgressSubmissionDto(
            sub.getId(), sub.getExerciseId(), exerciseTitle,
            sub.getExerciseType(), sub.getSource(),
            sub.isGraded(), score,
            sub.getAnswerData(), sub.getWorkspaceXml(),
            sub.getCreatedAt());
    }
}
```

- [ ] **Step 2: Update StudentProgressDto**

Replace `StudentProgressDto.java` entirely:

```java
package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;

public record StudentProgressDto(PageResponse<ProgressSubmissionDto> submissions) {}
```

- [ ] **Step 3: Write failing test for new service logic**

Create `backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.exercise.ExerciseRepository;
import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StudentProgressServiceTest {

    @Mock SubmissionRepository submissionRepository;
    @Mock ExerciseRepository exerciseRepository;
    @InjectMocks StudentProgressService service;

    @Test
    void getProgress_returnsSubmissionsForUser() {
        Submission sub = new Submission();
        sub.setId(1L);
        sub.setExerciseId(10L);
        sub.setExerciseType("PYTHON");
        sub.setSource("STUDENT");
        sub.setGraded(true);
        sub.setTutorScore(new BigDecimal("85.00"));
        sub.setCreatedAt(LocalDateTime.now());

        Exercise exercise = new Exercise();
        exercise.setId(10L);
        exercise.setTitle("Loops");

        when(submissionRepository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(
                eq(42L), any())).thenReturn(new PageImpl<>(List.of(sub)));
        when(exerciseRepository.findAllById(List.of(10L))).thenReturn(List.of(exercise));

        StudentProgressDto result = service.getProgress(42L, 0, 20);

        assertEquals(1, result.submissions().totalElements());
        ProgressSubmissionDto item = result.submissions().content().get(0);
        assertEquals(1L, item.submissionId());
        assertEquals("Loops", item.exerciseTitle());
        assertTrue(item.graded());
        assertEquals(new BigDecimal("85.00"), item.score());
    }

    @Test
    void getProgress_emptyWhenNoSubmissions() {
        when(submissionRepository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(
                eq(99L), any())).thenReturn(new PageImpl<>(List.of()));
        when(exerciseRepository.findAllById(List.of())).thenReturn(List.of());

        StudentProgressDto result = service.getProgress(99L, 0, 20);

        assertEquals(0, result.submissions().totalElements());
    }
}
```

- [ ] **Step 4: Run test to confirm it fails**

```bash
cd backend && mvn test -pl . -Dtest=StudentProgressServiceTest -q 2>&1 | tail -10
```
Expected: compile error / FAILED.

- [ ] **Step 5: Rewrite StudentProgressService**

Replace `StudentProgressService.java` entirely:

```java
package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.exercise.ExerciseRepository;
import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StudentProgressService {

    private final SubmissionRepository submissionRepository;
    private final ExerciseRepository exerciseRepository;

    public StudentProgressDto getProgress(Long userId, int page, int size) {
        Page<Submission> subPage = submissionRepository
            .findByUserIdAndDeletedFalseOrderByCreatedAtDesc(userId, PageRequest.of(page, size));

        List<Long> exerciseIds = subPage.map(Submission::getExerciseId).toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        Page<ProgressSubmissionDto> dtoPage = subPage.map(sub ->
            ProgressSubmissionDto.of(sub, titleMap.getOrDefault(sub.getExerciseId(), "Unknown")));

        return new StudentProgressDto(PageResponse.of(dtoPage));
    }
}
```

- [ ] **Step 6: Update StudentProgressController**

Replace `StudentProgressController.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/student/progress")
@RequiredArgsConstructor
@PreAuthorize("hasRole('STUDENT')")
public class StudentProgressController {

    private final StudentProgressService studentProgressService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<StudentProgressDto> getProgress(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        User user = (authentication.getPrincipal() instanceof User u) ? u
                : userRepository.findByUsername(authentication.getName())
                        .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND));
        return ResponseEntity.ok(studentProgressService.getProgress(user.getId(), page, size));
    }
}
```

- [ ] **Step 7: Run service test and full backend test suite**

```bash
cd backend && mvn test -pl . -Dtest=StudentProgressServiceTest -q 2>&1 | tail -10
cd backend && mvn test -q 2>&1 | tail -20
```
Expected: both `BUILD SUCCESS`. If any existing test references `StudentProgressDto.summary` or `StudentProgressDto.exercises`, update it to use `StudentProgressDto.submissions`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java \
        backend/src/main/java/com/platform/exercise/student/StudentProgressDto.java \
        backend/src/main/java/com/platform/exercise/student/StudentProgressService.java \
        backend/src/main/java/com/platform/exercise/student/StudentProgressController.java \
        backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java
git commit -m "feat(progress): rebuild My Progress API — submission list by user_id"
```

---

## Task 7: Frontend RubricEditor + ExerciseFormPage

**Files:**
- Create: `frontend/src/components/RubricEditor.jsx`
- Modify: `frontend/src/pages/tutor/ExerciseFormPage.jsx`

**Interfaces:**
- Produces: `<RubricEditor dimensions={[{name,weight}]} onChange={dims => ...} />` — controlled component, calls `onChange` with updated list
- Consumes: `blocklyConfig.showResult` / `pythonConfig.showResult` (existing state in ExerciseFormPage)
- The `rubric.dimensions` array is stored inside `blocklyConfig.rubric` or `pythonConfig.rubric`

- [ ] **Step 1: Create RubricEditor component**

Create `frontend/src/components/RubricEditor.jsx`:

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
    onChange([...dimensions, { name: '', weight: '' }]);
  }

  function removeDim(index) {
    onChange(dimensions.filter((_, i) => i !== index));
  }

  return (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ marginBottom: 8 }}>Scoring Dimensions</h4>
      {dimensions.map((d, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
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

- [ ] **Step 2: Update ExerciseFormPage — add rubric state and branch**

In `ExerciseFormPage.jsx`:

1. Add import at top:
```js
import RubricEditor from '../../components/RubricEditor';
```

2. Update `EMPTY_BLOCKLY_CONFIG` to include a `rubric` field:
```js
const EMPTY_BLOCKLY_CONFIG = {
  allowedBlocks: [],
  initialWorkspaceXml: '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
  showCodeView: false,
  showResult: true,
  canViewAnswer: false,
  rubric: { dimensions: [] },
  gradingRules: {
    outputMatch: { enabled: false, expectedOutput: '' },
    requiredBlocks: { enabled: false, blocks: [] },
    forbiddenBlocks: { enabled: false, blocks: [] },
    blockCountLimit: { enabled: false, max: null },
  },
};
```

3. Update `EMPTY_PYTHON_CONFIG`:
```js
const EMPTY_PYTHON_CONFIG = {
  starterCode: '',
  timeLimitSeconds: 5,
  testCases: [],
  showResult: true,
  rubric: { dimensions: [] },
};
```

4. Replace the `showResult` checkbox and the grading config section (the `<label>` for "Show instant result feedback" and everything below it in the form, up to the error/save buttons) with:

```jsx
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
            <input
              type="checkbox"
              checked={(exerciseType === 'BLOCKLY' ? blocklyConfig.showResult : pythonConfig.showResult) !== false}
              onChange={e => {
                const show = e.target.checked;
                if (exerciseType === 'BLOCKLY')
                  setBlocklyConfig(prev => ({ ...prev, showResult: show }));
                else
                  setPythonConfig(prev => ({ ...prev, showResult: show }));
              }}
            />
            Show instant result feedback
          </label>

          {exerciseType === 'BLOCKLY' ? (
            <div>
              <h3 style={{ marginTop: 0 }}>Blockly Configuration</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={blocklyConfig.canViewAnswer === true}
                  onChange={e =>
                    setBlocklyConfig(prev => ({ ...prev, canViewAnswer: e.target.checked }))}
                />
                Allow students to view the answer
              </label>
              <BlocklyAuthoringWorkspace
                allowedBlocks={blocklyConfig.allowedBlocks || []}
                initialWorkspaceXml={blocklyConfig.initialWorkspaceXml}
                showCodeView={blocklyConfig.showCodeView}
                onAllowedBlocksChange={blocks =>
                  setBlocklyConfig(prev => ({ ...prev, allowedBlocks: blocks }))}
                onWorkspaceXmlChange={xml =>
                  setBlocklyConfig(prev => ({ ...prev, initialWorkspaceXml: xml }))}
                onShowCodeViewChange={show =>
                  setBlocklyConfig(prev => ({ ...prev, showCodeView: show }))}
              />

              {blocklyConfig.showResult ? (
                <>
                  <h4 style={{ marginTop: 24 }}>Grading Rules</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="checkbox"
                        checked={blocklyConfig.gradingRules?.outputMatch?.enabled || false}
                        onChange={e => setBlocklyConfig(prev => ({
                          ...prev,
                          gradingRules: { ...prev.gradingRules,
                            outputMatch: { ...prev.gradingRules?.outputMatch, enabled: e.target.checked } }}))} />
                      Output Match
                      {blocklyConfig.gradingRules?.outputMatch?.enabled && (
                        <input
                          value={blocklyConfig.gradingRules?.outputMatch?.expectedOutput || ''}
                          onChange={e => setBlocklyConfig(prev => ({
                            ...prev,
                            gradingRules: { ...prev.gradingRules,
                              outputMatch: { ...prev.gradingRules?.outputMatch, expectedOutput: e.target.value } }}))}
                          placeholder="Expected output"
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }} />
                      )}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="checkbox"
                        checked={blocklyConfig.gradingRules?.blockCountLimit?.enabled || false}
                        onChange={e => setBlocklyConfig(prev => ({
                          ...prev,
                          gradingRules: { ...prev.gradingRules,
                            blockCountLimit: { ...prev.gradingRules?.blockCountLimit, enabled: e.target.checked } }}))} />
                      Block Count Limit
                      {blocklyConfig.gradingRules?.blockCountLimit?.enabled && (
                        <input type="number" min={1}
                          value={blocklyConfig.gradingRules?.blockCountLimit?.max || ''}
                          onChange={e => setBlocklyConfig(prev => ({
                            ...prev,
                            gradingRules: { ...prev.gradingRules,
                              blockCountLimit: { ...prev.gradingRules?.blockCountLimit, max: parseInt(e.target.value) || null } }}))}
                          placeholder="Max blocks"
                          style={{ width: 80, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }} />
                      )}
                    </label>
                  </div>
                </>
              ) : (
                <RubricEditor
                  dimensions={blocklyConfig.rubric?.dimensions || []}
                  onChange={dims => setBlocklyConfig(prev => ({
                    ...prev, rubric: { dimensions: dims }
                  }))}
                />
              )}
            </div>
          ) : (
            <div>
              <h3 style={{ marginTop: 0 }}>Python Configuration</h3>
              <PythonAuthoringEditor
                starterCode={pythonConfig.starterCode || ''}
                timeLimitSeconds={pythonConfig.timeLimitSeconds || 5}
                testCases={pythonConfig.testCases || []}
                onStarterCodeChange={code =>
                  setPythonConfig(prev => ({ ...prev, starterCode: code }))}
                onTimeLimitChange={secs =>
                  setPythonConfig(prev => ({ ...prev, timeLimitSeconds: secs }))}
                onTestCasesChange={cases =>
                  setPythonConfig(prev => ({ ...prev, testCases: cases }))}
              />
              {!pythonConfig.showResult && (
                <RubricEditor
                  dimensions={pythonConfig.rubric?.dimensions || []}
                  onChange={dims => setPythonConfig(prev => ({
                    ...prev, rubric: { dimensions: dims }
                  }))}
                />
              )}
            </div>
          )}
```

5. In `handleSubmit`, add rubric validation before the save call (after `setSaving(true)`):

```js
      // Validate rubric if manual grading mode
      const activeConfig = exerciseType === 'BLOCKLY' ? blocklyConfig : pythonConfig;
      if (!activeConfig.showResult) {
        const dims = activeConfig.rubric?.dimensions || [];
        if (dims.length === 0) {
          setError('Add at least one scoring dimension.');
          setSaving(false);
          return;
        }
        const sum = dims.reduce((acc, d) => acc + (parseFloat(d.weight) || 0), 0);
        if (Math.abs(sum - 1) > 1e-6) {
          setError('Dimension weights must sum to exactly 1.0.');
          setSaving(false);
          return;
        }
      }
```

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npm test -- --run 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RubricEditor.jsx \
        frontend/src/pages/tutor/ExerciseFormPage.jsx
git commit -m "feat(exercise): rubric editor for manual-grading exercises"
```

---

## Task 8: Frontend SubmissionDetailPage — Rubric Scoring + Graded Chip

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.jsx`

**Interfaces:**
- Consumes: `submission.graded` (boolean), `submission.tutorGradeDetails` (JSON string or null)
- Consumes: the exercise's rubric dimensions from the graded version's config — **fetched from existing `exerciseApi.get(submission.exerciseId)`**, then read `currentVersion.config.rubric.dimensions`
- Produces: renders per-dimension 0–100 inputs when rubric present; sends `{ dimensionScores, tutorComment }` to grade endpoint; shows "Tutor Graded" chip when `submission.graded`

- [ ] **Step 1: Update SubmissionDetailPage**

Replace `SubmissionDetailPage.jsx` with the following. Key changes: load rubric from exercise config, render dimension inputs, updated grade payload, graded chip.

```jsx
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { submissionApi } from '../../api/submissionApi';
import { exerciseApi } from '../../api/exerciseApi';
import { isReauthCancelled } from '../../api/axiosInstance';
import Breadcrumb from '../../components/Breadcrumb';
import BlocklySubmissionViewer from '../../components/BlocklySubmissionViewer';

export default function SubmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  const [submission, setSubmission] = useState(null);
  const [rubricDimensions, setRubricDimensions] = useState(null); // null = auto type
  const [dimensionScores, setDimensionScores] = useState({});
  const [tutorScore, setTutorScore] = useState('');
  const [tutorComment, setTutorComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    submissionApi.getById(id).then(data => {
      setSubmission(data);
      if (data.tutorComment) setTutorComment(data.tutorComment);

      // Load exercise to get rubric config
      exerciseApi.get(data.exerciseId).then(ex => {
        const config = ex.currentVersion?.config;
        if (config && config.showResult === false && config.rubric?.dimensions?.length) {
          setRubricDimensions(config.rubric.dimensions);
          // Pre-fill from saved tutorGradeDetails if present
          if (data.tutorGradeDetails) {
            try {
              const saved = JSON.parse(data.tutorGradeDetails);
              const map = {};
              saved.forEach(d => { map[d.name] = String(d.score); });
              setDimensionScores(map);
            } catch { /* ignore */ }
          }
        } else {
          if (data.tutorScore != null) setTutorScore(String(data.tutorScore));
        }
      }).catch(() => {
        if (data.tutorScore != null) setTutorScore(String(data.tutorScore));
      });
    });
  }, [id]);

  useEffect(() => {
    if (!submission || submission.exerciseType !== 'PYTHON' || !editorRef.current) return;
    import('monaco-editor').then(monaco => {
      if (monacoRef.current) monacoRef.current.dispose();
      monacoRef.current = monaco.editor.create(editorRef.current, {
        value: submission.answerData || '',
        language: 'python',
        readOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
      });
    });
    return () => { monacoRef.current?.dispose(); monacoRef.current = null; };
  }, [submission]);

  async function handleSave() {
    setSaveError('');
    setSaving(true);
    try {
      let payload;
      if (rubricDimensions) {
        // Validate each dimension score
        for (const d of rubricDimensions) {
          const val = parseFloat(dimensionScores[d.name]);
          if (isNaN(val) || val < 0 || val > 100) {
            setSaveError(`Score for "${d.name}" must be a number between 0 and 100.`);
            setSaving(false);
            return;
          }
        }
        payload = {
          dimensionScores: rubricDimensions.map(d => ({
            name: d.name,
            weight: d.weight,
            score: parseFloat(dimensionScores[d.name]),
          })),
          tutorComment: tutorComment || null,
        };
      } else {
        const score = parseFloat(tutorScore);
        if (isNaN(score) || score < 0 || score > 100) {
          setSaveError('Score must be a number between 0 and 100.');
          setSaving(false);
          return;
        }
        payload = { tutorScore: score, tutorComment: tutorComment || null };
      }
      const data = await submissionApi.grade(id, payload);
      setSubmission(data);
    } catch (err) {
      if (isReauthCancelled(err)) return;
      setSaveError(err.response?.data?.error?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this submission? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await submissionApi.delete(id);
      navigate('/tutor/submissions');
    } catch {
      alert('Failed to delete submission.');
      setDeleting(false);
    }
  }

  function renderAutoGrade(details) {
    if (!details) return null;
    try {
      const d = JSON.parse(details);
      if (d.type === 'BLOCKLY') {
        return (
          <div>
            <p><strong>Rule:</strong> {d.rule}</p>
            <p><strong>Passed:</strong> {String(d.passed)}</p>
            {d.expected != null && <p><strong>Expected:</strong> <code>{d.expected}</code></p>}
            {d.actual != null && <p><strong>Actual:</strong> <code>{d.actual}</code></p>}
            {d.error && <p style={{ color: '#c62828' }}><strong>Error:</strong> {d.error}</p>}
          </div>
        );
      }
      if (d.type === 'PYTHON') {
        return (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                {['#', 'Passed', 'Actual', 'Time (ms)', 'Error'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', border: '1px solid #ddd' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d.results || []).map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd' }}>{r.index}</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd', color: r.passed ? '#2e7d32' : '#c62828' }}>
                    {r.passed ? '✓' : '✗'}
                  </td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd' }}><code>{r.actual}</code></td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd' }}>{r.executionTimeMs}</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd', color: '#c62828' }}>{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
    } catch { /* ignore */ }
    return <pre style={{ fontSize: 12 }}>{details}</pre>;
  }

  if (!submission) return <p style={{ padding: 32 }}>Loading…</p>;

  const effectiveScore = submission.tutorScore ?? submission.autoScore;

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <Breadcrumb items={[
        { label: 'Submissions', to: '/tutor/submissions' },
        { label: 'Submission Detail' },
      ]} />
      <button onClick={() => navigate('/tutor/submissions')}
        style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        ← Back to Submissions
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{submission.exerciseTitle}</h1>
        {submission.graded && (
          <span style={{
            background: '#1976d2', color: '#fff', borderRadius: 12,
            padding: '3px 12px', fontSize: 12, fontWeight: 700,
          }}>
            Tutor Graded
          </span>
        )}
      </div>
      <p style={{ color: '#555', margin: '0 0 16px' }}>
        {submission.exerciseType} · {submission.studentName}
      </p>

      {submission.versionMismatch && (
        <div style={{
          background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4,
          padding: '10px 16px', marginBottom: 16, color: '#e65100',
        }}>
          This submission was answered against version {submission.studentVersionNumber}.
          The exercise has since been updated to version {submission.gradedVersionNumber}.
        </div>
      )}

      {effectiveScore != null && (
        <div style={{
          display: 'inline-block', padding: '4px 14px', borderRadius: 20,
          background: submission.tutorScore != null ? '#1976d2' : '#388e3c',
          color: '#fff', fontWeight: 700, marginBottom: 20,
        }}>
          {submission.tutorScore != null ? 'Tutor' : 'Auto'} Score: {effectiveScore}
        </div>
      )}

      <h2 style={{ marginBottom: 8 }}>Student Answer</h2>
      {submission.exerciseType === 'BLOCKLY' ? (
        <div style={{ marginBottom: 24 }}>
          <BlocklySubmissionViewer workspaceXml={submission.workspaceXml} />
        </div>
      ) : (
        <div ref={editorRef} style={{ height: 300, border: '1px solid #ddd', borderRadius: 4, marginBottom: 24 }} />
      )}

      <h2 style={{ marginBottom: 8 }}>Auto-Grade Details</h2>
      <div style={{ background: '#fafafa', border: '1px solid #ddd', borderRadius: 4, padding: 16, marginBottom: 24 }}>
        {renderAutoGrade(submission.autoGradeDetails)}
      </div>

      <h2 style={{ marginBottom: 12 }}>Manual Grade</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
        {rubricDimensions ? (
          <>
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
          </>
        ) : (
          <label style={{ fontSize: 14 }}>
            Score (0–100):
            <input
              type="number" min="0" max="100" step="0.01"
              value={tutorScore}
              onChange={e => setTutorScore(e.target.value)}
              style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
            />
          </label>
        )}
        <label style={{ fontSize: 14 }}>
          Comment (max 500 chars):
          <textarea
            maxLength={500}
            value={tutorComment}
            onChange={e => setTutorComment(e.target.value)}
            rows={4}
            style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
          />
        </label>
        {saveError && <p style={{ color: '#c62828', margin: 0 }}>{saveError}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4,
            padding: '8px 20px', cursor: 'pointer', alignSelf: 'flex-start',
          }}
        >
          {saving ? 'Saving…' : 'Save Grade'}
        </button>
      </div>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #eee' }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            background: 'none', color: '#c62828', border: '1px solid #c62828',
            borderRadius: 4, padding: '8px 20px',
            cursor: deleting ? 'default' : 'pointer',
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? 'Deleting…' : 'Delete Submission'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npm test -- --run 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionDetailPage.jsx
git commit -m "feat(grading): dimension scoring UI with graded chip"
```

---

## Task 9: GroupSubmissionPage + Nav + SubmissionListPage Graded Column

**Files:**
- Create: `frontend/src/api/importBatchApi.js`
- Create: `frontend/src/pages/tutor/GroupSubmissionPage.jsx`
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx`
- Modify: `frontend/src/pages/tutor/SubmissionImportPage.jsx`
- Modify: `frontend/src/components/sectionConfig.js`
- Modify: `frontend/src/components/SectionRouter.jsx`

**Interfaces:**
- `importBatchApi.list(params)` → `GET /v1/import-batches` → `{ content, page, totalPages, totalElements }`
- `importBatchApi.exportUrl(batchId)` → string URL for direct `<a href>` download
- `GroupSubmissionPage` route: `/tutor/group-submissions`

- [ ] **Step 1: Create importBatchApi**

Create `frontend/src/api/importBatchApi.js`:

```js
import axiosInstance from './axiosInstance';

export const importBatchApi = {
  list: (params) =>
    axiosInstance.get('/v1/import-batches', { params }).then(r => r.data),
};

export const batchExportUrl = (batchId) =>
  `/api/v1/import-batches/${batchId}/export`;
```

- [ ] **Step 2: Create GroupSubmissionPage**

Create `frontend/src/pages/tutor/GroupSubmissionPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { importBatchApi, batchExportUrl } from '../../api/importBatchApi';
import Pagination from '../../components/Pagination';

const STATUS_COLORS = {
  ALL:     { bg: '#e8f5e9', color: '#2e7d32' },
  PARTIAL: { bg: '#fff3e0', color: '#e65100' },
  NONE:    { bg: '#f5f5f5', color: '#888' },
};

export default function GroupSubmissionPage() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [pendingBatchId, setPendingBatchId] = useState('');
  const [pendingGradedStatus, setPendingGradedStatus] = useState('');
  const [batchId, setBatchId] = useState('');
  const [gradedStatus, setGradedStatus] = useState('');
  const [loading, setLoading] = useState(false);

  async function fetchBatches(params) {
    setLoading(true);
    try {
      const data = await importBatchApi.list(params);
      setBatches(data.content);
      setTotalPages(data.totalPages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = { page, size: 20 };
    if (batchId.trim()) params.batchId = batchId.trim();
    if (gradedStatus) params.gradedStatus = gradedStatus;
    fetchBatches(params);
  }, [page, batchId, gradedStatus]);

  function handleSearch() {
    setPage(0);
    setBatchId(pendingBatchId);
    setGradedStatus(pendingGradedStatus);
  }

  function handleExport(batch) {
    if (batch.gradedStatus !== 'ALL') {
      const total = batch.importedCount;
      const graded = batch.gradedCount ?? '?';
      if (!window.confirm(
        `Not all submissions in this batch are graded.\nExport anyway?`
      )) return;
    }
    window.location.href = batchExportUrl(batch.id);
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Group Submissions</h1>
        <button
          onClick={() => navigate('/tutor/group-submissions/import')}
          style={{
            background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4,
            padding: '8px 18px', cursor: 'pointer', fontSize: 14,
          }}
        >
          Import Files
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input
          placeholder="Filter by batch ID…"
          value={pendingBatchId}
          onChange={e => setPendingBatchId(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', width: 160 }}
        />
        <label>
          Graded Status:
          <select
            value={pendingGradedStatus}
            onChange={e => setPendingGradedStatus(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="">All</option>
            <option value="ALL">Fully Graded</option>
            <option value="PARTIAL">Partially Graded</option>
            <option value="NONE">Not Graded</option>
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
              {['Import ID', 'Date', 'Files', 'Imported', 'Duplicates', 'Failed', 'Graded Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No import batches found.</td></tr>
            ) : batches.map(b => {
              const sc = STATUS_COLORS[b.gradedStatus] || STATUS_COLORS.NONE;
              return (
                <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{b.id}</td>
                  <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                    {new Date(b.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{b.fileCount}</td>
                  <td style={{ padding: '10px 12px' }}>{b.importedCount}</td>
                  <td style={{ padding: '10px 12px' }}>{b.duplicateCount}</td>
                  <td style={{ padding: '10px 12px' }}>{b.failedCount}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: sc.bg, color: sc.color,
                      borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {b.gradedStatus}
                    </span>
                  </td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
```

- [ ] **Step 3: Update SubmissionListPage — add Graded column, remove Import button**

In `SubmissionListPage.jsx`:

1. Remove the "Import Files" button (the entire `<button onClick={() => navigate('/tutor/submissions/import')}>` block).

2. In the table header array, replace `['Student Name', 'Exercise', 'Type', 'Auto Score', 'Tutor Score', 'Mismatch', 'Date', '']` with:
```js
['Student Name', 'Exercise', 'Type', 'Auto Score', 'Tutor Score', 'Graded', 'Mismatch', 'Date', '']
```

3. In each table row, add a `Graded` cell after `Tutor Score`:
```jsx
<td style={{ padding: '10px 12px' }}>
  {sub.graded ? (
    <span style={{
      background: '#e3f2fd', color: '#1565c0',
      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
    }}>Graded</span>
  ) : '—'}
</td>
```

4. Update the `colSpan` on the "No submissions found" row from `8` to `9`.

- [ ] **Step 4: Update SubmissionImportPage — breadcrumb + handle ok=false response**

In `SubmissionImportPage.jsx`:

1. Change the breadcrumb:
```jsx
      <Breadcrumb items={[
        { label: 'Group Submissions', to: '/tutor/group-submissions' },
        { label: 'Import' },
      ]} />
```

2. Change the back button navigation from `navigate('/tutor/submissions')` to `navigate('/tutor/group-submissions')`.

3. In `handleImport`, after `setResponse(data)`, add handling for validation failure:
```jsx
      const data = await submissionApi.importFiles(formData);
      setResponse(data);
```
Becomes:
```jsx
      const data = await submissionApi.importFiles(formData);
      setResponse(data);
      if (!data.ok) return; // problems are shown below
```

4. After the `{summary && ...}` block and before `{results && ...}`, add a problems section:
```jsx
      {response && !response.ok && response.problems && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#ffebee', borderRadius: 4, border: '1px solid #ef9a9a' }}>
          <strong style={{ color: '#c62828' }}>Import failed — fix the following issues and re-import:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {response.problems.map((p, i) => (
              <li key={i} style={{ color: '#c62828', fontSize: 13, marginTop: 4 }}>
                <strong>{p.filename}</strong>: {p.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 5: Add group-submissions section to sectionConfig**

In `sectionConfig.js`:

1. Add to `SECTIONS` array after `submissions`:
```js
  { key: 'group-submissions', label: 'Group Submissions', icon: '📦', roles: ['TUTOR', 'SUPER_ADMIN'] },
```

2. Add to `getInitialPath`:
```js
    case 'group-submissions': return '/tutor/group-submissions';
```

- [ ] **Step 6: Add group-submissions routes to SectionRouter**

In `SectionRouter.jsx`:

1. Add import:
```js
import GroupSubmissionPage from '../pages/tutor/GroupSubmissionPage';
```

2. Add after the `submissions` section routes:
```jsx
      {section === 'group-submissions' && (
        <>
          <Route path="/tutor/group-submissions" element={<GroupSubmissionPage />} />
          <Route path="/tutor/group-submissions/import" element={<SubmissionImportPage />} />
        </>
      )}
```

- [ ] **Step 7: Run frontend tests**

```bash
cd frontend && npm test -- --run 2>&1 | tail -30
```
Expected: all tests pass. If `sectionConfig.test.js` checks the exact SECTIONS array length or order, update it to include `group-submissions`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/importBatchApi.js \
        frontend/src/pages/tutor/GroupSubmissionPage.jsx \
        frontend/src/pages/tutor/SubmissionListPage.jsx \
        frontend/src/pages/tutor/SubmissionImportPage.jsx \
        frontend/src/components/sectionConfig.js \
        frontend/src/components/SectionRouter.jsx
git commit -m "feat(batches): Group Submission page, graded column, import relocated"
```

---

## Task 10: My Progress Frontend Rebuild

**Files:**
- Modify: `frontend/src/pages/student/ProgressPage.jsx`

**Interfaces:**
- Consumes: `progressApi.getProgress(page, size)` → `{ submissions: { content: [ProgressSubmissionDto], page, totalPages, totalElements } }`
- Each `ProgressSubmissionDto`: `{ submissionId, exerciseId, exerciseTitle, exerciseType, source, graded, score, answerData, workspaceXml, createdAt }`
- Read-only run via existing `workers/blockly-runner.js` and `workers/pyodide-runner.js`

- [ ] **Step 1: Rebuild ProgressPage**

Replace `frontend/src/pages/student/ProgressPage.jsx` entirely:

```jsx
import { useEffect, useRef, useState } from 'react';
import { progressApi } from '../../api/progressApi';
import { isReauthCancelled } from '../../api/axiosInstance';
import Pagination from '../../components/Pagination';
import BlocklySubmissionViewer from '../../components/BlocklySubmissionViewer';

function ScoreChip({ score, graded }) {
  if (!graded && score == null) return <span style={{ color: '#888' }}>—</span>;
  if (!graded) return <span style={{ color: '#888', fontSize: 12 }}>Pending</span>;
  const val = score != null ? score.toFixed(1) : '—';
  const pass = score != null && score >= 60;
  return (
    <span style={{
      background: pass ? '#e8f5e9' : '#ffebee',
      color: pass ? '#2e7d32' : '#c62828',
      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
    }}>
      {val}
    </span>
  );
}

export default function ProgressPage() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // selected submission for detail view

  useEffect(() => {
    setLoading(true);
    progressApi.getProgress(page, 20)
      .then(setData)
      .catch(err => { if (!isReauthCancelled(err)) setError('Failed to load progress.'); })
      .finally(() => setLoading(false));
  }, [page]);

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;
  if (error)   return <div style={{ padding: 32, color: 'red' }}>{error}</div>;

  const { submissions } = data;

  if (selected) {
    return (
      <SubmissionViewer
        submission={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>My Progress</h2>

      {submissions.totalElements === 0 ? (
        <p style={{ color: '#888' }}>No submissions yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Exercise</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px' }}>Source</th>
              <th style={{ padding: '8px 12px' }}>Score</th>
              <th style={{ padding: '8px 12px' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {submissions.content.map(sub => (
              <tr
                key={sub.submissionId}
                onClick={() => setSelected(sub)}
                style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>{sub.exerciseTitle}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    background: sub.exerciseType === 'BLOCKLY' ? '#ede9fe' : '#dbeafe',
                    color: sub.exerciseType === 'BLOCKLY' ? '#7c3aed' : '#1d4ed8',
                    borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                  }}>
                    {sub.exerciseType}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#555' }}>
                  {sub.source === 'STUDENT' ? 'Submitted' : 'Imported'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <ScoreChip score={sub.score} graded={sub.graded} />
                </td>
                <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                  {new Date(sub.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={submissions.totalPages} onPageChange={setPage} />
    </div>
  );
}

function SubmissionViewer({ submission, onBack }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const workerRef = useRef(null);
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (submission.exerciseType !== 'PYTHON' || !editorRef.current) return;
    import('monaco-editor').then(monaco => {
      if (monacoRef.current) monacoRef.current.dispose();
      monacoRef.current = monaco.editor.create(editorRef.current, {
        value: submission.answerData || '',
        language: 'python',
        readOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
      });
    });
    return () => { monacoRef.current?.dispose(); monacoRef.current = null; };
  }, [submission]);

  function handleRun() {
    setRunning(true);
    setOutput('');
    if (workerRef.current) workerRef.current.terminate();

    if (submission.exerciseType === 'BLOCKLY') {
      const worker = new Worker(new URL('../../workers/blockly-runner.js', import.meta.url));
      workerRef.current = worker;
      const timer = setTimeout(() => {
        worker.terminate();
        setOutput('Execution timed out (5s).');
        setRunning(false);
      }, 5000);
      worker.onmessage = e => {
        clearTimeout(timer);
        setOutput(e.data.output ?? e.data.error ?? '(no output)');
        setRunning(false);
        worker.terminate();
      };
      worker.postMessage({ code: submission.answerData });
    } else {
      const worker = new Worker(new URL('../../workers/pyodide-runner.js', import.meta.url));
      workerRef.current = worker;
      const timer = setTimeout(() => {
        worker.terminate();
        setOutput('Execution timed out (10s).');
        setRunning(false);
      }, 10000);
      worker.onmessage = e => {
        clearTimeout(timer);
        setOutput(e.data.output ?? e.data.error ?? '(no output)');
        setRunning(false);
        worker.terminate();
      };
      worker.postMessage({ code: submission.answerData });
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', padding: 0, marginBottom: 16 }}
      >
        ← Back to My Progress
      </button>
      <h2 style={{ marginBottom: 4 }}>{submission.exerciseTitle}</h2>
      <p style={{ color: '#555', margin: '0 0 20px', fontSize: 13 }}>
        {submission.exerciseType} · {submission.source === 'STUDENT' ? 'Submitted' : 'Imported'} ·{' '}
        {new Date(submission.createdAt).toLocaleDateString()}
      </p>

      {submission.exerciseType === 'BLOCKLY' ? (
        <BlocklySubmissionViewer workspaceXml={submission.workspaceXml} />
      ) : (
        <div ref={editorRef} style={{ height: 300, border: '1px solid #ddd', borderRadius: 4 }} />
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4,
            padding: '8px 20px', cursor: 'pointer', fontSize: 14,
          }}
        >
          {running ? 'Running…' : 'Run'}
        </button>
      </div>

      {output && (
        <pre style={{
          marginTop: 12, padding: '12px 16px', background: '#1e1e1e', color: '#d4d4d4',
          borderRadius: 4, fontSize: 13, whiteSpace: 'pre-wrap', overflowX: 'auto',
        }}>
          {output}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npm test -- --run 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/student/ProgressPage.jsx
git commit -m "feat(progress): rebuild My Progress as submission list with read-only code viewer"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task(s) |
|-------------|---------|
| `showResult=false` → rubric editor in exercise form | T7 |
| Rubric: dimension name + weight, sum=1 validation | T7 |
| `showResult=true` → existing grading config unchanged | T7 |
| Grading page: dimension inputs for rubric type | T8 |
| Grading page: weighted total → `tutorScore` | T4, T8 |
| Grading page: save `tutorGradeDetails` JSON | T4 |
| Grading page: `graded=true` on save | T4 |
| Grading page: "Tutor Graded" chip | T8 |
| Grading page: instant-feedback type unchanged | T8 (else branch) |
| Import: atomic with username pre-flight | T3 |
| Import: unmatched username → abort, list problems | T3 |
| `import_batches` table with friendly id | T1 |
| `user_id` linked via username match on import | T3 |
| Group Submission page: import button | T9 |
| Group Submission page: batch list with graded status | T9 |
| Group Submission page: filter by batch id / graded status | T9 |
| Group Submission page: export per batch | T5, T9 |
| Export: confirm when not fully graded | T9 |
| Export CSV: long format with dimensions | T5 |
| Export CSV: student name + display name + exercise + total | T5 |
| Submissions list: graded column | T9 |
| Submissions list: import button removed | T9 |
| My Progress: only `user_id=me` submissions | T6 |
| My Progress: STUDENT + IMPORT sources | T6 |
| My Progress: click to view read-only + Run | T10 |
| My Progress: no editing | T10 |
| DB V10 migration | T1 |

**No placeholders found.**

**Type consistency check:**
- `ImportBatch.id` (Long) used as `ImportBatchDto.id` (Long) ✓
- `ImportResponseDto.importBatchId` (Long) used in T3 ✓
- `DimensionScoreDto(name, weight, score)` in T4 matches usage in T8 payload ✓
- `SubmissionListItemDto.graded` (boolean) in T2 rendered in T9 ✓
- `ProgressSubmissionDto.submissions` in T6 consumed in T10 as `data.submissions.content` ✓
- `StudentProgressDto.submissions` (PageResponse) — T6 controller returns this, T10 frontend reads `data.submissions` ✓
