# Student Draft & Submit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in students save a per-exercise draft and submit answers for immediate server-side grading (score + pass/fail), with a per-exercise tutor toggle controlling result visibility, while keeping student submissions separate from tutor-imported ones.

**Architecture:** A new `exercise_drafts` table holds one overwrite-on-save draft per `(student, exercise)`. The `submissions` table gains a `source` discriminator (`STUDENT`/`IMPORT`) and a nullable `user_id`. Student submit reuses the existing `BlocklyGrader`/`PythonGrader` server-side graders against the full (un-stripped) version config; the tutor toggle lives as `config.showResult` (default `true`). New `STUDENT`-role endpoints handle draft load/save, submit, and own-history; the existing tutor submission list gains a `source` filter defaulting to `IMPORT`.

**Tech Stack:** Java 25 · Spring Boot 3.5 · Spring Data JPA · Flyway · H2 (test, MySQL mode) · React 18 · Vite · Vitest · Axios

## Global Constraints

- API base path prefix: `/v1` (Nginx adds `/api`). Error format: `{ error: { code, message, timestamp } }`.
- Roles: `SUPER_ADMIN > TUTOR > STUDENT` (higher inherits lower). Student endpoints use `@PreAuthorize("hasRole('STUDENT')")`.
- No hard deletes; submissions use the existing `is_deleted` soft-delete flag.
- **No hidden test cases or grading details in any student API response** — student responses expose only `score` + `passed`.
- Migrations: `db/migration/V{n}__{description}.sql`, immutable once merged. Next free version is **V8**.
- Existing graders expose `Result grade(String studentCode, String configJson)` where `Result` is `record Result(BigDecimal autoScore, String autoGradeDetailsJson)`.
- Commits: Conventional Commits, e.g. `feat(submission): ...`. Branch: `feature/student-draft-submit`.
- Run backend tests: `cd backend && mvn test`. Run a single test: `cd backend && mvn test -Dtest=ClassName`.
- Run frontend tests: `cd frontend && npm test`. Single file: `cd frontend && npm test -- src/path/file.test.jsx`.

---

## File Structure

**Backend — create:**
- `db/migration/V8__add_drafts_and_submission_source.sql` — schema changes.
- `entity/ExerciseDraft.java` — draft entity (in `com.platform.exercise.domain`).
- `repository/ExerciseDraftRepository.java`
- `student/StudentDraftService.java`, `student/DraftDto.java`, `student/SaveDraftRequest.java`
- `student/StudentSubmissionService.java`, `student/SubmitRequest.java`, `student/SubmitResultDto.java`, `student/SubmissionHistoryItemDto.java`
- `student/StudentSubmissionController.java` — all four student practice endpoints.

**Backend — modify:**
- `domain/Submission.java` — add `source`, `userId` fields.
- `repository/SubmissionRepository.java` — `source` param on `findFiltered`; student-history finder.
- `submission/SubmissionService.java` + `submission/SubmissionController.java` — `source` filter on list.
- `security/RateLimitFilter.java` — submit rate limit.

**Frontend — modify:**
- `api/studentApi.js` — draft/submit/history calls.
- `pages/student/BlocklyPracticePage.jsx`, `pages/student/PythonPracticePage.jsx` — Save/Submit buttons, draft restore, result modal.
- `pages/tutor/ExerciseFormPage.jsx` — `showResult` checkbox.
- `pages/tutor/SubmissionListPage.jsx` — source filter.

---

## Task 1: V8 migration — drafts table + submission source/user_id

**Files:**
- Create: `backend/src/main/resources/db/migration/V8__add_drafts_and_submission_source.sql`
- Test: `backend/src/test/java/com/platform/exercise/MigrationTest.java`

**Interfaces:**
- Produces: table `exercise_drafts (id, user_id, exercise_id, exercise_type, answer_data, workspace_xml, updated_at)` with unique `(user_id, exercise_id)`; `submissions.source VARCHAR(20) NOT NULL DEFAULT 'IMPORT'`; `submissions.user_id BIGINT NULL`.

- [ ] **Step 1: Write the failing test**

Add to `MigrationTest.java`:

```java
    @Test
    void v8AddsExerciseDraftsTableAndSubmissionSourceColumns() throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
                    "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='exercise_drafts'")) {
                ResultSet rs = stmt.executeQuery();
                rs.next();
                assertEquals(1, rs.getInt(1), "exercise_drafts table should exist");
            }
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT LOWER(COLUMN_NAME) FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='submissions'")) {
                ResultSet rs = stmt.executeQuery();
                Set<String> cols = new HashSet<>();
                while (rs.next()) cols.add(rs.getString(1));
                assertTrue(cols.contains("source"), "submissions.source should exist");
                assertTrue(cols.contains("user_id"), "submissions.user_id should exist");
            }
        }
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=MigrationTest#v8AddsExerciseDraftsTableAndSubmissionSourceColumns`
Expected: FAIL — `exercise_drafts table should exist` (table/columns missing).

- [ ] **Step 3: Create the migration**

`backend/src/main/resources/db/migration/V8__add_drafts_and_submission_source.sql`:

```sql
-- One draft per (student, exercise); overwrite on save.
CREATE TABLE exercise_drafts (
    id            BIGINT          AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT          NOT NULL,
    exercise_id   BIGINT          NOT NULL,
    exercise_type VARCHAR(20)     NOT NULL COMMENT 'BLOCKLY | PYTHON',
    answer_data   MEDIUMTEXT      COMMENT 'Python code (restore editor)',
    workspace_xml MEDIUMTEXT      COMMENT 'Blockly DOM (restore blocks)',
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_draft_user_exercise (user_id, exercise_id),
    CONSTRAINT fk_draft_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_draft_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Distinguish student submissions from tutor imports. Existing rows are imports.
ALTER TABLE submissions
    ADD COLUMN source  VARCHAR(20) NOT NULL DEFAULT 'IMPORT' COMMENT 'STUDENT | IMPORT',
    ADD COLUMN user_id BIGINT      NULL COMMENT 'FK users(id); set for STUDENT source';

ALTER TABLE submissions
    ADD CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id);

CREATE INDEX idx_sub_user_exercise ON submissions (user_id, exercise_id, created_at);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=MigrationTest`
Expected: PASS (all MigrationTest methods green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V8__add_drafts_and_submission_source.sql \
        backend/src/test/java/com/platform/exercise/MigrationTest.java
git commit -m "feat(db): add exercise_drafts table and submission source/user_id columns"
```

---

## Task 2: Submission entity — source & userId fields

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/domain/Submission.java`
- Test: `backend/src/test/java/com/platform/exercise/submission/SubmissionEntityTest.java` (create)

**Interfaces:**
- Produces: `Submission.getSource()/setSource(String)` (default `"IMPORT"`), `Submission.getUserId()/setUserId(Long)`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/submission/SubmissionEntityTest.java`:

```java
package com.platform.exercise.submission;

import com.platform.exercise.domain.Submission;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class SubmissionEntityTest {

    @Test
    void newSubmissionDefaultsToImportSourceWithNoUser() {
        Submission sub = new Submission();
        assertEquals("IMPORT", sub.getSource());
        assertNull(sub.getUserId());
    }

    @Test
    void sourceAndUserIdAreSettable() {
        Submission sub = new Submission();
        sub.setSource("STUDENT");
        sub.setUserId(42L);
        assertEquals("STUDENT", sub.getSource());
        assertEquals(42L, sub.getUserId());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=SubmissionEntityTest`
Expected: FAIL — `getSource()` / `setUserId(...)` do not compile/exist.

- [ ] **Step 3: Add the fields**

In `Submission.java`, after the `importBatchId` field (around line 60), add:

```java
    @Column(name = "source", nullable = false, length = 20)
    private String source = "IMPORT";

    @Column(name = "user_id")
    private Long userId;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=SubmissionEntityTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/domain/Submission.java \
        backend/src/test/java/com/platform/exercise/submission/SubmissionEntityTest.java
git commit -m "feat(submission): add source and userId fields to Submission entity"
```

---

## Task 3: ExerciseDraft entity + repository

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/domain/ExerciseDraft.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/ExerciseDraftRepository.java`
- Test: `backend/src/test/java/com/platform/exercise/repository/ExerciseDraftRepositoryTest.java`

**Interfaces:**
- Produces: `ExerciseDraft` entity (`id, userId, exerciseId, exerciseType, answerData, workspaceXml, updatedAt`); `ExerciseDraftRepository.findByUserIdAndExerciseId(Long userId, Long exerciseId) -> Optional<ExerciseDraft>`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/repository/ExerciseDraftRepositoryTest.java`:

```java
package com.platform.exercise.repository;

import com.platform.exercise.domain.ExerciseDraft;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace.NONE;

@DataJpaTest
@AutoConfigureTestDatabase(replace = NONE)
@ActiveProfiles("test")
class ExerciseDraftRepositoryTest {

    @Autowired ExerciseDraftRepository repository;

    @Test
    void savesAndFindsDraftByUserAndExercise() {
        ExerciseDraft draft = new ExerciseDraft();
        draft.setUserId(1L);
        draft.setExerciseId(2L);
        draft.setExerciseType("PYTHON");
        draft.setAnswerData("print(1)");
        repository.save(draft);

        Optional<ExerciseDraft> found = repository.findByUserIdAndExerciseId(1L, 2L);
        assertTrue(found.isPresent());
        assertEquals("print(1)", found.get().getAnswerData());
    }

    @Test
    void returnsEmptyWhenNoDraftForUser() {
        assertTrue(repository.findByUserIdAndExerciseId(99L, 99L).isEmpty());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=ExerciseDraftRepositoryTest`
Expected: FAIL — `ExerciseDraft` / `ExerciseDraftRepository` do not exist.

- [ ] **Step 3: Create entity and repository**

`backend/src/main/java/com/platform/exercise/domain/ExerciseDraft.java`:

```java
package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "exercise_drafts")
@Data
@NoArgsConstructor
public class ExerciseDraft {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "exercise_id", nullable = false)
    private Long exerciseId;

    @Column(name = "exercise_type", nullable = false, length = 20)
    private String exerciseType;

    @Column(name = "answer_data", columnDefinition = "MEDIUMTEXT")
    private String answerData;

    @Column(name = "workspace_xml", columnDefinition = "MEDIUMTEXT")
    private String workspaceXml;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    @PrePersist
    void touch() {
        this.updatedAt = LocalDateTime.now();
    }
}
```

`backend/src/main/java/com/platform/exercise/repository/ExerciseDraftRepository.java`:

```java
package com.platform.exercise.repository;

import com.platform.exercise.domain.ExerciseDraft;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ExerciseDraftRepository extends JpaRepository<ExerciseDraft, Long> {
    Optional<ExerciseDraft> findByUserIdAndExerciseId(Long userId, Long exerciseId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=ExerciseDraftRepositoryTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/domain/ExerciseDraft.java \
        backend/src/main/java/com/platform/exercise/repository/ExerciseDraftRepository.java \
        backend/src/test/java/com/platform/exercise/repository/ExerciseDraftRepositoryTest.java
git commit -m "feat(student): add ExerciseDraft entity and repository"
```

---

## Task 4: Draft service + DTOs

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/student/DraftDto.java`
- Create: `backend/src/main/java/com/platform/exercise/student/SaveDraftRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/student/StudentDraftService.java`
- Test: `backend/src/test/java/com/platform/exercise/student/StudentDraftServiceTest.java`

**Interfaces:**
- Consumes: `ExerciseDraftRepository.findByUserIdAndExerciseId`; `ExerciseRepository.findByIdAndDeletedFalse`.
- Produces:
  - `record DraftDto(String answerData, String workspaceXml, java.time.LocalDateTime updatedAt)`
  - `record SaveDraftRequest(String answerData, String workspaceXml)`
  - `StudentDraftService.getDraft(Long userId, Long exerciseId) -> DraftDto` (null if none)
  - `StudentDraftService.saveDraft(Long userId, Long exerciseId, SaveDraftRequest req) -> DraftDto`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/student/StudentDraftServiceTest.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.repository.ExerciseDraftRepository;
import com.platform.exercise.repository.ExerciseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StudentDraftServiceTest {

    ExerciseDraftRepository draftRepo;
    ExerciseRepository exerciseRepo;
    StudentDraftService service;

    @BeforeEach
    void setUp() {
        draftRepo = mock(ExerciseDraftRepository.class);
        exerciseRepo = mock(ExerciseRepository.class);
        service = new StudentDraftService(draftRepo, exerciseRepo);
    }

    private Exercise publishedExercise() {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        return ex;
    }

    @Test
    void getDraft_returnsNullWhenNone() {
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(publishedExercise()));
        when(draftRepo.findByUserIdAndExerciseId(1L, 2L)).thenReturn(Optional.empty());
        assertNull(service.getDraft(1L, 2L));
    }

    @Test
    void saveDraft_createsThenOverwritesSameRow() {
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(publishedExercise()));
        when(draftRepo.findByUserIdAndExerciseId(1L, 2L)).thenReturn(Optional.empty());
        when(draftRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        DraftDto saved = service.saveDraft(1L, 2L, new SaveDraftRequest("print(1)", null));
        assertEquals("print(1)", saved.answerData());
        verify(draftRepo).save(argThat(d ->
            d.getUserId().equals(1L) && d.getExerciseId().equals(2L)
                && "PYTHON".equals(d.getExerciseType())));
    }

    @Test
    void saveDraft_missingExercise_throws() {
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.empty());
        assertThrows(PlatformException.class,
            () -> service.saveDraft(1L, 2L, new SaveDraftRequest("x", null)));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=StudentDraftServiceTest`
Expected: FAIL — `StudentDraftService`, `DraftDto`, `SaveDraftRequest` do not exist.

- [ ] **Step 3: Create DTOs and service**

`DraftDto.java`:

```java
package com.platform.exercise.student;

import java.time.LocalDateTime;

public record DraftDto(String answerData, String workspaceXml, LocalDateTime updatedAt) {}
```

`SaveDraftRequest.java`:

```java
package com.platform.exercise.student;

public record SaveDraftRequest(String answerData, String workspaceXml) {}
```

`StudentDraftService.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseDraft;
import com.platform.exercise.repository.ExerciseDraftRepository;
import com.platform.exercise.repository.ExerciseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class StudentDraftService {

    private final ExerciseDraftRepository draftRepository;
    private final ExerciseRepository exerciseRepository;

    @Transactional(readOnly = true)
    public DraftDto getDraft(Long userId, Long exerciseId) {
        requirePublished(exerciseId);
        return draftRepository.findByUserIdAndExerciseId(userId, exerciseId)
            .map(d -> new DraftDto(d.getAnswerData(), d.getWorkspaceXml(), d.getUpdatedAt()))
            .orElse(null);
    }

    @Transactional
    public DraftDto saveDraft(Long userId, Long exerciseId, SaveDraftRequest req) {
        Exercise exercise = requirePublished(exerciseId);
        ExerciseDraft draft = draftRepository.findByUserIdAndExerciseId(userId, exerciseId)
            .orElseGet(ExerciseDraft::new);
        draft.setUserId(userId);
        draft.setExerciseId(exerciseId);
        draft.setExerciseType(exercise.getType().name());
        draft.setAnswerData(req.answerData());
        draft.setWorkspaceXml(req.workspaceXml());
        ExerciseDraft saved = draftRepository.save(draft);
        return new DraftDto(saved.getAnswerData(), saved.getWorkspaceXml(), saved.getUpdatedAt());
    }

    private Exercise requirePublished(Long exerciseId) {
        return exerciseRepository.findByIdAndDeletedFalse(exerciseId)
            .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=StudentDraftServiceTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/DraftDto.java \
        backend/src/main/java/com/platform/exercise/student/SaveDraftRequest.java \
        backend/src/main/java/com/platform/exercise/student/StudentDraftService.java \
        backend/src/test/java/com/platform/exercise/student/StudentDraftServiceTest.java
git commit -m "feat(student): add draft save/load service"
```

---

## Task 5: Submission history finder + repository source filter

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`
- Test: `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java` (create)

**Interfaces:**
- Produces:
  - `SubmissionRepository.findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(Long userId, Long exerciseId) -> List<Submission>`
  - `findFiltered(Long exerciseId, String studentName, String source, Pageable)` — adds `source` param (`null` = any).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java`:

```java
package com.platform.exercise.repository;

import com.platform.exercise.domain.Submission;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace.NONE;

@DataJpaTest
@AutoConfigureTestDatabase(replace = NONE)
@ActiveProfiles("test")
class SubmissionRepositoryTest {

    @Autowired SubmissionRepository repository;

    private Submission sub(String source, Long userId, Long exerciseId) {
        Submission s = new Submission();
        s.setExerciseId(exerciseId);
        s.setGradedVersionId(1L);
        s.setStudentName("Alice");
        s.setExerciseType("PYTHON");
        s.setAnswerData("code");
        s.setExportTimestamp(LocalDateTime.now());
        s.setSource(source);
        s.setUserId(userId);
        s.setAutoScore(BigDecimal.valueOf(100));
        return s;
    }

    @Test
    void findFiltered_bySource_returnsOnlyMatchingSource() {
        repository.save(sub("STUDENT", 7L, 5L));
        repository.save(sub("IMPORT", null, 5L));

        var imports = repository.findFiltered(null, null, "IMPORT", PageRequest.of(0, 20));
        assertEquals(1, imports.getTotalElements());
        assertEquals("IMPORT", imports.getContent().get(0).getSource());

        var all = repository.findFiltered(null, null, null, PageRequest.of(0, 20));
        assertEquals(2, all.getTotalElements());
    }

    @Test
    void findByUser_returnsOwnHistoryNewestFirst() {
        repository.save(sub("STUDENT", 7L, 5L));
        repository.save(sub("STUDENT", 7L, 5L));
        repository.save(sub("STUDENT", 8L, 5L));

        List<Submission> history =
            repository.findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(7L, 5L);
        assertEquals(2, history.size());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=SubmissionRepositoryTest`
Expected: FAIL — `findFiltered(...)` 3-arg-plus-pageable and the history finder do not exist.

- [ ] **Step 3: Update the repository**

In `SubmissionRepository.java`, replace the `findFiltered` method with a `source`-aware version and add the history finder. The new `findFiltered`:

```java
    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
              AND (:source IS NULL OR source = :source)
              AND is_deleted = false
            ORDER BY created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
              AND (:source IS NULL OR source = :source)
              AND is_deleted = false
            """,
            nativeQuery = true)
    Page<Submission> findFiltered(
            @Param("exerciseId") Long exerciseId,
            @Param("studentName") String studentName,
            @Param("source") String source,
            Pageable pageable);

    List<Submission> findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(
            Long userId, Long exerciseId);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=SubmissionRepositoryTest`
Expected: PASS. (This breaks the existing `SubmissionService.list` call — fixed in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java \
        backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java
git commit -m "feat(submission): add source filter and student-history finders to repository"
```

---

## Task 6: Tutor submission list — source filter (default IMPORT)

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java:73-87`
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionController.java:36-43`
- Test: `backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java`

**Interfaces:**
- Consumes: `findFiltered(exerciseId, studentName, source, pageable)` from Task 5.
- Produces: `SubmissionService.list(Long exerciseId, String studentName, String source, int page, int size)`; `GET /v1/submissions?source=IMPORT|STUDENT` (defaults `IMPORT`).

- [ ] **Step 1: Write the failing test**

Add to `SubmissionControllerTest.java` (reuse its existing seeding helpers; adjust names to match the file). Add a test that seeds one STUDENT and one IMPORT submission and asserts the default list excludes STUDENT:

```java
    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void list_defaultsToImportSource_excludesStudentSubmissions() throws Exception {
        // Insert a STUDENT-source submission directly
        jdbcTemplate.update(
            "INSERT INTO submissions (exercise_id, graded_version_id, student_name, " +
            "exercise_type, answer_data, export_timestamp, source, user_id, auto_score) " +
            "VALUES (?,?,?,?,?,?,?,?,?)",
            seededExerciseId, seededVersionId, "Bob", "PYTHON", "code",
            java.sql.Timestamp.valueOf(java.time.LocalDateTime.now()), "STUDENT", studentId, 100);

        mockMvc.perform(get("/v1/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").isEmpty());

        mockMvc.perform(get("/v1/submissions").param("source", "STUDENT"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").exists());
    }
```

> Note for implementer: adapt `seededExerciseId`, `seededVersionId`, `studentId` to the field names already present in `SubmissionControllerTest`. If the test lacks a student user, insert one via `jdbcTemplate` mirroring `StudentExerciseControllerTest.seed()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=SubmissionControllerTest`
Expected: FAIL — compile error (`list` signature) and/or STUDENT row appears in default list.

- [ ] **Step 3: Update service and controller**

In `SubmissionService.list`, change the signature and pass `source`:

```java
    public PageResponse<SubmissionListItemDto> list(Long exerciseId, String studentName,
                                                     String source, int page, int size) {
        Page<Submission> submissionPage = submissionRepository.findFiltered(
            exerciseId,
            (studentName != null && studentName.isBlank()) ? null : studentName,
            (source != null && source.isBlank()) ? null : source,
            PageRequest.of(page, size));

        List<Long> exerciseIds = submissionPage.map(Submission::getExerciseId).toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        Page<SubmissionListItemDto> dtoPage = submissionPage.map(sub ->
            SubmissionListItemDto.of(sub, titleMap.getOrDefault(sub.getExerciseId(), "Unknown")));
        return PageResponse.of(dtoPage);
    }
```

In `SubmissionController.list`, add the `source` param defaulting to `IMPORT`:

```java
    @GetMapping
    public ResponseEntity<PageResponse<SubmissionListItemDto>> list(
            @RequestParam(required = false) Long exerciseId,
            @RequestParam(required = false) String studentName,
            @RequestParam(defaultValue = "IMPORT") String source,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(submissionService.list(exerciseId, studentName, source, page, size));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=SubmissionControllerTest`
Expected: PASS (including pre-existing list tests — their seeded data is IMPORT source).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/SubmissionService.java \
        backend/src/main/java/com/platform/exercise/submission/SubmissionController.java \
        backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java
git commit -m "feat(submission): filter tutor submission list by source, default IMPORT"
```

---

## Task 7: Student submission service — grade, persist, history

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/student/SubmitRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/student/SubmitResultDto.java`
- Create: `backend/src/main/java/com/platform/exercise/student/SubmissionHistoryItemDto.java`
- Create: `backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java`
- Test: `backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java`

**Interfaces:**
- Consumes: `BlocklyGrader.grade`, `PythonGrader.grade`, `ExerciseRepository.findByIdAndDeletedFalse`, `ExerciseVersionRepository.findById`, `SubmissionRepository.save`, `SubmissionRepository.findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc`.
- Produces:
  - `record SubmitRequest(@NotBlank String answerData, String workspaceXml)`
  - `record SubmitResultDto(Long submissionId, boolean showResult, BigDecimal score, Boolean passed)`
  - `record SubmissionHistoryItemDto(Long submissionId, LocalDateTime createdAt, boolean showResult, BigDecimal score, Boolean passed)`
  - `StudentSubmissionService.submit(Long userId, String studentName, Long exerciseId, SubmitRequest req) -> SubmitResultDto`
  - `StudentSubmissionService.history(Long userId, Long exerciseId) -> List<SubmissionHistoryItemDto>`
- A submission "passes" when `score != null && score.compareTo(BigDecimal.valueOf(100)) >= 0`. `showResult` reads `config.showResult` (default `true` when absent). When `showResult` is false, `score` and `passed` are `null` in the response (but stored on the row).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java`:

```java
package com.platform.exercise.student;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.grading.BlocklyGrader;
import com.platform.exercise.grading.PythonGrader;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class StudentSubmissionServiceTest {

    SubmissionRepository submissionRepo;
    ExerciseRepository exerciseRepo;
    ExerciseVersionRepository versionRepo;
    BlocklyGrader blocklyGrader;
    PythonGrader pythonGrader;
    StudentSubmissionService service;

    @BeforeEach
    void setUp() {
        submissionRepo = mock(SubmissionRepository.class);
        exerciseRepo = mock(ExerciseRepository.class);
        versionRepo = mock(ExerciseVersionRepository.class);
        blocklyGrader = mock(BlocklyGrader.class);
        pythonGrader = mock(PythonGrader.class);
        service = new StudentSubmissionService(submissionRepo, exerciseRepo, versionRepo,
            blocklyGrader, pythonGrader, new ObjectMapper());
        when(submissionRepo.save(any())).thenAnswer(inv -> {
            Submission s = inv.getArgument(0);
            s.setId(123L);
            return s;
        });
    }

    private void stubExercise(String configJson) {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCurrentVersionId(9L);
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(ex));
        ExerciseVersion v = new ExerciseVersion();
        v.setId(9L);
        v.setVersionNumber(1);
        v.setConfig(configJson);
        when(versionRepo.findById(9L)).thenReturn(Optional.of(v));
        when(pythonGrader.grade(any(), any()))
            .thenReturn(new PythonGrader.Result(BigDecimal.valueOf(100), "{}"));
    }

    @Test
    void submit_showResultTrue_returnsScoreAndPassed_andPersistsStudentSource() {
        stubExercise("{\"showResult\":true,\"testCases\":[]}");
        SubmitResultDto result = service.submit(7L, "Alice", 2L,
            new SubmitRequest("print(1)", null));

        assertTrue(result.showResult());
        assertEquals(0, BigDecimal.valueOf(100).compareTo(result.score()));
        assertTrue(result.passed());
        verify(submissionRepo).save(argThat(s ->
            "STUDENT".equals(s.getSource()) && s.getUserId().equals(7L)
                && "Alice".equals(s.getStudentName())
                && s.getAutoScore() != null));
    }

    @Test
    void submit_showResultFalse_hidesScoreButStillStoresIt() {
        stubExercise("{\"showResult\":false,\"testCases\":[]}");
        SubmitResultDto result = service.submit(7L, "Alice", 2L,
            new SubmitRequest("print(1)", null));

        assertFalse(result.showResult());
        assertNull(result.score());
        assertNull(result.passed());
        verify(submissionRepo).save(argThat(s -> s.getAutoScore() != null));
    }

    @Test
    void submit_showResultAbsent_defaultsToTrue() {
        stubExercise("{\"testCases\":[]}");
        SubmitResultDto result = service.submit(7L, "Alice", 2L,
            new SubmitRequest("print(1)", null));
        assertTrue(result.showResult());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=StudentSubmissionServiceTest`
Expected: FAIL — service and DTOs do not exist.

- [ ] **Step 3: Create DTOs and service**

`SubmitRequest.java`:

```java
package com.platform.exercise.student;

import jakarta.validation.constraints.NotBlank;

public record SubmitRequest(@NotBlank String answerData, String workspaceXml) {}
```

`SubmitResultDto.java`:

```java
package com.platform.exercise.student;

import java.math.BigDecimal;

public record SubmitResultDto(Long submissionId, boolean showResult,
                              BigDecimal score, Boolean passed) {}
```

`SubmissionHistoryItemDto.java`:

```java
package com.platform.exercise.student;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SubmissionHistoryItemDto(Long submissionId, LocalDateTime createdAt,
                                       boolean showResult, BigDecimal score, Boolean passed) {}
```

`StudentSubmissionService.java`:

```java
package com.platform.exercise.student;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.grading.BlocklyGrader;
import com.platform.exercise.grading.PythonGrader;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class StudentSubmissionService {

    private static final BigDecimal PASS_THRESHOLD = BigDecimal.valueOf(100);

    private final SubmissionRepository submissionRepository;
    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final BlocklyGrader blocklyGrader;
    private final PythonGrader pythonGrader;
    private final ObjectMapper objectMapper;

    @Transactional
    public SubmitResultDto submit(Long userId, String studentName, Long exerciseId, SubmitRequest req) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
            .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));

        String type = exercise.getType().name();
        BigDecimal autoScore;
        String autoGradeDetails;
        if ("BLOCKLY".equals(type)) {
            BlocklyGrader.Result gr = blocklyGrader.grade(req.answerData(), version.getConfig());
            autoScore = gr.autoScore();
            autoGradeDetails = gr.autoGradeDetailsJson();
        } else {
            PythonGrader.Result gr = pythonGrader.grade(req.answerData(), version.getConfig());
            autoScore = gr.autoScore();
            autoGradeDetails = gr.autoGradeDetailsJson();
        }

        Submission sub = new Submission();
        sub.setExerciseId(exerciseId);
        sub.setGradedVersionId(version.getId());
        sub.setStudentName(studentName);
        sub.setExerciseType(type);
        sub.setAnswerData(req.answerData());
        sub.setWorkspaceXml(req.workspaceXml());
        sub.setExportTimestamp(LocalDateTime.now());
        sub.setVersionMismatch(false);
        sub.setStudentVersionNumber(version.getVersionNumber());
        sub.setAutoScore(autoScore);
        sub.setAutoGradeDetails(autoGradeDetails);
        sub.setSource("STUDENT");
        sub.setUserId(userId);
        Submission saved = submissionRepository.save(sub);

        boolean showResult = showResult(version.getConfig());
        return new SubmitResultDto(
            saved.getId(),
            showResult,
            showResult ? autoScore : null,
            showResult ? passed(autoScore) : null);
    }

    @Transactional(readOnly = true)
    public List<SubmissionHistoryItemDto> history(Long userId, Long exerciseId) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
            .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        boolean showResult = exercise.getCurrentVersionId() != null
            && versionRepository.findById(exercise.getCurrentVersionId())
                .map(v -> showResult(v.getConfig())).orElse(true);

        return submissionRepository
            .findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(userId, exerciseId)
            .stream()
            .map(s -> new SubmissionHistoryItemDto(
                s.getId(), s.getCreatedAt(), showResult,
                showResult ? s.getAutoScore() : null,
                showResult ? passed(s.getAutoScore()) : null))
            .toList();
    }

    private boolean passed(BigDecimal score) {
        return score != null && score.compareTo(PASS_THRESHOLD) >= 0;
    }

    private boolean showResult(String configJson) {
        try {
            JsonNode config = objectMapper.readTree(configJson);
            if (config.isTextual()) config = objectMapper.readTree(config.asText());
            JsonNode node = config.get("showResult");
            return node == null || node.asBoolean(true);
        } catch (Exception e) {
            return true;
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=StudentSubmissionServiceTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/SubmitRequest.java \
        backend/src/main/java/com/platform/exercise/student/SubmitResultDto.java \
        backend/src/main/java/com/platform/exercise/student/SubmissionHistoryItemDto.java \
        backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java \
        backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java
git commit -m "feat(student): grade and persist student submissions with showResult gating"
```

---

## Task 8: Student practice controller — draft + submit + history endpoints

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/student/StudentSubmissionController.java`
- Test: `backend/src/test/java/com/platform/exercise/student/StudentSubmissionControllerTest.java`

**Interfaces:**
- Consumes: `StudentDraftService`, `StudentSubmissionService`, `UserRepository`.
- Produces these `STUDENT`-role endpoints (all under `/v1/student/exercises/{exerciseId}`):
  - `GET /draft` → `200` `DraftDto` or `204` when none.
  - `PUT /draft` (body `SaveDraftRequest`) → `200` `DraftDto`.
  - `POST /submissions` (body `SubmitRequest`) → `200` `SubmitResultDto`.
  - `GET /submissions` → `200` `List<SubmissionHistoryItemDto>` (own history).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/student/StudentSubmissionControllerTest.java`. Reuse the seeding style from `StudentExerciseControllerTest` (copy the `seed()` helper that creates `student1`, a published Python exercise, and category):

```java
package com.platform.exercise.student;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentSubmissionControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JdbcTemplate jdbcTemplate;

    Long studentId;
    Long pythonExId;

    @BeforeEach
    void seed() {
        User student = new User();
        student.setUsername("student1");
        student.setDisplayName("Alice");
        student.setPasswordHash(passwordEncoder.encode("pass"));
        student.setRole(Role.STUDENT);
        student.setStatus(UserStatus.ACTIVE);
        studentId = userRepository.save(student).getId();

        jdbcTemplate.update(
            "INSERT INTO exercises (title, description, type, difficulty, status, created_by) " +
            "VALUES (?,?,?,?,?,?)",
            "FizzBuzz", "d", "PYTHON", "EASY", "PUBLISHED", studentId);
        pythonExId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update(
            "INSERT INTO exercise_versions (exercise_id, version_number, title, description, difficulty, hints, config) " +
            "VALUES (?,?,?,?,?,?,?)",
            pythonExId, 1, "FizzBuzz", "d", "EASY", null,
            "{\"showResult\":true,\"starterCode\":\"x=1\",\"timeLimitSeconds\":5," +
            "\"testCases\":[{\"input\":\"print(1)\",\"expectedOutput\":\"1\",\"visible\":true}]}");
        Long verId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update("UPDATE exercises SET current_version_id=? WHERE id=?", verId, pythonExId);
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void getDraft_whenNone_returns204() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/" + pythonExId + "/draft"))
            .andExpect(status().isNoContent());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void putThenGetDraft_roundTrips() throws Exception {
        mockMvc.perform(put("/v1/student/exercises/" + pythonExId + "/draft")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"answerData\":\"print(42)\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.answerData").value("print(42)"));

        mockMvc.perform(get("/v1/student/exercises/" + pythonExId + "/draft"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.answerData").value("print(42)"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void submit_returnsScoreAndPassed_andAppearsInHistory() throws Exception {
        mockMvc.perform(post("/v1/student/exercises/" + pythonExId + "/submissions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"answerData\":\"print(1)\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissionId").exists())
            .andExpect(jsonPath("$.showResult").value(true));

        mockMvc.perform(get("/v1/student/exercises/" + pythonExId + "/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void submit_blankAnswer_returns400() throws Exception {
        mockMvc.perform(post("/v1/student/exercises/" + pythonExId + "/submissions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"answerData\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=StudentSubmissionControllerTest`
Expected: FAIL — controller endpoints return 404 / do not exist.

- [ ] **Step 3: Create the controller**

`StudentSubmissionController.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/student/exercises/{exerciseId}")
@RequiredArgsConstructor
@PreAuthorize("hasRole('STUDENT')")
public class StudentSubmissionController {

    private final StudentDraftService draftService;
    private final StudentSubmissionService submissionService;
    private final UserRepository userRepository;

    @GetMapping("/draft")
    public ResponseEntity<DraftDto> getDraft(@PathVariable Long exerciseId,
                                             Authentication authentication) {
        DraftDto draft = draftService.getDraft(currentUser(authentication).getId(), exerciseId);
        return draft == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(draft);
    }

    @PutMapping("/draft")
    public ResponseEntity<DraftDto> saveDraft(@PathVariable Long exerciseId,
                                              @RequestBody SaveDraftRequest req,
                                              Authentication authentication) {
        return ResponseEntity.ok(
            draftService.saveDraft(currentUser(authentication).getId(), exerciseId, req));
    }

    @PostMapping("/submissions")
    public ResponseEntity<SubmitResultDto> submit(@PathVariable Long exerciseId,
                                                  @RequestBody @Valid SubmitRequest req,
                                                  Authentication authentication) {
        User user = currentUser(authentication);
        String studentName = user.getDisplayName() != null && !user.getDisplayName().isBlank()
            ? user.getDisplayName() : user.getUsername();
        return ResponseEntity.ok(
            submissionService.submit(user.getId(), studentName, exerciseId, req));
    }

    @GetMapping("/submissions")
    public ResponseEntity<List<SubmissionHistoryItemDto>> history(@PathVariable Long exerciseId,
                                                                  Authentication authentication) {
        return ResponseEntity.ok(
            submissionService.history(currentUser(authentication).getId(), exerciseId));
    }

    private User currentUser(Authentication authentication) {
        if (authentication.getPrincipal() instanceof User user) return user;
        return userRepository.findByUsername(authentication.getName())
            .orElseThrow(() -> new IllegalStateException("Authenticated user not found"));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=StudentSubmissionControllerTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentSubmissionController.java \
        backend/src/test/java/com/platform/exercise/student/StudentSubmissionControllerTest.java
git commit -m "feat(student): add draft, submit, and submission-history endpoints"
```

---

## Task 9: Submit rate limit (20/min per user)

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java`
- Test: `backend/src/test/java/com/platform/exercise/security/RateLimitFilterTest.java`

**Interfaces:**
- Produces: `POST` to a URI matching `(/api)?/v1/student/exercises/{id}/submissions` is limited to 20/min per authenticated user; the 21st returns `429` with `RATE_LIMITED`.

- [ ] **Step 1: Write the failing test**

Add to `RateLimitFilterTest.java` a test mirroring the existing import-limit test. Inspect the file first for its helper style (how it builds the filter, a valid Bearer token, and asserts status). Then add:

```java
    @Test
    void submitEndpoint_allows20ThenBlocks21st() throws Exception {
        String token = validTokenForUser("7");
        for (int i = 0; i < 20; i++) {
            MockHttpServletResponse ok = new MockHttpServletResponse();
            MockHttpServletRequest req = new MockHttpServletRequest("POST",
                "/v1/student/exercises/5/submissions");
            req.addHeader("Authorization", "Bearer " + token);
            filter.doFilter(req, ok, new MockFilterChain());
            assertNotEquals(429, ok.getStatus());
        }
        MockHttpServletResponse blocked = new MockHttpServletResponse();
        MockHttpServletRequest req = new MockHttpServletRequest("POST",
            "/v1/student/exercises/5/submissions");
        req.addHeader("Authorization", "Bearer " + token);
        filter.doFilter(req, blocked, new MockFilterChain());
        assertEquals(429, blocked.getStatus());
    }
```

> Note for implementer: reuse whatever token/filter setup the existing import test in this file already uses (`validTokenForUser` is a placeholder for that helper — match the file's actual approach, e.g. a real `JwtUtil`-issued token or a mocked `jwtUtil.parseToken`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=RateLimitFilterTest`
Expected: FAIL — the 21st request is not blocked (no submit limit yet).

- [ ] **Step 3: Add the submit limit**

In `RateLimitFilter.doFilterInternal`, after the import block and before `chain.doFilter(...)`:

```java
        // Student submit: 20/min per user (sandboxed grading is expensive)
        boolean isSubmitEndpoint = uri.matches("(/api)?/v1/student/exercises/\\d+/submissions");
        if ("POST".equals(method) && isSubmitEndpoint) {
            String userId = extractUserIdFromToken(request);
            if (userId != null) {
                Bucket bucket = buckets.get("submit:" + userId, k -> newBucket(20, 1));
                if (!bucket.tryConsume(1)) {
                    writeRateLimitResponse(response, "Submit rate limit exceeded. Try again in 1 minute.");
                    return;
                }
            }
        }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=RateLimitFilterTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java \
        backend/src/test/java/com/platform/exercise/security/RateLimitFilterTest.java
git commit -m "feat(security): rate-limit student submit to 20/min per user"
```

---

## Task 10: Frontend studentApi — draft/submit/history calls

**Files:**
- Modify: `frontend/src/api/studentApi.js`
- Test: `frontend/src/api/studentApi.test.js` (create)

**Interfaces:**
- Produces on `studentApi`:
  - `getDraft(id) -> Promise<DraftDto | null>` (null on 204)
  - `saveDraft(id, { answerData, workspaceXml }) -> Promise<DraftDto>`
  - `submit(id, { answerData, workspaceXml }) -> Promise<SubmitResultDto>`
  - `getSubmissionHistory(id) -> Promise<SubmissionHistoryItemDto[]>`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/studentApi.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axiosInstance from './axiosInstance';
import { studentApi } from './studentApi';

vi.mock('./axiosInstance');

describe('studentApi draft & submit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getDraft returns data on 200', async () => {
    axiosInstance.get.mockResolvedValue({ status: 200, data: { answerData: 'x' } });
    const res = await studentApi.getDraft(5);
    expect(axiosInstance.get).toHaveBeenCalledWith('/v1/student/exercises/5/draft', { validateStatus: expect.any(Function) });
    expect(res).toEqual({ answerData: 'x' });
  });

  it('getDraft returns null on 204', async () => {
    axiosInstance.get.mockResolvedValue({ status: 204, data: '' });
    expect(await studentApi.getDraft(5)).toBeNull();
  });

  it('saveDraft PUTs the body', async () => {
    axiosInstance.put.mockResolvedValue({ data: { answerData: 'y' } });
    const res = await studentApi.saveDraft(5, { answerData: 'y' });
    expect(axiosInstance.put).toHaveBeenCalledWith('/v1/student/exercises/5/draft', { answerData: 'y' });
    expect(res).toEqual({ answerData: 'y' });
  });

  it('submit POSTs the body', async () => {
    axiosInstance.post.mockResolvedValue({ data: { submissionId: 1, showResult: true, score: 100, passed: true } });
    const res = await studentApi.submit(5, { answerData: 'z' });
    expect(axiosInstance.post).toHaveBeenCalledWith('/v1/student/exercises/5/submissions', { answerData: 'z' });
    expect(res.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/api/studentApi.test.js`
Expected: FAIL — new methods are undefined.

- [ ] **Step 3: Extend studentApi**

Append to the `studentApi` object in `studentApi.js` (keep existing methods):

```javascript
  getDraft: (id) =>
    axiosInstance
      .get(`/v1/student/exercises/${id}/draft`, { validateStatus: (s) => s === 200 || s === 204 })
      .then((r) => (r.status === 204 ? null : r.data)),

  saveDraft: (id, body) =>
    axiosInstance.put(`/v1/student/exercises/${id}/draft`, body).then((r) => r.data),

  submit: (id, body) =>
    axiosInstance.post(`/v1/student/exercises/${id}/submissions`, body).then((r) => r.data),

  getSubmissionHistory: (id) =>
    axiosInstance.get(`/v1/student/exercises/${id}/submissions`).then((r) => r.data),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/api/studentApi.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/studentApi.js frontend/src/api/studentApi.test.js
git commit -m "feat(student): add draft/submit/history API client methods"
```

---

## Task 11: Python practice page — Save, Submit, draft restore, result modal

**Files:**
- Modify: `frontend/src/pages/student/PythonPracticePage.jsx`
- Test: `frontend/src/pages/student/PythonPracticePage.test.jsx`

**Interfaces:**
- Consumes: `studentApi.getDraft`, `studentApi.saveDraft`, `studentApi.submit`.
- Behaviour: on mount, load draft and replace editor code if present. "Save" calls `saveDraft({ answerData: code })`. "Submit" calls `submit({ answerData: code })`; if `showResult` show a modal with score + 通過/未通過, else a "已提交" toast/banner. Submit hidden when `config.showResult === false`? No — submit is always available; only the *result* is gated. Show Submit button whenever practicing.

- [ ] **Step 1: Write the failing test**

Inspect the existing `PythonPracticePage.test.jsx` for its render setup (router wrapper, mocks). Add a new test file section / cases. Example additions:

```javascript
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PythonPracticePage from './PythonPracticePage';
import { studentApi } from '../../api/studentApi';

vi.mock('../../api/studentApi');
vi.mock('@monaco-editor/react', () => ({
  default: ({ value }) => <textarea data-testid="editor" defaultValue={value} readOnly />,
}));

const exercise = {
  id: 5, title: 'FizzBuzz', type: 'PYTHON',
  version: { versionNumber: 1, description: 'd', hints: [],
    config: { starterCode: 'x=1', visibleTestCases: [], showResult: true } },
};

describe('PythonPracticePage submit/draft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads draft on mount and shows Submit/Save buttons', async () => {
    studentApi.getDraft.mockResolvedValue({ answerData: 'print(99)' });
    render(<MemoryRouter><PythonPracticePage exercise={exercise} /></MemoryRouter>);
    await waitFor(() => expect(studentApi.getDraft).toHaveBeenCalledWith(5));
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
  });

  it('submit shows result modal when showResult true', async () => {
    studentApi.getDraft.mockResolvedValue(null);
    studentApi.submit.mockResolvedValue({ submissionId: 1, showResult: true, score: 100, passed: true });
    render(<MemoryRouter><PythonPracticePage exercise={exercise} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(studentApi.submit).toHaveBeenCalledWith(5, expect.objectContaining({ answerData: expect.any(String) })));
    expect(await screen.findByText(/100/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/pages/student/PythonPracticePage.test.jsx`
Expected: FAIL — Save/Submit buttons and draft load not implemented.

- [ ] **Step 3: Implement in PythonPracticePage.jsx**

Add imports and state near the top of the component:

```javascript
import { studentApi } from '../../api/studentApi';
```

Add state (next to existing `useState` calls):

```javascript
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null); // { showResult, score, passed }
  const [savedToast, setSavedToast] = useState(false);
```

Add a draft-load effect (after the worker effect):

```javascript
  useEffect(() => {
    studentApi.getDraft(exercise.id)
      .then(d => { if (d && d.answerData != null) setCode(d.answerData); })
      .catch(() => { /* no draft / ignore */ });
  }, [exercise.id]);
```

Add handlers:

```javascript
  async function handleSaveDraft() {
    setSaving(true);
    try {
      await studentApi.saveDraft(exercise.id, { answerData: code });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await studentApi.submit(exercise.id, { answerData: code });
      setSubmitResult(res);
    } finally {
      setSubmitting(false);
    }
  }
```

In the button row (next to Run), add Save and Submit buttons:

```javascript
        <button onClick={handleSaveDraft} disabled={saving}
          style={{ border: '1px solid #1976d2', color: '#1976d2', background: '#fff', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={handleSubmit} disabled={submitting}
          style={{ background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
```

Add the saved toast and result modal before the closing `</div>` of the component:

```javascript
      {savedToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#323232', color: '#fff', padding: '10px 20px', borderRadius: 4, zIndex: 1100 }}>
          已保存
        </div>
      )}

      {submitResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320, textAlign: 'center' }}>
            {submitResult.showResult ? (
              <>
                <h2 style={{ marginTop: 0 }}>
                  {submitResult.passed ? '✅ 通過' : '❌ 未通過'}
                </h2>
                <p style={{ fontSize: 32, margin: '8px 0' }}>{submitResult.score}</p>
              </>
            ) : (
              <h2 style={{ marginTop: 0 }}>已提交</h2>
            )}
            <button onClick={() => setSubmitResult(null)}
              style={{ marginTop: 16, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/pages/student/PythonPracticePage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/PythonPracticePage.jsx \
        frontend/src/pages/student/PythonPracticePage.test.jsx
git commit -m "feat(student): add save draft and submit to Python practice page"
```

---

## Task 12: Blockly practice page — Save, Submit, draft restore, result modal

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx`
- Test: `frontend/src/pages/student/BlocklyPracticePage.test.jsx`

**Interfaces:**
- Consumes: `studentApi.getDraft`, `studentApi.saveDraft`, `studentApi.submit`.
- Behaviour: draft restore loads `workspaceXml` into the Blockly workspace; "Save" calls `saveDraft({ workspaceXml, answerData: <JS code> })`; "Submit" calls `submit({ answerData: <JS code>, workspaceXml })`. Blockly grading is server-side via Rhino on the JS produced by `javascriptGenerator`. Result modal identical to Task 11.

- [ ] **Step 1: Write the failing test**

Inspect existing `BlocklyPracticePage.test.jsx` setup (it mocks Blockly). Add cases asserting Save/Submit buttons render and that submit shows the result modal. Mirror the Python test structure:

```javascript
  it('renders Save and Submit buttons and submits', async () => {
    studentApi.getDraft.mockResolvedValue(null);
    studentApi.submit.mockResolvedValue({ submissionId: 1, showResult: true, score: 100, passed: true });
    render(<MemoryRouter><BlocklyPracticePage exercise={blocklyExercise} /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(studentApi.submit).toHaveBeenCalledWith(blocklyExercise.id, expect.any(Object)));
    expect(await screen.findByText(/通過|100/)).toBeInTheDocument();
  });
```

> Note for implementer: reuse the existing test's `blocklyExercise` fixture and Blockly mock. Ensure `studentApi` is mocked via `vi.mock('../../api/studentApi')`. Set `config.showResult: true` in the fixture's `version.config`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/pages/student/BlocklyPracticePage.test.jsx`
Expected: FAIL — buttons/handlers missing.

- [ ] **Step 3: Implement in BlocklyPracticePage.jsx**

Add import:

```javascript
import { studentApi } from '../../api/studentApi';
```

Add state alongside existing `useState` calls:

```javascript
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [savedToast, setSavedToast] = useState(false);
```

Add a draft-restore effect after the workspace-injection effect (it must run after `workspaceRef.current` exists):

```javascript
  useEffect(() => {
    studentApi.getDraft(exercise.id)
      .then(d => {
        if (d && d.workspaceXml && workspaceRef.current) {
          const dom = Blockly.utils.xml.textToDom(d.workspaceXml);
          Blockly.Xml.domToWorkspace(dom, workspaceRef.current);
        }
      })
      .catch(() => { /* ignore */ });
  }, [exercise.id]);
```

Add handlers:

```javascript
  function currentJsCode() {
    return workspaceRef.current
      ? javascriptGenerator.workspaceToCode(workspaceRef.current) : '';
  }
  function currentWorkspaceXml() {
    return workspaceRef.current
      ? Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspaceRef.current)) : '';
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      await studentApi.saveDraft(exercise.id,
        { answerData: currentJsCode(), workspaceXml: currentWorkspaceXml() });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await studentApi.submit(exercise.id,
        { answerData: currentJsCode(), workspaceXml: currentWorkspaceXml() });
      setSubmitResult(res);
    } finally {
      setSubmitting(false);
    }
  }
```

Add Save and Submit buttons in the button row (next to Run) and the saved toast + result modal markup — identical to Task 11's snippets (Save: outlined blue; Submit: `#7b1fa2`; modal shows pass/score or "已提交").

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/pages/student/BlocklyPracticePage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx \
        frontend/src/pages/student/BlocklyPracticePage.test.jsx
git commit -m "feat(student): add save draft and submit to Blockly practice page"
```

---

## Task 13: Tutor exercise form — showResult toggle

**Files:**
- Modify: `frontend/src/pages/tutor/ExerciseFormPage.jsx`
- Test: `frontend/src/pages/tutor/ExerciseFormPage.test.jsx` (create if absent)

**Interfaces:**
- Behaviour: a single checkbox **「即時提示是否做對」** (default checked) that writes `showResult` onto the active config object (`blocklyConfig` or `pythonConfig`). On load of an existing exercise, the checkbox reflects `config.showResult !== false`. On save, `config.showResult` is included in the payload.

- [ ] **Step 1: Write the failing test**

Create/extend `frontend/src/pages/tutor/ExerciseFormPage.test.jsx`. Inspect the existing form test (if any) for render/mocks. Add:

```javascript
  it('includes showResult in the create payload, default true', async () => {
    // render the form, fill required fields for a PYTHON exercise, submit
    // assert exerciseApi.create was called with config.showResult === true
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ showResult: true }) }));
  });

  it('unchecking the toggle sends showResult false', async () => {
    // render, uncheck the "即時提示是否做對" checkbox, submit
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ config: expect.objectContaining({ showResult: false }) }));
  });
```

> Note for implementer: model this test on the existing tutor form/management tests for render + API mock setup. Use `getByRole('checkbox', { name: /即時提示是否做對/ })`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/pages/tutor/ExerciseFormPage.test.jsx`
Expected: FAIL — checkbox absent / `showResult` not in payload.

- [ ] **Step 3: Implement the toggle**

In `ExerciseFormPage.jsx`:

1. Add `showResult: true` to both `EMPTY_BLOCKLY_CONFIG` and `EMPTY_PYTHON_CONFIG` defaults.
2. Render a checkbox shared by both types (place it near the type-specific config section, inside the form):

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
            即時提示是否做對
          </label>
```

3. Because `handleSubmit` already builds `config` from the active config object (`const config = exerciseType === 'BLOCKLY' ? blocklyConfig : pythonConfig;`), `showResult` flows through automatically. Verify the loaded-exercise effect keeps `config.showResult` (the `setBlocklyConfig(ex.currentVersion.config ...)` lines already preserve unknown keys — no change needed, but if `showResult` is absent on legacy configs the checkbox defaults to checked via the `!== false` test).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/pages/tutor/ExerciseFormPage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/ExerciseFormPage.jsx \
        frontend/src/pages/tutor/ExerciseFormPage.test.jsx
git commit -m "feat(exercise): add show-result toggle to tutor exercise form"
```

---

## Task 14: Tutor submission list — source filter UI

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx`
- Modify: `frontend/src/api/submissionApi.js` (if it does not already forward arbitrary params)
- Test: `frontend/src/pages/tutor/SubmissionListPage.test.jsx`

**Interfaces:**
- Behaviour: a select control with options Imported (`IMPORT`, default) and Student (`STUDENT`), included as the `source` query param when listing submissions. Default load requests `source=IMPORT`.

- [ ] **Step 1: Write the failing test**

Inspect existing `SubmissionListPage.test.jsx` and `submissionApi.js`. Add a test asserting the default list call carries `source: 'IMPORT'` and that switching the control re-fetches with `source: 'STUDENT'`:

```javascript
  it('requests IMPORT source by default and STUDENT after switching', async () => {
    render(<MemoryRouter><SubmissionListPage /></MemoryRouter>);
    await waitFor(() => expect(submissionApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'IMPORT' })));

    fireEvent.change(screen.getByLabelText(/source/i), { target: { value: 'STUDENT' } });
    await waitFor(() => expect(submissionApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'STUDENT' })));
  });
```

> Note for implementer: match the actual `submissionApi.list` signature in the repo (it may take a params object or positional args). Adapt the assertion and the source control's label accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- src/pages/tutor/SubmissionListPage.test.jsx`
Expected: FAIL — no source control; default param missing.

- [ ] **Step 3: Implement the source filter**

In `SubmissionListPage.jsx`:
1. Add `const [source, setSource] = useState('IMPORT');`.
2. Include `source` in the params passed to `submissionApi.list(...)` and add `source` to the effect's dependency array so changing it re-fetches.
3. Render the control near the existing filters:

```jsx
          <label>
            Source:
            <select value={source} onChange={e => setSource(e.target.value)} style={{ marginLeft: 8 }}>
              <option value="IMPORT">Imported</option>
              <option value="STUDENT">Student</option>
            </select>
          </label>
```

4. If `submissionApi.list` does not already forward a `source` param, update it in `submissionApi.js` to include `source` in the request `params`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- src/pages/tutor/SubmissionListPage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionListPage.jsx frontend/src/api/submissionApi.js \
        frontend/src/pages/tutor/SubmissionListPage.test.jsx
git commit -m "feat(submission): add source filter to tutor submission list"
```

---

## Task 15: Full regression + deploy

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && mvn test`
Expected: BUILD SUCCESS, all tests green. If `SubmissionControllerTest` pre-existing list tests fail, confirm their seeded submissions are `IMPORT` source (the default) and adjust seeds if they relied on the old 2-arg `findFiltered`.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: all test files pass.

- [ ] **Step 3: Rebuild and redeploy changed containers**

Per project convention (deploy after development), rebuild and redeploy:

Run: `docker compose up -d --build`
Expected: backend and frontend containers rebuilt and healthy.

- [ ] **Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: finalize student draft & submit feature" || echo "nothing to commit"
```
