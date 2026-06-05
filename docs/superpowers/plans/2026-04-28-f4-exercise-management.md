# F4 — Exercise Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow tutors to create, edit, publish, version-control, and roll back Blockly and Python exercises, with a "Verify Test Cases" feature for Python exercises.

**Architecture:** Spring Boot backend with `Exercise` + `ExerciseVersion` entities (config stored as JSON text); service layer serializes/deserializes via Jackson; controller exposes a TUTOR-secured REST API. React frontend: a list page with filters, a form page that branches into a Blockly workspace or Monaco Python editor, and a version history panel. No new DB migration needed — `exercises` and `exercise_versions` tables already exist in V1.

**Tech Stack:** Java 25 · Spring Boot 3.5.0 · Spring Data JPA · Jackson ObjectMapper · RestTemplate (sandbox calls) · React 18 · Blockly 12.5.0 · @monaco-editor/react

---

## File Map

### Backend — create
| File | Responsibility |
|---|---|
| `backend/src/main/java/com/platform/exercise/domain/Exercise.java` | JPA entity for exercises table |
| `backend/src/main/java/com/platform/exercise/domain/ExerciseVersion.java` | JPA entity for exercise_versions table (immutable after creation) |
| `backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java` | Filtered list query + standard CRUD |
| `backend/src/main/java/com/platform/exercise/repository/ExerciseVersionRepository.java` | Version history and max-version queries |
| `backend/src/main/java/com/platform/exercise/repository/ExerciseListView.java` | Projection interface for list query |
| `backend/src/main/java/com/platform/exercise/exercise/CreateExerciseRequest.java` | Validated create/update request record |
| `backend/src/main/java/com/platform/exercise/exercise/UpdateExerciseRequest.java` | Validated update request record |
| `backend/src/main/java/com/platform/exercise/exercise/RollbackRequest.java` | Rollback request record |
| `backend/src/main/java/com/platform/exercise/exercise/VerifyRequest.java` | Verify test cases request |
| `backend/src/main/java/com/platform/exercise/exercise/ExerciseListItemDto.java` | List item response DTO |
| `backend/src/main/java/com/platform/exercise/exercise/ExerciseDetailDto.java` | Single exercise detail response DTO |
| `backend/src/main/java/com/platform/exercise/exercise/ExerciseVersionDto.java` | Version response DTO |
| `backend/src/main/java/com/platform/exercise/exercise/RollbackResponse.java` | Rollback success response |
| `backend/src/main/java/com/platform/exercise/exercise/ExerciseService.java` | All business logic |
| `backend/src/main/java/com/platform/exercise/exercise/ExerciseController.java` | REST endpoints |
| `backend/src/main/java/com/platform/exercise/exercise/SandboxClient.java` | RestTemplate wrapper for sandbox calls |
| `backend/src/test/java/com/platform/exercise/exercise/ExerciseControllerTest.java` | Integration tests |

### Backend — modify
| File | Change |
|---|---|
| `backend/src/main/java/com/platform/exercise/common/ErrorCode.java` | Already has EXERCISE_NOT_FOUND — no change needed |

### Frontend — create
| File | Responsibility |
|---|---|
| `frontend/src/api/exerciseApi.js` | Axios client for all exercise endpoints |
| `frontend/src/pages/tutor/ExerciseManagementPage.jsx` | Paginated list with type/status/category/difficulty filters and debounced title search |
| `frontend/src/pages/tutor/ExerciseFormPage.jsx` | Create/edit form; branches by type to Blockly or Python sub-forms |
| `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx` | Blockly workspace: allowed-blocks checklist, XML capture, Python code view |
| `frontend/src/components/tutor/PythonAuthoringEditor.jsx` | Monaco editor: starter code, test case CRUD, verify button |
| `frontend/src/components/tutor/VersionHistoryPanel.jsx` | Version list newest-first with rollback confirmation |

### Frontend — modify
| File | Change |
|---|---|
| `frontend/src/App.jsx` | Add `/tutor/exercises`, `/tutor/exercises/new`, `/tutor/exercises/:id/edit` routes |
| `frontend/src/pages/tutor/TutorPage.jsx` | Add "Exercise Management" nav link |

---

## Task 1: Exercise Entity

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/domain/Exercise.java`

- [ ] **Step 1: Write the failing test**

Add a quick entity mapping test to `MigrationTest.java` to verify `exercises` table is mapped:

```java
// In backend/src/test/java/com/platform/exercise/MigrationTest.java
// Add this import and test (the class already exists)
@Test
void exercises_tableIsAccessible() {
    Integer count = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM exercises", Integer.class);
    assertThat(count).isNotNull();
}
```

Run: `cd backend && mvn test -pl . -Dtest=MigrationTest#exercises_tableIsAccessible -q 2>&1 | tail -5`

Expected: PASS (table exists from V1 migration) — this test confirms the JPA entity just needs to match the schema.

- [ ] **Step 2: Create the Exercise entity**

```java
// backend/src/main/java/com/platform/exercise/domain/Exercise.java
package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "exercises")
@Data
@NoArgsConstructor
public class Exercise {

    public enum ExerciseType { BLOCKLY, PYTHON }
    public enum Difficulty { EASY, MEDIUM, HARD }
    public enum Status { DRAFT, PUBLISHED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ExerciseType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Difficulty difficulty;

    @Column(name = "category_id")
    private Long categoryId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status = Status.DRAFT;

    @Column(name = "current_version_id")
    private Long currentVersionId;

    @Column(name = "is_deleted", nullable = false)
    private boolean deleted = false;

    @Column(name = "like_count", nullable = false)
    private int likeCount = 0;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
```

- [ ] **Step 3: Create the ExerciseVersion entity**

```java
// backend/src/main/java/com/platform/exercise/domain/ExerciseVersion.java
package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "exercise_versions")
@Data
@NoArgsConstructor
public class ExerciseVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "exercise_id", nullable = false)
    private Long exerciseId;

    @Column(name = "version_number", nullable = false)
    private int versionNumber;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, length = 20)
    private String difficulty;

    @Column(columnDefinition = "TEXT")
    private String hints;  // JSON: ["hint1", "hint2"]

    @Column(nullable = false, columnDefinition = "TEXT")
    private String config;  // JSON: type-specific config

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
```

- [ ] **Step 4: Run the app to verify Hibernate validates the schema**

Run: `cd backend && mvn test -pl . -Dtest=ActuatorHealthTest -q 2>&1 | tail -5`

Expected: PASS (Hibernate validates entities against H2 schema — if it fails with a column mapping error, check the entity field names match the SQL schema exactly)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/domain/Exercise.java \
        backend/src/main/java/com/platform/exercise/domain/ExerciseVersion.java
git commit -m "feat(f4): add Exercise and ExerciseVersion JPA entities"
```

---

## Task 2: Repositories and Projections

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/repository/ExerciseListView.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/ExerciseVersionRepository.java`

- [ ] **Step 1: Create the ExerciseListView projection interface**

```java
// backend/src/main/java/com/platform/exercise/repository/ExerciseListView.java
package com.platform.exercise.repository;

import java.time.LocalDateTime;

public interface ExerciseListView {
    Long getId();
    String getTitle();
    String getType();
    String getDifficulty();
    Long getCategoryId();
    String getCategoryName();
    Integer getCurrentVersionNumber();
    String getStatus();
    Integer getLikeCount();
    LocalDateTime getCreatedAt();
}
```

- [ ] **Step 2: Create ExerciseRepository with filtered list query**

```java
// backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java
package com.platform.exercise.repository;

import com.platform.exercise.domain.Exercise;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ExerciseRepository extends JpaRepository<Exercise, Long> {

    Optional<Exercise> findByIdAndDeletedFalse(Long id);

    @Query(value = """
            SELECT e.id, e.title, e.type, e.difficulty, e.category_id,
                   c.name AS category_name,
                   ev.version_number AS current_version_number,
                   e.status, e.like_count, e.created_at
            FROM exercises e
            LEFT JOIN categories c ON c.id = e.category_id
            LEFT JOIN exercise_versions ev ON ev.id = e.current_version_id
            WHERE e.is_deleted = false
              AND (:type IS NULL OR e.type = :type)
              AND (:status IS NULL OR e.status = :status)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
              AND (:title IS NULL OR e.title LIKE CONCAT('%', :title, '%'))
            ORDER BY e.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM exercises e
            WHERE e.is_deleted = false
              AND (:type IS NULL OR e.type = :type)
              AND (:status IS NULL OR e.status = :status)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
              AND (:title IS NULL OR e.title LIKE CONCAT('%', :title, '%'))
            """,
            nativeQuery = true)
    Page<ExerciseListView> findAllFiltered(
            @Param("type") String type,
            @Param("status") String status,
            @Param("categoryId") Long categoryId,
            @Param("difficulty") String difficulty,
            @Param("title") String title,
            Pageable pageable);
}
```

- [ ] **Step 3: Create ExerciseVersionRepository**

```java
// backend/src/main/java/com/platform/exercise/repository/ExerciseVersionRepository.java
package com.platform.exercise.repository;

import com.platform.exercise.domain.ExerciseVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ExerciseVersionRepository extends JpaRepository<ExerciseVersion, Long> {

    List<ExerciseVersion> findByExerciseIdOrderByVersionNumberDesc(Long exerciseId);

    @Query("SELECT MAX(ev.versionNumber) FROM ExerciseVersion ev WHERE ev.exerciseId = :exerciseId")
    Optional<Integer> findMaxVersionNumber(@Param("exerciseId") Long exerciseId);

    Optional<ExerciseVersion> findByIdAndExerciseId(Long id, Long exerciseId);
}
```

- [ ] **Step 4: Run tests to verify no mapping errors**

Run: `cd backend && mvn test -pl . -Dtest=ActuatorHealthTest -q 2>&1 | tail -5`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/ExerciseListView.java \
        backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java \
        backend/src/main/java/com/platform/exercise/repository/ExerciseVersionRepository.java
git commit -m "feat(f4): add ExerciseRepository, ExerciseVersionRepository, ExerciseListView"
```

---

## Task 3: Request/Response DTOs

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/exercise/CreateExerciseRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/exercise/UpdateExerciseRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/exercise/RollbackRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/exercise/VerifyRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/exercise/ExerciseListItemDto.java`
- Create: `backend/src/main/java/com/platform/exercise/exercise/ExerciseDetailDto.java`
- Create: `backend/src/main/java/com/platform/exercise/exercise/ExerciseVersionDto.java`
- Create: `backend/src/main/java/com/platform/exercise/exercise/RollbackResponse.java`

- [ ] **Step 1: Create request records**

```java
// backend/src/main/java/com/platform/exercise/exercise/CreateExerciseRequest.java
package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import com.platform.exercise.domain.Exercise.Difficulty;
import com.platform.exercise.domain.Exercise.ExerciseType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CreateExerciseRequest(
        @NotBlank String title,
        @NotBlank String description,
        @NotNull ExerciseType type,
        @NotNull Difficulty difficulty,
        Long categoryId,
        List<String> hints,
        @NotNull JsonNode config
) {}
```

```java
// backend/src/main/java/com/platform/exercise/exercise/UpdateExerciseRequest.java
package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import com.platform.exercise.domain.Exercise.Difficulty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record UpdateExerciseRequest(
        @NotBlank String title,
        @NotBlank String description,
        @NotNull Difficulty difficulty,
        Long categoryId,
        List<String> hints,
        @NotNull JsonNode config
) {}
```

```java
// backend/src/main/java/com/platform/exercise/exercise/RollbackRequest.java
package com.platform.exercise.exercise;

import jakarta.validation.constraints.NotNull;

public record RollbackRequest(@NotNull Long versionId) {}
```

```java
// backend/src/main/java/com/platform/exercise/exercise/VerifyRequest.java
package com.platform.exercise.exercise;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record VerifyRequest(
        @NotBlank String starterCode,
        @Min(1) @Max(30) int timeLimitSeconds,
        @NotEmpty List<TestCaseItem> testCases
) {
    public record TestCaseItem(String input, String expectedOutput) {}
}
```

- [ ] **Step 2: Create response DTOs**

```java
// backend/src/main/java/com/platform/exercise/exercise/ExerciseListItemDto.java
package com.platform.exercise.exercise;

import com.platform.exercise.repository.ExerciseListView;
import java.time.LocalDateTime;

public record ExerciseListItemDto(
        Long id,
        String title,
        String type,
        String difficulty,
        CategoryRef category,
        Integer currentVersionNumber,
        String status,
        int likeCount,
        LocalDateTime createdAt
) {
    public record CategoryRef(Long id, String name) {}

    public static ExerciseListItemDto from(ExerciseListView v) {
        CategoryRef cat = (v.getCategoryId() != null && v.getCategoryName() != null)
                ? new CategoryRef(v.getCategoryId(), v.getCategoryName())
                : null;
        return new ExerciseListItemDto(
                v.getId(), v.getTitle(), v.getType(), v.getDifficulty(),
                cat, v.getCurrentVersionNumber(), v.getStatus(),
                v.getLikeCount() != null ? v.getLikeCount() : 0,
                v.getCreatedAt());
    }
}
```

```java
// backend/src/main/java/com/platform/exercise/exercise/ExerciseVersionDto.java
package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;

public record ExerciseVersionDto(
        Long id,
        int versionNumber,
        String title,
        String description,
        String difficulty,
        List<String> hints,
        JsonNode config,
        LocalDateTime createdAt,
        boolean isCurrent
) {}
```

```java
// backend/src/main/java/com/platform/exercise/exercise/ExerciseDetailDto.java
package com.platform.exercise.exercise;

public record ExerciseDetailDto(
        Long id,
        String title,
        String type,
        String status,
        ExerciseVersionDto currentVersion
) {}
```

```java
// backend/src/main/java/com/platform/exercise/exercise/RollbackResponse.java
package com.platform.exercise.exercise;

public record RollbackResponse(String message, int currentVersionNumber) {}
```

- [ ] **Step 3: Run tests to confirm no compilation errors**

Run: `cd backend && mvn compile -q 2>&1 | tail -10`

Expected: BUILD SUCCESS with no errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/exercise/
git commit -m "feat(f4): add exercise DTOs and request records"
```

---

## Task 4: SandboxClient

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/exercise/SandboxClient.java`

- [ ] **Step 1: Create the SandboxClient**

```java
// backend/src/main/java/com/platform/exercise/exercise/SandboxClient.java
package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;

@Component
public class SandboxClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String sandboxUrl;

    public SandboxClient(
            ObjectMapper objectMapper,
            @Value("${app.sandbox.url:http://sandbox:5000}") String sandboxUrl) {
        this.restTemplate = new RestTemplate();
        this.objectMapper = objectMapper;
        this.sandboxUrl = sandboxUrl;
    }

    public JsonNode execute(String code, List<VerifyRequest.TestCaseItem> testCases, int timeLimitSeconds) {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("code", code);
        body.put("timeLimitSeconds", timeLimitSeconds);
        body.put("memoryLimitMb", 128);
        ArrayNode cases = body.putArray("testCases");
        for (VerifyRequest.TestCaseItem tc : testCases) {
            ObjectNode c = cases.addObject();
            c.put("input", tc.input() == null ? "" : tc.input());
            c.put("expectedOutput", tc.expectedOutput() == null ? "" : tc.expectedOutput());
        }
        try {
            return restTemplate.postForObject(sandboxUrl + "/execute", body, JsonNode.class);
        } catch (RestClientException e) {
            throw new SandboxUnavailableException("Sandbox unavailable: " + e.getMessage());
        }
    }

    public static class SandboxUnavailableException extends RuntimeException {
        public SandboxUnavailableException(String msg) { super(msg); }
    }
}
```

- [ ] **Step 2: Compile to confirm**

Run: `cd backend && mvn compile -q 2>&1 | tail -5`

Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/exercise/SandboxClient.java
git commit -m "feat(f4): add SandboxClient for verify-test-cases endpoint"
```

---

## Task 5: ExerciseService

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/exercise/ExerciseService.java`

- [ ] **Step 1: Write the failing test for createExercise**

```java
// backend/src/test/java/com/platform/exercise/exercise/ExerciseControllerTest.java
package com.platform.exercise.exercise;

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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExerciseControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JdbcTemplate jdbcTemplate;

    Long tutorId;
    Long categoryId;

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("tutor1");
        tutor.setDisplayName("Tutor One");
        tutor.setPasswordHash(passwordEncoder.encode("pass"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        tutorId = userRepository.save(tutor).getId();

        jdbcTemplate.update("INSERT INTO categories (name) VALUES (?)", "Loops");
        categoryId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createPythonExercise_valid_returns201() throws Exception {
        String body = """
            {
              "title": "FizzBuzz",
              "description": "Classic problem",
              "type": "PYTHON",
              "difficulty": "MEDIUM",
              "categoryId": %d,
              "hints": ["Try modulo"],
              "config": {
                "starterCode": "def fizzbuzz(n):\\n    pass",
                "timeLimitSeconds": 5,
                "testCases": [{"input": "fizzbuzz(3)", "expectedOutput": "\\"Fizz\\"", "visible": true}]
              }
            }
            """.formatted(categoryId);

        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("FizzBuzz"))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.currentVersion.versionNumber").value(1));
    }
}
```

Run: `cd backend && mvn test -pl . -Dtest=ExerciseControllerTest#createPythonExercise_valid_returns201 -q 2>&1 | tail -10`

Expected: FAIL — `ExerciseController` not found / 404

- [ ] **Step 2: Create ExerciseService**

```java
// backend/src/main/java/com/platform/exercise/exercise/ExerciseService.java
package com.platform.exercise.exercise;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.Exercise.ExerciseType;
import com.platform.exercise.domain.Exercise.Status;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ExerciseService {

    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final ObjectMapper objectMapper;
    private final SandboxClient sandboxClient;

    // ── List ─────────────────────────────────────────────────────────────────

    public PageResponse<ExerciseListItemDto> listExercises(
            String type, String status, Long categoryId, String difficulty,
            String title, int page, int size) {
        Page<ExerciseListItemDto> result = exerciseRepository
                .findAllFiltered(type, status, categoryId, difficulty,
                        (title != null && title.isBlank()) ? null : title,
                        PageRequest.of(page, size))
                .map(ExerciseListItemDto::from);
        return PageResponse.of(result);
    }

    // ── Create ───────────────────────────────────────────────────────────────

    @Transactional
    public ExerciseDetailDto createExercise(CreateExerciseRequest req, Long userId) {
        validateConfig(req.type(), req.config());

        Exercise exercise = new Exercise();
        exercise.setTitle(req.title());
        exercise.setDescription(req.description());
        exercise.setType(req.type());
        exercise.setDifficulty(req.difficulty());
        exercise.setCategoryId(req.categoryId());
        exercise.setCreatedBy(userId);
        Exercise saved = exerciseRepository.save(exercise);

        ExerciseVersion version = buildVersion(saved.getId(), 1, req.title(),
                req.description(), req.difficulty().name(),
                req.hints(), req.config());
        ExerciseVersion savedVersion = versionRepository.save(version);

        saved.setCurrentVersionId(savedVersion.getId());
        exerciseRepository.save(saved);

        return toDetailDto(saved, savedVersion);
    }

    // ── Get ──────────────────────────────────────────────────────────────────

    public ExerciseDetailDto getExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toDetailDto(exercise, version);
    }

    // ── Update (creates new version) ─────────────────────────────────────────

    @Transactional
    public ExerciseDetailDto updateExercise(Long id, UpdateExerciseRequest req) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        validateConfig(exercise.getType(), req.config());

        int nextVersion = versionRepository.findMaxVersionNumber(id).orElse(0) + 1;

        ExerciseVersion version = buildVersion(id, nextVersion, req.title(),
                req.description(), req.difficulty().name(),
                req.hints(), req.config());
        ExerciseVersion savedVersion = versionRepository.save(version);

        exercise.setTitle(req.title());
        exercise.setDescription(req.description());
        exercise.setDifficulty(req.difficulty());
        exercise.setCategoryId(req.categoryId());
        exercise.setCurrentVersionId(savedVersion.getId());
        exerciseRepository.save(exercise);

        return toDetailDto(exercise, savedVersion);
    }

    // ── Delete (soft) ────────────────────────────────────────────────────────

    @Transactional
    public void deleteExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        exercise.setDeleted(true);
        exerciseRepository.save(exercise);
    }

    // ── Publish / Unpublish ───────────────────────────────────────────────────

    @Transactional
    public ExerciseDetailDto publishExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        exercise.setStatus(Status.PUBLISHED);
        exerciseRepository.save(exercise);
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toDetailDto(exercise, version);
    }

    @Transactional
    public ExerciseDetailDto unpublishExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        exercise.setStatus(Status.DRAFT);
        exerciseRepository.save(exercise);
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toDetailDto(exercise, version);
    }

    // ── Version History ───────────────────────────────────────────────────────

    public List<ExerciseVersionDto> listVersions(Long exerciseId) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return versionRepository.findByExerciseIdOrderByVersionNumberDesc(exerciseId)
                .stream()
                .map(v -> toVersionDto(v, v.getId().equals(exercise.getCurrentVersionId())))
                .toList();
    }

    public ExerciseVersionDto getVersion(Long exerciseId, Long versionId) {
        exerciseRepository.findByIdAndDeletedFalse(exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId).get();
        ExerciseVersion version = versionRepository.findByIdAndExerciseId(versionId, exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toVersionDto(version, version.getId().equals(exercise.getCurrentVersionId()));
    }

    // ── Rollback ──────────────────────────────────────────────────────────────

    @Transactional
    public RollbackResponse rollbackExercise(Long exerciseId, RollbackRequest req) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        ExerciseVersion targetVersion = versionRepository
                .findByIdAndExerciseId(req.versionId(), exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.VALIDATION_ERROR,
                        "Version does not belong to this exercise"));
        exercise.setCurrentVersionId(targetVersion.getId());
        exerciseRepository.save(exercise);
        return new RollbackResponse(
                "Exercise rolled back to version " + targetVersion.getVersionNumber() + ".",
                targetVersion.getVersionNumber());
    }

    // ── Verify Test Cases ─────────────────────────────────────────────────────

    public JsonNode verifyTestCases(VerifyRequest req) {
        return sandboxClient.execute(req.starterCode(), req.testCases(), req.timeLimitSeconds());
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void validateConfig(ExerciseType type, JsonNode config) {
        if (type == ExerciseType.BLOCKLY) {
            JsonNode blocks = config.get("allowedBlocks");
            if (blocks == null || !blocks.isArray() || blocks.isEmpty()) {
                throw new PlatformException(ErrorCode.VALIDATION_ERROR,
                        "Blockly exercises must have at least one allowed block");
            }
        } else if (type == ExerciseType.PYTHON) {
            JsonNode testCases = config.get("testCases");
            if (testCases == null || !testCases.isArray() || testCases.isEmpty()) {
                throw new PlatformException(ErrorCode.VALIDATION_ERROR,
                        "Python exercises must have at least one test case");
            }
        }
    }

    private ExerciseVersion buildVersion(Long exerciseId, int versionNumber,
                                          String title, String description,
                                          String difficulty, List<String> hints,
                                          JsonNode config) {
        ExerciseVersion v = new ExerciseVersion();
        v.setExerciseId(exerciseId);
        v.setVersionNumber(versionNumber);
        v.setTitle(title);
        v.setDescription(description);
        v.setDifficulty(difficulty);
        try {
            v.setHints(hints != null ? objectMapper.writeValueAsString(hints) : "[]");
            v.setConfig(objectMapper.writeValueAsString(config));
        } catch (JsonProcessingException e) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "Invalid JSON config");
        }
        return v;
    }

    private ExerciseDetailDto toDetailDto(Exercise exercise, ExerciseVersion version) {
        return new ExerciseDetailDto(
                exercise.getId(),
                exercise.getTitle(),
                exercise.getType().name(),
                exercise.getStatus().name(),
                toVersionDto(version, true));
    }

    private ExerciseVersionDto toVersionDto(ExerciseVersion v, boolean isCurrent) {
        try {
            List<String> hints = v.getHints() != null
                    ? objectMapper.readValue(v.getHints(), new TypeReference<>() {})
                    : List.of();
            JsonNode config = objectMapper.readTree(v.getConfig());
            return new ExerciseVersionDto(v.getId(), v.getVersionNumber(), v.getTitle(),
                    v.getDescription(), v.getDifficulty(), hints, config, v.getCreatedAt(), isCurrent);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to parse version config", e);
        }
    }
}
```

- [ ] **Step 3: Compile to confirm no errors**

Run: `cd backend && mvn compile -q 2>&1 | tail -5`

Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/exercise/ExerciseService.java
git commit -m "feat(f4): add ExerciseService with CRUD, publish/unpublish, versioning, rollback"
```

---

## Task 6: ExerciseController

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/exercise/ExerciseController.java`

- [ ] **Step 1: Create the controller**

```java
// backend/src/main/java/com/platform/exercise/exercise/ExerciseController.java
package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/exercises")
@RequiredArgsConstructor
@PreAuthorize("hasRole('TUTOR')")
public class ExerciseController {

    private final ExerciseService exerciseService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<PageResponse<ExerciseListItemDto>> list(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false) String title,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(exerciseService.listExercises(type, status, categoryId, difficulty, title, page, size));
    }

    @PostMapping
    public ResponseEntity<ExerciseDetailDto> create(
            @Valid @RequestBody CreateExerciseRequest req,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.status(HttpStatus.CREATED).body(exerciseService.createExercise(req, userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ExerciseDetailDto> get(@PathVariable Long id) {
        return ResponseEntity.ok(exerciseService.getExercise(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ExerciseDetailDto> update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateExerciseRequest req) {
        return ResponseEntity.ok(exerciseService.updateExercise(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        exerciseService.deleteExercise(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/publish")
    public ResponseEntity<ExerciseDetailDto> publish(@PathVariable Long id) {
        return ResponseEntity.ok(exerciseService.publishExercise(id));
    }

    @PatchMapping("/{id}/unpublish")
    public ResponseEntity<ExerciseDetailDto> unpublish(@PathVariable Long id) {
        return ResponseEntity.ok(exerciseService.unpublishExercise(id));
    }

    @GetMapping("/{id}/versions")
    public ResponseEntity<List<ExerciseVersionDto>> listVersions(@PathVariable Long id) {
        return ResponseEntity.ok(exerciseService.listVersions(id));
    }

    @GetMapping("/{id}/versions/{versionId}")
    public ResponseEntity<ExerciseVersionDto> getVersion(
            @PathVariable Long id,
            @PathVariable Long versionId) {
        return ResponseEntity.ok(exerciseService.getVersion(id, versionId));
    }

    @PostMapping("/{id}/rollback")
    public ResponseEntity<RollbackResponse> rollback(
            @PathVariable Long id,
            @Valid @RequestBody RollbackRequest req) {
        return ResponseEntity.ok(exerciseService.rollbackExercise(id, req));
    }

    @PostMapping("/verify")
    public ResponseEntity<JsonNode> verify(@Valid @RequestBody VerifyRequest req) {
        return ResponseEntity.ok(exerciseService.verifyTestCases(req));
    }

    private Long resolveUserId(Authentication auth) {
        if (auth.getPrincipal() instanceof User user) return user.getId();
        return userRepository.findByUsername(auth.getName()).map(User::getId).orElse(null);
    }
}
```

- [ ] **Step 2: Run the failing test — it should now pass**

Run: `cd backend && mvn test -pl . -Dtest=ExerciseControllerTest#createPythonExercise_valid_returns201 -q 2>&1 | tail -10`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/exercise/ExerciseController.java
git commit -m "feat(f4): add ExerciseController with all REST endpoints"
```

---

## Task 7: Backend Tests

**Files:**
- Modify: `backend/src/test/java/com/platform/exercise/exercise/ExerciseControllerTest.java`

- [ ] **Step 1: Add all remaining tests**

Replace the test file with the full test suite:

```java
// backend/src/test/java/com/platform/exercise/exercise/ExerciseControllerTest.java
package com.platform.exercise.exercise;

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

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExerciseControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JdbcTemplate jdbcTemplate;

    Long tutorId;
    Long categoryId;

    private static final String PYTHON_BODY = """
            {
              "title": "FizzBuzz",
              "description": "Classic problem",
              "type": "PYTHON",
              "difficulty": "MEDIUM",
              "categoryId": %d,
              "hints": ["Try modulo"],
              "config": {
                "starterCode": "def fizzbuzz(n):\\n    pass",
                "timeLimitSeconds": 5,
                "testCases": [{"input": "fizzbuzz(3)", "expectedOutput": "\\"Fizz\\"", "visible": true}]
              }
            }
            """;

    private static final String BLOCKLY_BODY = """
            {
              "title": "Print Hello",
              "description": "Simple print",
              "type": "BLOCKLY",
              "difficulty": "EASY",
              "config": {
                "allowedBlocks": ["text_print", "text"],
                "initialWorkspaceXml": "<xml></xml>",
                "showCodeView": true,
                "gradingRules": {
                  "outputMatch": {"enabled": true, "expectedOutput": "Hello World"},
                  "requiredBlocks": {"enabled": false, "blocks": []},
                  "forbiddenBlocks": {"enabled": false, "blocks": []},
                  "blockCountLimit": {"enabled": false, "max": null}
                }
              }
            }
            """;

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("tutor1");
        tutor.setDisplayName("Tutor One");
        tutor.setPasswordHash(passwordEncoder.encode("pass"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        tutorId = userRepository.save(tutor).getId();

        jdbcTemplate.update("INSERT INTO categories (name) VALUES (?)", "Loops");
        categoryId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    // ── RBAC ─────────────────────────────────────────────────────────────────

    @Test
    void listExercises_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/v1/exercises")).andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void listExercises_asStudent_returns403() throws Exception {
        mockMvc.perform(get("/v1/exercises")).andExpect(status().isForbidden());
    }

    // ── Create Python ────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createPythonExercise_valid_returns201() throws Exception {
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PYTHON_BODY.formatted(categoryId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("FizzBuzz"))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.currentVersion.versionNumber").value(1))
                .andExpect(jsonPath("$.currentVersion.config.starterCode").value("def fizzbuzz(n):\n    pass"))
                .andExpect(jsonPath("$.currentVersion.hints[0]").value("Try modulo"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createPythonExercise_noTestCases_returns400() throws Exception {
        String body = """
                {"title":"T","description":"D","type":"PYTHON","difficulty":"EASY",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,"testCases":[]}}
                """;
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    // ── Create Blockly ───────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createBlocklyExercise_valid_returns201() throws Exception {
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BLOCKLY_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("BLOCKLY"))
                .andExpect(jsonPath("$.currentVersion.versionNumber").value(1));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createBlocklyExercise_noAllowedBlocks_returns400() throws Exception {
        String body = """
                {"title":"T","description":"D","type":"BLOCKLY","difficulty":"EASY",
                 "config":{"allowedBlocks":[],"initialWorkspaceXml":"<xml></xml>","showCodeView":false,
                           "gradingRules":{"outputMatch":{"enabled":false,"expectedOutput":""},
                           "requiredBlocks":{"enabled":false,"blocks":[]},
                           "forbiddenBlocks":{"enabled":false,"blocks":[]},
                           "blockCountLimit":{"enabled":false,"max":null}}}}
                """;
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    // ── Get ──────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getExercise_exists_returns200() throws Exception {
        // Create first
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(createResult, "$.id");

        mockMvc.perform(get("/v1/exercises/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.currentVersion").isNotEmpty());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getExercise_notFound_returns404() throws Exception {
        mockMvc.perform(get("/v1/exercises/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("EXERCISE_NOT_FOUND"));
    }

    // ── Update ───────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void updateExercise_createsNewVersion() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(createResult, "$.id");

        String updateBody = """
                {
                  "title": "FizzBuzz Updated",
                  "description": "Updated desc",
                  "difficulty": "HARD",
                  "config": {
                    "starterCode": "def fizzbuzz(n):\\n    return str(n)",
                    "timeLimitSeconds": 10,
                    "testCases": [{"input": "fizzbuzz(3)", "expectedOutput": "\\"Fizz\\"", "visible": true}]
                  }
                }
                """;

        mockMvc.perform(put("/v1/exercises/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("FizzBuzz Updated"))
                .andExpect(jsonPath("$.currentVersion.versionNumber").value(2));
    }

    // ── Delete ───────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteExercise_softDeletes_thenReturns404() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(createResult, "$.id");

        mockMvc.perform(delete("/v1/exercises/" + id)).andExpect(status().isNoContent());
        mockMvc.perform(get("/v1/exercises/" + id)).andExpect(status().isNotFound());
    }

    // ── Publish / Unpublish ───────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void publish_draftExercise_returnsPublished() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(createResult, "$.id");

        mockMvc.perform(patch("/v1/exercises/" + id + "/publish"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void unpublish_publishedExercise_returnsDraft() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(createResult, "$.id");

        mockMvc.perform(patch("/v1/exercises/" + id + "/publish")).andExpect(status().isOk());
        mockMvc.perform(patch("/v1/exercises/" + id + "/unpublish"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    // ── Version history ───────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listVersions_afterTwoUpdates_returnsThreeVersionsNewestFirst() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(createResult, "$.id");

        String updateBody = """
                {"title":"Updated","description":"desc","difficulty":"EASY",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(put("/v1/exercises/" + id).contentType(MediaType.APPLICATION_JSON).content(updateBody));
        mockMvc.perform(put("/v1/exercises/" + id).contentType(MediaType.APPLICATION_JSON).content(updateBody));

        mockMvc.perform(get("/v1/exercises/" + id + "/versions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].versionNumber").value(3))
                .andExpect(jsonPath("$[0].isCurrent").value(true))
                .andExpect(jsonPath("$[2].versionNumber").value(1));
    }

    // ── Rollback ──────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void rollback_toVersion1_succeeds() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(createResult, "$.id");
        Long v1Id = com.jayway.jsonpath.JsonPath.read(createResult, "$.currentVersion.id");

        String updateBody = """
                {"title":"Updated","description":"desc","difficulty":"EASY",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(put("/v1/exercises/" + id).contentType(MediaType.APPLICATION_JSON).content(updateBody));

        mockMvc.perform(post("/v1/exercises/" + id + "/rollback")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"versionId\":" + v1Id + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentVersionNumber").value(1))
                .andExpect(jsonPath("$.message").value(containsString("version 1")));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void rollback_wrongExerciseVersionId_returns400() throws Exception {
        // Create two exercises, try to roll back exercise 1 using a version from exercise 2
        String r1 = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long ex1Id = com.jayway.jsonpath.JsonPath.read(r1, "$.id");

        String r2 = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long v2Id = com.jayway.jsonpath.JsonPath.read(r2, "$.currentVersion.id");

        mockMvc.perform(post("/v1/exercises/" + ex1Id + "/rollback")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"versionId\":" + v2Id + "}"))
                .andExpect(status().isBadRequest());
    }

    // ── List with filters ─────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listExercises_filterByType_returnsOnlyMatching() throws Exception {
        mockMvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(PYTHON_BODY.formatted(categoryId)));
        mockMvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(BLOCKLY_BODY));

        mockMvc.perform(get("/v1/exercises?type=PYTHON"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].type").value("PYTHON"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listExercises_filterByStatus_returnsOnlyPublished() throws Exception {
        String r = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(PYTHON_BODY.formatted(categoryId)))
                .andReturn().getResponse().getContentAsString();
        Long id = com.jayway.jsonpath.JsonPath.read(r, "$.id");
        mockMvc.perform(patch("/v1/exercises/" + id + "/publish"));

        mockMvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(BLOCKLY_BODY));

        mockMvc.perform(get("/v1/exercises?status=PUBLISHED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].status").value("PUBLISHED"));
    }
}
```

- [ ] **Step 2: Add jsonpath test dependency to pom.xml if missing**

Check: `grep -c "json-path" backend/pom.xml`

If output is 0, add to `<dependencies>` in `backend/pom.xml`:
```xml
<dependency>
    <groupId>com.jayway.jsonpath</groupId>
    <artifactId>json-path</artifactId>
    <scope>test</scope>
</dependency>
```

(Spring Boot manages the version via the BOM — no `<version>` needed.)

- [ ] **Step 3: Run all exercise tests**

Run: `cd backend && mvn test -pl . -Dtest=ExerciseControllerTest -q 2>&1 | tail -15`

Expected: All tests PASS. If any test fails, read the error output and fix the implementation before proceeding.

- [ ] **Step 4: Run the full test suite to check for regressions**

Run: `cd backend && mvn test -q 2>&1 | tail -15`

Expected: BUILD SUCCESS, all prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/test/java/com/platform/exercise/exercise/ExerciseControllerTest.java \
        backend/pom.xml
git commit -m "feat(f4): add ExerciseControllerTest (CRUD, versioning, publish, rollback)"
```

---

## Task 8: Install Blockly and Monaco

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install Blockly and @monaco-editor/react**

Run: `cd frontend && npm install blockly@12.5.0 @monaco-editor/react@4.6.0 2>&1 | tail -5`

Expected: `added N packages` with no errors

- [ ] **Step 2: Verify Blockly imports work**

Run: `cd frontend && node -e "const Blockly = require('blockly'); console.log('ok')" 2>&1`

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat(f4): install blockly@12.5.0 and @monaco-editor/react@4.6.0"
```

---

## Task 9: exerciseApi.js

**Files:**
- Create: `frontend/src/api/exerciseApi.js`

- [ ] **Step 1: Write the API client**

```js
// frontend/src/api/exerciseApi.js
import axiosInstance from './axiosInstance';

export const exerciseApi = {
  list: (params = {}) =>
    axiosInstance.get('/v1/exercises', { params }).then(r => r.data),

  get: (id) =>
    axiosInstance.get(`/v1/exercises/${id}`).then(r => r.data),

  create: (data) =>
    axiosInstance.post('/v1/exercises', data).then(r => r.data),

  update: (id, data) =>
    axiosInstance.put(`/v1/exercises/${id}`, data).then(r => r.data),

  delete: (id) =>
    axiosInstance.delete(`/v1/exercises/${id}`),

  publish: (id) =>
    axiosInstance.patch(`/v1/exercises/${id}/publish`).then(r => r.data),

  unpublish: (id) =>
    axiosInstance.patch(`/v1/exercises/${id}/unpublish`).then(r => r.data),

  listVersions: (id) =>
    axiosInstance.get(`/v1/exercises/${id}/versions`).then(r => r.data),

  getVersion: (id, versionId) =>
    axiosInstance.get(`/v1/exercises/${id}/versions/${versionId}`).then(r => r.data),

  rollback: (id, versionId) =>
    axiosInstance.post(`/v1/exercises/${id}/rollback`, { versionId }).then(r => r.data),

  verify: (data) =>
    axiosInstance.post('/v1/exercises/verify', data).then(r => r.data),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/exerciseApi.js
git commit -m "feat(f4): add exerciseApi.js"
```

---

## Task 10: ExerciseManagementPage

**Files:**
- Create: `frontend/src/pages/tutor/ExerciseManagementPage.jsx`

- [ ] **Step 1: Write the page**

```jsx
// frontend/src/pages/tutor/ExerciseManagementPage.jsx
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { exerciseApi } from '../../api/exerciseApi';
import { categoryApi } from '../../api/categoryApi';

const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const STATUS_COLORS = { DRAFT: '#888', PUBLISHED: '#2e7d32' };

export default function ExerciseManagementPage() {
  const [exercises, setExercises] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    type: '', status: '', categoryId: '', difficulty: '', title: '',
  });
  const debounceRef = useRef(null);

  async function load(p = 0, f = filters) {
    setLoading(true);
    try {
      const params = { page: p, size: 20 };
      if (f.type) params.type = f.type;
      if (f.status) params.status = f.status;
      if (f.categoryId) params.categoryId = f.categoryId;
      if (f.difficulty) params.difficulty = f.difficulty;
      if (f.title) params.title = f.title;

      const data = await exerciseApi.list(params);
      setExercises(data.content);
      setTotalPages(data.totalPages);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    categoryApi.list().then(setCategories);
    load(0);
  }, []);

  function handleFilterChange(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (key === 'title') {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => load(0, next), 300);
    } else {
      load(0, next);
    }
  }

  async function handleDelete(ex) {
    if (!confirm(`Delete exercise "${ex.title}"?`)) return;
    try {
      await exerciseApi.delete(ex.id);
      load(page);
    } catch {
      alert('Failed to delete exercise.');
    }
  }

  async function handlePublishToggle(ex) {
    try {
      if (ex.status === 'PUBLISHED') {
        await exerciseApi.unpublish(ex.id);
      } else {
        await exerciseApi.publish(ex.id);
      }
      load(page);
    } catch {
      alert('Failed to update status.');
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Exercise Management</h1>
        <Link to="/tutor/exercises/new"
          style={{ background: '#1976d2', color: '#fff', padding: '8px 16px', borderRadius: 4, textDecoration: 'none' }}>
          + New Exercise
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Search title…"
          value={filters.title}
          onChange={e => handleFilterChange('title', e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, width: 200 }}
        />
        <select value={filters.type} onChange={e => handleFilterChange('type', e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Types</option>
          <option value="BLOCKLY">Blockly</option>
          <option value="PYTHON">Python</option>
        </select>
        <select value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
        </select>
        <select value={filters.difficulty} onChange={e => handleFilterChange('difficulty', e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
        <select value={filters.categoryId} onChange={e => handleFilterChange('categoryId', e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
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
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map(ex => (
              <tr key={ex.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>
                  <Link to={`/tutor/exercises/${ex.id}/edit`} style={{ color: '#1976d2' }}>{ex.title}</Link>
                </td>
                <td style={{ padding: 8 }}>{ex.type}</td>
                <td style={{ padding: 8 }}>{DIFFICULTY_LABELS[ex.difficulty] || ex.difficulty}</td>
                <td style={{ padding: 8 }}>{ex.category?.name || '—'}</td>
                <td style={{ padding: 8 }}>v{ex.currentVersionNumber}</td>
                <td style={{ padding: 8 }}>
                  <span style={{ color: STATUS_COLORS[ex.status] || '#333', fontWeight: 600 }}>
                    {ex.status}
                  </span>
                </td>
                <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                  <button onClick={() => handlePublishToggle(ex)}
                    style={{ padding: '3px 8px', cursor: 'pointer', borderRadius: 4,
                             border: '1px solid #1976d2', color: '#1976d2', background: 'none' }}>
                    {ex.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button onClick={() => handleDelete(ex)}
                    style={{ padding: '3px 8px', cursor: 'pointer', borderRadius: 4,
                             border: '1px solid #c62828', color: '#c62828', background: 'none' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {exercises.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, color: '#999', textAlign: 'center' }}>
                  No exercises yet. <Link to="/tutor/exercises/new">Create one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button onClick={() => load(page - 1)} disabled={page === 0}
            style={{ padding: '4px 12px', cursor: page === 0 ? 'default' : 'pointer' }}>
            ← Prev
          </button>
          <span>Page {page + 1} of {totalPages}</span>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1}
            style={{ padding: '4px 12px', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/tutor/ExerciseManagementPage.jsx
git commit -m "feat(f4): add ExerciseManagementPage with filters and pagination"
```

---

## Task 11: BlocklyAuthoringWorkspace Component

**Files:**
- Create: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx`

- [ ] **Step 1: Write the component**

```jsx
// frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx
import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { pythonGenerator } from 'blockly/python';

export const AVAILABLE_BLOCKS = [
  { type: 'controls_if', label: 'If/Else' },
  { type: 'controls_repeat_ext', label: 'Repeat' },
  { type: 'controls_for', label: 'For Loop' },
  { type: 'controls_whileUntil', label: 'While Loop' },
  { type: 'logic_compare', label: 'Compare' },
  { type: 'logic_operation', label: 'And / Or' },
  { type: 'logic_negate', label: 'Not' },
  { type: 'logic_boolean', label: 'True / False' },
  { type: 'math_number', label: 'Number' },
  { type: 'math_arithmetic', label: 'Arithmetic' },
  { type: 'math_single', label: 'Math (sqrt, abs…)' },
  { type: 'text', label: 'Text (string)' },
  { type: 'text_print', label: 'Print' },
  { type: 'text_join', label: 'Join text' },
  { type: 'text_length', label: 'Text length' },
  { type: 'lists_create_with', label: 'Create list' },
  { type: 'lists_length', label: 'List length' },
  { type: 'lists_getIndex', label: 'Get item' },
  { type: 'lists_setIndex', label: 'Set item' },
  { type: 'variables_get', label: 'Get variable' },
  { type: 'variables_set', label: 'Set variable' },
  { type: 'procedures_defnoreturn', label: 'Define function' },
  { type: 'procedures_defreturn', label: 'Define function (return)' },
];

/**
 * Props:
 *   allowedBlocks: string[]         — block types checked in the checklist
 *   initialWorkspaceXml: string     — starting XML for the workspace
 *   showCodeView: boolean
 *   onAllowedBlocksChange: (types: string[]) => void
 *   onWorkspaceXmlChange: (xml: string) => void
 *   onShowCodeViewChange: (show: boolean) => void
 */
export default function BlocklyAuthoringWorkspace({
  allowedBlocks = [],
  initialWorkspaceXml = '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
  showCodeView = false,
  onAllowedBlocksChange,
  onWorkspaceXmlChange,
  onShowCodeViewChange,
}) {
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const [pythonCode, setPythonCode] = useState('');

  // Rebuild workspace when allowedBlocks changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Dispose previous workspace
    if (workspaceRef.current) {
      const currentXml = Blockly.Xml.domToText(
        Blockly.Xml.workspaceToDom(workspaceRef.current));
      workspaceRef.current.dispose();
      workspaceRef.current = null;
      // Preserve current XML for re-injection
      containerRef.current.dataset.preservedXml = currentXml;
    }

    const toolboxXml = allowedBlocks.length > 0
      ? `<xml>${allowedBlocks.map(b => `<block type="${b}"></block>`).join('')}</xml>`
      : '<xml></xml>';

    const workspace = Blockly.inject(containerRef.current, {
      toolbox: toolboxXml,
      trashcan: true,
      scrollbars: true,
    });
    workspaceRef.current = workspace;

    // Load preserved XML (from prior allowedBlocks change) or initial XML
    const xmlToLoad = containerRef.current.dataset.preservedXml || initialWorkspaceXml;
    try {
      const dom = Blockly.utils.xml.textToDom(xmlToLoad);
      Blockly.Xml.domToWorkspace(dom, workspace);
    } catch {
      // Invalid XML — start empty
    }
    delete containerRef.current.dataset.preservedXml;

    workspace.addChangeListener(() => {
      const xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
      onWorkspaceXmlChange?.(xml);
      if (showCodeView) {
        try {
          setPythonCode(pythonGenerator.workspaceToCode(workspace));
        } catch {
          setPythonCode('');
        }
      }
    });

    return () => {
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [allowedBlocks]);  // Re-run when allowedBlocks changes

  function toggleBlock(type, checked) {
    const next = checked
      ? [...allowedBlocks, type]
      : allowedBlocks.filter(b => b !== type);
    onAllowedBlocksChange?.(next);
  }

  return (
    <div>
      {/* Block checklist */}
      <details style={{ marginBottom: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '4px 0' }}>
          Allowed Blocks ({allowedBlocks.length} selected)
        </summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {AVAILABLE_BLOCKS.map(b => (
            <label key={b.type} style={{ display: 'flex', alignItems: 'center', gap: 4,
              border: '1px solid #ddd', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
              background: allowedBlocks.includes(b.type) ? '#e3f2fd' : '#fff' }}>
              <input
                type="checkbox"
                checked={allowedBlocks.includes(b.type)}
                onChange={e => toggleBlock(b.type, e.target.checked)}
              />
              {b.label}
            </label>
          ))}
        </div>
      </details>

      {/* Show Python code view toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={showCodeView}
          onChange={e => onShowCodeViewChange?.(e.target.checked)}
        />
        Show Python Code View for students
      </label>

      {/* Blockly workspace */}
      <div ref={containerRef} style={{ height: 400, border: '1px solid #ddd', borderRadius: 4 }} />

      {/* Python code panel */}
      {showCodeView && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#555' }}>
            Python equivalent (live preview — read-only for students):
          </p>
          <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, fontSize: 13,
            fontFamily: 'monospace', overflow: 'auto', maxHeight: 200, margin: 0 }}>
            {pythonCode || '(empty workspace)'}
          </pre>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx
git commit -m "feat(f4): add BlocklyAuthoringWorkspace with block checklist and Python code view"
```

---

## Task 12: PythonAuthoringEditor Component

**Files:**
- Create: `frontend/src/components/tutor/PythonAuthoringEditor.jsx`

- [ ] **Step 1: Write the component**

```jsx
// frontend/src/components/tutor/PythonAuthoringEditor.jsx
import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { exerciseApi } from '../../api/exerciseApi';

/**
 * Props:
 *   starterCode: string
 *   timeLimitSeconds: number
 *   testCases: Array<{input: string, expectedOutput: string, visible: boolean}>
 *   onStarterCodeChange: (code: string) => void
 *   onTimeLimitChange: (seconds: number) => void
 *   onTestCasesChange: (cases: Array) => void
 */
export default function PythonAuthoringEditor({
  starterCode = '',
  timeLimitSeconds = 5,
  testCases = [],
  onStarterCodeChange,
  onTimeLimitChange,
  onTestCasesChange,
}) {
  const [verifyResults, setVerifyResults] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  function addTestCase() {
    onTestCasesChange([...testCases, { input: '', expectedOutput: '', visible: true }]);
  }

  function removeTestCase(idx) {
    onTestCasesChange(testCases.filter((_, i) => i !== idx));
  }

  function updateTestCase(idx, field, value) {
    const next = testCases.map((tc, i) => i === idx ? { ...tc, [field]: value } : tc);
    onTestCasesChange(next);
  }

  async function handleVerify() {
    if (testCases.length === 0) {
      alert('Add at least one test case before verifying.');
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    setVerifyResults(null);
    try {
      const result = await exerciseApi.verify({
        starterCode,
        timeLimitSeconds,
        testCases: testCases.map(tc => ({ input: tc.input, expectedOutput: tc.expectedOutput })),
      });
      setVerifyResults(result.results || []);
    } catch (e) {
      setVerifyError(e.response?.data?.error?.message || 'Sandbox unavailable');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      {/* Starter code */}
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Starter Code</label>
      <Editor
        height="300px"
        language="python"
        value={starterCode}
        onChange={value => onStarterCodeChange?.(value || '')}
        options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
        theme="light"
      />

      {/* Time limit */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontWeight: 600 }}>Time Limit (seconds):</label>
        <input
          type="number"
          min={1}
          max={30}
          value={timeLimitSeconds}
          onChange={e => onTimeLimitChange?.(parseInt(e.target.value, 10) || 5)}
          style={{ width: 70, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
        />
      </div>

      {/* Test cases */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontWeight: 600 }}>Test Cases</label>
          <button onClick={addTestCase}
            style={{ padding: '4px 10px', cursor: 'pointer', borderRadius: 4,
                     border: '1px solid #1976d2', color: '#1976d2', background: 'none' }}>
            + Add Test Case
          </button>
        </div>

        {testCases.map((tc, idx) => (
          <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 4, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#555' }}>Input expression</label>
                <input
                  value={tc.input}
                  onChange={e => updateTestCase(idx, 'input', e.target.value)}
                  placeholder="e.g. fizzbuzz(3)"
                  style={{ display: 'block', width: '100%', padding: '4px 8px',
                           border: '1px solid #ccc', borderRadius: 4, marginTop: 2, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#555' }}>Expected output</label>
                <input
                  value={tc.expectedOutput}
                  onChange={e => updateTestCase(idx, 'expectedOutput', e.target.value)}
                  placeholder='e.g. "Fizz"'
                  style={{ display: 'block', width: '100%', padding: '4px 8px',
                           border: '1px solid #ccc', borderRadius: 4, marginTop: 2, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, color: '#555' }}>Visible</label>
                <input type="checkbox"
                  checked={tc.visible}
                  onChange={e => updateTestCase(idx, 'visible', e.target.checked)}
                  style={{ marginTop: 6 }}
                />
              </div>
              <button onClick={() => removeTestCase(idx)}
                style={{ alignSelf: 'flex-end', padding: '4px 8px', cursor: 'pointer',
                         border: '1px solid #c62828', color: '#c62828', borderRadius: 4, background: 'none' }}>
                Remove
              </button>
            </div>

            {/* Verify result for this test case */}
            {verifyResults && verifyResults[idx] && (
              <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 4,
                background: verifyResults[idx].passed ? '#e8f5e9' : '#ffebee',
                fontSize: 13 }}>
                {verifyResults[idx].passed
                  ? '✓ Passed'
                  : `✗ Failed — got: ${verifyResults[idx].actual || verifyResults[idx].error || '(no output)'}`}
              </div>
            )}
          </div>
        ))}

        {testCases.length === 0 && (
          <p style={{ color: '#999', fontSize: 13 }}>No test cases yet. Add at least one.</p>
        )}
      </div>

      {/* Verify button */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleVerify}
          disabled={verifying}
          style={{ padding: '6px 14px', cursor: verifying ? 'default' : 'pointer',
                   background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4 }}>
          {verifying ? 'Verifying…' : 'Verify Test Cases'}
        </button>
        {verifyError && (
          <span style={{ color: '#c62828', fontSize: 13 }}>Error: {verifyError}</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/tutor/PythonAuthoringEditor.jsx
git commit -m "feat(f4): add PythonAuthoringEditor with Monaco, test cases, and verify button"
```

---

## Task 13: VersionHistoryPanel Component

**Files:**
- Create: `frontend/src/components/tutor/VersionHistoryPanel.jsx`

- [ ] **Step 1: Write the component**

```jsx
// frontend/src/components/tutor/VersionHistoryPanel.jsx
import { useState } from 'react';
import { exerciseApi } from '../../api/exerciseApi';

/**
 * Props:
 *   exerciseId: number
 *   versions: Array<{id, versionNumber, createdAt, isCurrent}>
 *   onRollback: () => void   — called after successful rollback so parent can reload
 */
export default function VersionHistoryPanel({ exerciseId, versions = [], onRollback }) {
  const [rolling, setRolling] = useState(false);

  async function handleRollback(version) {
    if (!confirm(
      `Roll back to version ${version.versionNumber}?\n\nThis will change the exercise students see. The status (Draft/Published) will remain unchanged.`
    )) return;

    setRolling(true);
    try {
      await exerciseApi.rollback(exerciseId, version.id);
      onRollback?.();
    } catch (e) {
      alert(e.response?.data?.error?.message || 'Rollback failed');
    } finally {
      setRolling(false);
    }
  }

  if (versions.length === 0) {
    return <p style={{ color: '#999' }}>No version history yet.</p>;
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
            <th style={{ padding: 8 }}>Version</th>
            <th style={{ padding: 8 }}>Created</th>
            <th style={{ padding: 8 }}>Status</th>
            <th style={{ padding: 8 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {versions.map(v => (
            <tr key={v.id} style={{ borderBottom: '1px solid #eee',
              background: v.isCurrent ? '#f0f7ff' : 'transparent' }}>
              <td style={{ padding: 8, fontWeight: v.isCurrent ? 700 : 400 }}>
                v{v.versionNumber}
              </td>
              <td style={{ padding: 8, fontSize: 13, color: '#555' }}>
                {new Date(v.createdAt).toLocaleString()}
              </td>
              <td style={{ padding: 8 }}>
                {v.isCurrent && (
                  <span style={{ background: '#1976d2', color: '#fff',
                    borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                    Current
                  </span>
                )}
              </td>
              <td style={{ padding: 8 }}>
                {!v.isCurrent && (
                  <button
                    onClick={() => handleRollback(v)}
                    disabled={rolling}
                    style={{ padding: '3px 10px', cursor: rolling ? 'default' : 'pointer',
                      borderRadius: 4, border: '1px solid #f57c00', color: '#f57c00', background: 'none' }}>
                    Roll back to v{v.versionNumber}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/tutor/VersionHistoryPanel.jsx
git commit -m "feat(f4): add VersionHistoryPanel with rollback confirmation"
```

---

## Task 14: ExerciseFormPage

**Files:**
- Create: `frontend/src/pages/tutor/ExerciseFormPage.jsx`

- [ ] **Step 1: Write the form page**

```jsx
// frontend/src/pages/tutor/ExerciseFormPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { exerciseApi } from '../../api/exerciseApi';
import { categoryApi } from '../../api/categoryApi';
import BlocklyAuthoringWorkspace from '../../components/tutor/BlocklyAuthoringWorkspace';
import PythonAuthoringEditor from '../../components/tutor/PythonAuthoringEditor';
import VersionHistoryPanel from '../../components/tutor/VersionHistoryPanel';

const EMPTY_BLOCKLY_CONFIG = {
  allowedBlocks: [],
  initialWorkspaceXml: '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
  showCodeView: false,
  gradingRules: {
    outputMatch: { enabled: false, expectedOutput: '' },
    requiredBlocks: { enabled: false, blocks: [] },
    forbiddenBlocks: { enabled: false, blocks: [] },
    blockCountLimit: { enabled: false, max: null },
  },
};

const EMPTY_PYTHON_CONFIG = {
  starterCode: '',
  timeLimitSeconds: 5,
  testCases: [],
};

export default function ExerciseFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [categories, setCategories] = useState([]);
  const [versions, setVersions] = useState([]);
  const [activeTab, setActiveTab] = useState('edit');  // 'edit' | 'versions'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [exerciseType, setExerciseType] = useState('');  // 'BLOCKLY' | 'PYTHON'
  const [difficulty, setDifficulty] = useState('EASY');
  const [categoryId, setCategoryId] = useState('');
  const [hints, setHints] = useState('');  // newline-separated
  const [blocklyConfig, setBlocklyConfig] = useState(EMPTY_BLOCKLY_CONFIG);
  const [pythonConfig, setPythonConfig] = useState(EMPTY_PYTHON_CONFIG);

  useEffect(() => {
    categoryApi.list().then(setCategories);
    if (isEdit) {
      loadExercise();
      loadVersions();
    }
  }, [id]);

  async function loadExercise() {
    try {
      const ex = await exerciseApi.get(id);
      setTitle(ex.title);
      setDescription(ex.currentVersion.description);
      setExerciseType(ex.type);
      setDifficulty(ex.currentVersion.difficulty);
      setCategoryId('');  // Category not in detail DTO — load from list if needed
      setHints((ex.currentVersion.hints || []).join('\n'));
      if (ex.type === 'BLOCKLY') {
        setBlocklyConfig(ex.currentVersion.config || EMPTY_BLOCKLY_CONFIG);
      } else {
        setPythonConfig(ex.currentVersion.config || EMPTY_PYTHON_CONFIG);
      }
    } catch {
      setError('Failed to load exercise.');
    }
  }

  async function loadVersions() {
    try {
      const data = await exerciseApi.listVersions(id);
      setVersions(data);
    } catch {
      // non-critical
    }
  }

  function buildConfig() {
    return exerciseType === 'BLOCKLY' ? blocklyConfig : pythonConfig;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        description,
        difficulty,
        categoryId: categoryId ? Number(categoryId) : null,
        hints: hints.split('\n').map(h => h.trim()).filter(Boolean),
        config: buildConfig(),
      };

      if (isEdit) {
        await exerciseApi.update(id, payload);
        await loadVersions();
      } else {
        const created = await exerciseApi.create({ ...payload, type: exerciseType });
        navigate(`/tutor/exercises/${created.id}/edit`);
        return;
      }
      setError(null);
      alert(isEdit ? 'Exercise saved as new version.' : 'Exercise created.');
    } catch (e) {
      setError(e.response?.data?.error?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  // Type not yet selected (create mode)
  if (!isEdit && !exerciseType) {
    return (
      <div style={{ padding: 32, maxWidth: 600 }}>
        <h1>New Exercise</h1>
        <p>Select an exercise type to continue:</p>
        <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
          <button onClick={() => setExerciseType('BLOCKLY')}
            style={{ flex: 1, padding: 24, border: '2px solid #1976d2', borderRadius: 8,
                     cursor: 'pointer', background: '#fff', fontSize: 16 }}>
            <div style={{ fontSize: 24 }}>🧱</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>Blockly</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Visual block-based programming</div>
          </button>
          <button onClick={() => setExerciseType('PYTHON')}
            style={{ flex: 1, padding: 24, border: '2px solid #1976d2', borderRadius: 8,
                     cursor: 'pointer', background: '#fff', fontSize: 16 }}>
            <div style={{ fontSize: 24 }}>🐍</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>Python</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Text-based code editor</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>
          {isEdit ? 'Edit Exercise' : `New ${exerciseType} Exercise`}
        </h1>
        {isEdit && (
          <div style={{ display: 'flex', gap: 0 }}>
            {['edit', 'versions'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ padding: '6px 16px', cursor: 'pointer',
                  background: activeTab === tab ? '#1976d2' : '#fff',
                  color: activeTab === tab ? '#fff' : '#333',
                  border: '1px solid #ccc', borderRadius: tab === 'edit' ? '4px 0 0 4px' : '0 4px 4px 0' }}>
                {tab === 'edit' ? 'Edit' : `Versions (${versions.length})`}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => navigate('/tutor/exercises')}
          style={{ marginLeft: 'auto', padding: '6px 14px', cursor: 'pointer',
                   border: '1px solid #ccc', borderRadius: 4, background: '#fff' }}>
          ← Back
        </button>
      </div>

      {activeTab === 'versions' && isEdit ? (
        <VersionHistoryPanel
          exerciseId={Number(id)}
          versions={versions}
          onRollback={loadVersions}
        />
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Common fields */}
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr', marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Title *</label>
              <input required value={title} onChange={e => setTitle(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Difficulty *</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Category</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4 }}>
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Hints (one per line)</label>
              <textarea value={hints} onChange={e => setHints(e.target.value)} rows={3}
                placeholder="Optional hints for students"
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Description *</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={4}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }} />
          </div>

          <hr style={{ margin: '20px 0', borderColor: '#eee' }} />

          {/* Type-specific authoring */}
          {exerciseType === 'BLOCKLY' ? (
            <div>
              <h3 style={{ marginTop: 0 }}>Blockly Configuration</h3>
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

              <h4 style={{ marginTop: 24 }}>Grading Rules</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Output Match */}
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

                {/* Block Count Limit */}
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
            </div>
          )}

          {error && (
            <p style={{ color: '#c62828', marginTop: 16 }}>{error}</p>
          )}

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <button type="submit" disabled={saving}
              style={{ padding: '10px 24px', background: '#1976d2', color: '#fff',
                       border: 'none', borderRadius: 4, cursor: saving ? 'default' : 'pointer', fontSize: 15 }}>
              {saving ? 'Saving…' : (isEdit ? 'Save (creates new version)' : 'Create Exercise')}
            </button>
            <button type="button" onClick={() => navigate('/tutor/exercises')}
              style={{ padding: '10px 16px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/tutor/ExerciseFormPage.jsx
git commit -m "feat(f4): add ExerciseFormPage with Blockly and Python authoring sub-forms"
```

---

## Task 15: Routes and Navigation

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/tutor/TutorPage.jsx`

- [ ] **Step 1: Add exercise routes to App.jsx**

In [frontend/src/App.jsx](frontend/src/App.jsx), add the following imports after the existing tutor imports:

```jsx
import ExerciseManagementPage from './pages/tutor/ExerciseManagementPage';
import ExerciseFormPage from './pages/tutor/ExerciseFormPage';
```

Then add these routes inside `<Routes>`, after the existing `/tutor/courses/:id` route and before the `/admin` routes:

```jsx
<Route path="/tutor/exercises" element={
  <ProtectedRoute requiredRole="TUTOR"><ExerciseManagementPage /></ProtectedRoute>
} />
<Route path="/tutor/exercises/new" element={
  <ProtectedRoute requiredRole="TUTOR"><ExerciseFormPage /></ProtectedRoute>
} />
<Route path="/tutor/exercises/:id/edit" element={
  <ProtectedRoute requiredRole="TUTOR"><ExerciseFormPage /></ProtectedRoute>
} />
```

- [ ] **Step 2: Add Exercise Management link to TutorPage.jsx**

In [frontend/src/pages/tutor/TutorPage.jsx](frontend/src/pages/tutor/TutorPage.jsx), add the exercise link to the nav:

```jsx
<Link to="/tutor/exercises">Exercise Management</Link>
```

Full file after edit:
```jsx
import { Link } from 'react-router-dom';

export default function TutorPage() {
  return (
    <div style={{ padding: 32 }}>
      <h1>Tutor Dashboard</h1>
      <nav style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <Link to="/tutor/categories">Category Management</Link>
        <Link to="/tutor/courses">Course Management</Link>
        <Link to="/tutor/exercises">Exercise Management</Link>
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Build the frontend to confirm no import errors**

Run: `cd frontend && npm run build 2>&1 | tail -15`

Expected: `built in Xs` with no errors. If Blockly or Monaco causes Vite build issues, check Vite config — you may need to add to `optimizeDeps.include` in `vite.config.js`:
```js
optimizeDeps: {
  include: ['blockly', '@monaco-editor/react']
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/tutor/TutorPage.jsx
git commit -m "feat(f4): add exercise routes and TutorPage nav link"
```

---

## Task 16: End-to-End Smoke Test

- [ ] **Step 1: Run all backend tests one final time**

Run: `cd backend && mvn test -q 2>&1 | tail -10`

Expected: BUILD SUCCESS with 0 failures.

- [ ] **Step 2: Confirm frontend builds clean**

Run: `cd frontend && npm run build 2>&1 | tail -10`

Expected: no errors.

- [ ] **Step 3: Final commit**

```bash
git commit --allow-empty -m "chore: F4 exercise management complete — all tests passing, frontend builds clean"
```

---

## Self-Review: Spec Coverage Check

| Spec Requirement | Covered By |
|---|---|
| `POST /api/v1/exercises` with valid Blockly/Python config → 201, status DRAFT, versionNumber 1 | Task 5/6, Task 7 (test) |
| `PUT /api/v1/exercises/{id}` creates new immutable version, increments version number | Task 5/6, Task 7 (test) |
| `DELETE /api/v1/exercises/{id}` soft-deletes, GET returns 404 | Task 5/6, Task 7 (test) |
| `GET /api/v1/exercises/{id}/versions` returns all versions newest-first with isCurrent | Task 5/6, Task 7 (test) |
| `POST /api/v1/exercises/{id}/rollback` with valid versionId updates current_version_id | Task 5/6, Task 7 (test) |
| Rollback with wrong exercise's versionId → 400 VALIDATION_ERROR | Task 7 (test) |
| `PATCH /{id}/publish` → PUBLISHED, `PATCH /{id}/unpublish` → DRAFT, publish idempotent | Task 5/6, Task 7 (test) |
| Blockly config must have non-empty allowedBlocks | Task 5 (validateConfig), Task 7 (test) |
| Python config must have at least one test case | Task 5 (validateConfig), Task 7 (test) |
| Blockly workspace with allowed blocks checklist + live Python code view | Task 11 (component) |
| Monaco editor with Python syntax highlighting | Task 12 (component) |
| "Verify Test Cases" inline pass/fail per test case | Task 12 (component) + Task 4 (SandboxClient) + Task 6 (endpoint) |
| List with filters: type, status, categoryId, difficulty, debounced title | Task 10 (page) + Task 2 (repository) |
| Version history tab with rollback confirmation warning | Task 13 (component) + Task 14 (page) |
| `GET /api/v1/exercises/{id}/versions/{versionId}` returns full version | Task 5/6 |
| Pagination 20 per page | Task 10 (page) + Task 2 (repository) |
| Access restricted to TUTOR+ | Task 6 (@PreAuthorize) |
| Publish idempotent on already-published exercise | Task 5 (sets status regardless) |
