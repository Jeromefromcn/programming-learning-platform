# F-6 Submission & Grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full submission import, auto-grading, manual review, and CSV export pipeline for tutor use.

**Architecture:** `FileImportService` parses and validates each JSON/ZIP file, calls `BlocklyGrader` (Rhino JS execution) or `PythonGrader` (REST to sandbox), and persists results. `SubmissionService` orchestrates list/detail/grade/CSV. Three new tutor pages (import, list, detail) connect to a new `submissionApi.js` client.

**Tech Stack:** Java 17 · Spring Boot 3.2.5 · Rhino 1.7.15 · Apache Commons CSV 1.11 · Caffeine · React 18 · Monaco Editor · Axios

---

## File Map

**Backend — new:**
- `domain/Submission.java`
- `repository/SubmissionRepository.java`
- `grading/BlocklyGrader.java`
- `grading/PythonGrader.java`
- `submission/ImportResultDto.java`
- `submission/ImportResponseDto.java`
- `submission/ForceImportRequest.java`
- `submission/SubmissionListItemDto.java`
- `submission/SubmissionDetailDto.java`
- `submission/GradeRequest.java`
- `submission/ImportBatchCache.java`
- `submission/FileImportService.java`
- `submission/SubmissionService.java`
- `submission/SubmissionController.java`

**Backend — modified:**
- `security/SecurityConfig.java` — add `/v1/submissions/export-csv` to `permitAll`
- `security/RateLimitFilter.java` — add import rate limit (5/min per user)

**Backend — tests:**
- `grading/BlocklyGraderTest.java`
- `grading/PythonGraderTest.java`
- `submission/FileImportServiceTest.java`
- `submission/SubmissionControllerTest.java`

**Frontend — new:**
- `src/api/submissionApi.js`
- `src/pages/tutor/SubmissionImportPage.jsx`
- `src/pages/tutor/SubmissionListPage.jsx`
- `src/pages/tutor/SubmissionDetailPage.jsx`

**Frontend — modified:**
- `src/pages/student/BlocklyPracticePage.jsx` — export JS code instead of workspace XML
- `src/App.jsx` — add 3 tutor routes
- `src/pages/tutor/TutorPage.jsx` — add Submissions nav link

All backend paths are relative to `backend/src/main/java/com/platform/exercise/`.
All test paths are relative to `backend/src/test/java/com/platform/exercise/`.

---

## Task 1: Fix Blockly Export — JS Instead of XML

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx`

The current export stores workspace XML. Grading needs the generated JavaScript code.

- [ ] **Step 1: Update the export payload in BlocklyPracticePage.jsx**

In `handleExport()` (around line 118), change `answer` from workspace XML to generated JS:

```jsx
// Before:
answer: workspaceRef.current
  ? Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspaceRef.current))
  : '',

// After:
answer: workspaceRef.current
  ? javascriptGenerator.workspaceToCode(workspaceRef.current)
  : '',
```

The import for `javascriptGenerator` is already at the top of the file (line 4). No other changes needed.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx
git commit -m "fix(f6): export Blockly answer as generated JS instead of workspace XML"
```

---

## Task 2: Submission Entity + Repository

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/domain/Submission.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`

- [ ] **Step 1: Create Submission.java**

```java
package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "submissions")
@Data
@NoArgsConstructor
public class Submission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "exercise_id", nullable = false)
    private Long exerciseId;

    @Column(name = "graded_version_id", nullable = false)
    private Long gradedVersionId;

    @Column(name = "student_name", nullable = false, length = 128)
    private String studentName;

    @Column(name = "exercise_type", nullable = false, length = 20)
    private String exerciseType;

    @Column(name = "answer_data", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String answerData;

    @Column(name = "export_timestamp", nullable = false)
    private LocalDateTime exportTimestamp;

    @Column(name = "version_mismatch", nullable = false)
    private boolean versionMismatch = false;

    @Column(name = "student_version_number")
    private Integer studentVersionNumber;

    @Column(name = "auto_score", precision = 5, scale = 2)
    private BigDecimal autoScore;

    @Column(name = "auto_grade_details", columnDefinition = "JSON")
    private String autoGradeDetails;

    @Column(name = "tutor_score", precision = 5, scale = 2)
    private BigDecimal tutorScore;

    @Column(name = "tutor_comment", columnDefinition = "TEXT")
    private String tutorComment;

    @Column(name = "import_batch_id", length = 36)
    private String importBatchId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
```

- [ ] **Step 2: Create SubmissionRepository.java**

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

    boolean existsByStudentNameAndExerciseIdAndExportTimestamp(
            String studentName, Long exerciseId, LocalDateTime exportTimestamp);

    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
            ORDER BY created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
            """,
            nativeQuery = true)
    Page<Submission> findFiltered(
            @Param("exerciseId") Long exerciseId,
            @Param("studentName") String studentName,
            Pageable pageable);

    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
            ORDER BY created_at DESC
            """,
            nativeQuery = true)
    List<Submission> findAllForExport(@Param("exerciseId") Long exerciseId);
}
```

- [ ] **Step 3: Verify the project compiles**

```bash
cd backend && mvn compile -q
```

Expected: `BUILD SUCCESS`

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/domain/Submission.java \
        backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java
git commit -m "feat(f6): add Submission entity and SubmissionRepository"
```

---

## Task 3: BlocklyGrader (TDD)

**Files:**
- Create: `backend/src/test/java/com/platform/exercise/grading/BlocklyGraderTest.java`
- Create: `backend/src/main/java/com/platform/exercise/grading/BlocklyGrader.java`

- [ ] **Step 1: Write the failing tests**

```java
package com.platform.exercise.grading;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class BlocklyGraderTest {

    private final BlocklyGrader grader = new BlocklyGrader();

    private static final String BLOCKLY_CONFIG_OUTPUT_MATCH_ON =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello World\"}}}";
    private static final String BLOCKLY_CONFIG_OUTPUT_MATCH_OFF =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":false}}}";

    @Test
    void grade_correctOutput_returns100() {
        String code = "print('Hello World');";
        BlocklyGrader.Result result = grader.grade(code, BLOCKLY_CONFIG_OUTPUT_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void grade_wrongOutput_returns0() {
        String code = "print('Wrong');";
        BlocklyGrader.Result result = grader.grade(code, BLOCKLY_CONFIG_OUTPUT_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.autoGradeDetailsJson()).contains("\"passed\":false");
    }

    @Test
    void grade_infiniteLoop_returnsNullScoreWithTleError() {
        String code = "while(true){}";
        BlocklyGrader.Result result = grader.grade(code, BLOCKLY_CONFIG_OUTPUT_MATCH_ON);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("TIME_LIMIT_EXCEEDED");
    }

    @Test
    void grade_outputMatchDisabled_returnsNullScoreWithNoRuleMessage() {
        String code = "print('Hello World');";
        BlocklyGrader.Result result = grader.grade(code, BLOCKLY_CONFIG_OUTPUT_MATCH_OFF);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("No grading rules");
    }
}
```

- [ ] **Step 2: Run tests — expect compilation failure (class does not exist yet)**

```bash
cd backend && mvn test -pl . -Dtest=BlocklyGraderTest -q 2>&1 | tail -5
```

Expected: `COMPILATION ERROR` — `BlocklyGrader` not found.

- [ ] **Step 3: Create BlocklyGrader.java**

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mozilla.javascript.*;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.concurrent.*;

@Component
public class BlocklyGrader {

    private static final int TIMEOUT_SECONDS = 3;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ObjectMapper mapper = new ObjectMapper();

    public record Result(BigDecimal autoScore, String autoGradeDetailsJson) {}

    public Result grade(String studentCode, String configJson) {
        try {
            JsonNode config = mapper.readTree(configJson);
            JsonNode outputMatch = config.path("gradingRules").path("outputMatch");

            if (!outputMatch.path("enabled").asBoolean(false)) {
                return new Result(null,
                    "{\"type\":\"BLOCKLY\",\"rule\":\"none\",\"passed\":null," +
                    "\"error\":\"No grading rules configured\"}");
            }

            String expected = outputMatch.path("expectedOutput").asText("").trim();
            Future<String> future = executor.submit(() -> runInRhino(studentCode));

            String actual = null;
            String error = null;
            try {
                actual = future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                future.cancel(true);
                error = "TIME_LIMIT_EXCEEDED";
            } catch (ExecutionException e) {
                error = e.getCause() != null ? e.getCause().getMessage() : "EXECUTION_ERROR";
            }

            boolean passed = error == null && expected.equals(actual);
            BigDecimal score = error != null ? null
                    : (passed ? new BigDecimal("100.00")
                              : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));

            String details = String.format(
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":%s," +
                "\"expected\":%s,\"actual\":%s,\"error\":%s}",
                error != null ? "null" : passed,
                mapper.writeValueAsString(expected),
                mapper.writeValueAsString(actual),
                mapper.writeValueAsString(error));

            return new Result(score, details);
        } catch (Exception e) {
            return new Result(null,
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":false," +
                "\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    private String runInRhino(String code) {
        StringBuilder output = new StringBuilder();
        Context cx = Context.enter();
        try {
            cx.setOptimizationLevel(-1);
            Scriptable scope = cx.initSafeStandardObjects();
            scope.put("print", scope, new BaseFunction() {
                @Override
                public Object call(Context cx, Scriptable scope, Scriptable thisObj, Object[] args) {
                    if (args.length > 0) {
                        output.append(Context.toString(args[0])).append('\n');
                    }
                    return Context.getUndefinedValue();
                }
            });
            cx.evaluateString(scope, code, "student", 1, null);
        } finally {
            Context.exit();
        }
        return output.toString().stripTrailing();
    }
}
```

- [ ] **Step 4: Run tests — expect all 4 to pass**

```bash
cd backend && mvn test -Dtest=BlocklyGraderTest -q 2>&1 | tail -5
```

Expected: `Tests run: 4, Failures: 0, Errors: 0, Skipped: 0`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/grading/BlocklyGrader.java \
        backend/src/test/java/com/platform/exercise/grading/BlocklyGraderTest.java
git commit -m "feat(f6): add BlocklyGrader with Rhino JS execution and outputMatch scoring"
```

---

## Task 4: PythonGrader (TDD)

**Files:**
- Create: `backend/src/test/java/com/platform/exercise/grading/PythonGraderTest.java`
- Create: `backend/src/main/java/com/platform/exercise/grading/PythonGrader.java`

- [ ] **Step 1: Write the failing tests**

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.platform.exercise.exercise.SandboxClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PythonGraderTest {

    @Mock
    private SandboxClient sandboxClient;

    private PythonGrader grader;
    private final ObjectMapper mapper = new ObjectMapper();

    private static final String PYTHON_CONFIG = """
            {
              "timeLimitSeconds": 5,
              "testCases": [
                {"input": "f(1)", "expectedOutput": "1", "visible": true},
                {"input": "f(2)", "expectedOutput": "2", "visible": false}
              ]
            }
            """;

    @BeforeEach
    void setUp() {
        grader = new PythonGrader(sandboxClient, mapper);
    }

    private ObjectNode makeResults(boolean... passes) {
        ObjectNode root = mapper.createObjectNode();
        ArrayNode results = root.putArray("results");
        for (int i = 0; i < passes.length; i++) {
            ObjectNode r = results.addObject();
            r.put("index", i);
            r.put("passed", passes[i]);
            r.put("actual", passes[i] ? String.valueOf(i + 1) : "wrong");
            r.putNull("error");
            r.put("executionTimeMs", 10);
        }
        return root;
    }

    @Test
    void grade_allPass_returns100() {
        when(sandboxClient.execute(any(), any(), anyInt())).thenReturn(makeResults(true, true));
        PythonGrader.Result result = grader.grade("def f(n): return n", PYTHON_CONFIG);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void grade_halfPass_returns50() {
        when(sandboxClient.execute(any(), any(), anyInt())).thenReturn(makeResults(true, false));
        PythonGrader.Result result = grader.grade("def f(n): return n", PYTHON_CONFIG);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("50.00"));
    }

    @Test
    void grade_sandboxUnavailable_returnsNullScoreWithError() {
        when(sandboxClient.execute(any(), any(), anyInt()))
            .thenThrow(new SandboxClient.SandboxUnavailableException("down"));
        PythonGrader.Result result = grader.grade("def f(n): return n", PYTHON_CONFIG);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("SANDBOX_UNAVAILABLE");
    }

    @Test
    void grade_allFail_returns0() {
        when(sandboxClient.execute(any(), any(), anyInt())).thenReturn(makeResults(false, false));
        PythonGrader.Result result = grader.grade("def f(n): return n", PYTHON_CONFIG);
        assertThat(result.autoScore()).isEqualByComparingTo(BigDecimal.ZERO);
    }
}
```

- [ ] **Step 2: Run tests — expect compilation failure**

```bash
cd backend && mvn test -Dtest=PythonGraderTest -q 2>&1 | tail -5
```

Expected: `COMPILATION ERROR` — `PythonGrader` not found.

- [ ] **Step 3: Create PythonGrader.java**

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.exercise.VerifyRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class PythonGrader {

    private final SandboxClient sandboxClient;
    private final ObjectMapper objectMapper;

    public record Result(BigDecimal autoScore, String autoGradeDetailsJson) {}

    public Result grade(String studentCode, String configJson) {
        try {
            JsonNode config = objectMapper.readTree(configJson);
            int timeLimitSeconds = config.path("timeLimitSeconds").asInt(5);

            List<VerifyRequest.TestCaseItem> testCases = new ArrayList<>();
            for (JsonNode tc : config.path("testCases")) {
                testCases.add(new VerifyRequest.TestCaseItem(
                    tc.path("input").asText(""),
                    tc.path("expectedOutput").asText("")
                ));
            }

            JsonNode sandboxResponse = sandboxClient.execute(studentCode, testCases, timeLimitSeconds);
            JsonNode results = sandboxResponse.path("results");

            int total = 0, passed = 0;
            for (JsonNode r : results) {
                total++;
                if (r.path("passed").asBoolean(false)) passed++;
            }

            BigDecimal score = total == 0 ? null
                    : new BigDecimal(passed)
                        .multiply(new BigDecimal("100"))
                        .divide(new BigDecimal(total), 2, RoundingMode.HALF_UP);

            String details = String.format(
                "{\"type\":\"PYTHON\",\"results\":%s,\"passedCount\":%d,\"totalCount\":%d}",
                results.toString(), passed, total);

            return new Result(score, details);

        } catch (SandboxClient.SandboxUnavailableException e) {
            return new Result(null, "{\"type\":\"PYTHON\",\"error\":\"SANDBOX_UNAVAILABLE\"}");
        } catch (Exception e) {
            return new Result(null,
                "{\"type\":\"PYTHON\",\"error\":\"" + e.getMessage() + "\"}");
        }
    }
}
```

- [ ] **Step 4: Run tests — expect all 4 to pass**

```bash
cd backend && mvn test -Dtest=PythonGraderTest -q 2>&1 | tail -5
```

Expected: `Tests run: 4, Failures: 0, Errors: 0, Skipped: 0`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/grading/PythonGrader.java \
        backend/src/test/java/com/platform/exercise/grading/PythonGraderTest.java
git commit -m "feat(f6): add PythonGrader with sandbox HTTP client and score aggregation"
```

---

## Task 5: DTOs + ImportBatchCache + FileImportService (TDD)

**Files:**
- Create: `submission/ImportResultDto.java`
- Create: `submission/ImportResponseDto.java`
- Create: `submission/ForceImportRequest.java`
- Create: `submission/ImportBatchCache.java`
- Create: `submission/FileImportService.java`
- Create: `backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java`

- [ ] **Step 1: Create the DTOs**

**`submission/ImportResultDto.java`:**
```java
package com.platform.exercise.submission;

import java.math.BigDecimal;

public record ImportResultDto(
    String filename,
    String status,
    Long submissionId,
    String studentName,
    String exerciseTitle,
    String exerciseType,
    BigDecimal autoScore,
    boolean versionMismatch,
    String message
) {
    static ImportResultDto imported(String filename, Long submissionId, String studentName,
            String exerciseTitle, String exerciseType, BigDecimal autoScore, boolean versionMismatch) {
        return new ImportResultDto(filename, "IMPORTED", submissionId, studentName,
                exerciseTitle, exerciseType, autoScore, versionMismatch, null);
    }

    static ImportResultDto duplicate(String filename, String studentName, String exerciseTitle) {
        return new ImportResultDto(filename, "DUPLICATE", null, studentName,
                exerciseTitle, null, null, false, "Duplicate submission detected.");
    }

    static ImportResultDto failed(String filename, String message) {
        return new ImportResultDto(filename, "FAILED", null, null, null, null, null, false, message);
    }
}
```

**`submission/ImportResponseDto.java`:**
```java
package com.platform.exercise.submission;

import java.util.List;

public record ImportResponseDto(
    String batchId,
    List<ImportResultDto> results,
    Summary summary
) {
    public record Summary(int total, int imported, int duplicates, int failed) {}
}
```

**`submission/ForceImportRequest.java`:**
```java
package com.platform.exercise.submission;

import jakarta.validation.constraints.NotBlank;

public record ForceImportRequest(
    @NotBlank String batchId,
    @NotBlank String filename
) {}
```

- [ ] **Step 2: Create ImportBatchCache.java**

```java
package com.platform.exercise.submission;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.concurrent.TimeUnit;

@Component
public class ImportBatchCache {

    private final Cache<String, byte[]> cache = Caffeine.newBuilder()
            .expireAfterWrite(5, TimeUnit.MINUTES)
            .maximumSize(2000)
            .build();

    public void put(String batchId, String filename, byte[] bytes) {
        cache.put(batchId + ":" + filename, bytes);
    }

    public Optional<byte[]> get(String batchId, String filename) {
        return Optional.ofNullable(cache.getIfPresent(batchId + ":" + filename));
    }
}
```

- [ ] **Step 3: Write FileImportServiceTest.java**

```java
package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.Exercise.ExerciseType;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.grading.BlocklyGrader;
import com.platform.exercise.grading.PythonGrader;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FileImportServiceTest {

    @Mock ExerciseRepository exerciseRepository;
    @Mock ExerciseVersionRepository versionRepository;
    @Mock SubmissionRepository submissionRepository;
    @Mock BlocklyGrader blocklyGrader;
    @Mock PythonGrader pythonGrader;
    @Mock ImportBatchCache batchCache;

    private FileImportService service;

    // Minimal valid Blockly exercise config
    private static final String BLOCKLY_CONFIG =
        "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello\"}}}";

    // Valid exported JSON bytes — Blockly exercise, version 1
    private byte[] validBlocklyJson(long exerciseId) {
        return String.format("""
            {"platformVersion":"1.0","exerciseId":%d,"exerciseTitle":"Hello","exerciseType":"BLOCKLY",
             "exerciseVersion":1,"studentName":"Alex","answer":"print('Hello');",
             "exportedAt":"2026-05-01T10:00:00Z"}""", exerciseId).getBytes();
    }

    @BeforeEach
    void setUp() {
        service = new FileImportService(
            exerciseRepository, versionRepository, submissionRepository,
            blocklyGrader, pythonGrader, batchCache, new ObjectMapper());
    }

    private Exercise stubExercise(long exerciseId, long versionId) {
        Exercise exercise = new Exercise();
        exercise.setId(exerciseId);
        exercise.setTitle("Hello");
        exercise.setType(ExerciseType.BLOCKLY);
        exercise.setCurrentVersionId(versionId);
        when(exerciseRepository.findByIdAndDeletedFalse(exerciseId)).thenReturn(Optional.of(exercise));
        ExerciseVersion version = new ExerciseVersion();
        version.setId(versionId);
        version.setVersionNumber(1);
        version.setConfig(BLOCKLY_CONFIG);
        when(versionRepository.findById(versionId)).thenReturn(Optional.of(version));
        return exercise;
    }

    @Test
    void processSingleFile_validJson_returnsImported() {
        stubExercise(1L, 10L);
        when(submissionRepository.existsByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(false);
        Submission saved = new Submission();
        saved.setId(42L);
        when(submissionRepository.save(any())).thenReturn(saved);
        when(blocklyGrader.grade(anyString(), anyString()))
            .thenReturn(new BlocklyGrader.Result(new BigDecimal("100.00"),
                "{\"type\":\"BLOCKLY\",\"passed\":true}"));

        ImportResultDto result = service.processSingleFile("alex.json", validBlocklyJson(1L), "batch-1", false);

        assertThat(result.status()).isEqualTo("IMPORTED");
        assertThat(result.submissionId()).isEqualTo(42L);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void processSingleFile_missingRequiredField_returnsFailed() {
        byte[] badJson = "{\"exerciseId\":1}".getBytes();
        ImportResultDto result = service.processSingleFile("bad.json", badJson, "batch-1", false);
        assertThat(result.status()).isEqualTo("FAILED");
        assertThat(result.message()).contains("Missing required fields");
    }

    @Test
    void processSingleFile_exerciseNotFound_returnsFailed() {
        when(exerciseRepository.findByIdAndDeletedFalse(99L)).thenReturn(Optional.empty());
        when(submissionRepository.existsByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(false);
        ImportResultDto result = service.processSingleFile("missing.json", validBlocklyJson(99L), "batch-1", false);
        assertThat(result.status()).isEqualTo("FAILED");
        assertThat(result.message()).contains("Exercise not found");
    }

    @Test
    void processSingleFile_duplicate_returnsDuplicateAndCachesBytes() {
        when(submissionRepository.existsByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(true);
        byte[] content = validBlocklyJson(1L);

        ImportResultDto result = service.processSingleFile("dup.json", content, "batch-1", false);

        assertThat(result.status()).isEqualTo("DUPLICATE");
        verify(batchCache).put("batch-1", "dup.json", content);
    }

    @Test
    void processZip_pathTraversal_throwsPlatformException() {
        // Build a ZIP with a path-traversal entry name
        byte[] zipBytes = buildZipWithEntry("../evil.json", "{\"x\":1}".getBytes());
        assertThatThrownBy(() -> service.processZip(zipBytes, "batch-1"))
            .hasMessageContaining("Path traversal");
    }

    // Helper: build a real ZIP in memory
    private byte[] buildZipWithEntry(String entryName, byte[] content) {
        try {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(bos);
            zos.putNextEntry(new java.util.zip.ZipEntry(entryName));
            zos.write(content);
            zos.closeEntry();
            zos.close();
            return bos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
```

- [ ] **Step 4: Run tests — expect compilation failure**

```bash
cd backend && mvn test -Dtest=FileImportServiceTest -q 2>&1 | tail -5
```

Expected: `COMPILATION ERROR` — `FileImportService` not found.

- [ ] **Step 5: Create FileImportService.java**

```java
package com.platform.exercise.submission;

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

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
@RequiredArgsConstructor
public class FileImportService {

    private static final long MAX_ZIP_DECOMPRESSED_BYTES = 100L * 1024 * 1024;
    private static final int MAX_ZIP_FILES = 500;
    private static final List<String> REQUIRED_FIELDS =
        List.of("exerciseId", "exerciseType", "studentName", "answer", "exportedAt");

    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final SubmissionRepository submissionRepository;
    private final BlocklyGrader blocklyGrader;
    private final PythonGrader pythonGrader;
    private final ImportBatchCache batchCache;
    private final ObjectMapper objectMapper;

    List<ImportResultDto> processZip(byte[] zipBytes, String batchId) throws IOException {
        List<ImportResultDto> results = new ArrayList<>();
        long totalBytes = 0;
        int fileCount = 0;

        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) { zis.closeEntry(); continue; }
                String entryName = entry.getName();
                if (entryName.contains("..")) {
                    throw new PlatformException(ErrorCode.ZIP_PATH_TRAVERSAL,
                        "Path traversal detected: " + entryName);
                }
                if (++fileCount > MAX_ZIP_FILES) {
                    throw new PlatformException(ErrorCode.ZIP_TOO_LARGE,
                        "ZIP contains more than " + MAX_ZIP_FILES + " files.");
                }
                byte[] content = zis.readAllBytes();
                totalBytes += content.length;
                if (totalBytes > MAX_ZIP_DECOMPRESSED_BYTES) {
                    throw new PlatformException(ErrorCode.ZIP_TOO_LARGE,
                        "Decompressed ZIP exceeds 100 MB.");
                }
                String filename = new File(entryName).getName();
                if (filename.toLowerCase().endsWith(".json")) {
                    results.add(processSingleFile(filename, content, batchId, false));
                }
                zis.closeEntry();
            }
        }
        return results;
    }

    ImportResultDto processSingleFile(String filename, byte[] content,
                                      String batchId, boolean skipDuplicateCheck) {
        try {
            JsonNode node = objectMapper.readTree(content);

            List<String> missing = REQUIRED_FIELDS.stream()
                .filter(f -> node.path(f).isMissingNode())
                .toList();
            if (!missing.isEmpty()) {
                return ImportResultDto.failed(filename,
                    "Missing required fields: " + String.join(", ", missing));
            }

            long exerciseId = node.path("exerciseId").asLong();
            String exerciseType = node.path("exerciseType").asText();
            String studentName = node.path("studentName").asText();
            String answer = node.path("answer").asText();
            String exportedAtStr = node.path("exportedAt").asText();
            Integer studentVersion = node.path("exerciseVersion").isMissingNode()
                ? null : node.path("exerciseVersion").asInt();

            LocalDateTime exportedAt = parseTimestamp(exportedAtStr);

            if (!skipDuplicateCheck && submissionRepository
                    .existsByStudentNameAndExerciseIdAndExportTimestamp(
                        studentName, exerciseId, exportedAt)) {
                batchCache.put(batchId, filename, content);
                return ImportResultDto.duplicate(filename, studentName, null);
            }

            Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId).orElse(null);
            if (exercise == null) {
                return ImportResultDto.failed(filename,
                    "Exercise not found or has been deleted.");
            }

            ExerciseVersion currentVersion = versionRepository
                .findById(exercise.getCurrentVersionId()).orElse(null);
            if (currentVersion == null) {
                return ImportResultDto.failed(filename, "Exercise configuration not found.");
            }

            boolean versionMismatch = studentVersion != null
                && studentVersion != currentVersion.getVersionNumber();

            BigDecimal autoScore;
            String autoGradeDetails;
            if ("BLOCKLY".equals(exerciseType)) {
                BlocklyGrader.Result gr = blocklyGrader.grade(answer, currentVersion.getConfig());
                autoScore = gr.autoScore();
                autoGradeDetails = gr.autoGradeDetailsJson();
            } else if ("PYTHON".equals(exerciseType)) {
                PythonGrader.Result gr = pythonGrader.grade(answer, currentVersion.getConfig());
                autoScore = gr.autoScore();
                autoGradeDetails = gr.autoGradeDetailsJson();
            } else {
                return ImportResultDto.failed(filename, "Unknown exercise type: " + exerciseType);
            }

            Submission sub = new Submission();
            sub.setExerciseId(exerciseId);
            sub.setGradedVersionId(currentVersion.getId());
            sub.setStudentName(studentName);
            sub.setExerciseType(exerciseType);
            sub.setAnswerData(answer);
            sub.setExportTimestamp(exportedAt);
            sub.setVersionMismatch(versionMismatch);
            sub.setStudentVersionNumber(studentVersion);
            sub.setAutoScore(autoScore);
            sub.setAutoGradeDetails(autoGradeDetails);
            sub.setImportBatchId(batchId);
            Submission saved = submissionRepository.save(sub);

            return ImportResultDto.imported(filename, saved.getId(), studentName,
                exercise.getTitle(), exerciseType, autoScore, versionMismatch);

        } catch (PlatformException e) {
            throw e;
        } catch (Exception e) {
            return ImportResultDto.failed(filename, "Parse error: " + e.getMessage());
        }
    }

    private LocalDateTime parseTimestamp(String raw) {
        try {
            return OffsetDateTime.parse(raw).toLocalDateTime();
        } catch (DateTimeParseException e) {
            return LocalDateTime.parse(raw);
        }
    }
}
```

- [ ] **Step 6: Run tests — expect all 5 to pass**

```bash
cd backend && mvn test -Dtest=FileImportServiceTest -q 2>&1 | tail -5
```

Expected: `Tests run: 5, Failures: 0, Errors: 0, Skipped: 0`

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/ \
        backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java
git commit -m "feat(f6): add DTOs, ImportBatchCache, and FileImportService with ZIP/JSON processing"
```

---

## Task 6: SubmissionService + SubmissionController + Security

**Files:**
- Create: `submission/SubmissionListItemDto.java`
- Create: `submission/SubmissionDetailDto.java`
- Create: `submission/GradeRequest.java`
- Create: `submission/SubmissionService.java`
- Create: `submission/SubmissionController.java`
- Modify: `security/SecurityConfig.java`
- Modify: `security/RateLimitFilter.java`

- [ ] **Step 1: Create remaining DTOs**

**`submission/SubmissionListItemDto.java`:**
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
    LocalDateTime createdAt
) {
    public static SubmissionListItemDto of(Submission sub, String exerciseTitle) {
        return new SubmissionListItemDto(
            sub.getId(), sub.getStudentName(), exerciseTitle,
            sub.getExerciseType(), sub.getAutoScore(), sub.getTutorScore(),
            sub.isVersionMismatch(), sub.getCreatedAt());
    }
}
```

**`submission/SubmissionDetailDto.java`:**
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
    LocalDateTime exportTimestamp,
    boolean versionMismatch,
    Integer studentVersionNumber,
    Integer gradedVersionNumber,
    BigDecimal autoScore,
    String autoGradeDetails,
    BigDecimal tutorScore,
    String tutorComment,
    LocalDateTime createdAt
) {
    public static SubmissionDetailDto of(Submission sub, String exerciseTitle, int gradedVersionNumber) {
        return new SubmissionDetailDto(
            sub.getId(), sub.getStudentName(), exerciseTitle,
            sub.getExerciseType(), sub.getAnswerData(), sub.getExportTimestamp(),
            sub.isVersionMismatch(), sub.getStudentVersionNumber(), gradedVersionNumber,
            sub.getAutoScore(), sub.getAutoGradeDetails(),
            sub.getTutorScore(), sub.getTutorComment(), sub.getCreatedAt());
    }
}
```

**`submission/GradeRequest.java`:**
```java
package com.platform.exercise.submission;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record GradeRequest(
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal tutorScore,
    @Size(max = 500) String tutorComment
) {}
```

- [ ] **Step 2: Create SubmissionService.java**

```java
package com.platform.exercise.submission;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SubmissionService {

    private final SubmissionRepository submissionRepository;
    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final FileImportService fileImportService;
    private final ImportBatchCache batchCache;

    // ── Import ───────────────────────────────────────────────────────────────

    @Transactional
    public ImportResponseDto importFiles(List<MultipartFile> files) throws IOException {
        String batchId = UUID.randomUUID().toString();
        List<ImportResultDto> results = new ArrayList<>();

        for (MultipartFile file : files) {
            String name = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";
            if (name.toLowerCase().endsWith(".zip")) {
                results.addAll(fileImportService.processZip(file.getBytes(), batchId));
            } else if (name.toLowerCase().endsWith(".json")) {
                results.add(fileImportService.processSingleFile(name, file.getBytes(), batchId, false));
            } else {
                results.add(ImportResultDto.failed(name, "Unsupported file type."));
            }
        }

        long imported = results.stream().filter(r -> "IMPORTED".equals(r.status())).count();
        long duplicates = results.stream().filter(r -> "DUPLICATE".equals(r.status())).count();
        long failed = results.stream().filter(r -> "FAILED".equals(r.status())).count();
        return new ImportResponseDto(batchId, results,
            new ImportResponseDto.Summary(results.size(), (int) imported, (int) duplicates, (int) failed));
    }

    @Transactional
    public ImportResultDto forceImport(ForceImportRequest req) throws IOException {
        byte[] bytes = batchCache.get(req.batchId(), req.filename())
            .orElseThrow(() -> new PlatformException(ErrorCode.IMPORT_FILE_INVALID,
                "Batch expired — please re-import the file."));
        return fileImportService.processSingleFile(req.filename(), bytes, req.batchId(), true);
    }

    // ── List ─────────────────────────────────────────────────────────────────

    public PageResponse<SubmissionListItemDto> list(Long exerciseId, String studentName,
                                                     int page, int size) {
        Page<Submission> submissionPage = submissionRepository.findFiltered(
            exerciseId,
            (studentName != null && studentName.isBlank()) ? null : studentName,
            PageRequest.of(page, size));

        // Batch-load exercise titles to avoid N+1
        List<Long> exerciseIds = submissionPage.map(Submission::getExerciseId).toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        Page<SubmissionListItemDto> dtoPage = submissionPage.map(sub ->
            SubmissionListItemDto.of(sub, titleMap.getOrDefault(sub.getExerciseId(), "Unknown")));
        return PageResponse.of(dtoPage);
    }

    // ── Detail ───────────────────────────────────────────────────────────────

    public SubmissionDetailDto getById(Long id) {
        Submission sub = submissionRepository.findById(id)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND,
                "Submission not found."));
        String exerciseTitle = exerciseRepository.findById(sub.getExerciseId())
            .map(Exercise::getTitle).orElse("Unknown");
        int gradedVersionNumber = versionRepository.findById(sub.getGradedVersionId())
            .map(ExerciseVersion::getVersionNumber).orElse(0);
        return SubmissionDetailDto.of(sub, exerciseTitle, gradedVersionNumber);
    }

    // ── Manual Grade ─────────────────────────────────────────────────────────

    @Transactional
    public SubmissionDetailDto grade(Long id, GradeRequest req) {
        Submission sub = submissionRepository.findById(id)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND,
                "Submission not found."));
        sub.setTutorScore(req.tutorScore());
        sub.setTutorComment(req.tutorComment());
        submissionRepository.save(sub);
        return getById(id);
    }

    // ── CSV Export ───────────────────────────────────────────────────────────

    public void exportCsv(Long exerciseId, HttpServletResponse response) throws IOException {
        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition",
            "attachment; filename=\"grades_" + LocalDate.now() + ".csv\"");

        List<Submission> subs = submissionRepository.findAllForExport(exerciseId);
        List<Long> exerciseIds = subs.stream().map(Submission::getExerciseId).distinct().toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        try (CSVPrinter printer = new CSVPrinter(
                new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8),
                CSVFormat.DEFAULT.builder()
                    .setHeader("Student Name", "Exercise Title", "Exercise Type",
                               "Auto Score", "Tutor Score", "Tutor Comment", "Submitted At")
                    .build())) {
            for (Submission sub : subs) {
                printer.printRecord(
                    sub.getStudentName(),
                    titleMap.getOrDefault(sub.getExerciseId(), ""),
                    sub.getExerciseType(),
                    sub.getAutoScore() != null ? sub.getAutoScore().toPlainString() : "",
                    sub.getTutorScore() != null ? sub.getTutorScore().toPlainString() : "",
                    sub.getTutorComment() != null ? sub.getTutorComment() : "",
                    sub.getExportTimestamp().toString());
            }
        }
    }
}
```

- [ ] **Step 3: Create SubmissionController.java**

```java
package com.platform.exercise.submission;

import com.platform.exercise.common.PageResponse;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/v1/submissions")
@RequiredArgsConstructor
@PreAuthorize("hasRole('TUTOR')")
public class SubmissionController {

    private final SubmissionService submissionService;

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportResponseDto> importFiles(
            @RequestParam("files") List<MultipartFile> files) throws IOException {
        return ResponseEntity.ok(submissionService.importFiles(files));
    }

    @PostMapping("/import-duplicate")
    public ResponseEntity<ImportResultDto> forceImport(
            @RequestBody @Valid ForceImportRequest req) throws IOException {
        return ResponseEntity.ok(submissionService.forceImport(req));
    }

    @GetMapping
    public ResponseEntity<PageResponse<SubmissionListItemDto>> list(
            @RequestParam(required = false) Long exerciseId,
            @RequestParam(required = false) String studentName,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(submissionService.list(exerciseId, studentName, page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<SubmissionDetailDto> getById(@PathVariable Long id) {
        return ResponseEntity.ok(submissionService.getById(id));
    }

    @PutMapping("/{id}/grade")
    public ResponseEntity<SubmissionDetailDto> grade(
            @PathVariable Long id,
            @RequestBody @Valid GradeRequest req) {
        return ResponseEntity.ok(submissionService.grade(id, req));
    }

    @GetMapping("/export-csv")
    @PreAuthorize("permitAll()")
    public void exportCsv(
            @RequestParam(required = false) Long exerciseId,
            HttpServletResponse response) throws IOException {
        submissionService.exportCsv(exerciseId, response);
    }
}
```

- [ ] **Step 4: Update SecurityConfig.java — add CSV to permitAll**

In `security/SecurityConfig.java`, add `/v1/submissions/export-csv` and `/api/v1/submissions/export-csv` to the `.requestMatchers(...).permitAll()` block:

```java
// Replace the existing requestMatchers block with:
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/v1/auth/login", "/v1/auth/refresh", "/v1/auth/logout").permitAll()
    .requestMatchers("/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout").permitAll()
    .requestMatchers("/v1/submissions/export-csv", "/api/v1/submissions/export-csv").permitAll()
    .requestMatchers("/actuator/**").permitAll()
    .anyRequest().authenticated()
)
```

- [ ] **Step 5: Update RateLimitFilter.java — add import rate limit**

Add import rate limiting by user ID (extracted from JWT). Add the `JwtUtil` dependency and a new rate-limit block after the login block:

The field declaration at the top of `RateLimitFilter`:
```java
// Add constructor injection
private final JwtUtil jwtUtil;

public RateLimitFilter(JwtUtil jwtUtil) {
    this.jwtUtil = jwtUtil;
}
```

Note: `RateLimitFilter` currently has no constructor (uses `@Component` with field injection pattern). Replace the class to add `JwtUtil`:

```java
package com.platform.exercise.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;

@Component
@Order(1)
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;

    private final Cache<String, Bucket> buckets = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterAccess(2, TimeUnit.MINUTES)
            .build();

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain)
            throws ServletException, IOException {
        String uri = request.getRequestURI();
        String method = request.getMethod();

        // Login: 10/min per IP
        boolean isLoginEndpoint = uri.equals("/v1/auth/login") || uri.equals("/api/v1/auth/login");
        if ("POST".equals(method) && isLoginEndpoint) {
            String ip = resolveIp(request);
            Bucket bucket = buckets.get(ip, k -> newBucket(10, 1));
            if (!bucket.tryConsume(1)) {
                writeRateLimitResponse(response, "Too many login attempts. Try again in 1 minute.");
                return;
            }
        }

        // Import: 5/min per user
        boolean isImportEndpoint = uri.equals("/v1/submissions/import") || uri.equals("/api/v1/submissions/import");
        if ("POST".equals(method) && isImportEndpoint) {
            String userId = extractUserIdFromToken(request);
            if (userId != null) {
                Bucket bucket = buckets.get("import:" + userId, k -> newBucket(5, 1));
                if (!bucket.tryConsume(1)) {
                    writeRateLimitResponse(response, "Import rate limit exceeded. Try again in 1 minute.");
                    return;
                }
            }
        }

        chain.doFilter(request, response);
    }

    private Bucket newBucket(long capacity, long refillMinutes) {
        return Bucket.builder()
            .addLimit(Bandwidth.builder()
                .capacity(capacity)
                .refillIntervally(capacity, Duration.ofMinutes(refillMinutes))
                .build())
            .build();
    }

    private String extractUserIdFromToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                return jwtUtil.parseToken(header.substring(7)).getSubject();
            } catch (Exception ignored) {}
        }
        return null;
    }

    private String resolveIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }

    private void writeRateLimitResponse(HttpServletResponse response, String message) throws IOException {
        response.setStatus(429);
        response.setContentType("application/json");
        response.getWriter().write(
            "{\"error\":{\"code\":\"RATE_LIMITED\",\"message\":\"" + message + "\"," +
            "\"timestamp\":\"" + Instant.now() + "\"}}");
    }
}
```

- [ ] **Step 6: Verify the project compiles**

```bash
cd backend && mvn compile -q
```

Expected: `BUILD SUCCESS`

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/ \
        backend/src/main/java/com/platform/exercise/security/SecurityConfig.java \
        backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java
git commit -m "feat(f6): add SubmissionService, SubmissionController, and security updates"
```

---

## Task 7: SubmissionControllerTest (Integration)

**Files:**
- Create: `backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java`

- [ ] **Step 1: Create SubmissionControllerTest.java**

```java
package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SubmissionControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ExerciseRepository exerciseRepository;
    @Autowired ExerciseVersionRepository versionRepository;
    @Autowired SubmissionRepository submissionRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired ObjectMapper objectMapper;
    @MockBean SandboxClient sandboxClient;

    private Exercise blocklyExercise;
    private ExerciseVersion blocklyVersion;
    private Exercise pythonExercise;
    private ExerciseVersion pythonVersion;

    private static final String BLOCKLY_CONFIG =
        "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello\"}}}";
    private static final String PYTHON_CONFIG =
        "{\"timeLimitSeconds\":5,\"testCases\":[{\"input\":\"f(1)\",\"expectedOutput\":\"1\",\"visible\":true}]}";

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("tutor1");
        tutor.setDisplayName("Tutor One");
        tutor.setPasswordHash(passwordEncoder.encode("pw"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        userRepository.save(tutor);

        blocklyExercise = new Exercise();
        blocklyExercise.setTitle("Hello Exercise");
        blocklyExercise.setDescription("desc");
        blocklyExercise.setType(Exercise.ExerciseType.BLOCKLY);
        blocklyExercise.setDifficulty(Exercise.Difficulty.EASY);
        blocklyExercise.setStatus(Exercise.Status.PUBLISHED);
        blocklyExercise.setCreatedBy(tutor.getId());
        blocklyExercise = exerciseRepository.save(blocklyExercise);

        blocklyVersion = new ExerciseVersion();
        blocklyVersion.setExerciseId(blocklyExercise.getId());
        blocklyVersion.setVersionNumber(1);
        blocklyVersion.setTitle("Hello Exercise");
        blocklyVersion.setDescription("desc");
        blocklyVersion.setDifficulty("EASY");
        blocklyVersion.setHints("[]");
        blocklyVersion.setConfig(BLOCKLY_CONFIG);
        blocklyVersion = versionRepository.save(blocklyVersion);

        blocklyExercise.setCurrentVersionId(blocklyVersion.getId());
        exerciseRepository.save(blocklyExercise);

        pythonExercise = new Exercise();
        pythonExercise.setTitle("Python Exercise");
        pythonExercise.setDescription("desc");
        pythonExercise.setType(Exercise.ExerciseType.PYTHON);
        pythonExercise.setDifficulty(Exercise.Difficulty.MEDIUM);
        pythonExercise.setStatus(Exercise.Status.PUBLISHED);
        pythonExercise.setCreatedBy(tutor.getId());
        pythonExercise = exerciseRepository.save(pythonExercise);

        pythonVersion = new ExerciseVersion();
        pythonVersion.setExerciseId(pythonExercise.getId());
        pythonVersion.setVersionNumber(1);
        pythonVersion.setTitle("Python Exercise");
        pythonVersion.setDescription("desc");
        pythonVersion.setDifficulty("MEDIUM");
        pythonVersion.setHints("[]");
        pythonVersion.setConfig(PYTHON_CONFIG);
        pythonVersion = versionRepository.save(pythonVersion);

        pythonExercise.setCurrentVersionId(pythonVersion.getId());
        exerciseRepository.save(pythonExercise);
    }

    private String blocklyExportJson(long exerciseId, String studentName, int version) {
        return String.format("""
            {"platformVersion":"1.0","exerciseId":%d,"exerciseTitle":"Hello Exercise",
             "exerciseType":"BLOCKLY","exerciseVersion":%d,"studentName":"%s",
             "answer":"print('Hello');","exportedAt":"2026-05-01T10:00:00Z"}""",
            exerciseId, version, studentName);
    }

    // ── Import ───────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void importSingleBlocklyJson_valid_returnsImported() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", "alex.json", "application/json",
            blocklyExportJson(blocklyExercise.getId(), "Alex", 1).getBytes());

        mockMvc.perform(multipart("/v1/submissions/import").file(file))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.imported").value(1))
            .andExpect(jsonPath("$.results[0].status").value("IMPORTED"))
            .andExpect(jsonPath("$.results[0].autoScore").exists())
            .andExpect(jsonPath("$.batchId").isNotEmpty());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void importDuplicateJson_secondTime_returnsDuplicateStatus() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", "alex.json", "application/json",
            blocklyExportJson(blocklyExercise.getId(), "Alex", 1).getBytes());

        // First import
        mockMvc.perform(multipart("/v1/submissions/import").file(file)).andExpect(status().isOk());

        // Second import — same file
        mockMvc.perform(multipart("/v1/submissions/import")
                .file(new MockMultipartFile("files", "alex.json", "application/json",
                    blocklyExportJson(blocklyExercise.getId(), "Alex", 1).getBytes())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.duplicates").value(1))
            .andExpect(jsonPath("$.results[0].status").value("DUPLICATE"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void importMissingFields_returnsFailed() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", "bad.json", "application/json",
            "{\"exerciseId\":1}".getBytes());

        mockMvc.perform(multipart("/v1/submissions/import").file(file))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.results[0].status").value("FAILED"));
    }

    @Test
    void importFiles_unauthenticated_returns401() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", "alex.json", "application/json",
            blocklyExportJson(blocklyExercise.getId(), "Alex", 1).getBytes());

        mockMvc.perform(multipart("/v1/submissions/import").file(file))
            .andExpect(status().isUnauthorized());
    }

    // ── List ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listSubmissions_noFilter_returnsAll() throws Exception {
        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        submissionRepository.save(sub);

        mockMvc.perform(get("/v1/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[0].studentName").value("Alex"))
            .andExpect(jsonPath("$.content[0].exerciseTitle").value("Hello Exercise"));
    }

    // ── Grade ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void gradeSubmission_validRequest_persistsTutorScore() throws Exception {
        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        Submission saved = submissionRepository.save(sub);

        mockMvc.perform(put("/v1/submissions/" + saved.getId() + "/grade")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"tutorScore\":80.0,\"tutorComment\":\"Good effort!\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tutorScore").value(80.0))
            .andExpect(jsonPath("$.tutorComment").value("Good effort!"));

        Submission updated = submissionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getTutorScore()).isEqualByComparingTo(new BigDecimal("80.00"));
    }

    // ── CSV Export ───────────────────────────────────────────────────────────

    @Test
    void exportCsv_unauthenticated_returns200WithCsv() throws Exception {
        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        sub.setAutoScore(new BigDecimal("100.00"));
        submissionRepository.save(sub);

        String csv = mockMvc.perform(get("/v1/submissions/export-csv"))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", org.hamcrest.Matchers.containsString("text/csv")))
            .andReturn().getResponse().getContentAsString();

        assertThat(csv).contains("Alex");
        assertThat(csv).contains("Hello Exercise");
        assertThat(csv).contains("100.00");
        // Tutor score absent → empty cell, not "null"
        assertThat(csv).doesNotContain("null");
    }
}
```

- [ ] **Step 2: Run the tests**

```bash
cd backend && mvn test -Dtest=SubmissionControllerTest -q 2>&1 | tail -10
```

Expected: `Tests run: 7, Failures: 0, Errors: 0, Skipped: 0`

- [ ] **Step 3: Run the full backend test suite to check for regressions**

```bash
cd backend && mvn test -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS` with no failures.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java
git commit -m "test(f6): add SubmissionControllerTest integration tests"
```

---

## Task 8: Frontend API Client

**Files:**
- Create: `frontend/src/api/submissionApi.js`

- [ ] **Step 1: Create submissionApi.js**

```js
import api from './index';

export const importFiles = (formData) =>
  api.post('/submissions/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const forceImport = (batchId, filename) =>
  api.post('/submissions/import-duplicate', { batchId, filename });

export const listSubmissions = (params) =>
  api.get('/submissions', { params });

export const getSubmission = (id) =>
  api.get(`/submissions/${id}`);

export const gradeSubmission = (id, payload) =>
  api.put(`/submissions/${id}/grade`, payload);
```

Note: CSV export uses a plain `<a href>` — no Axios call needed; the endpoint is unauthenticated.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/submissionApi.js
git commit -m "feat(f6): add submissionApi.js frontend API client"
```

---

## Task 9: SubmissionImportPage

**Files:**
- Create: `frontend/src/pages/tutor/SubmissionImportPage.jsx`

- [ ] **Step 1: Create SubmissionImportPage.jsx**

```jsx
import { useRef, useState } from 'react';
import { importFiles, forceImport } from '../../api/submissionApi';

const STATUS_COLOR = { IMPORTED: '#2e7d32', DUPLICATE: '#e65100', FAILED: '#c62828' };
const STATUS_BG = { IMPORTED: '#e8f5e9', DUPLICATE: '#fff3e0', FAILED: '#ffebee' };

export default function SubmissionImportPage() {
  const inputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [forceLoading, setForceLoading] = useState({});

  function handleDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(isValidFile);
    setSelectedFiles(files);
    setResponse(null);
  }

  function handleFileChange(e) {
    const files = Array.from(e.target.files).filter(isValidFile);
    setSelectedFiles(files);
    setResponse(null);
  }

  function isValidFile(f) {
    return f.name.endsWith('.json') || f.name.endsWith('.zip');
  }

  async function handleImport() {
    if (!selectedFiles.length) return;
    const formData = new FormData();
    selectedFiles.forEach(f => formData.append('files', f));
    setLoading(true);
    try {
      const { data } = await importFiles(formData);
      setResponse(data);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForceImport(batchId, filename, index) {
    setForceLoading(prev => ({ ...prev, [index]: true }));
    try {
      const { data } = await forceImport(batchId, filename);
      setResponse(prev => {
        const results = [...prev.results];
        results[index] = data;
        const imported = results.filter(r => r.status === 'IMPORTED').length;
        const duplicates = results.filter(r => r.status === 'DUPLICATE').length;
        const failed = results.filter(r => r.status === 'FAILED').length;
        return { ...prev, results, summary: { ...prev.summary, imported, duplicates, failed } };
      });
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Force import failed.');
    } finally {
      setForceLoading(prev => ({ ...prev, [index]: false }));
    }
  }

  const { summary, results, batchId } = response || {};

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h1>Import Submissions</h1>

      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current.click()}
        style={{
          border: '2px dashed #90caf9', borderRadius: 8, padding: 40,
          textAlign: 'center', cursor: 'pointer', background: '#f3f8ff', marginBottom: 16,
        }}
      >
        <p style={{ margin: 0, color: '#555' }}>
          Drop <strong>.json</strong> or <strong>.zip</strong> files here, or click to browse
        </p>
        {selectedFiles.length > 0 && (
          <p style={{ margin: '8px 0 0', color: '#1976d2' }}>
            {selectedFiles.length} file(s) selected: {selectedFiles.map(f => f.name).join(', ')}
          </p>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".json,.zip" multiple hidden onChange={handleFileChange} />

      <button
        onClick={handleImport}
        disabled={!selectedFiles.length || loading}
        style={{
          background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4,
          padding: '10px 24px', cursor: 'pointer', fontSize: 15, marginBottom: 24,
        }}
      >
        {loading ? 'Importing…' : 'Import'}
      </button>

      {summary && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: '#f5f5f5', borderRadius: 4 }}>
          <strong>
            {summary.imported} imported &nbsp;·&nbsp;
            {summary.duplicates} duplicates &nbsp;·&nbsp;
            {summary.failed} failed
          </strong>
        </div>
      )}

      {results && results.map((r, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', marginBottom: 8, borderRadius: 4,
          background: STATUS_BG[r.status] || '#fafafa',
        }}>
          <div>
            <span style={{
              display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 12,
              fontWeight: 700, marginRight: 10,
              background: STATUS_COLOR[r.status] || '#888', color: '#fff',
            }}>
              {r.status}
            </span>
            <strong>{r.filename}</strong>
            {r.studentName && <span style={{ color: '#555', marginLeft: 8 }}>{r.studentName}</span>}
            {r.exerciseTitle && <span style={{ color: '#555', marginLeft: 8 }}>— {r.exerciseTitle}</span>}
            {r.autoScore != null && (
              <span style={{ marginLeft: 8, color: '#333' }}>Score: {r.autoScore}</span>
            )}
            {r.message && <span style={{ color: '#c62828', marginLeft: 8 }}>{r.message}</span>}
          </div>
          {r.status === 'DUPLICATE' && (
            <button
              onClick={() => handleForceImport(batchId, r.filename, i)}
              disabled={forceLoading[i]}
              style={{
                background: '#e65100', color: '#fff', border: 'none', borderRadius: 4,
                padding: '4px 14px', cursor: 'pointer', fontSize: 13,
              }}
            >
              {forceLoading[i] ? 'Importing…' : 'Force Import'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionImportPage.jsx
git commit -m "feat(f6): add SubmissionImportPage with drop zone and force-import"
```

---

## Task 10: SubmissionListPage

**Files:**
- Create: `frontend/src/pages/tutor/SubmissionListPage.jsx`

- [ ] **Step 1: Create SubmissionListPage.jsx**

```jsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { listSubmissions } from '../../api/submissionApi';

const BASE_URL = '/api/v1';

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
      const { data } = await listSubmissions(params);
      setSubmissions(data.content);
      setTotalPages(data.totalPages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedFetch = useCallback(debounce(fetchSubmissions, 300), [fetchSubmissions]);

  useEffect(() => {
    const params = { page, size: 20 };
    if (studentName.trim()) params.studentName = studentName.trim();
    if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
    debouncedFetch(params);
  }, [page, studentName, exerciseId]);

  const csvHref = `${BASE_URL}/submissions/export-csv${exerciseId ? `?exerciseId=${exerciseId}` : ''}`;

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
              {['Student Name', 'Exercise', 'Type', 'Auto Score', 'Tutor Score', 'Mismatch', 'Date'].map(h => (
                <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No submissions found.</td></tr>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            style={{ padding: '4px 12px' }}>←</button>
          <span style={{ padding: '4px 8px' }}>Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            style={{ padding: '4px 12px' }}>→</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionListPage.jsx
git commit -m "feat(f6): add SubmissionListPage with filters and CSV export link"
```

---

## Task 11: SubmissionDetailPage

**Files:**
- Create: `frontend/src/pages/tutor/SubmissionDetailPage.jsx`

- [ ] **Step 1: Create SubmissionDetailPage.jsx**

```jsx
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmission, gradeSubmission } from '../../api/submissionApi';

export default function SubmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  const [submission, setSubmission] = useState(null);
  const [tutorScore, setTutorScore] = useState('');
  const [tutorComment, setTutorComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    getSubmission(id).then(({ data }) => {
      setSubmission(data);
      if (data.tutorScore != null) setTutorScore(String(data.tutorScore));
      if (data.tutorComment) setTutorComment(data.tutorComment);
    });
  }, [id]);

  useEffect(() => {
    if (!submission || !editorRef.current) return;
    import('monaco-editor').then(monaco => {
      if (monacoRef.current) monacoRef.current.dispose();
      monacoRef.current = monaco.editor.create(editorRef.current, {
        value: submission.answerData || '',
        language: submission.exerciseType === 'PYTHON' ? 'python' : 'javascript',
        readOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
      });
    });
    return () => { monacoRef.current?.dispose(); monacoRef.current = null; };
  }, [submission]);

  async function handleSave() {
    const score = parseFloat(tutorScore);
    if (isNaN(score) || score < 0 || score > 100) {
      setSaveError('Score must be a number between 0 and 100.');
      return;
    }
    setSaveError('');
    setSaving(true);
    try {
      const { data } = await gradeSubmission(id, {
        tutorScore: score,
        tutorComment: tutorComment || null,
      });
      setSubmission(data);
    } catch (err) {
      setSaveError(err.response?.data?.error?.message || 'Save failed.');
    } finally {
      setSaving(false);
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
      <button onClick={() => navigate('/tutor/submissions')}
        style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        ← Back to Submissions
      </button>

      <h1 style={{ marginBottom: 4 }}>{submission.exerciseTitle}</h1>
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
      <div ref={editorRef} style={{ height: 300, border: '1px solid #ddd', borderRadius: 4, marginBottom: 24 }} />

      <h2 style={{ marginBottom: 8 }}>Auto-Grade Details</h2>
      <div style={{ background: '#fafafa', border: '1px solid #ddd', borderRadius: 4, padding: 16, marginBottom: 24 }}>
        {renderAutoGrade(submission.autoGradeDetails)}
      </div>

      <h2 style={{ marginBottom: 12 }}>Manual Grade</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
        <label style={{ fontSize: 14 }}>
          Score (0–100):
          <input
            type="number" min="0" max="100" step="0.01"
            value={tutorScore}
            onChange={e => setTutorScore(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
          />
        </label>
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
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionDetailPage.jsx
git commit -m "feat(f6): add SubmissionDetailPage with Monaco viewer and grade form"
```

---

## Task 12: App.jsx Routing + TutorPage Navigation

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/tutor/TutorPage.jsx`

- [ ] **Step 1: Add imports and routes to App.jsx**

At the top of `App.jsx`, add three new imports after the existing tutor page imports:
```jsx
import SubmissionImportPage from './pages/tutor/SubmissionImportPage';
import SubmissionListPage from './pages/tutor/SubmissionListPage';
import SubmissionDetailPage from './pages/tutor/SubmissionDetailPage';
```

Inside the `<Routes>` block, add after the last `/tutor/exercises/:id/edit` route and before the `/admin` route:
```jsx
<Route path="/tutor/submissions" element={
  <ProtectedRoute requiredRole="TUTOR"><SubmissionListPage /></ProtectedRoute>
} />
<Route path="/tutor/submissions/import" element={
  <ProtectedRoute requiredRole="TUTOR"><SubmissionImportPage /></ProtectedRoute>
} />
<Route path="/tutor/submissions/:id" element={
  <ProtectedRoute requiredRole="TUTOR"><SubmissionDetailPage /></ProtectedRoute>
} />
```

- [ ] **Step 2: Add Submissions link to TutorPage.jsx**

Replace the entire file content:
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
        <Link to="/tutor/submissions">Submissions</Link>
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Verify the frontend builds**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: `✓ built in` with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/tutor/TutorPage.jsx
git commit -m "feat(f6): wire submission routes and add nav link to tutor dashboard"
```

---

## Done

F-6 is complete when:
- `cd backend && mvn test -q` passes with no failures
- `cd frontend && npm run build` succeeds with no errors
- Import, list, and detail pages are reachable under `/tutor/submissions`
- CSV download works from the list page without login
