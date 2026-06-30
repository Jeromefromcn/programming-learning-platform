# Batch Export Pivot & Single-Exercise Import Restriction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict import batches to a single exercise per batch, and pivot the batch CSV export to one row per submission with dynamic dimension columns.

**Architecture:** Two independent backend-only changes — (1) a uniqueness check in `SubmissionService.importFiles()` that runs between phase 1 validation and phase 2 commit, and (2) a rewrite of `ImportBatchService.exportBatchCsv()` that reads the exercise's rubric config to build a dynamic header. No schema changes. No frontend changes.

**Tech Stack:** Java 25, Spring Boot 3.5.0, Apache Commons CSV, Jackson `ObjectMapper`, JUnit 5, Mockito, `spring-test` `MockHttpServletResponse`.

## Global Constraints

- No schema migrations — no new tables or columns
- No frontend changes
- No Redis, Kafka, or extra infrastructure
- Conventional Commits: `feat(submission): ...`, `test(submission): ...`
- Tests use JUnit 5 (`org.junit.jupiter.api.Test`) + Mockito; no `@SpringBootTest`
- `@RequiredArgsConstructor` (Lombok) generates constructors — add new deps as `private final` fields

---

## File Map

| File | Change |
|------|--------|
| `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java` | Add `ObjectMapper` dependency; add exerciseId uniqueness check after phase 1 validation |
| `backend/src/test/java/com/platform/exercise/submission/SubmissionImportRestrictionTest.java` | New — unit tests for the import restriction |
| `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java` | Add `ExerciseVersionRepository` dependency; rewrite `exportBatchCsv` |
| `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java` | Expand with export pivot tests |

---

## Task 1: Import restriction — test + implementation

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java`
- Create: `backend/src/test/java/com/platform/exercise/submission/SubmissionImportRestrictionTest.java`

**Interfaces:**
- Consumes: `SubmissionService.importFiles(List<MultipartFile>, Long)` → `ImportResponseDto`
- Produces: same signature — when files span multiple `exerciseId` values, returns `ImportResponseDto.validationFailed(problems)` before any write

**Context — how importFiles works today:**

`SubmissionService.importFiles()` has two phases:
- Phase 1 (no writes): collect file bytes, call `fileImportService.validateFile()` per file, return early if any problem
- Phase 2 (writes): create `ImportBatch` row, call `fileImportService.processSingleFile()` per file

The restriction check goes between these two phases. It reads the already-collected `entries` (a `List<FileEntry>` where `FileEntry` is a local record `record FileEntry(String name, byte[] bytes) {}`), parses each file's `exerciseId` using `ObjectMapper`, and returns `validationFailed` if more than one distinct ID is found.

`SubmissionService` currently has no `ObjectMapper` field. Add it.

**Existing relevant classes (read these before editing):**
- `ImportResponseDto` — record with `boolean ok`, `List<ImportProblemDto> problems`, static factory `validationFailed(List<ImportProblemDto>)`
- `ImportProblemDto` — record `(String filename, String reason)`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/platform/exercise/submission/SubmissionImportRestrictionTest.java`:

```java
package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.ImportBatch;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.ImportBatchRepository;
import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SubmissionImportRestrictionTest {

    @Mock FileImportService fileImportService;
    @Mock SubmissionRepository submissionRepository;
    @Mock ExerciseRepository exerciseRepository;
    @Mock ExerciseVersionRepository versionRepository;
    @Mock ImportBatchCache batchCache;
    @Mock ImportBatchRepository importBatchRepository;

    final ObjectMapper objectMapper = new ObjectMapper();
    SubmissionService submissionService;

    @BeforeEach
    void setUp() {
        submissionService = new SubmissionService(
            submissionRepository, exerciseRepository, versionRepository,
            fileImportService, batchCache, importBatchRepository, objectMapper);
    }

    private static byte[] submissionJson(long exerciseId, String studentName) {
        return ("{\"exerciseId\":" + exerciseId + ",\"exerciseType\":\"PYTHON\"," +
            "\"studentName\":\"" + studentName + "\",\"answer\":\"print()\"," +
            "\"exportedAt\":\"2026-01-01T00:00:00Z\"}")
            .getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void importFiles_mixedExerciseIds_returnsValidationFailed() throws IOException {
        byte[] f1 = submissionJson(1, "alice");
        byte[] f2 = submissionJson(2, "bob");
        MockMultipartFile mf1 = new MockMultipartFile("files", "alice.json", "application/json", f1);
        MockMultipartFile mf2 = new MockMultipartFile("files", "bob.json",   "application/json", f2);

        when(fileImportService.validateFile(eq("alice.json"), any())).thenReturn(null);
        when(fileImportService.validateFile(eq("bob.json"),   any())).thenReturn(null);

        ImportResponseDto response = submissionService.importFiles(List.of(mf1, mf2), null);

        assertThat(response.ok()).isFalse();
        assertThat(response.problems()).hasSize(1);
        assertThat(response.problems().get(0).filename()).isEqualTo("bob.json");
        assertThat(response.problems().get(0).reason()).contains("exercise #2");
        assertThat(response.problems().get(0).reason()).contains("exercise #1");
    }

    @Test
    void importFiles_allSameExercise_proceedsToPhase2() throws IOException {
        byte[] f1 = submissionJson(1, "alice");
        byte[] f2 = submissionJson(1, "bob");
        MockMultipartFile mf1 = new MockMultipartFile("files", "alice.json", "application/json", f1);
        MockMultipartFile mf2 = new MockMultipartFile("files", "bob.json",   "application/json", f2);

        when(fileImportService.validateFile(eq("alice.json"), any())).thenReturn(null);
        when(fileImportService.validateFile(eq("bob.json"),   any())).thenReturn(null);
        when(importBatchRepository.save(any(ImportBatch.class))).thenAnswer(inv -> {
            ImportBatch b = inv.getArgument(0);
            b.setId(99L);
            return b;
        });
        when(fileImportService.processSingleFile(any(), any(), any(), anyBoolean()))
            .thenReturn(ImportResultDto.failed("x.json", "stub"));

        ImportResponseDto response = submissionService.importFiles(List.of(mf1, mf2), null);

        // No restriction violation → proceeds to phase 2 → ok=true response
        assertThat(response.ok()).isTrue();
        assertThat(response.problems()).isNull();
    }

    @Test
    void importFiles_singleFile_alwaysPasses() throws IOException {
        byte[] f1 = submissionJson(5, "carol");
        MockMultipartFile mf1 = new MockMultipartFile("files", "carol.json", "application/json", f1);

        when(fileImportService.validateFile(eq("carol.json"), any())).thenReturn(null);
        when(importBatchRepository.save(any(ImportBatch.class))).thenAnswer(inv -> {
            ImportBatch b = inv.getArgument(0);
            b.setId(1L);
            return b;
        });
        when(fileImportService.processSingleFile(any(), any(), any(), anyBoolean()))
            .thenReturn(ImportResultDto.failed("carol.json", "stub"));

        ImportResponseDto response = submissionService.importFiles(List.of(mf1), null);

        assertThat(response.ok()).isTrue();
    }
}
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=SubmissionImportRestrictionTest -q 2>&1 | tail -20
```

Expected: compilation error — `SubmissionService` constructor doesn't accept `ObjectMapper` yet.

- [ ] **Step 3: Add ObjectMapper dependency to SubmissionService**

In `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java`, add the import and field:

Add to imports:
```java
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Set;
```

Add field (keep alphabetical with other `final` fields, after `importBatchRepository`):
```java
private final ObjectMapper objectMapper;
```

- [ ] **Step 4: Add the exerciseId uniqueness check in importFiles()**

In `SubmissionService.importFiles()`, locate this block (end of phase 1):
```java
        if (!problems.isEmpty()) {
            return ImportResponseDto.validationFailed(problems);
        }

        // --- Phase 2: commit ---
```

Replace with:
```java
        if (!problems.isEmpty()) {
            return ImportResponseDto.validationFailed(problems);
        }

        // Phase 1b: all files must belong to the same exercise
        Map<String, Long> fileExerciseIds = new LinkedHashMap<>();
        for (FileEntry e : entries) {
            try {
                long eid = objectMapper.readTree(e.bytes()).path("exerciseId").asLong(-1L);
                if (eid > 0) fileExerciseIds.put(e.name(), eid);
            } catch (Exception ignored) {}
        }
        Set<Long> distinctIds = new LinkedHashSet<>(fileExerciseIds.values());
        if (distinctIds.size() > 1) {
            long expected = distinctIds.iterator().next();
            List<ImportProblemDto> mismatchProblems = fileExerciseIds.entrySet().stream()
                .filter(entry -> entry.getValue() != expected)
                .map(entry -> new ImportProblemDto(entry.getKey(),
                    "Exercise mismatch: this file belongs to exercise #" + entry.getValue()
                    + ", but the batch expects exercise #" + expected))
                .toList();
            return ImportResponseDto.validationFailed(mismatchProblems);
        }

        // --- Phase 2: commit ---
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=SubmissionImportRestrictionTest -q 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`, 3 tests passed.

- [ ] **Step 6: Run full backend test suite to check for regressions**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -q 2>&1 | tail -30
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 7: Commit**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git add backend/src/main/java/com/platform/exercise/submission/SubmissionService.java \
        backend/src/test/java/com/platform/exercise/submission/SubmissionImportRestrictionTest.java
git commit -m "feat(submission): reject import batch when files span multiple exercises"
```

---

## Task 2: Export pivot — one row per submission, dynamic dimension columns

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java`
- Modify: `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java`

**Interfaces:**
- Consumes: `ImportBatchService.exportBatchCsv(Long batchId, HttpServletResponse response)`
- Produces: same signature — CSV changes from one-row-per-dimension to one-row-per-submission with dynamic headers

**Context — what changes:**

Current behaviour: fixed header `Student Name, Display Name, Exercise Title, Dimension, Weight, Dimension Score, Total Score`; rubric submissions produce one row per dimension.

New behaviour:
- Load `exercise_versions.config` JSON for the batch's exercise → `rubric.dimensions[]`
- If dimensions non-empty: `Student Name, Display Name, Exercise Title, "Logic (60%)", "Style (40%)", ..., Total Score`
- If dimensions empty/absent: `Student Name, Display Name, Exercise Title, Total Score`
- One row per submission; dimension scores from `tutor_grade_details` JSON, looked up by dimension name; empty string for ungraded cells
- `Total Score` = `tutorScore` if non-null, else `autoScore`, else empty string

`ImportBatchService` currently has no `ExerciseVersionRepository`. Add it.

Dimension config JSON shape (inside `exercise_versions.config`):
```json
{"rubric": {"dimensions": [{"name": "Logic", "weight": 0.6}, {"name": "Style", "weight": 0.4}]}}
```

`tutor_grade_details` JSON shape (inside `submissions.tutor_grade_details`):
```json
[{"name": "Logic", "weight": 0.6, "score": 80.0}, {"name": "Style", "weight": 0.4, "score": 70.0}]
```

- [ ] **Step 1: Write the failing tests**

Expand `backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java`. Add `@ExtendWith(MockitoExtension.class)`, imports, mocks, and three new test methods — keep the four existing static-method tests untouched:

```java
package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.ImportBatchRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ImportBatchServiceTest {

    // ---- existing static-method tests (unchanged) ----

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

    // ---- export pivot tests ----

    @Mock ImportBatchRepository importBatchRepository;
    @Mock SubmissionRepository submissionRepository;
    @Mock UserRepository userRepository;
    @Mock ExerciseRepository exerciseRepository;
    @Mock ExerciseVersionRepository versionRepository;

    final ObjectMapper objectMapper = new ObjectMapper();
    ImportBatchService service;

    @BeforeEach
    void setUp() {
        service = new ImportBatchService(
            importBatchRepository, submissionRepository, userRepository,
            exerciseRepository, versionRepository, objectMapper);
    }

    private Exercise exercise(long id, long versionId, String title) {
        Exercise ex = new Exercise();
        ex.setId(id);
        ex.setTitle(title);
        ex.setCurrentVersionId(versionId);
        return ex;
    }

    private ExerciseVersion version(long id, String configJson) {
        ExerciseVersion v = new ExerciseVersion();
        v.setId(id);
        v.setConfig(configJson);
        return v;
    }

    private Submission submission(String studentName, long exerciseId,
                                  String gradeDetails, BigDecimal tutorScore, BigDecimal autoScore) {
        Submission s = new Submission();
        s.setStudentName(studentName);
        s.setExerciseId(exerciseId);
        s.setTutorGradeDetails(gradeDetails);
        s.setTutorScore(tutorScore);
        s.setAutoScore(autoScore);
        return s;
    }

    @Test
    void exportBatchCsv_rubricMode_oneRowPerSubmissionWithDimColumns() throws IOException {
        Exercise ex = exercise(1L, 10L, "Algo Test");
        ExerciseVersion ver = version(10L,
            "{\"rubric\":{\"dimensions\":[{\"name\":\"Logic\",\"weight\":0.6},{\"name\":\"Style\",\"weight\":0.4}]}}");
        Submission sub = submission("alice", 1L,
            "[{\"name\":\"Logic\",\"weight\":0.6,\"score\":80.0},{\"name\":\"Style\",\"weight\":0.4,\"score\":70.0}]",
            new BigDecimal("76.00"), null);

        when(submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc(1L))
            .thenReturn(List.of(sub));
        when(exerciseRepository.findById(1L)).thenReturn(Optional.of(ex));
        when(versionRepository.findById(10L)).thenReturn(Optional.of(ver));
        when(exerciseRepository.findAllById(List.of(1L))).thenReturn(List.of(ex));

        MockHttpServletResponse response = new MockHttpServletResponse();
        service.exportBatchCsv(1L, response);

        String[] lines = response.getContentAsString().split("\\r?\\n");
        assertThat(lines[0]).contains("Logic (60%)").contains("Style (40%)");
        assertThat(lines[0]).doesNotContain("Dimension").doesNotContain("Weight");
        assertThat(lines).hasSize(2); // header + 1 row
        assertThat(lines[1]).contains("alice").contains("80.0").contains("70.0").contains("76.00");
    }

    @Test
    void exportBatchCsv_instantFeedbackMode_noDimColumns() throws IOException {
        Exercise ex = exercise(2L, 20L, "Quick Quiz");
        ExerciseVersion ver = version(20L, "{\"showResult\":true,\"rubric\":{\"dimensions\":[]}}");
        Submission sub = submission("bob", 2L, null, null, new BigDecimal("90.00"));

        when(submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc(1L))
            .thenReturn(List.of(sub));
        when(exerciseRepository.findById(2L)).thenReturn(Optional.of(ex));
        when(versionRepository.findById(20L)).thenReturn(Optional.of(ver));
        when(exerciseRepository.findAllById(List.of(2L))).thenReturn(List.of(ex));

        MockHttpServletResponse response = new MockHttpServletResponse();
        service.exportBatchCsv(1L, response);

        String[] lines = response.getContentAsString().split("\\r?\\n");
        // Header must have exactly: Student Name, Display Name, Exercise Title, Total Score
        assertThat(lines[0]).isEqualTo("Student Name,Display Name,Exercise Title,Total Score");
        assertThat(lines[1]).contains("bob").contains("90.00");
    }

    @Test
    void exportBatchCsv_ungradedSubmission_dimAndTotalCellsEmpty() throws IOException {
        Exercise ex = exercise(3L, 30L, "Rubric Only");
        ExerciseVersion ver = version(30L,
            "{\"rubric\":{\"dimensions\":[{\"name\":\"Logic\",\"weight\":1.0}]}}");
        Submission sub = submission("carol", 3L, null, null, null);

        when(submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc(1L))
            .thenReturn(List.of(sub));
        when(exerciseRepository.findById(3L)).thenReturn(Optional.of(ex));
        when(versionRepository.findById(30L)).thenReturn(Optional.of(ver));
        when(exerciseRepository.findAllById(List.of(3L))).thenReturn(List.of(ex));

        MockHttpServletResponse response = new MockHttpServletResponse();
        service.exportBatchCsv(1L, response);

        String[] lines = response.getContentAsString().split("\\r?\\n");
        // Header has the dim column
        assertThat(lines[0]).contains("Logic (100%)");
        // carol's row: student name, empty display, title, empty dim score, empty total
        assertThat(lines[1]).startsWith("carol,");
        // Both the dim score and total score are empty (ends with ",,")
        assertThat(lines[1]).endsWith(",,");
    }
}
```

- [ ] **Step 2: Run to verify tests fail**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=ImportBatchServiceTest -q 2>&1 | tail -20
```

Expected: compilation error — `ImportBatchService` constructor doesn't accept `ExerciseVersionRepository` yet.

- [ ] **Step 3: Add ExerciseVersionRepository to ImportBatchService and import JsonNode**

In `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java`:

Add to imports:
```java
import com.fasterxml.jackson.databind.JsonNode;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.repository.ExerciseVersionRepository;
import java.util.ArrayList;
```

Add field after `exerciseRepository`:
```java
private final ExerciseVersionRepository versionRepository;
```

- [ ] **Step 4: Replace exportBatchCsv with the pivot implementation**

Replace the entire `exportBatchCsv` method and add the three private helpers below it:

```java
    public void exportBatchCsv(Long batchId, HttpServletResponse response) throws IOException {
        List<Submission> subs = submissionRepository
            .findByBatchIdAndDeletedFalseOrderByStudentNameAsc(batchId);

        List<DimensionDef> dimensions = List.of();
        if (!subs.isEmpty()) {
            dimensions = loadDimensions(subs.get(0).getExerciseId());
        }

        Map<Long, String> displayNameMap = subs.stream()
            .filter(s -> s.getUserId() != null)
            .map(Submission::getUserId)
            .distinct()
            .flatMap(uid -> userRepository.findById(uid).stream())
            .collect(Collectors.toMap(User::getId, u ->
                u.getDisplayName() != null ? u.getDisplayName() : u.getUsername()));

        List<Long> exerciseIds = subs.stream().map(Submission::getExerciseId).distinct().toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition",
            "attachment; filename=\"batch_" + batchId + "_" + LocalDate.now() + ".csv\"");

        List<String> headers = buildHeaders(dimensions);

        try (CSVPrinter printer = new CSVPrinter(
                new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8),
                CSVFormat.DEFAULT.builder()
                    .setHeader(headers.toArray(new String[0]))
                    .build())) {
            for (Submission sub : subs) {
                String displayName = sub.getUserId() != null
                    ? displayNameMap.getOrDefault(sub.getUserId(), "") : "";
                String title = titleMap.getOrDefault(sub.getExerciseId(), "");
                String totalScore = sub.getTutorScore() != null
                    ? sub.getTutorScore().toPlainString()
                    : (sub.getAutoScore() != null ? sub.getAutoScore().toPlainString() : "");

                List<Object> row = new ArrayList<>();
                row.add(sub.getStudentName());
                row.add(displayName);
                row.add(title);

                if (!dimensions.isEmpty()) {
                    Map<String, Double> dimScores = parseDimScores(sub.getTutorGradeDetails());
                    for (DimensionDef d : dimensions) {
                        Double score = dimScores.get(d.name());
                        row.add(score != null ? score : "");
                    }
                }
                row.add(totalScore);
                printer.printRecord(row);
            }
        }
    }

    private record DimensionDef(String name, double weight) {}

    private List<DimensionDef> loadDimensions(long exerciseId) {
        return exerciseRepository.findById(exerciseId)
            .flatMap(ex -> versionRepository.findById(ex.getCurrentVersionId()))
            .map(v -> parseDimensionConfig(v.getConfig()))
            .orElse(List.of());
    }

    private List<DimensionDef> parseDimensionConfig(String configJson) {
        try {
            JsonNode dims = objectMapper.readTree(configJson).path("rubric").path("dimensions");
            if (dims.isMissingNode() || !dims.isArray()) return List.of();
            List<DimensionDef> result = new ArrayList<>();
            for (JsonNode d : dims) {
                result.add(new DimensionDef(d.path("name").asText(), d.path("weight").asDouble()));
            }
            return result;
        } catch (Exception e) {
            return List.of();
        }
    }

    private List<String> buildHeaders(List<DimensionDef> dimensions) {
        List<String> h = new ArrayList<>(List.of("Student Name", "Display Name", "Exercise Title"));
        for (DimensionDef d : dimensions) {
            h.add(d.name() + " (" + (int) Math.round(d.weight() * 100) + "%)");
        }
        h.add("Total Score");
        return h;
    }

    private Map<String, Double> parseDimScores(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            com.fasterxml.jackson.databind.JavaType listType = objectMapper.getTypeFactory()
                .constructCollectionType(List.class, DimensionScoreDto.class);
            List<DimensionScoreDto> dims = objectMapper.readValue(json, listType);
            return dims.stream()
                .collect(Collectors.toMap(DimensionScoreDto::name, DimensionScoreDto::score));
        } catch (Exception e) {
            return Map.of();
        }
    }
```

The three old private methods (`buildCountMap`, already present) and `computeGradedStatus` remain untouched.

- [ ] **Step 5: Run export pivot tests**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=ImportBatchServiceTest -q 2>&1 | tail -20
```

Expected: `BUILD SUCCESS`, 7 tests passed (4 existing + 3 new).

- [ ] **Step 6: Run full backend test suite**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -q 2>&1 | tail -30
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 7: Commit**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git add backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java \
        backend/src/test/java/com/platform/exercise/submission/ImportBatchServiceTest.java
git commit -m "feat(submission): pivot batch export to one row per submission with dynamic dimension columns"
```
