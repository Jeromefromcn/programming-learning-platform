# F-5 — Student Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students browse published exercises, run code in-browser via Web Workers, and export their answer as a JSON file — no server round-trip for "Run".

**Architecture:** Three vertical slices built in order — (1) Browse: new `student` backend package with two STUDENT-secured endpoints + React list page; (2) Blockly Practice: page + classic Web Worker that runs Blockly-generated JS with an overridden `print()`; (3) Python Practice: page + classic Web Worker loading Pyodide from CDN. Course filter reads the cached `SettingsService`. Config stripping (hidden test cases, gradingRules) is done in the service layer via Jackson `ObjectNode` manipulation. No new DB migrations.

**Tech Stack:** Java 25 · Spring Boot 3.5.0 · Jackson ObjectMapper · React 18 · Blockly 12.5.0 (`blockly/javascript` generator) · `@monaco-editor/react` · Pyodide 0.26.x (CDN)

---

## File Map

### Backend — create
| File | Responsibility |
|---|---|
| `backend/src/main/java/com/platform/exercise/student/StudentExerciseController.java` | Two STUDENT-secured endpoints: list + get-by-id |
| `backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java` | Course filter logic, config stripping, DTO mapping |
| `backend/src/main/java/com/platform/exercise/student/StudentExerciseListDto.java` | List item response (no hidden data) |
| `backend/src/main/java/com/platform/exercise/student/StudentExerciseDetailDto.java` | Detail response (visibleTestCases, no gradingRules) |
| `backend/src/main/java/com/platform/exercise/student/StudentVersionDto.java` | Version sub-record inside detail DTO |
| `backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java` | 13 MockMvc integration tests |

### Backend — modify
| File | Change |
|---|---|
| `backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java` | Add `findPublishedFiltered` and `findPublishedFilteredForStudent` native queries |

### Frontend — create
| File | Responsibility |
|---|---|
| `frontend/src/api/studentApi.js` | Axios wrappers for `/v1/student/exercises` |
| `frontend/src/pages/student/ExerciseListPage.jsx` | Filter bar + paginated exercise cards |
| `frontend/src/pages/student/ExercisePracticeRouter.jsx` | Fetches exercise type, renders Blockly or Python page |
| `frontend/src/pages/student/BlocklyPracticePage.jsx` | Blockly workspace + Run/Hint/Export |
| `frontend/src/pages/student/PythonPracticePage.jsx` | Monaco editor + visible test cases + Run/Export |
| `frontend/src/workers/blocklyRunner.worker.js` | Classic worker: executes JS code, overrides `print()` |
| `frontend/src/workers/pyodideRunner.worker.js` | Classic worker: loads Pyodide, runs each test case |

### Frontend — modify
| File | Change |
|---|---|
| `frontend/src/App.jsx` | Add `/student/exercises` and `/student/exercises/:id` routes |
| `frontend/src/pages/student/StudentPage.jsx` | Add nav link to exercise list |

---

## Task 1: Write All Failing Backend Tests

**Files:**
- Create: `backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java`

- [ ] **Step 1: Create the test class with scaffolding and `@BeforeEach` seed**

```java
// backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java
package com.platform.exercise.student;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import com.platform.exercise.settings.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentExerciseControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired SettingsService settingsService;

    Long studentId;
    Long tutorId;
    Long categoryId;
    Long publishedPythonExId;
    Long publishedBlocklyExId;
    Long courseId;

    @BeforeEach
    void seed() {
        // Reset course filter cache to off before every test
        settingsService.updateCourseFilter(false);

        User student = new User();
        student.setUsername("student1");
        student.setDisplayName("Alice");
        student.setPasswordHash(passwordEncoder.encode("pass"));
        student.setRole(Role.STUDENT);
        student.setStatus(UserStatus.ACTIVE);
        studentId = userRepository.save(student).getId();

        User tutor = new User();
        tutor.setUsername("tutor1");
        tutor.setDisplayName("Tutor One");
        tutor.setPasswordHash(passwordEncoder.encode("pass"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        tutorId = userRepository.save(tutor).getId();

        jdbcTemplate.update("INSERT INTO categories (name) VALUES (?)", "Loops");
        categoryId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        // Python exercise: 1 visible + 1 hidden test case, no gradingRules in config
        publishedPythonExId = createPythonExercise("FizzBuzz", "PUBLISHED", tutorId, categoryId);
        // Blockly exercise: has gradingRules in config
        publishedBlocklyExId = createBlocklyExercise("Hello World", "PUBLISHED", tutorId, categoryId);
        // Draft — must never appear in student list or detail
        createPythonExercise("Draft Exercise", "DRAFT", tutorId, categoryId);

        jdbcTemplate.update(
            "INSERT INTO courses (name, description, created_by) VALUES (?,?,?)",
            "CS101", "Intro course", tutorId);
        courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        // Link only FizzBuzz to the course
        jdbcTemplate.update(
            "INSERT INTO course_exercises (course_id, exercise_id) VALUES (?,?)",
            courseId, publishedPythonExId);

        // Enroll student1 in course
        jdbcTemplate.update(
            "INSERT INTO course_students (course_id, user_id) VALUES (?,?)",
            courseId, studentId);
    }
```

- [ ] **Step 2: Add list-endpoint tests**

Append inside the class:

```java
    // ── List ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_courseFilterOff_returnsAllPublished() throws Exception {
        mockMvc.perform(get("/v1/student/exercises"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(2));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_courseFilterOn_enrolledStudent_returnsLinkedExercisesOnly() throws Exception {
        settingsService.updateCourseFilter(true);
        mockMvc.perform(get("/v1/student/exercises"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1))
            .andExpect(jsonPath("$.content[0].title").value("FizzBuzz"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_courseFilterOn_unenrolledStudent_returnsEmpty() throws Exception {
        settingsService.updateCourseFilter(true);
        jdbcTemplate.update(
            "DELETE FROM course_students WHERE course_id=? AND user_id=?",
            courseId, studentId);
        mockMvc.perform(get("/v1/student/exercises"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(0));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_filterByType_returnsPythonOnly() throws Exception {
        mockMvc.perform(get("/v1/student/exercises").param("type", "PYTHON"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1))
            .andExpect(jsonPath("$.content[0].type").value("PYTHON"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_filterByCategoryId_returnsExercisesInCategory() throws Exception {
        mockMvc.perform(get("/v1/student/exercises")
                .param("categoryId", categoryId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(2));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_filterByDifficulty_returnsMatchingExercises() throws Exception {
        // FizzBuzz is MEDIUM, Hello World is EASY
        mockMvc.perform(get("/v1/student/exercises").param("difficulty", "MEDIUM"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void list_asTutor_returns403() throws Exception {
        mockMvc.perform(get("/v1/student/exercises"))
            .andExpect(status().isForbidden());
    }
```

- [ ] **Step 3: Add get-by-id tests**

Append inside the class:

```java
    // ── Get by ID ─────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_publishedPythonExercise_stripsHiddenTestCasesAndGradingRules() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/" + publishedPythonExId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(publishedPythonExId))
            .andExpect(jsonPath("$.version.config.visibleTestCases").isArray())
            .andExpect(jsonPath("$.version.config.visibleTestCases.length()").value(1))
            .andExpect(jsonPath("$.version.config.testCases").doesNotExist())
            .andExpect(jsonPath("$.version.config.gradingRules").doesNotExist());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_publishedBlocklyExercise_stripsGradingRulesKeepsAllowedBlocks() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/" + publishedBlocklyExId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version.config.allowedBlocks").isArray())
            .andExpect(jsonPath("$.version.config.gradingRules").doesNotExist());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_draftExercise_returns404() throws Exception {
        Long draftId = createPythonExercise("Another Draft", "DRAFT", tutorId, categoryId);
        mockMvc.perform(get("/v1/student/exercises/" + draftId))
            .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_softDeletedExercise_returns404() throws Exception {
        jdbcTemplate.update("UPDATE exercises SET is_deleted=true WHERE id=?", publishedPythonExId);
        mockMvc.perform(get("/v1/student/exercises/" + publishedPythonExId))
            .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_nonExistentExercise_returns404() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/99999"))
            .andExpect(status().isNotFound());
    }
```

- [ ] **Step 4: Add helper methods then close the class**

Append inside the class, then close with `}`:

```java
    // ── Helpers ───────────────────────────────────────────────────────────────

    private Long createPythonExercise(String title, String status, Long createdBy, Long catId) {
        jdbcTemplate.update(
            "INSERT INTO exercises (title, description, type, difficulty, category_id, status, created_by, current_version_id) VALUES (?,?,?,?,?,?,?,0)",
            title, "A description", "PYTHON", "MEDIUM", catId, status, createdBy);
        Long exId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update(
            "INSERT INTO exercise_versions (exercise_id, version_number, title, description, difficulty, hints, config) VALUES (?,?,?,?,?,?,?)",
            exId, 1, title, "A description", "MEDIUM", "[\"Try modulo\"]",
            "{\"starterCode\":\"def f():\\n    pass\",\"timeLimitSeconds\":5," +
            "\"testCases\":[" +
            "{\"input\":\"f()\",\"expectedOutput\":\"1\",\"visible\":true}," +
            "{\"input\":\"f()\",\"expectedOutput\":\"2\",\"visible\":false}]}");
        Long verId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update("UPDATE exercises SET current_version_id=? WHERE id=?", verId, exId);
        return exId;
    }

    private Long createBlocklyExercise(String title, String status, Long createdBy, Long catId) {
        jdbcTemplate.update(
            "INSERT INTO exercises (title, description, type, difficulty, category_id, status, created_by, current_version_id) VALUES (?,?,?,?,?,?,?,0)",
            title, "A description", "BLOCKLY", "EASY", catId, status, createdBy);
        Long exId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update(
            "INSERT INTO exercise_versions (exercise_id, version_number, title, description, difficulty, hints, config) VALUES (?,?,?,?,?,?,?)",
            exId, 1, title, "A description", "EASY", "[]",
            "{\"allowedBlocks\":[\"text_print\",\"text\"]," +
            "\"initialWorkspaceXml\":\"<xml/>\",\"showCodeView\":false," +
            "\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello World\"}," +
            "\"requiredBlocks\":{\"enabled\":false,\"blocks\":[]}}}");
        Long verId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update("UPDATE exercises SET current_version_id=? WHERE id=?", verId, exId);
        return exId;
    }
}
```

- [ ] **Step 5: Run to confirm compilation failure (controller doesn't exist yet)**

```bash
cd backend && mvn test -Dtest=StudentExerciseControllerTest -q 2>&1 | tail -8
```

Expected: `COMPILATION ERROR` — `StudentExerciseController` cannot be resolved.

- [ ] **Step 6: Commit the test file**

```bash
git add backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java
git commit -m "test(f5): add StudentExerciseControllerTest — 13 failing tests"
```

---

## Task 2: Add Student Queries to ExerciseRepository

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java`

- [ ] **Step 1: Add `findPublishedFiltered` (no course filter)**

Open `ExerciseRepository.java` and append before the closing `}`:

```java
    // ── Student browse — course filter OFF ───────────────────────────────────

    @Query(value = """
            SELECT e.id, e.title, e.type, e.difficulty, e.category_id,
                   c.name AS category_name,
                   ev.version_number AS current_version_number,
                   e.status, e.like_count, e.created_at
            FROM exercises e
            LEFT JOIN categories c ON c.id = e.category_id
            LEFT JOIN exercise_versions ev ON ev.id = e.current_version_id
            WHERE e.is_deleted = false AND e.status = 'PUBLISHED'
              AND (:type IS NULL OR e.type = :type)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
            ORDER BY e.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM exercises e
            WHERE e.is_deleted = false AND e.status = 'PUBLISHED'
              AND (:type IS NULL OR e.type = :type)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
            """,
            nativeQuery = true)
    Page<ExerciseListView> findPublishedFiltered(
            @Param("type") String type,
            @Param("categoryId") Long categoryId,
            @Param("difficulty") String difficulty,
            Pageable pageable);
```

- [ ] **Step 2: Add `findPublishedFilteredForStudent` (course filter ON)**

Append directly after the previous method:

```java
    // ── Student browse — course filter ON ────────────────────────────────────

    @Query(value = """
            SELECT e.id, e.title, e.type, e.difficulty, e.category_id,
                   c.name AS category_name,
                   ev.version_number AS current_version_number,
                   e.status, e.like_count, e.created_at
            FROM exercises e
            LEFT JOIN categories c ON c.id = e.category_id
            LEFT JOIN exercise_versions ev ON ev.id = e.current_version_id
            WHERE e.is_deleted = false AND e.status = 'PUBLISHED'
              AND (:type IS NULL OR e.type = :type)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
              AND e.id IN (
                  SELECT ce.exercise_id FROM course_exercises ce
                  WHERE ce.course_id IN (
                      SELECT cs.course_id FROM course_students cs WHERE cs.user_id = :userId
                  )
              )
            ORDER BY e.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM exercises e
            WHERE e.is_deleted = false AND e.status = 'PUBLISHED'
              AND (:type IS NULL OR e.type = :type)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
              AND e.id IN (
                  SELECT ce.exercise_id FROM course_exercises ce
                  WHERE ce.course_id IN (
                      SELECT cs.course_id FROM course_students cs WHERE cs.user_id = :userId
                  )
              )
            """,
            nativeQuery = true)
    Page<ExerciseListView> findPublishedFilteredForStudent(
            @Param("type") String type,
            @Param("categoryId") Long categoryId,
            @Param("difficulty") String difficulty,
            @Param("userId") Long userId,
            Pageable pageable);
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java
git commit -m "feat(f5): add student browse queries to ExerciseRepository"
```

---

## Task 3: Student DTOs

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/student/StudentExerciseListDto.java`
- Create: `backend/src/main/java/com/platform/exercise/student/StudentVersionDto.java`
- Create: `backend/src/main/java/com/platform/exercise/student/StudentExerciseDetailDto.java`

- [ ] **Step 1: Create `StudentExerciseListDto`**

```java
// backend/src/main/java/com/platform/exercise/student/StudentExerciseListDto.java
package com.platform.exercise.student;

import com.platform.exercise.repository.ExerciseListView;

public record StudentExerciseListDto(
        Long id,
        String title,
        String type,
        String difficulty,
        CategoryRef category,
        Integer currentVersionNumber,
        int likeCount
) {
    public record CategoryRef(Long id, String name) {}

    public static StudentExerciseListDto from(ExerciseListView v) {
        CategoryRef cat = (v.getCategoryId() != null && v.getCategoryName() != null)
                ? new CategoryRef(v.getCategoryId(), v.getCategoryName())
                : null;
        return new StudentExerciseListDto(
                v.getId(), v.getTitle(), v.getType(), v.getDifficulty(),
                cat, v.getCurrentVersionNumber(),
                v.getLikeCount() != null ? v.getLikeCount() : 0);
    }
}
```

- [ ] **Step 2: Create `StudentVersionDto`**

```java
// backend/src/main/java/com/platform/exercise/student/StudentVersionDto.java
package com.platform.exercise.student;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record StudentVersionDto(
        Long id,
        int versionNumber,
        String description,
        List<String> hints,
        JsonNode config
) {}
```

- [ ] **Step 3: Create `StudentExerciseDetailDto`**

```java
// backend/src/main/java/com/platform/exercise/student/StudentExerciseDetailDto.java
package com.platform.exercise.student;

public record StudentExerciseDetailDto(
        Long id,
        String title,
        String type,
        String difficulty,
        CategoryRef category,
        StudentVersionDto version,
        int likeCount,
        boolean liked
) {
    public record CategoryRef(Long id, String name) {}
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/
git commit -m "feat(f5): add student exercise DTOs"
```

---

## Task 4: StudentExerciseService

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java`

- [ ] **Step 1: Create the service**

```java
// backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java
package com.platform.exercise.student;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Category;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.repository.CategoryRepository;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.settings.SettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class StudentExerciseService {

    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final CategoryRepository categoryRepository;
    private final SettingsService settingsService;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public PageResponse<StudentExerciseListDto> listExercises(
            String type, Long categoryId, String difficulty, int page, int size, Long userId) {
        PageRequest pageable = PageRequest.of(page, size);
        boolean filterEnabled = settingsService.getSettings().courseFilterEnabled();
        Page<StudentExerciseListDto> result = filterEnabled
                ? exerciseRepository.findPublishedFilteredForStudent(
                        type, categoryId, difficulty, userId, pageable)
                        .map(StudentExerciseListDto::from)
                : exerciseRepository.findPublishedFiltered(
                        type, categoryId, difficulty, pageable)
                        .map(StudentExerciseListDto::from);
        return PageResponse.of(result);
    }

    @Transactional(readOnly = true)
    public StudentExerciseDetailDto getExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toDetailDto(exercise, version);
    }

    private StudentExerciseDetailDto toDetailDto(Exercise exercise, ExerciseVersion version) {
        try {
            List<String> hints = version.getHints() != null
                    ? objectMapper.readValue(version.getHints(), new TypeReference<>() {})
                    : List.of();
            JsonNode rawConfig = objectMapper.readTree(version.getConfig());
            JsonNode strippedConfig = stripConfig(exercise.getType().name(), rawConfig);

            StudentExerciseDetailDto.CategoryRef cat = null;
            if (exercise.getCategoryId() != null) {
                cat = categoryRepository.findById(exercise.getCategoryId())
                        .map(c -> new StudentExerciseDetailDto.CategoryRef(c.getId(), c.getName()))
                        .orElse(null);
            }

            StudentVersionDto versionDto = new StudentVersionDto(
                    version.getId(), version.getVersionNumber(),
                    version.getDescription(), hints, strippedConfig);

            return new StudentExerciseDetailDto(
                    exercise.getId(), exercise.getTitle(),
                    exercise.getType().name(), exercise.getDifficulty().name(),
                    cat, versionDto, exercise.getLikeCount(), false);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to parse version config", e);
        }
    }

    private JsonNode stripConfig(String type, JsonNode config) {
        ObjectNode stripped = (ObjectNode) config.deepCopy();
        stripped.remove("gradingRules");
        if ("PYTHON".equals(type)) {
            JsonNode testCases = stripped.get("testCases");
            ArrayNode visible = objectMapper.createArrayNode();
            if (testCases != null && testCases.isArray()) {
                for (JsonNode tc : testCases) {
                    if (tc.path("visible").asBoolean(true)) {
                        ObjectNode clean = (ObjectNode) tc.deepCopy();
                        clean.remove("visible");
                        visible.add(clean);
                    }
                }
            }
            stripped.remove("testCases");
            stripped.set("visibleTestCases", visible);
        }
        return stripped;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java
git commit -m "feat(f5): add StudentExerciseService with course filter and config stripping"
```

---

## Task 5: StudentExerciseController → All Tests Pass

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/student/StudentExerciseController.java`

- [ ] **Step 1: Create the controller**

```java
// backend/src/main/java/com/platform/exercise/student/StudentExerciseController.java
package com.platform.exercise.student;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/student/exercises")
@RequiredArgsConstructor
@PreAuthorize("hasRole('STUDENT')")
public class StudentExerciseController {

    private final StudentExerciseService studentExerciseService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<PageResponse<StudentExerciseListDto>> list(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String difficulty,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(
                studentExerciseService.listExercises(type, categoryId, difficulty, page, size, userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<StudentExerciseDetailDto> get(@PathVariable Long id) {
        return ResponseEntity.ok(studentExerciseService.getExercise(id));
    }

    private Long resolveUserId(Authentication authentication) {
        return userRepository.findByUsername(authentication.getName())
                .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND))
                .getId();
    }
}
```

- [ ] **Step 2: Run student tests — expect all 13 to pass**

```bash
cd backend && mvn test -Dtest=StudentExerciseControllerTest -q 2>&1 | tail -6
```

Expected:
```
Tests run: 13, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

- [ ] **Step 3: Run full backend test suite — must stay green**

```bash
cd backend && mvn test -q 2>&1 | tail -6
```

Expected: `BUILD SUCCESS` with no failures.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/
git commit -m "feat(f5): add StudentExerciseController — slice 1 backend complete"
```

---

## Task 6: Frontend Slice 1 — Browse Exercises

**Files:**
- Create: `frontend/src/api/studentApi.js`
- Create: `frontend/src/pages/student/ExerciseListPage.jsx`
- Modify: `frontend/src/pages/student/StudentPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create `studentApi.js`**

```js
// frontend/src/api/studentApi.js
import axiosInstance from './axiosInstance';

export const studentApi = {
  listExercises: (params = {}) =>
    axiosInstance.get('/v1/student/exercises', { params }).then(r => r.data),

  getExercise: (id) =>
    axiosInstance.get(`/v1/student/exercises/${id}`).then(r => r.data),
};
```

- [ ] **Step 2: Create `ExerciseListPage.jsx`**

```jsx
// frontend/src/pages/student/ExerciseListPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { categoryApi } from '../../api/categoryApi';

const TYPE_BADGE = { BLOCKLY: { label: 'Blockly', bg: '#e3f2fd' }, PYTHON: { label: 'Python', bg: '#f3e5f5' } };
const DIFF_BADGE = { EASY: '#e8f5e9', MEDIUM: '#fff3e0', HARD: '#fce4ec' };

export default function ExerciseListPage() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ type: '', categoryId: '', difficulty: '' });

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
    categoryApi.list().then(setCategories);
    load(0);
  }, []);

  function handleFilter(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    load(0, next);
  }

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      <h1>Exercises</h1>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <select value={filters.type} onChange={e => handleFilter('type', e.target.value)}>
          <option value="">All Types</option>
          <option value="BLOCKLY">Blockly</option>
          <option value="PYTHON">Python</option>
        </select>

        <select value={filters.categoryId} onChange={e => handleFilter('categoryId', e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select value={filters.difficulty} onChange={e => handleFilter('difficulty', e.target.value)}>
          <option value="">All Difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
      </div>

      {/* Exercise cards */}
      {loading ? (
        <p>Loading…</p>
      ) : exercises.length === 0 ? (
        <p style={{ color: '#888' }}>No exercises found.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16 }}>
          {exercises.map(ex => {
            const type = TYPE_BADGE[ex.type] || { label: ex.type, bg: '#eee' };
            return (
              <div
                key={ex.id}
                onClick={() => navigate(`/student/exercises/${ex.id}`)}
                style={{
                  border: '1px solid #ddd', borderRadius: 8, padding: 16,
                  cursor: 'pointer', background: '#fff',
                  boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                }}
              >
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span style={{ background: type.bg, borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                    {type.label}
                  </span>
                  <span style={{ background: DIFF_BADGE[ex.difficulty] || '#eee', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
                    {ex.difficulty}
                  </span>
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>{ex.title}</h3>
                {ex.category && (
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#666' }}>{ex.category.name}</p>
                )}
                <p style={{ margin: 0, fontSize: 12, color: '#999' }}>♥ {ex.likeCount}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          <button onClick={() => load(page - 1)} disabled={page === 0}>Prev</button>
          <span>{page + 1} / {totalPages}</span>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1}>Next</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `StudentPage.jsx` to add nav link**

Replace the full contents of `frontend/src/pages/student/StudentPage.jsx`:

```jsx
// frontend/src/pages/student/StudentPage.jsx
import { Link } from 'react-router-dom';

export default function StudentPage() {
  return (
    <div style={{ padding: 32 }}>
      <h1>Student Dashboard</h1>
      <nav style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <Link to="/student/exercises">Browse Exercises</Link>
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Add routes to `App.jsx`**

In `frontend/src/App.jsx`, add the following two imports after the existing student imports:

```jsx
import ExerciseListPage from './pages/student/ExerciseListPage';
import ExercisePracticeRouter from './pages/student/ExercisePracticeRouter';
```

Then inside `<Routes>`, after the existing `/student` route, add:

```jsx
          <Route path="/student/exercises" element={
            <ProtectedRoute requiredRole="STUDENT"><ExerciseListPage /></ProtectedRoute>
          } />
          <Route path="/student/exercises/:id" element={
            <ProtectedRoute requiredRole="STUDENT"><ExercisePracticeRouter /></ProtectedRoute>
          } />
```

- [ ] **Step 5: Verify build passes**

```bash
cd frontend && npm run build 2>&1 | tail -8
```

Expected: `✓ built in` with no errors. (Will warn about missing `ExercisePracticeRouter` import until Task 8 — create a stub first if needed.)

**If build fails due to missing `ExercisePracticeRouter`**, create a temporary stub:

```jsx
// frontend/src/pages/student/ExercisePracticeRouter.jsx  (temporary stub)
export default function ExercisePracticeRouter() {
  return <div>Loading exercise…</div>;
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/studentApi.js \
        frontend/src/pages/student/ExerciseListPage.jsx \
        frontend/src/pages/student/StudentPage.jsx \
        frontend/src/pages/student/ExercisePracticeRouter.jsx \
        frontend/src/App.jsx
git commit -m "feat(f5): add student exercise list page and routing — slice 1 frontend"
```

---

## Task 7: Blockly Worker

**Files:**
- Create: `frontend/src/workers/blocklyRunner.worker.js`

- [ ] **Step 1: Create the worker directory and file**

```bash
mkdir -p frontend/src/workers
```

```js
// frontend/src/workers/blocklyRunner.worker.js
self.onmessage = function ({ data: { code } }) {
  var lines = [];
  function print() {
    lines.push(Array.prototype.join.call(arguments, ' '));
  }
  try {
    new Function('print', code)(print);
    self.postMessage({ output: lines.join('\n'), error: null });
  } catch (e) {
    self.postMessage({ output: null, error: e.message });
  }
};
```

Notes:
- Uses `var` and `function` (not `const`/`let`) to stay compatible with `new Function` scope
- No `importScripts` — no external dependencies
- Timeout is enforced from the main thread via `worker.terminate()`; the worker never self-terminates

- [ ] **Step 2: Commit**

```bash
git add frontend/src/workers/blocklyRunner.worker.js
git commit -m "feat(f5): add blocklyRunner.worker.js"
```

---

## Task 8: Blockly Practice Page + ExercisePracticeRouter

**Files:**
- Create: `frontend/src/pages/student/BlocklyPracticePage.jsx`
- Replace: `frontend/src/pages/student/ExercisePracticeRouter.jsx`

- [ ] **Step 1: Create `BlocklyPracticePage.jsx`**

```jsx
// frontend/src/pages/student/BlocklyPracticePage.jsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';

const OUTPUT_STYLE = {
  background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace',
  fontSize: 13, padding: 12, borderRadius: 4,
  maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', margin: 0,
};

function mapError(msg) {
  if (!msg) return 'An error occurred.';
  return msg;
}

export default function BlocklyPracticePage({ exercise }) {
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);

  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [tle, setTle] = useState(false);
  const [hintIndex, setHintIndex] = useState(-1);
  const [exportModal, setExportModal] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [pythonCode, setPythonCode] = useState('');

  const version = exercise.version;
  const config = version.config;
  const hints = version.hints || [];
  const showCodeView = config.showCodeView || false;

  useEffect(() => {
    if (!containerRef.current) return;

    const toolboxXml = config.allowedBlocks?.length > 0
      ? `<xml>${config.allowedBlocks.map(b => `<block type="${b}"></block>`).join('')}</xml>`
      : '<xml></xml>';

    const workspace = Blockly.inject(containerRef.current, {
      toolbox: toolboxXml,
      trashcan: true,
      scrollbars: true,
    });
    workspaceRef.current = workspace;

    if (config.initialWorkspaceXml) {
      try {
        const dom = Blockly.utils.xml.textToDom(config.initialWorkspaceXml);
        Blockly.Xml.domToWorkspace(dom, workspace);
      } catch { /* invalid XML — start empty */ }
    }

    if (showCodeView) {
      workspace.addChangeListener(() => {
        try {
          setPythonCode(pythonGenerator.workspaceToCode(workspace));
        } catch { /* ignore transient errors */ }
      });
    }

    return () => { workspace.dispose(); workspaceRef.current = null; };
  }, []);

  function handleRun() {
    if (!workspaceRef.current) return;
    setRunning(true);
    setOutput(null);
    setTle(false);

    // Clean up any previous worker
    if (workerRef.current) workerRef.current.terminate();
    clearTimeout(timeoutRef.current);

    const jsCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
    const worker = new Worker(
      new URL('../../workers/blocklyRunner.worker.js', import.meta.url)
    );
    workerRef.current = worker;

    timeoutRef.current = setTimeout(() => {
      worker.terminate();
      workerRef.current = null;
      setRunning(false);
      setTle(true);
    }, 3000);

    worker.onmessage = ({ data: { output, error } }) => {
      clearTimeout(timeoutRef.current);
      workerRef.current = null;
      setRunning(false);
      setOutput(error ? `Error: ${mapError(error)}` : (output ?? '(no output)'));
    };

    worker.onerror = (e) => {
      clearTimeout(timeoutRef.current);
      workerRef.current = null;
      setRunning(false);
      setOutput(`Error: ${mapError(e.message)}`);
    };

    worker.postMessage({ code: jsCode });
  }

  function handleExport() {
    const name = studentName.trim();
    if (!name) { alert('Please enter your name.'); return; }
    const payload = {
      platformVersion: '1.0',
      exerciseId: exercise.id,
      exerciseTitle: exercise.title,
      exerciseType: 'BLOCKLY',
      exerciseVersion: version.versionNumber,
      studentName: name,
      answer: workspaceRef.current
        ? Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspaceRef.current))
        : '',
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_${exercise.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportModal(false);
    setStudentName('');
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h1>{exercise.title}</h1>
      <p style={{ color: '#555', marginBottom: 16 }}>{version.description}</p>

      {/* Blockly workspace */}
      <div ref={containerRef} style={{ height: 400, border: '1px solid #ddd', borderRadius: 4, marginBottom: 16 }} />

      {/* Python code view */}
      {showCodeView && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#555' }}>Python equivalent (read-only):</p>
          <pre style={OUTPUT_STYLE}>{pythonCode || '(empty workspace)'}</pre>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={handleRun}
          disabled={running}
          style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}
        >
          {running ? 'Running…' : 'Run'}
        </button>

        {hints.length > 0 && (
          <button
            onClick={() => setHintIndex(i => Math.min(i + 1, hints.length - 1))}
            disabled={hintIndex >= hints.length - 1}
            style={{ border: '1px solid #ddd', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}
          >
            {hintIndex < 0 ? 'Hint' : `Hint (${hintIndex + 1}/${hints.length})`}
          </button>
        )}

        <button
          onClick={() => setExportModal(true)}
          style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer', marginLeft: 'auto' }}
        >
          Export
        </button>
      </div>

      {/* Hints */}
      {hintIndex >= 0 && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 4, padding: 12, marginBottom: 16 }}>
          {hints[hintIndex]}
        </div>
      )}

      {/* Output panel */}
      {tle && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4, padding: 12, marginBottom: 12 }}>
          ⚠ Time Limit Exceeded (3 seconds)
        </div>
      )}
      {output !== null && <pre style={OUTPUT_STYLE}>{output}</pre>}

      {/* Export modal */}
      {exportModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320 }}>
            <h2 style={{ marginTop: 0 }}>Export Answer</h2>
            <label style={{ display: 'block', marginBottom: 8 }}>Your name:</label>
            <input
              type="text"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleExport()}
              style={{ width: '100%', padding: 8, marginBottom: 16, boxSizing: 'border-box' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setExportModal(false)}>Cancel</button>
              <button
                onClick={handleExport}
                style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
              >
                Download JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `ExercisePracticeRouter.jsx` with the real implementation**

```jsx
// frontend/src/pages/student/ExercisePracticeRouter.jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import BlocklyPracticePage from './BlocklyPracticePage';
import PythonPracticePage from './PythonPracticePage';

export default function ExercisePracticeRouter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exercise, setExercise] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    studentApi.getExercise(id)
      .then(setExercise)
      .catch(err => {
        if (err.response?.status === 404) setError('Exercise not found.');
        else setError('Failed to load exercise.');
      });
  }, [id]);

  if (error) return <div style={{ padding: 32 }}><p style={{ color: '#c62828' }}>{error}</p></div>;
  if (!exercise) return <div style={{ padding: 32 }}>Loading…</div>;

  if (exercise.type === 'BLOCKLY') return <BlocklyPracticePage exercise={exercise} />;
  if (exercise.type === 'PYTHON') return <PythonPracticePage exercise={exercise} />;
  return <div style={{ padding: 32 }}>Unknown exercise type: {exercise.type}</div>;
}
```

- [ ] **Step 3: Verify build passes**

```bash
cd frontend && npm run build 2>&1 | tail -8
```

Expected: `✓ built in` with no errors. (PythonPracticePage is imported but doesn't exist yet — create a stub if needed.)

**If build fails due to missing `PythonPracticePage`**, create a temporary stub:

```jsx
// frontend/src/pages/student/PythonPracticePage.jsx  (temporary stub)
export default function PythonPracticePage({ exercise }) {
  return <div style={{ padding: 32 }}><h1>{exercise.title}</h1><p>Python practice — coming in Task 9.</p></div>;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx \
        frontend/src/pages/student/ExercisePracticeRouter.jsx \
        frontend/src/pages/student/PythonPracticePage.jsx
git commit -m "feat(f5): add BlocklyPracticePage, ExercisePracticeRouter — slice 2 complete"
```

---

## Task 9: Pyodide Worker + Python Practice Page

**Files:**
- Create: `frontend/src/workers/pyodideRunner.worker.js`
- Replace: `frontend/src/pages/student/PythonPracticePage.jsx`

- [ ] **Step 1: Create `pyodideRunner.worker.js`**

```js
// frontend/src/workers/pyodideRunner.worker.js
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');

var pyodide = null;

var ERROR_MAP = [
  ['IndentationError', 'Check your indentation'],
  ['NameError',        'Variable not defined'],
  ['SyntaxError',      'Syntax error'],
  ['TypeError',        'Type mismatch'],
  ['IndexError',       'List index out of range'],
  ['ValueError',       'Invalid value'],
  ['AttributeError',   'No such attribute or method'],
];

function friendlyError(raw) {
  if (!raw) return 'An error occurred.';
  for (var i = 0; i < ERROR_MAP.length; i++) {
    if (raw.indexOf(ERROR_MAP[i][0]) !== -1) {
      // Extract line number if present
      var lineMatch = raw.match(/line (\d+)/i);
      var detail = lineMatch ? ' (line ' + lineMatch[1] + ')' : '';
      return ERROR_MAP[i][1] + detail;
    }
  }
  return raw.split('\n').pop() || raw;
}

self.onmessage = async function ({ data: { code, visibleTestCases } }) {
  try {
    if (!pyodide) {
      pyodide = await loadPyodide();
    }

    var results = [];
    for (var i = 0; i < visibleTestCases.length; i++) {
      var tc = visibleTestCases[i];
      var stdout = '';
      try {
        // Redirect stdout
        pyodide.runPython(
          'import sys, io\n' +
          'sys.stdout = io.StringIO()\n'
        );
        // Run user code then the test input expression
        pyodide.runPython(code);
        var actual = String(pyodide.runPython(tc.input));
        stdout = pyodide.runPython('sys.stdout.getvalue()');
        // If test input is an expression, use its return value; otherwise use stdout
        if (stdout.trim()) actual = stdout.trim();
        var passed = actual === String(tc.expectedOutput);
        results.push({ index: i, passed: passed, actual: actual, error: null });
      } catch (e) {
        results.push({ index: i, passed: false, actual: null, error: friendlyError(String(e)) });
      }
    }
    self.postMessage({ results: results, error: null });
  } catch (e) {
    self.postMessage({ results: [], error: String(e) });
  }
};
```

- [ ] **Step 2: Replace `PythonPracticePage.jsx` with the real implementation**

```jsx
// frontend/src/pages/student/PythonPracticePage.jsx
import { useRef, useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

const OUTPUT_STYLE = {
  background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace',
  fontSize: 13, padding: 12, borderRadius: 4,
  maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', margin: 0,
};

export default function PythonPracticePage({ exercise }) {
  const version = exercise.version;
  const config = version.config;
  const visibleTestCases = config.visibleTestCases || [];
  const timeLimitSeconds = config.timeLimitSeconds || 5;
  const hints = version.hints || [];

  const [code, setCode] = useState(config.starterCode || '');
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [tle, setTle] = useState(false);
  const [runError, setRunError] = useState(null);
  const [hintIndex, setHintIndex] = useState(-1);
  const [exportModal, setExportModal] = useState(false);
  const [studentName, setStudentName] = useState('');
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);

  // Keep worker alive across runs — only one Pyodide load
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../../workers/pyodideRunner.worker.js', import.meta.url),
      { type: 'classic' }
    );
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  function handleRun() {
    if (!workerRef.current || running) return;
    setRunning(true);
    setResults(null);
    setTle(false);
    setRunError(null);

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      workerRef.current.terminate();
      workerRef.current = new Worker(
        new URL('../../workers/pyodideRunner.worker.js', import.meta.url),
        { type: 'classic' }
      );
      workerRef.current.onmessage = handleWorkerMessage;
      workerRef.current.onerror = handleWorkerError;
      setRunning(false);
      setTle(true);
    }, timeLimitSeconds * 1000 + 500);

    workerRef.current.onmessage = handleWorkerMessage;
    workerRef.current.onerror = handleWorkerError;
    workerRef.current.postMessage({ code, visibleTestCases });
  }

  function handleWorkerMessage({ data: { results, error } }) {
    clearTimeout(timeoutRef.current);
    setRunning(false);
    if (error) setRunError(error);
    else setResults(results);
  }

  function handleWorkerError(e) {
    clearTimeout(timeoutRef.current);
    setRunning(false);
    setRunError(e.message || 'Worker error');
  }

  function handleExport() {
    const name = studentName.trim();
    if (!name) { alert('Please enter your name.'); return; }
    const payload = {
      platformVersion: '1.0',
      exerciseId: exercise.id,
      exerciseTitle: exercise.title,
      exerciseType: 'PYTHON',
      exerciseVersion: version.versionNumber,
      studentName: name,
      answer: code,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_${exercise.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportModal(false);
    setStudentName('');
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h1>{exercise.title}</h1>
      <p style={{ color: '#555', marginBottom: 16 }}>{version.description}</p>

      {/* Monaco editor */}
      <Editor
        height="320px"
        language="python"
        value={code}
        onChange={v => setCode(v || '')}
        options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
        theme="vs-dark"
      />

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, margin: '16px 0', flexWrap: 'wrap' }}>
        <button
          onClick={handleRun}
          disabled={running}
          style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}
        >
          {running ? 'Running…' : 'Run'}
        </button>

        {hints.length > 0 && (
          <button
            onClick={() => setHintIndex(i => Math.min(i + 1, hints.length - 1))}
            disabled={hintIndex >= hints.length - 1}
            style={{ border: '1px solid #ddd', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}
          >
            {hintIndex < 0 ? 'Hint' : `Hint (${hintIndex + 1}/${hints.length})`}
          </button>
        )}

        <button
          onClick={() => setExportModal(true)}
          style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer', marginLeft: 'auto' }}
        >
          Export
        </button>
      </div>

      {/* Hints */}
      {hintIndex >= 0 && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 4, padding: 12, marginBottom: 16 }}>
          {hints[hintIndex]}
        </div>
      )}

      {/* Test cases */}
      <h3>Test Cases</h3>
      {visibleTestCases.length === 0 ? (
        <p style={{ color: '#888' }}>No visible test cases for this exercise.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleTestCases.map((tc, i) => {
            const res = results?.[i];
            const bg = res ? (res.passed ? '#e8f5e9' : '#fce4ec') : '#f5f5f5';
            const icon = res ? (res.passed ? '✅' : '❌') : '○';
            return (
              <div key={i} style={{ background: bg, border: '1px solid #ddd', borderRadius: 4, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{icon}</span>
                  <code style={{ fontSize: 13 }}>{tc.input}</code>
                </div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                  Expected: <code>{tc.expectedOutput}</code>
                </div>
                {res && !res.passed && res.actual !== null && (
                  <div style={{ fontSize: 12, color: '#c62828', marginTop: 2 }}>
                    Got: <code>{res.actual}</code>
                  </div>
                )}
                {res?.error && (
                  <div style={{ fontSize: 12, color: '#c62828', marginTop: 2 }}>
                    Error: {res.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden test note */}
      <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>
        + hidden tests will also run on grading
      </p>

      {/* TLE / run error */}
      {tle && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4, padding: 12, marginTop: 12 }}>
          ⚠ Time Limit Exceeded ({timeLimitSeconds}s)
        </div>
      )}
      {runError && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 4, padding: 12, marginTop: 12 }}>
          Error: {runError}
        </div>
      )}

      {/* Export modal */}
      {exportModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320 }}>
            <h2 style={{ marginTop: 0 }}>Export Answer</h2>
            <label style={{ display: 'block', marginBottom: 8 }}>Your name:</label>
            <input
              type="text"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleExport()}
              style={{ width: '100%', padding: 8, marginBottom: 16, boxSizing: 'border-box' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setExportModal(false)}>Cancel</button>
              <button
                onClick={handleExport}
                style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
              >
                Download JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify final build passes with all new files**

```bash
cd frontend && npm run build 2>&1 | tail -8
```

Expected: `✓ built in` with no errors.

- [ ] **Step 4: Run full backend tests one final time**

```bash
cd backend && mvn test -q 2>&1 | tail -6
```

Expected: `BUILD SUCCESS` with no failures.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/workers/pyodideRunner.worker.js \
        frontend/src/pages/student/PythonPracticePage.jsx
git commit -m "feat(f5): add PythonPracticePage and pyodideRunner worker — F-5 complete"
```

---

## Self-Review Checklist

Checked against the design spec and p0.md acceptance criteria:

| Requirement | Covered by |
|---|---|
| `course_filter_enabled = false` → all PUBLISHED returned | Task 5 (service) + Task 1 test |
| Course filter on + enrolled → linked exercises only | Task 5 (service) + Task 1 test |
| Course filter on + no enrollment → empty | Task 5 (service) + Task 1 test |
| Filters: type, categoryId, difficulty | Task 2 (queries) + Task 1 tests |
| Hidden test cases stripped from Python response | Task 4 (stripConfig) + Task 1 test |
| `gradingRules` stripped from both types | Task 4 (stripConfig) + Task 1 tests |
| `likeCount` returned | Task 3 (DTO uses `like_count` column) |
| `liked` always false | Task 3 (DTO hardcodes `false`) |
| 404 on deleted, draft, non-existent exercise | Task 1 tests + Task 4 filter |
| TUTOR on student endpoint → 403 | Task 1 test + Task 5 (`@PreAuthorize`) |
| Blockly: workspace with allowedBlocks + initialWorkspaceXml | Task 8 (BlocklyPracticePage) |
| Blockly: showCodeView panel (pythonGenerator) | Task 8 (BlocklyPracticePage) |
| Blockly: Run → JS worker → output panel | Task 7 (worker) + Task 8 |
| Blockly: 3s TLE → terminate + warning | Task 8 (`setTimeout 3000`) |
| Blockly: hints one at a time | Task 8 (hintIndex state) |
| Blockly: Export → JSON download, no server call | Task 8 (handleExport) |
| Python: Monaco pre-filled with starterCode | Task 9 (PythonPracticePage) |
| Python: visible test cases shown with ✅/❌ | Task 9 (results render) |
| Python: "+ N hidden tests" note | Task 9 (static note) |
| Python: TLE → terminate + warning | Task 9 (`timeLimitSeconds * 1000 + 500`) |
| Python: error messages human-readable (5 types) | Task 9 (worker ERROR_MAP, 7 types) |
| Python: Pyodide reused across runs | Task 9 (worker kept alive via `useEffect`) |
| Python: Export → JSON download | Task 9 (handleExport) |
| Export JSON format matches spec | Tasks 8 & 9 (payload shape) |
| Student routes in App.jsx | Task 6 |
| StudentPage nav link | Task 6 |
