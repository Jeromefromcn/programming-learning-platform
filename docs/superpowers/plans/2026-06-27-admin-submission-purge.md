# Admin Submission Purge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a SUPER_ADMIN-only "Data Management" page (`/admin/data`) that bulk-deletes submission records created before a given date, with optional exercise and source filters, supporting both soft-delete and hard-delete modes.

**Architecture:** Three new backend classes (`SubmissionPurgeController`, `SubmissionPurgeService`, plus three repository methods) handle the purge API. A new React page (`DataManagementPage`) provides a filter form → preview count → confirm → purge flow. The `data` section is registered in `sectionConfig.js` and `SettingsService` so it appears in the menu for SUPER_ADMIN.

**Tech Stack:** Java 25 · Spring Boot 3.5 · Spring Data JPA · JPQL · React 18 · Vitest · @testing-library/react

## Global Constraints

- No hard deletes on exercises, courses (submissions may be hard-deleted by admin explicitly)
- `SUPER_ADMIN > TUTOR > STUDENT` role hierarchy via Spring Security
- All backend tests use `@ActiveProfiles("test")` with H2
- No new dependencies; no Redis, Kafka, or extra infra
- Conventional Commits: `feat(submission): ...`, `test(submission): ...`

---

## File Map

| File | Action |
|------|--------|
| `backend/.../repository/SubmissionRepository.java` | Modify — add 3 purge query methods |
| `backend/.../repository/SubmissionRepositoryTest.java` | Modify — add purge query tests |
| `backend/.../submission/PurgeMode.java` | Create — enum SOFT / HARD |
| `backend/.../submission/PurgePreviewResponse.java` | Create — record `{ long count }` |
| `backend/.../submission/PurgeResultResponse.java` | Create — record `{ long deletedCount }` |
| `backend/.../submission/SubmissionPurgeService.java` | Create — preview + purge logic |
| `backend/.../submission/SubmissionPurgeServiceTest.java` | Create — Mockito unit tests |
| `backend/.../submission/SubmissionPurgeController.java` | Create — REST endpoints |
| `backend/.../submission/SubmissionPurgeControllerTest.java` | Create — MockMvc integration tests |
| `backend/.../settings/SettingsService.java` | Modify — add `data` to SUPER_ADMIN default config + validation |
| `frontend/src/components/sectionConfig.js` | Modify — add `data` entry + `getInitialPath` case |
| `frontend/src/components/sectionConfig.test.js` | Modify — update section count + SUPER_ADMIN assertions |
| `frontend/src/api/submissionApi.js` | Modify — add `previewPurge` + `purge` methods |
| `frontend/src/components/SectionRouter.jsx` | Modify — add `data` route |
| `frontend/src/pages/admin/DataManagementPage.jsx` | Create — purge form page |
| `frontend/src/pages/admin/DataManagementPage.test.jsx` | Create — component tests |

---

### Task 1: Backend — Repository purge query methods

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`
- Modify: `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java`

**Interfaces:**
- Produces:
  - `long countForPurge(LocalDateTime before, Long exerciseId, String source)`
  - `int softDeleteByFilters(LocalDateTime before, Long exerciseId, String source)`
  - `int hardDeleteByFilters(LocalDateTime before, Long exerciseId, String source)`

- [ ] **Step 1: Write the failing tests**

Add this import at top of `SubmissionRepositoryTest.java` (it already imports `LocalDateTime`):
```java
import java.time.LocalDate;
```

Add this helper and these tests inside `SubmissionRepositoryTest`:

```java
private Submission subWithDate(LocalDateTime createdAt, String source, String studentName) {
    Submission s = new Submission();
    s.setExerciseId(exerciseId);
    s.setGradedVersionId(gradedVersionId);
    s.setStudentName(studentName);
    s.setExerciseType("BLOCKLY");
    s.setAnswerData("{}");
    s.setExportTimestamp(LocalDateTime.now());
    s.setSource(source);
    s.setCreatedAt(createdAt);
    return s;
}

@Test
void countForPurge_returnsMatchingNonDeletedCount() {
    LocalDateTime old = LocalDateTime.of(2024, 1, 1, 0, 0);
    LocalDateTime recent = LocalDateTime.of(2025, 6, 1, 0, 0);
    LocalDateTime cutoff = LocalDateTime.of(2025, 1, 1, 0, 0);

    repository.save(subWithDate(old, "IMPORT", "Alice"));
    repository.save(subWithDate(old, "ONLINE", "Bob"));
    repository.save(subWithDate(recent, "IMPORT", "Carol"));

    assertEquals(2, repository.countForPurge(cutoff, null, null));
    assertEquals(1, repository.countForPurge(cutoff, null, "IMPORT"));
    assertEquals(0, repository.countForPurge(cutoff, null, "ONLINE_MISSING"));
}

@Test
void countForPurge_excludesAlreadyDeleted() {
    LocalDateTime old = LocalDateTime.of(2024, 1, 1, 0, 0);
    LocalDateTime cutoff = LocalDateTime.of(2025, 1, 1, 0, 0);

    Submission s = subWithDate(old, "IMPORT", "Dave");
    s.setDeleted(true);
    repository.save(s);

    assertEquals(0, repository.countForPurge(cutoff, null, null));
}

@Test
void softDeleteByFilters_marksMatchingRowsDeleted() {
    LocalDateTime old = LocalDateTime.of(2024, 3, 1, 0, 0);
    LocalDateTime recent = LocalDateTime.of(2025, 9, 1, 0, 0);
    LocalDateTime cutoff = LocalDateTime.of(2025, 1, 1, 0, 0);

    Submission s1 = repository.save(subWithDate(old, "IMPORT", "Eve"));
    Submission s2 = repository.save(subWithDate(recent, "IMPORT", "Frank"));

    int affected = repository.softDeleteByFilters(cutoff, null, null);

    assertEquals(1, affected);
    assertTrue(repository.findById(s1.getId()).map(Submission::isDeleted).orElse(false));
    assertFalse(repository.findById(s2.getId()).map(Submission::isDeleted).orElse(true));
}

@Test
void hardDeleteByFilters_permanentlyRemovesMatchingRows() {
    LocalDateTime old = LocalDateTime.of(2024, 6, 1, 0, 0);
    LocalDateTime recent = LocalDateTime.of(2025, 8, 1, 0, 0);
    LocalDateTime cutoff = LocalDateTime.of(2025, 1, 1, 0, 0);

    Submission s1 = repository.save(subWithDate(old, "ONLINE", "Grace"));
    Submission s2 = repository.save(subWithDate(recent, "ONLINE", "Hank"));

    int affected = repository.hardDeleteByFilters(cutoff, null, null);

    assertEquals(1, affected);
    assertFalse(repository.findById(s1.getId()).isPresent());
    assertTrue(repository.findById(s2.getId()).isPresent());
}
```

Also add these imports to `SubmissionRepositoryTest.java`:
```java
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && mvn test -pl . -Dtest="SubmissionRepositoryTest#countForPurge*+softDeleteByFilters*+hardDeleteByFilters*" -q 2>&1 | tail -20
```

Expected: compilation error — `countForPurge`, `softDeleteByFilters`, `hardDeleteByFilters` not found.

- [ ] **Step 3: Add the three query methods to SubmissionRepository**

Add these imports at the top of `SubmissionRepository.java` (already has `LocalDateTime`):
```java
// (no new imports needed — LocalDateTime, Query, Param, Modifying already available via existing imports)
```

Add these three methods to `SubmissionRepository` (after the existing methods):

```java
@Query("""
        SELECT COUNT(s) FROM Submission s
        WHERE s.createdAt < :before
          AND (:exerciseId IS NULL OR s.exerciseId = :exerciseId)
          AND (:source IS NULL OR s.source = :source)
          AND s.deleted = false
        """)
long countForPurge(@Param("before") LocalDateTime before,
                   @Param("exerciseId") Long exerciseId,
                   @Param("source") String source);

@Modifying
@Transactional
@Query("""
        UPDATE Submission s SET s.deleted = true
        WHERE s.createdAt < :before
          AND (:exerciseId IS NULL OR s.exerciseId = :exerciseId)
          AND (:source IS NULL OR s.source = :source)
          AND s.deleted = false
        """)
int softDeleteByFilters(@Param("before") LocalDateTime before,
                        @Param("exerciseId") Long exerciseId,
                        @Param("source") String source);

@Modifying
@Transactional
@Query("""
        DELETE FROM Submission s
        WHERE s.createdAt < :before
          AND (:exerciseId IS NULL OR s.exerciseId = :exerciseId)
          AND (:source IS NULL OR s.source = :source)
        """)
int hardDeleteByFilters(@Param("before") LocalDateTime before,
                        @Param("exerciseId") Long exerciseId,
                        @Param("source") String source);
```

Add these imports to `SubmissionRepository.java`:
```java
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && mvn test -pl . -Dtest="SubmissionRepositoryTest" -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS` with all `SubmissionRepositoryTest` tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java \
        backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java
git commit -m "feat(submission): add bulk purge query methods to SubmissionRepository"
```

---

### Task 2: Backend — Purge DTOs, enum, service, and unit test

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/submission/PurgeMode.java`
- Create: `backend/src/main/java/com/platform/exercise/submission/PurgePreviewResponse.java`
- Create: `backend/src/main/java/com/platform/exercise/submission/PurgeResultResponse.java`
- Create: `backend/src/main/java/com/platform/exercise/submission/SubmissionPurgeService.java`
- Create: `backend/src/test/java/com/platform/exercise/submission/SubmissionPurgeServiceTest.java`

**Interfaces:**
- Consumes: `SubmissionRepository.countForPurge`, `.softDeleteByFilters`, `.hardDeleteByFilters`
- Produces:
  - `SubmissionPurgeService.preview(LocalDateTime before, Long exerciseId, String source): PurgePreviewResponse`
  - `SubmissionPurgeService.purge(LocalDateTime before, Long exerciseId, String source, PurgeMode mode): PurgeResultResponse`

- [ ] **Step 1: Write the failing unit test**

Create `backend/src/test/java/com/platform/exercise/submission/SubmissionPurgeServiceTest.java`:

```java
package com.platform.exercise.submission;

import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SubmissionPurgeServiceTest {

    @Mock SubmissionRepository submissionRepository;
    @InjectMocks SubmissionPurgeService purgeService;

    private static final LocalDateTime CUTOFF = LocalDateTime.of(2025, 1, 1, 0, 0);

    @Test
    void preview_returnsCountFromRepository() {
        when(submissionRepository.countForPurge(CUTOFF, null, null)).thenReturn(42L);

        PurgePreviewResponse result = purgeService.preview(CUTOFF, null, null);

        assertThat(result.count()).isEqualTo(42L);
        verify(submissionRepository).countForPurge(CUTOFF, null, null);
    }

    @Test
    void preview_withFilters_passesFiltersToRepository() {
        when(submissionRepository.countForPurge(CUTOFF, 7L, "IMPORT")).thenReturn(3L);

        PurgePreviewResponse result = purgeService.preview(CUTOFF, 7L, "IMPORT");

        assertThat(result.count()).isEqualTo(3L);
    }

    @Test
    void purge_softMode_callsSoftDelete() {
        when(submissionRepository.softDeleteByFilters(CUTOFF, null, "ONLINE")).thenReturn(10);

        PurgeResultResponse result = purgeService.purge(CUTOFF, null, "ONLINE", PurgeMode.SOFT);

        assertThat(result.deletedCount()).isEqualTo(10L);
        verify(submissionRepository).softDeleteByFilters(CUTOFF, null, "ONLINE");
    }

    @Test
    void purge_hardMode_callsHardDelete() {
        when(submissionRepository.hardDeleteByFilters(CUTOFF, 5L, null)).thenReturn(7);

        PurgeResultResponse result = purgeService.purge(CUTOFF, 5L, null, PurgeMode.HARD);

        assertThat(result.deletedCount()).isEqualTo(7L);
        verify(submissionRepository).hardDeleteByFilters(CUTOFF, 5L, null);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && mvn test -pl . -Dtest="SubmissionPurgeServiceTest" -q 2>&1 | tail -10
```

Expected: compilation error — `PurgeMode`, `PurgePreviewResponse`, `PurgeResultResponse`, `SubmissionPurgeService` not found.

- [ ] **Step 3: Create the DTOs and enum**

Create `backend/src/main/java/com/platform/exercise/submission/PurgeMode.java`:
```java
package com.platform.exercise.submission;

public enum PurgeMode {
    SOFT, HARD
}
```

Create `backend/src/main/java/com/platform/exercise/submission/PurgePreviewResponse.java`:
```java
package com.platform.exercise.submission;

public record PurgePreviewResponse(long count) {}
```

Create `backend/src/main/java/com/platform/exercise/submission/PurgeResultResponse.java`:
```java
package com.platform.exercise.submission;

public record PurgeResultResponse(long deletedCount) {}
```

- [ ] **Step 4: Create SubmissionPurgeService**

Create `backend/src/main/java/com/platform/exercise/submission/SubmissionPurgeService.java`:
```java
package com.platform.exercise.submission;

import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class SubmissionPurgeService {

    private final SubmissionRepository submissionRepository;

    @Transactional(readOnly = true)
    public PurgePreviewResponse preview(LocalDateTime before, Long exerciseId, String source) {
        long count = submissionRepository.countForPurge(before, exerciseId, source);
        return new PurgePreviewResponse(count);
    }

    @Transactional
    public PurgeResultResponse purge(LocalDateTime before, Long exerciseId, String source, PurgeMode mode) {
        int affected = switch (mode) {
            case SOFT -> submissionRepository.softDeleteByFilters(before, exerciseId, source);
            case HARD -> submissionRepository.hardDeleteByFilters(before, exerciseId, source);
        };
        return new PurgeResultResponse(affected);
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && mvn test -pl . -Dtest="SubmissionPurgeServiceTest" -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/PurgeMode.java \
        backend/src/main/java/com/platform/exercise/submission/PurgePreviewResponse.java \
        backend/src/main/java/com/platform/exercise/submission/PurgeResultResponse.java \
        backend/src/main/java/com/platform/exercise/submission/SubmissionPurgeService.java \
        backend/src/test/java/com/platform/exercise/submission/SubmissionPurgeServiceTest.java
git commit -m "feat(submission): add SubmissionPurgeService with soft/hard delete modes"
```

---

### Task 3: Backend — Controller, integration test, and menu config update

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/submission/SubmissionPurgeController.java`
- Create: `backend/src/test/java/com/platform/exercise/submission/SubmissionPurgeControllerTest.java`
- Modify: `backend/src/main/java/com/platform/exercise/settings/SettingsService.java`

**Interfaces:**
- Consumes: `SubmissionPurgeService.preview(...)`, `SubmissionPurgeService.purge(...)`
- Produces:
  - `GET /api/v1/submissions/purge/preview?before=&exerciseId=&source=` → `{ count }`
  - `DELETE /api/v1/submissions/purge?before=&exerciseId=&source=&mode=` → `{ deletedCount }`

- [ ] **Step 1: Write the failing integration tests**

Create `backend/src/test/java/com/platform/exercise/submission/SubmissionPurgeControllerTest.java`:

```java
package com.platform.exercise.submission;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SubmissionPurgeControllerTest {

    @Autowired MockMvc mockMvc;
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
        tutor.setUsername("purge_tutor");
        tutor.setDisplayName("Purge Tutor");
        tutor.setPasswordHash(passwordEncoder.encode("pw"));
        tutor.setRole(User.Role.TUTOR);
        tutor.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(tutor);

        Exercise ex = new Exercise();
        ex.setTitle("Purge Test Exercise");
        ex.setDescription("desc");
        ex.setType(Exercise.ExerciseType.BLOCKLY);
        ex.setDifficulty(Exercise.Difficulty.EASY);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCreatedBy(tutor.getId());
        exerciseId = exerciseRepository.save(ex).getId();

        ExerciseVersion ver = new ExerciseVersion();
        ver.setExerciseId(exerciseId);
        ver.setVersionNumber(1);
        ver.setTitle("Purge Test Exercise");
        ver.setDescription("desc");
        ver.setDifficulty("EASY");
        ver.setConfig("{}");
        gradedVersionId = versionRepository.save(ver).getId();

        // Old submission (before cutoff)
        Submission old = submission("Alice", "IMPORT", LocalDateTime.of(2024, 6, 1, 0, 0));
        submissionRepository.save(old);

        // Recent submission (after cutoff)
        Submission recent = submission("Bob", "IMPORT", LocalDateTime.of(2025, 6, 1, 0, 0));
        submissionRepository.save(recent);
    }

    private Submission submission(String studentName, String source, LocalDateTime createdAt) {
        Submission s = new Submission();
        s.setExerciseId(exerciseId);
        s.setGradedVersionId(gradedVersionId);
        s.setStudentName(studentName);
        s.setExerciseType("BLOCKLY");
        s.setAnswerData("{}");
        s.setExportTimestamp(LocalDateTime.now());
        s.setSource(source);
        s.setCreatedAt(createdAt);
        return s;
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void preview_returnsCountOfMatchingSubmissions() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview").param("before", "2025-01-01"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.count").value(1));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void preview_withSourceFilter_filtersCorrectly() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview")
                .param("before", "2025-01-01")
                .param("source", "ONLINE"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.count").value(0));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void preview_missingBefore_returns400() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void preview_invalidDateFormat_returns400() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview").param("before", "not-a-date"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(roles = "TUTOR")
    void preview_tutorRole_returns403() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview").param("before", "2025-01-01"))
            .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_softMode_marksRowsDeleted() throws Exception {
        mockMvc.perform(delete("/v1/submissions/purge")
                .param("before", "2025-01-01")
                .param("mode", "SOFT"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deletedCount").value(1));

        long remaining = submissionRepository.countForPurge(
            LocalDateTime.of(2025, 1, 1, 0, 0), null, null);
        assertThat(remaining).isEqualTo(0);
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_hardMode_removesRows() throws Exception {
        long beforeCount = submissionRepository.count();

        mockMvc.perform(delete("/v1/submissions/purge")
                .param("before", "2025-01-01")
                .param("mode", "HARD"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deletedCount").value(1));

        assertThat(submissionRepository.count()).isEqualTo(beforeCount - 1);
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_missingMode_returns400() throws Exception {
        mockMvc.perform(delete("/v1/submissions/purge").param("before", "2025-01-01"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_invalidMode_returns400() throws Exception {
        mockMvc.perform(delete("/v1/submissions/purge")
                .param("before", "2025-01-01")
                .param("mode", "GARBAGE"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_invalidSource_returns400() throws Exception {
        mockMvc.perform(delete("/v1/submissions/purge")
                .param("before", "2025-01-01")
                .param("mode", "SOFT")
                .param("source", "UNKNOWN"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && mvn test -pl . -Dtest="SubmissionPurgeControllerTest" -q 2>&1 | tail -10
```

Expected: compilation error — `SubmissionPurgeController` not found.

- [ ] **Step 3: Create SubmissionPurgeController**

Create `backend/src/main/java/com/platform/exercise/submission/SubmissionPurgeController.java`:

```java
package com.platform.exercise.submission;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;

@RestController
@RequestMapping("/v1/submissions/purge")
@RequiredArgsConstructor
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SubmissionPurgeController {

    private final SubmissionPurgeService purgeService;

    @GetMapping("/preview")
    public ResponseEntity<PurgePreviewResponse> preview(
            @RequestParam(required = false) String before,
            @RequestParam(required = false) Long exerciseId,
            @RequestParam(required = false) String source) {
        LocalDateTime cutoff = parseBefore(before);
        validateSource(source);
        return ResponseEntity.ok(purgeService.preview(cutoff, exerciseId, source));
    }

    @DeleteMapping
    public ResponseEntity<PurgeResultResponse> purge(
            @RequestParam(required = false) String before,
            @RequestParam(required = false) Long exerciseId,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String mode) {
        LocalDateTime cutoff = parseBefore(before);
        validateSource(source);
        PurgeMode purgeMode = parseMode(mode);
        return ResponseEntity.ok(purgeService.purge(cutoff, exerciseId, source, purgeMode));
    }

    private LocalDateTime parseBefore(String before) {
        if (before == null || before.isBlank()) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "before date is required.");
        }
        try {
            return LocalDate.parse(before).atStartOfDay();
        } catch (DateTimeParseException e) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "Invalid date format. Use YYYY-MM-DD.");
        }
    }

    private void validateSource(String source) {
        if (source != null && !source.equals("IMPORT") && !source.equals("ONLINE")) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "source must be IMPORT or ONLINE.");
        }
    }

    private PurgeMode parseMode(String mode) {
        if (mode == null || mode.isBlank()) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "mode is required.");
        }
        try {
            return PurgeMode.valueOf(mode);
        } catch (IllegalArgumentException e) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "mode must be SOFT or HARD.");
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && mvn test -pl . -Dtest="SubmissionPurgeControllerTest" -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Update SettingsService to include `data` section for SUPER_ADMIN**

In `backend/src/main/java/com/platform/exercise/settings/SettingsService.java`, make two changes:

**Change 1** — Update `DEFAULT_MENU_CONFIG` (line with `"SUPER_ADMIN"`):
```java
// Before:
"SUPER_ADMIN", List.of("exercises", "courses", "categories", "submissions", "users", "settings")

// After:
"SUPER_ADMIN", List.of("exercises", "courses", "categories", "submissions", "users", "settings", "data")
```

**Change 2** — Update `validateMenuConfig` validation message and condition:
```java
// Before:
if (!role.equals("SUPER_ADMIN") &&
        (sections.contains("users") || sections.contains("settings"))) {
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "users and settings are only allowed for SUPER_ADMIN");
}

// After:
if (!role.equals("SUPER_ADMIN") &&
        (sections.contains("users") || sections.contains("settings") || sections.contains("data"))) {
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
        "users, settings, and data are only allowed for SUPER_ADMIN");
}
```

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && mvn test -q 2>&1 | tail -15
```

Expected: `BUILD SUCCESS` with all tests passing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/SubmissionPurgeController.java \
        backend/src/main/java/com/platform/exercise/settings/SettingsService.java \
        backend/src/test/java/com/platform/exercise/submission/SubmissionPurgeControllerTest.java
git commit -m "feat(submission): add SubmissionPurgeController with SUPER_ADMIN guard"
```

---

### Task 4: Frontend — sectionConfig update

**Files:**
- Modify: `frontend/src/components/sectionConfig.js`
- Modify: `frontend/src/components/sectionConfig.test.js`

**Interfaces:**
- Produces: `SECTIONS` now includes `{ key: 'data', label: 'Data Management', icon: '🗑️', roles: ['SUPER_ADMIN'] }`
- Produces: `getInitialPath('data', 'SUPER_ADMIN')` returns `'/admin/data'`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/components/sectionConfig.test.js`, update the existing tests and add a new one:

```js
// Update this test — change 7 to 8 and add 'data' to the array:
test('contains all 8 expected section keys', () => {
  const keys = SECTIONS.map(s => s.key);
  expect(keys).toEqual([
    'exercises', 'progress', 'courses', 'categories', 'submissions', 'users', 'settings', 'data',
  ]);
});

// Update this test — add 'data' to the expected keys:
test('SUPER_ADMIN gets all sections except progress', () => {
  const keys = sectionsForRole('SUPER_ADMIN').map(s => s.key);
  expect(keys).toEqual([
    'exercises', 'courses', 'categories', 'submissions', 'users', 'settings', 'data',
  ]);
});

// Add this new test inside describe('getInitialPath'):
test('data starts at /admin/data', () => {
  expect(getInitialPath('data', 'SUPER_ADMIN')).toBe('/admin/data');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --run src/components/sectionConfig.test.js 2>&1 | tail -20
```

Expected: failing on "contains all 8 expected section keys" (got 7) and "SUPER_ADMIN gets all sections except progress" (missing `data`).

- [ ] **Step 3: Update sectionConfig.js**

In `frontend/src/components/sectionConfig.js`:

Add `data` entry to `SECTIONS` array (append after `settings`):
```js
export const SECTIONS = [
  { key: 'exercises',   label: 'Exercises',        icon: '📋', roles: ['STUDENT', 'TUTOR', 'SUPER_ADMIN'] },
  { key: 'progress',    label: 'My Progress',       icon: '📊', roles: ['STUDENT'] },
  { key: 'courses',     label: 'Courses',           icon: '📚', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'categories',  label: 'Categories',        icon: '🏷️', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'submissions', label: 'Submissions',       icon: '📥', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'users',       label: 'Users',             icon: '👥', roles: ['SUPER_ADMIN'] },
  { key: 'settings',    label: 'Settings',          icon: '⚙️', roles: ['SUPER_ADMIN'] },
  { key: 'data',        label: 'Data Management',   icon: '🗑️', roles: ['SUPER_ADMIN'] },
];
```

Add `data` case to `getInitialPath`:
```js
export function getInitialPath(section, role) {
  const isStudent = role === 'STUDENT';
  switch (section) {
    case 'exercises':   return isStudent ? '/student/exercises' : '/tutor/exercises';
    case 'progress':    return '/student/progress';
    case 'courses':     return '/tutor/courses';
    case 'categories':  return '/tutor/categories';
    case 'submissions': return '/tutor/submissions';
    case 'users':       return '/admin/users';
    case 'settings':    return '/admin/settings';
    case 'data':        return '/admin/data';
    default:            return '/';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --run src/components/sectionConfig.test.js 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/sectionConfig.js \
        frontend/src/components/sectionConfig.test.js
git commit -m "feat(admin): register data section in sectionConfig for SUPER_ADMIN"
```

---

### Task 5: Frontend — DataManagementPage, submissionApi, SectionRouter, and tests

**Files:**
- Modify: `frontend/src/api/submissionApi.js`
- Modify: `frontend/src/components/SectionRouter.jsx`
- Create: `frontend/src/pages/admin/DataManagementPage.jsx`
- Create: `frontend/src/pages/admin/DataManagementPage.test.jsx`

**Interfaces:**
- Consumes: `GET /api/v1/submissions/purge/preview`, `DELETE /api/v1/submissions/purge`
- Consumes: `exerciseApi.list({ size: 1000 })` (returns `{ content: [{id, title}...] }`)

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/pages/admin/DataManagementPage.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import DataManagementPage from './DataManagementPage';
import { submissionApi } from '../../api/submissionApi';
import { exerciseApi } from '../../api/exerciseApi';

vi.mock('../../api/submissionApi');
vi.mock('../../api/exerciseApi');
vi.mock('../../api/axiosInstance', () => ({ default: {}, isReauthCancelled: () => false }));

beforeEach(() => {
  exerciseApi.list = vi.fn().mockResolvedValue({ content: [{ id: 1, title: 'Math Exercise' }] });
  submissionApi.previewPurge = vi.fn().mockResolvedValue({ count: 5 });
  submissionApi.purge = vi.fn().mockResolvedValue({ deletedCount: 5 });
  global.confirm = vi.fn(() => true);
});

test('renders page title and filter form', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Data Management')).toBeInTheDocument();
  expect(screen.getByLabelText(/before date/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
});

test('purge buttons are disabled before preview', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: /soft delete/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /hard delete/i })).toBeDisabled();
});

test('preview button is disabled when before date is empty', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: /preview/i })).toBeDisabled();
});

test('clicking preview fetches count and enables purge buttons', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));

  await waitFor(() => expect(submissionApi.previewPurge).toHaveBeenCalledWith({
    before: '2025-01-01',
    exerciseId: undefined,
    source: undefined,
  }));

  expect(await screen.findByText(/5 submissions match/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /soft delete/i })).not.toBeDisabled();
  expect(screen.getByRole('button', { name: /hard delete/i })).not.toBeDisabled();
});

test('changing filter after preview disables purge buttons again', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));
  await screen.findByText(/5 submissions match/i);

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2024-01-01' } });

  expect(screen.queryByText(/5 submissions match/i)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /soft delete/i })).toBeDisabled();
});

test('soft delete calls purge with SOFT mode and shows toast', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));
  await screen.findByText(/5 submissions match/i);

  fireEvent.click(screen.getByRole('button', { name: /soft delete/i }));

  await waitFor(() => expect(submissionApi.purge).toHaveBeenCalledWith({
    before: '2025-01-01',
    exerciseId: undefined,
    source: undefined,
    mode: 'SOFT',
  }));
  expect(await screen.findByText(/5 submissions soft-deleted/i)).toBeInTheDocument();
});

test('hard delete calls purge with HARD mode and shows toast', async () => {
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));
  await screen.findByText(/5 submissions match/i);

  fireEvent.click(screen.getByRole('button', { name: /hard delete/i }));

  await waitFor(() => expect(submissionApi.purge).toHaveBeenCalledWith({
    before: '2025-01-01',
    exerciseId: undefined,
    source: undefined,
    mode: 'HARD',
  }));
  expect(await screen.findByText(/5 submissions permanently deleted/i)).toBeInTheDocument();
});

test('cancelled confirm does not call purge', async () => {
  global.confirm = vi.fn(() => false);
  render(<DataManagementPage />);
  await waitFor(() => expect(exerciseApi.list).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByLabelText(/before date/i), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: /preview/i }));
  await screen.findByText(/5 submissions match/i);

  fireEvent.click(screen.getByRole('button', { name: /soft delete/i }));
  expect(submissionApi.purge).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --run src/pages/admin/DataManagementPage.test.jsx 2>&1 | tail -20
```

Expected: error — `DataManagementPage` not found, `submissionApi.previewPurge` not a function.

- [ ] **Step 3: Add purge methods to submissionApi**

In `frontend/src/api/submissionApi.js`, add these two methods to the `submissionApi` object (after `delete`):

```js
  previewPurge: (params) =>
    axiosInstance.get('/v1/submissions/purge/preview', { params }).then(r => r.data),

  purge: (params) =>
    axiosInstance.delete('/v1/submissions/purge', { params }).then(r => r.data),
```

- [ ] **Step 4: Create DataManagementPage**

Create `frontend/src/pages/admin/DataManagementPage.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { exerciseApi } from '../../api/exerciseApi';
import { submissionApi } from '../../api/submissionApi';

export default function DataManagementPage() {
  const [exercises, setExercises] = useState([]);
  const [form, setForm] = useState({ before: '', exerciseId: '', source: '' });
  const [previewCount, setPreviewCount] = useState(null);
  const [loading, setLoading] = useState({ preview: false, soft: false, hard: false });
  const [toast, setToast] = useState('');

  useEffect(() => {
    exerciseApi.list({ size: 1000 }).then(res => setExercises(res.content ?? []));
  }, []);

  function handleFormChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setPreviewCount(null);
  }

  function buildParams() {
    return {
      before: form.before,
      exerciseId: form.exerciseId ? Number(form.exerciseId) : undefined,
      source: form.source || undefined,
    };
  }

  async function handlePreview() {
    setLoading(l => ({ ...l, preview: true }));
    try {
      const res = await submissionApi.previewPurge(buildParams());
      setPreviewCount(res.count);
    } catch {
      showToast('Preview failed — please try again.');
    } finally {
      setLoading(l => ({ ...l, preview: false }));
    }
  }

  async function handlePurge(mode) {
    const sourceLabel = form.source || 'all sources';
    const exLabel = exercises.find(e => String(e.id) === form.exerciseId)?.title ?? 'all exercises';
    const msg = mode === 'HARD'
      ? `Permanently delete ${previewCount} submissions created before ${form.before} (exercise: ${exLabel}, source: ${sourceLabel})? This cannot be undone and rows will be removed from the database.`
      : `Soft-delete ${previewCount} submissions created before ${form.before} (exercise: ${exLabel}, source: ${sourceLabel})? Records will be marked as deleted but remain in the database.`;

    if (!window.confirm(msg)) return;

    const key = mode === 'HARD' ? 'hard' : 'soft';
    setLoading(l => ({ ...l, [key]: true }));
    try {
      const res = await submissionApi.purge({ ...buildParams(), mode });
      const count = res.deletedCount;
      showToast(mode === 'HARD'
        ? `${count} submissions permanently deleted.`
        : `${count} submissions soft-deleted.`);
      setPreviewCount(null);
    } catch {
      showToast('Purge failed — please try again.');
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  }

  const previewDisabled = !form.before || loading.preview;
  const purgeDisabled = previewCount === null;

  return (
    <div style={{ padding: 32, maxWidth: 640 }}>
      <h1>Data Management</h1>

      {toast && (
        <div role="status" style={{ marginBottom: 16, padding: 12, background: '#e8f5e9', borderRadius: 4, color: '#2e7d32' }}>
          {toast}
        </div>
      )}

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 16 }}>Purge Submissions</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label htmlFor="before-date" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Before Date (required)
          </label>
          <input
            id="before-date"
            type="date"
            value={form.before}
            onChange={e => handleFormChange('before', e.target.value)}
            aria-label="Before date"
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
          />
        </div>

        <div>
          <label htmlFor="exercise-filter" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Exercise (optional)
          </label>
          <select
            id="exercise-filter"
            value={form.exerciseId}
            onChange={e => handleFormChange('exerciseId', e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14, minWidth: 220 }}
          >
            <option value="">All exercises</option>
            {exercises.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="source-filter" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Source (optional)
          </label>
          <select
            id="source-filter"
            value={form.source}
            onChange={e => handleFormChange('source', e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
          >
            <option value="">All sources</option>
            <option value="IMPORT">IMPORT</option>
            <option value="ONLINE">ONLINE</option>
          </select>
        </div>

        <div>
          <button
            onClick={handlePreview}
            disabled={previewDisabled}
            style={{
              background: '#1976d2', color: '#fff', border: 'none',
              padding: '8px 20px', borderRadius: 4, fontSize: 14,
              cursor: previewDisabled ? 'not-allowed' : 'pointer', opacity: previewDisabled ? 0.6 : 1,
            }}
          >
            {loading.preview ? 'Loading…' : 'Preview'}
          </button>
        </div>

        {previewCount !== null && (
          <div style={{ padding: 12, background: '#e3f2fd', borderRadius: 4, fontWeight: 600, color: '#1565c0' }}>
            {previewCount} submissions match these filters
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={() => handlePurge('SOFT')}
            disabled={purgeDisabled || loading.soft}
            style={{
              background: purgeDisabled ? '#ccc' : '#388e3c', color: '#fff', border: 'none',
              padding: '8px 20px', borderRadius: 4, fontSize: 14,
              cursor: (purgeDisabled || loading.soft) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading.soft ? 'Deleting…' : `Soft Delete${previewCount !== null ? ` (${previewCount} records)` : ''}`}
          </button>

          <div>
            <button
              onClick={() => handlePurge('HARD')}
              disabled={purgeDisabled || loading.hard}
              style={{
                background: purgeDisabled ? '#ccc' : '#c62828', color: '#fff', border: 'none',
                padding: '8px 20px', borderRadius: 4, fontSize: 14,
                cursor: (purgeDisabled || loading.hard) ? 'not-allowed' : 'pointer',
              }}
            >
              {loading.hard ? 'Deleting…' : `Hard Delete${previewCount !== null ? ` (${previewCount} records)` : ''}`}
            </button>
            <div style={{ fontSize: 11, color: '#c62828', marginTop: 4 }}>Permanent — cannot be undone</div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Register the `data` route in SectionRouter**

In `frontend/src/components/SectionRouter.jsx`:

Add the import at the top (with other admin imports):
```jsx
import DataManagementPage from '../pages/admin/DataManagementPage';
```

Add the route inside the `return` block (after the `settings` route block):
```jsx
{section === 'data' && (
  <Route path="/admin/data" element={<DataManagementPage />} />
)}
```

- [ ] **Step 6: Run frontend tests to verify they pass**

```bash
cd frontend && npm test -- --run src/pages/admin/DataManagementPage.test.jsx 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 7: Run full frontend test suite to check for regressions**

```bash
cd frontend && npm test -- --run 2>&1 | tail -15
```

Expected: `BUILD SUCCESS` / all tests passing. If sectionConfig tests fail, verify the `data` entry was added correctly in Task 4.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api/submissionApi.js \
        frontend/src/components/SectionRouter.jsx \
        frontend/src/pages/admin/DataManagementPage.jsx \
        frontend/src/pages/admin/DataManagementPage.test.jsx
git commit -m "feat(admin): add DataManagementPage for bulk submission purge"
```
