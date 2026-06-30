# Auto-Grade Toggle (rename `showResult` → `autoGrade`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the exercise config field `showResult` to `autoGrade` and make it actually gate whether auto-grading runs (Rhino/Blockly or Python-sandbox), in both the student self-submission path and the tutor batch-import path — today it only affects what's shown to the student.

**Architecture:** A new small `AutoGradeConfigResolver` component centralizes reading the `autoGrade` flag out of an `ExerciseVersion.config` JSON blob. `StudentSubmissionService.submit()`/`history()` and `FileImportService.processSingleFile()` are updated to call it and skip `BlocklyGrader`/`PythonGrader` entirely when it's `false`. A Flyway migration rewrites the JSON key in all existing `exercise_versions` rows. Two frontend pages (`ExerciseFormPage.jsx`, `SubmissionDetailPage.jsx`) are updated to read/write the new key name.

**Tech Stack:** Java 25, Spring Boot 3.5, Jackson `ObjectMapper`, JUnit 5 + Mockito (backend); React 18, Vitest + Testing Library (frontend); Flyway 9 migration against MySQL 8 (prod) / H2 in `MODE=MySQL` (test).

## Global Constraints

- No backward-compat fallback for the old `showResult` key — historical data is migrated directly, not read with a fallback at runtime.
- `autoGrade` missing from config or unparseable JSON → treat as `true` (matches today's default-grading behavior).
- Gate applies to **both** `StudentSubmissionService.submit()` and `FileImportService` (tutor import).
- `SubmitResultDto`'s response field stays named `showResult` (frontend practice pages read this field and need no changes).
- Tutor checkbox label text: **"Enable automatic grading"**.
- Conventional Commits style: `feat(exercise): ...`, `fix(...)`, etc. (per CLAUDE.md).

---

### Task 1: Database migration — rename `showResult` to `autoGrade` in stored config JSON

**Files:**
- Create: `backend/src/main/resources/db/migration/V13__rename_show_result_to_auto_grade.sql`

**Interfaces:**
- Produces: all `exercise_versions.config` rows have `"autoGrade":` instead of `"showResult":` after this migration runs. No code-level interface — purely a data migration.

There is no automated test for this migration. The codebase's existing precedent for a JSON-content rewrite migration, `V9__add_data_section_to_menu_config.sql`, also has no automated test (confirmed: `grep -rl "V9\|menu_config" backend/src/test` returns nothing) — verification is manual, via the `WHERE ... LIKE` guard making the migration idempotent and safe to re-run. Follow the same precedent here.

- [ ] **Step 1: Write the migration**

```sql
-- V13__rename_show_result_to_auto_grade.sql
-- Renames the exercise_versions.config JSON key "showResult" to "autoGrade" — the field
-- now actually gates whether BlocklyGrader/PythonGrader run (see AutoGradeConfigResolver),
-- not just whether the score is shown to the student. Text REPLACE (not MySQL's JSON_SET)
-- because this must also run against H2 in MODE=MySQL for tests, which lacks MySQL's JSON functions.
UPDATE exercise_versions
SET    config = REPLACE(config, '"showResult":', '"autoGrade":')
WHERE  config LIKE '%"showResult":%';
```

- [ ] **Step 2: Verify the migration applies cleanly on a fresh test database**

Run: `cd backend && mvn test -Dtest=MigrationTest`
Expected: `BUILD SUCCESS` — confirms Flyway applies V13 without error against H2 (the table starts empty in tests, so the `UPDATE` matches zero rows; this only proves the SQL is valid, not the data transform — that's verified manually below).

- [ ] **Step 3: Manually verify the data transform against a real MySQL instance** (do this once, locally, before merging — not part of automated CI)

```bash
docker compose up -d mysql
docker exec -i programming-learning-platform-mysql-1 mysql -uroot -p"$MYSQL_ROOT_PASSWORD" exercise_db \
  -e "INSERT INTO exercise_versions (exercise_id, version_number, title, description, difficulty, config) \
      SELECT id, 999, 'migration-test', 'x', 'EASY', '{\"showResult\":false,\"rubric\":{\"dimensions\":[]}}' \
      FROM exercises LIMIT 1;"
# Apply V13 by restarting api-server (Flyway runs on boot), or run the UPDATE manually, then:
docker exec -i programming-learning-platform-mysql-1 mysql -uroot -p"$MYSQL_ROOT_PASSWORD" exercise_db \
  -e "SELECT config FROM exercise_versions WHERE version_number = 999;"
# Expected output contains "autoGrade":false, not "showResult":false
docker exec -i programming-learning-platform-mysql-1 mysql -uroot -p"$MYSQL_ROOT_PASSWORD" exercise_db \
  -e "DELETE FROM exercise_versions WHERE version_number = 999;"
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V13__rename_show_result_to_auto_grade.sql
git commit -m "feat(db): rename exercise_versions.config showResult to autoGrade (V13)"
```

---

### Task 2: `AutoGradeConfigResolver` — shared config-flag reader

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/grading/AutoGradeConfigResolver.java`
- Test: `backend/src/test/java/com/platform/exercise/grading/AutoGradeConfigResolverTest.java`

**Interfaces:**
- Produces: `AutoGradeConfigResolver.isEnabled(String configJson) -> boolean`, a `@Component` with constructor `AutoGradeConfigResolver(ObjectMapper objectMapper)`. Tasks 3 and 4 inject this as a new constructor field (real instance in tests, not a mock — it has no external dependencies, same pattern as the existing `new ObjectMapper()` usage in those test files).

- [ ] **Step 1: Write the failing tests**

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AutoGradeConfigResolverTest {

    private final AutoGradeConfigResolver resolver = new AutoGradeConfigResolver(new ObjectMapper());

    @Test
    void isEnabled_trueWhenAutoGradeTrue() {
        assertTrue(resolver.isEnabled("{\"autoGrade\":true,\"testCases\":[]}"));
    }

    @Test
    void isEnabled_falseWhenAutoGradeFalse() {
        assertFalse(resolver.isEnabled("{\"autoGrade\":false,\"rubric\":{\"dimensions\":[]}}"));
    }

    @Test
    void isEnabled_defaultsTrueWhenKeyAbsent() {
        assertTrue(resolver.isEnabled("{\"testCases\":[]}"));
    }

    @Test
    void isEnabled_defaultsTrueOnMalformedJson() {
        assertTrue(resolver.isEnabled("not json"));
    }

    @Test
    void isEnabled_handlesDoubleEncodedConfig() {
        // Some stored configs are a JSON string containing JSON (textual node) — readTree
        // must unwrap it the same way StudentSubmissionService's old showResult() did.
        String doubleEncoded = "\"{\\\"autoGrade\\\":false}\"";
        assertFalse(resolver.isEnabled(doubleEncoded));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=AutoGradeConfigResolverTest`
Expected: FAIL — `AutoGradeConfigResolver` does not exist (compile error).

- [ ] **Step 3: Write the implementation**

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AutoGradeConfigResolver {

    private final ObjectMapper objectMapper;

    public boolean isEnabled(String configJson) {
        try {
            JsonNode config = objectMapper.readTree(configJson);
            if (config.isTextual()) config = objectMapper.readTree(config.asText());
            JsonNode node = config.get("autoGrade");
            return node == null || node.asBoolean(true);
        } catch (Exception e) {
            return true;
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=AutoGradeConfigResolverTest`
Expected: `Tests run: 5, Failures: 0, Errors: 0`

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/grading/AutoGradeConfigResolver.java \
        backend/src/test/java/com/platform/exercise/grading/AutoGradeConfigResolverTest.java
git commit -m "feat(grading): add AutoGradeConfigResolver to read autoGrade flag from exercise config"
```

---

### Task 3: Gate `StudentSubmissionService` on `autoGrade`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java`
- Modify: `backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java`

**Interfaces:**
- Consumes: `AutoGradeConfigResolver.isEnabled(String) -> boolean` (Task 2).
- Produces: `StudentSubmissionService` constructor gains a 7th parameter `AutoGradeConfigResolver autoGradeConfigResolver` (appended after `objectMapper`, so existing positional-constructor test calls only need one new trailing argument). `SubmitResultDto.showResult()` and `SubmissionHistoryItemDto.showResult()` now mirror `autoGradeConfigResolver.isEnabled(...)` instead of the deleted private `showResult()` helper.

- [ ] **Step 1: Update the test file's existing tests and add new ones (write failing tests first)**

Replace the full contents of `StudentSubmissionServiceTest.java` with:

```java
package com.platform.exercise.student;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.grading.AutoGradeConfigResolver;
import com.platform.exercise.grading.BlocklyGrader;
import com.platform.exercise.grading.PythonGrader;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
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
            blocklyGrader, pythonGrader, new ObjectMapper(),
            new AutoGradeConfigResolver(new ObjectMapper()));
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
    }

    @Test
    void submit_autoGradeTrue_returnsScoreAndPassed_andPersistsStudentSource() {
        stubExercise("{\"autoGrade\":true,\"testCases\":[]}");
        when(pythonGrader.grade(any(), any()))
            .thenReturn(new PythonGrader.Result(BigDecimal.valueOf(100), "{}"));

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
    void submit_autoGradeFalse_skipsGradingAndHidesScore() {
        stubExercise("{\"autoGrade\":false,\"testCases\":[]}");

        SubmitResultDto result = service.submit(7L, "Alice", 2L,
            new SubmitRequest("print(1)", null));

        assertFalse(result.showResult());
        assertNull(result.score());
        assertNull(result.passed());
        verifyNoInteractions(pythonGrader);
        verify(submissionRepo).save(argThat(s -> s.getAutoScore() == null));
    }

    @Test
    void submit_autoGradeAbsent_defaultsToTrueAndGrades() {
        stubExercise("{\"testCases\":[]}");
        when(pythonGrader.grade(any(), any()))
            .thenReturn(new PythonGrader.Result(BigDecimal.valueOf(100), "{}"));

        SubmitResultDto result = service.submit(7L, "Alice", 2L,
            new SubmitRequest("print(1)", null));

        assertTrue(result.showResult());
        verify(pythonGrader).grade(any(), any());
    }

    @Test
    void history_autoGradeFalse_hidesStoredScores() {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCurrentVersionId(9L);
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(ex));
        ExerciseVersion v = new ExerciseVersion();
        v.setId(9L);
        v.setConfig("{\"autoGrade\":false}");
        when(versionRepo.findById(9L)).thenReturn(Optional.of(v));

        Submission s = new Submission();
        s.setId(1L);
        s.setAutoScore(BigDecimal.valueOf(80));
        when(submissionRepo.findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(7L, 2L))
            .thenReturn(List.of(s));

        List<SubmissionHistoryItemDto> result = service.history(7L, 2L);

        assertEquals(1, result.size());
        assertFalse(result.get(0).showResult());
        assertNull(result.get(0).score());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail to compile (constructor signature mismatch)**

Run: `cd backend && mvn test -Dtest=StudentSubmissionServiceTest`
Expected: FAIL — compile error, `StudentSubmissionService` has no 7-arg constructor yet.

- [ ] **Step 3: Update `StudentSubmissionService.java`**

Add the import and field:

```java
import com.platform.exercise.grading.AutoGradeConfigResolver;
```

(insert alphabetically after the existing `com.platform.exercise.domain.Submission` import, before `com.platform.exercise.grading.BlocklyGrader`)

```java
    private final ObjectMapper objectMapper;
    private final AutoGradeConfigResolver autoGradeConfigResolver;
```

Replace the `submit()` method body from `String type = exercise.getType().name();` through the `return new SubmitResultDto(...)` line with:

```java
        String type = exercise.getType().name();
        boolean autoGrade = autoGradeConfigResolver.isEnabled(version.getConfig());
        BigDecimal autoScore = null;
        String autoGradeDetails = null;
        if (autoGrade) {
            if ("BLOCKLY".equals(type)) {
                BlocklyGrader.Result gr = blocklyGrader.grade(req.answerData(), version.getConfig());
                autoScore = gr.autoScore();
                autoGradeDetails = gr.autoGradeDetailsJson();
            } else {
                PythonGrader.Result gr = pythonGrader.grade(req.answerData(), version.getConfig());
                autoScore = gr.autoScore();
                autoGradeDetails = gr.autoGradeDetailsJson();
            }
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

        return new SubmitResultDto(
            saved.getId(),
            autoGrade,
            autoGrade ? autoScore : null,
            autoGrade ? passed(autoScore) : null);
```

Replace the `history()` method body:

```java
    @Transactional(readOnly = true)
    public List<SubmissionHistoryItemDto> history(Long userId, Long exerciseId) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
            .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        boolean autoGrade = exercise.getCurrentVersionId() != null
            && versionRepository.findById(exercise.getCurrentVersionId())
                .map(v -> autoGradeConfigResolver.isEnabled(v.getConfig())).orElse(true);

        return submissionRepository
            .findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(userId, exerciseId)
            .stream()
            .map(s -> new SubmissionHistoryItemDto(
                s.getId(), s.getCreatedAt(), autoGrade,
                autoGrade ? s.getAutoScore() : null,
                autoGrade ? passed(s.getAutoScore()) : null))
            .toList();
    }
```

Delete the private `showResult(String configJson)` method entirely (no longer referenced). Remove the now-unused `JsonNode` import if no other method in the file uses it (check with `grep -n JsonNode StudentSubmissionService.java` — if `submit()`/`history()` no longer reference it directly, only `AutoGradeConfigResolver` does, so this import should be removed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=StudentSubmissionServiceTest`
Expected: `Tests run: 4, Failures: 0, Errors: 0`

- [ ] **Step 5: Run the full backend test suite to catch any other callers of the removed constructor**

Run: `cd backend && mvn test`
Expected: `BUILD SUCCESS`. If a Spring context test (`@SpringBootTest`) fails to wire `StudentSubmissionService`, confirm `AutoGradeConfigResolver` is a `@Component` (it is, from Task 2) — Spring will autowire it with no further change needed.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java \
        backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java
git commit -m "feat(submission): gate student auto-grading on autoGrade config flag"
```

---

### Task 4: Gate `FileImportService` on `autoGrade`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/FileImportService.java`
- Modify: `backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java`

**Interfaces:**
- Consumes: `AutoGradeConfigResolver.isEnabled(String) -> boolean` (Task 2).
- Produces: `FileImportService` constructor gains a 12th parameter `AutoGradeConfigResolver autoGradeConfigResolver` (appended after `businessMetrics`, so existing positional-constructor test calls only need one new trailing argument). `processSingleFile()` still validates exercise type up front and returns the existing `"Unknown exercise type: ..."` failure regardless of `autoGrade`.

- [ ] **Step 1: Add the new field/mock and a failing test**

In `FileImportServiceTest.java`, add the import:

```java
import com.platform.exercise.grading.AutoGradeConfigResolver;
```

No new `@Mock` field is needed — `autoGradeConfigResolver` will be a **real** instance, not a mock, same rationale as Task 3: it's a pure JSON reader with no side effects, and Mockito's default-`false` return for an unstubbed boolean mock would silently break every existing test that expects grading to run.

Update `setUp()`:

```java
    private FileImportService service;
    private final AutoGradeConfigResolver autoGradeConfigResolver =
        new AutoGradeConfigResolver(new ObjectMapper());

    @BeforeEach
    void setUp() {
        service = new FileImportService(
            exerciseRepository, versionRepository, submissionRepository,
            blocklyGrader, pythonGrader, batchCache, new ObjectMapper(),
            userRepository, importBatchRepository, securityMetrics, businessMetrics,
            autoGradeConfigResolver);
    }
```

Add a constant and a new test near `processSingleFile_validJson_returnsImported`:

```java
    private static final String MANUAL_GRADE_BLOCKLY_CONFIG =
        "{\"autoGrade\":false,\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello\"}}}";

    @Test
    void processSingleFile_autoGradeFalse_skipsGradingAndStoresNullScore() {
        Exercise exercise = new Exercise();
        exercise.setId(1L);
        exercise.setTitle("Hello");
        exercise.setType(ExerciseType.BLOCKLY);
        exercise.setCurrentVersionId(10L);
        when(exerciseRepository.findByIdAndDeletedFalse(1L)).thenReturn(Optional.of(exercise));
        ExerciseVersion version = new ExerciseVersion();
        version.setId(10L);
        version.setVersionNumber(1);
        version.setConfig(MANUAL_GRADE_BLOCKLY_CONFIG);
        when(versionRepository.findById(10L)).thenReturn(Optional.of(version));
        when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(false);
        Submission saved = new Submission();
        saved.setId(42L);
        when(submissionRepository.save(any())).thenReturn(saved);
        when(userRepository.findByUsername("Alex")).thenReturn(Optional.empty());
        when(importBatchRepository.findByUuid("batch-1")).thenReturn(Optional.empty());

        ImportResultDto result = service.processSingleFile("alex.json", validBlocklyJson(1L), "batch-1", false);

        assertThat(result.status()).isEqualTo("IMPORTED");
        assertThat(result.autoScore()).isNull();
        verifyNoInteractions(blocklyGrader);
    }
```

Add `verifyNoInteractions` to the existing static Mockito import line:
```java
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
```

- [ ] **Step 2: Run tests to verify the new test fails / others fail to compile**

Run: `cd backend && mvn test -Dtest=FileImportServiceTest`
Expected: FAIL — compile error, `FileImportService` has no 12-arg constructor yet.

- [ ] **Step 3: Update `FileImportService.java`**

Add the import and field:

```java
import com.platform.exercise.grading.AutoGradeConfigResolver;
```

(insert alphabetically, after `com.platform.exercise.domain.Submission`, before `com.platform.exercise.grading.BlocklyGrader`)

```java
    private final SecurityMetrics securityMetrics;
    private final BusinessMetrics businessMetrics;
    private final AutoGradeConfigResolver autoGradeConfigResolver;
```

Replace the grading block (currently `BigDecimal autoScore; String autoGradeDetails; if ("BLOCKLY"...` through the `else { return logAndReturn(...."Unknown exercise type...."); }` close) with:

```java
            BigDecimal autoScore = null;
            String autoGradeDetails = null;
            if (!"BLOCKLY".equals(exerciseType) && !"PYTHON".equals(exerciseType)) {
                return logAndReturn(batchId, ImportResultDto.failed(filename, "Unknown exercise type: " + exerciseType));
            }
            if (autoGradeConfigResolver.isEnabled(currentVersion.getConfig())) {
                if ("BLOCKLY".equals(exerciseType)) {
                    BlocklyGrader.Result gr = blocklyGrader.grade(answer, currentVersion.getConfig());
                    autoScore = gr.autoScore();
                    autoGradeDetails = gr.autoGradeDetailsJson();
                } else {
                    PythonGrader.Result gr = pythonGrader.grade(answer, currentVersion.getConfig());
                    autoScore = gr.autoScore();
                    autoGradeDetails = gr.autoGradeDetailsJson();
                }
            }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=FileImportServiceTest`
Expected: all tests pass, including the new `processSingleFile_autoGradeFalse_skipsGradingAndStoresNullScore`.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && mvn test`
Expected: `BUILD SUCCESS`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/FileImportService.java \
        backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java
git commit -m "feat(submission): gate import-batch auto-grading on autoGrade config flag"
```

---

### Task 5: Frontend — `ExerciseFormPage.jsx` rename + label change

**Files:**
- Modify: `frontend/src/pages/tutor/ExerciseFormPage.jsx`
- Modify: `frontend/src/pages/tutor/ExerciseFormPage.test.jsx`

**Interfaces:**
- Produces: form payload sends `config.autoGrade` (boolean) instead of `config.showResult`; checkbox accessible name is "Enable automatic grading".

- [ ] **Step 1: Update the test file (write failing tests first)**

In `ExerciseFormPage.test.jsx`, replace lines 72–113:

```javascript
it('includes autoGrade true in the create payload by default', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ autoGrade: true }),
      })
    )
  );
});

it('unchecking the toggle sends autoGrade false', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();

  const checkbox = screen.getByRole('checkbox', { name: /Enable automatic grading/ });
  expect(checkbox).toBeChecked();

  fireEvent.click(checkbox);
  expect(checkbox).not.toBeChecked();

  // Manual grading mode requires at least one dimension with weights summing to 1.0
  fireEvent.click(screen.getByRole('button', { name: /\+ Add Dimension/i }));
  const nameInputs = screen.getAllByPlaceholderText('Dimension name');
  fireEvent.change(nameInputs[0], { target: { value: 'Correctness' } });
  const weightInputs = screen.getAllByPlaceholderText('Weight (0–1)');
  fireEvent.change(weightInputs[0], { target: { value: '1' } });

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ autoGrade: false }),
      })
    )
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/tutor/ExerciseFormPage.test.jsx`
Expected: FAIL — both tests fail (`autoGrade` not in payload; checkbox with name "Enable automatic grading" not found).

- [ ] **Step 3: Update `ExerciseFormPage.jsx`**

Lines 13–34, rename the default config keys:

```javascript
const EMPTY_BLOCKLY_CONFIG = {
  allowedBlocks: [],
  initialWorkspaceXml: '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
  showCodeView: false,
  autoGrade: true,
  canViewAnswer: false,
  rubric: { dimensions: [] },
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
  autoGrade: true,
  rubric: { dimensions: [] },
};
```

Line 100, the validation guard:
```javascript
    if (!activeConfig.showResult) {
```
becomes
```javascript
    if (!activeConfig.autoGrade) {
```

Lines 271–280 (Blockly section):
```javascript
              <h3 style={{ marginTop: 24 }}>Grading Configuration</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={blocklyConfig.showResult !== false}
                  onChange={e => setBlocklyConfig(prev => ({ ...prev, showResult: e.target.checked }))}
                />
                Show instant result feedback
              </label>
              {blocklyConfig.showResult ? (
```
becomes
```javascript
              <h3 style={{ marginTop: 24 }}>Grading Configuration</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={blocklyConfig.autoGrade !== false}
                  onChange={e => setBlocklyConfig(prev => ({ ...prev, autoGrade: e.target.checked }))}
                />
                Enable automatic grading
              </label>
              {blocklyConfig.autoGrade ? (
```

Lines 347–356 (Python section):
```javascript
              <h3 style={{ marginTop: 24 }}>Grading Configuration</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={pythonConfig.showResult !== false}
                  onChange={e => setPythonConfig(prev => ({ ...prev, showResult: e.target.checked }))}
                />
                Show instant result feedback
              </label>
              {!pythonConfig.showResult && (
```
becomes
```javascript
              <h3 style={{ marginTop: 24 }}>Grading Configuration</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                <input
                  type="checkbox"
                  checked={pythonConfig.autoGrade !== false}
                  onChange={e => setPythonConfig(prev => ({ ...prev, autoGrade: e.target.checked }))}
                />
                Enable automatic grading
              </label>
              {!pythonConfig.autoGrade && (
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/tutor/ExerciseFormPage.test.jsx`
Expected: all tests pass.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: no failures (catches any other test in the suite that happens to assert on this page's old copy/keys).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/tutor/ExerciseFormPage.jsx frontend/src/pages/tutor/ExerciseFormPage.test.jsx
git commit -m "feat(exercise): rename showResult to autoGrade in exercise authoring form"
```

---

### Task 6: Frontend — `SubmissionDetailPage.jsx` rename

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.jsx`
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.test.jsx`

**Interfaces:**
- Produces: tutor review page reads `config.autoGrade === false` to decide whether to render rubric-dimension score inputs vs. a single score field (same logic, renamed key).

- [ ] **Step 1: Update the test file (write failing tests first)**

In `SubmissionDetailPage.test.jsx`, in both existing tests (`shows dimension description below the dimension label in the grading panel` and `does not render description text when description is absent`), change:
```javascript
      config: {
        showResult: false,
```
to
```javascript
      config: {
        autoGrade: false,
```
(both occurrences — lines 54 and 75 in the current file).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx`
Expected: FAIL — both tests fail because the page still reads `config.showResult`, which is no longer present in the fixture, so it falls into the non-rubric branch.

- [ ] **Step 3: Update `SubmissionDetailPage.jsx`**

Line 32:
```javascript
        if (config && config.showResult === false && config.rubric?.dimensions?.length) {
```
becomes
```javascript
        if (config && config.autoGrade === false && config.rubric?.dimensions?.length) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionDetailPage.test.jsx`
Expected: all tests pass.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: no failures.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionDetailPage.jsx frontend/src/pages/tutor/SubmissionDetailPage.test.jsx
git commit -m "feat(submission): read autoGrade instead of showResult in tutor review page"
```

---

## Final Verification

- [ ] Run the full backend suite: `cd backend && mvn test` → `BUILD SUCCESS`.
- [ ] Run the full frontend suite: `cd frontend && npm test` → no failures.
- [ ] Manually smoke-test per [run skill / CLAUDE.md Dev Commands]: `docker compose up -d`, create a PYTHON exercise with "Enable automatic grading" unchecked + a rubric dimension, submit as a student, confirm the modal shows "Submitted" (no score), confirm in the tutor's submission list that `autoScore` is empty and the tutor can still manually grade via the rubric form.
