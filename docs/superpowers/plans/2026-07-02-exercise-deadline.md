# Exercise Deadline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional per-exercise submission deadline. After it passes, students can no longer submit through the platform; tutors can still batch-import for that exercise at any time.

**Architecture:** `deadline` is a new nullable `LocalDateTime` column on `exercises` (mutable exercise-level metadata, like `status`/`categoryId` — not part of the immutable `exercise_versions.config`). It flows through the existing create/edit exercise APIs, is enforced as a single new guard clause in `StudentSubmissionService.submit()` (right after the exercise is loaded), is deliberately never checked in `FileImportService` (tutor import), and is surfaced to students on `StudentExerciseDetailDto` so the practice pages can display it and disable the Submit button client-side as a UX precaution.

**Tech Stack:** Java 25, Spring Boot 3.5.0, Flyway 9, Spring Data JPA, JUnit 5 + Mockito + MockMvc (backend); React 18.3.1, Vitest + Testing Library (frontend).

## Global Constraints

- `deadline` is optional (nullable). No deadline set → unrestricted submission, exactly like today.
- Deadline lives on `Exercise` (not `exercise_versions.config`) — editing it never creates a new immutable version.
- Tutor batch import (`FileImportService`) is never gated by the deadline.
- Spec: `docs/superpowers/specs/2026-07-02-exercise-deadline-design.md`

---

### Task 1: Backend — schema, entity, and error code

**Files:**
- Create: `backend/src/main/resources/db/migration/V14__add_exercise_deadline.sql`
- Modify: `backend/src/main/java/com/platform/exercise/domain/Exercise.java`
- Modify: `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`

**Interfaces:**
- Produces: `Exercise.getDeadline(): LocalDateTime` / `Exercise.setDeadline(LocalDateTime)`. `ErrorCode.EXERCISE_DEADLINE_PASSED` (HTTP 409).

- [ ] **Step 1: Add the migration**

Create `backend/src/main/resources/db/migration/V14__add_exercise_deadline.sql`:

```sql
ALTER TABLE exercises
    ADD COLUMN deadline DATETIME NULL COMMENT 'Optional submission deadline; NULL = no deadline' AFTER status;
```

- [ ] **Step 2: Add the `deadline` field to `Exercise`**

In `backend/src/main/java/com/platform/exercise/domain/Exercise.java`, add after the `status` field (after line 41, before `currentVersionId`):

```java
    @Column(name = "deadline")
    private LocalDateTime deadline;

```

- [ ] **Step 3: Add `EXERCISE_DEADLINE_PASSED` to `ErrorCode`**

In `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`, this enum constant was already added by the "submission-latest-only" plan's Task 1 if that plan ran first (it appends `SUBMISSION_ALREADY_GRADED`). Whether or not it has, add (or confirm present) as the final constant, terminated with `;`:

```java
    EXERCISE_DEADLINE_PASSED(HttpStatus.CONFLICT);
```

(If `SUBMISSION_ALREADY_GRADED` is already present from the other plan, place `EXERCISE_DEADLINE_PASSED` immediately after it instead, and move the terminating `;` to the new last line. If this plan runs first, append after `ACCOUNT_EXPIRED(HttpStatus.FORBIDDEN)` instead, exactly as shown above.)

- [ ] **Step 4: Compile to verify no errors**

Run: `cd backend && mvn compile -pl . 2>&1 | tail -40`
Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V14__add_exercise_deadline.sql backend/src/main/java/com/platform/exercise/domain/Exercise.java backend/src/main/java/com/platform/exercise/common/ErrorCode.java
git commit -m "feat(exercise): add nullable deadline column and EXERCISE_DEADLINE_PASSED error code"
```

---

### Task 2: Backend — tutor create/edit persists and returns `deadline`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/exercise/CreateExerciseRequest.java`
- Modify: `backend/src/main/java/com/platform/exercise/exercise/UpdateExerciseRequest.java`
- Modify: `backend/src/main/java/com/platform/exercise/exercise/ExerciseDetailDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/exercise/ExerciseService.java:49-70,84-105,223-230`
- Modify: `backend/src/test/java/com/platform/exercise/exercise/ExerciseControllerTest.java`

**Interfaces:**
- Consumes: `Exercise.getDeadline()/.setDeadline()` from Task 1.
- Produces: `CreateExerciseRequest.deadline(): LocalDateTime`, `UpdateExerciseRequest.deadline(): LocalDateTime`, `ExerciseDetailDto.deadline(): LocalDateTime` (serialized as `$.deadline` in the JSON API response).

- [ ] **Step 1: Write failing controller tests**

Add to `backend/src/test/java/com/platform/exercise/exercise/ExerciseControllerTest.java`, after `createPythonExercise_valid_returns201` (after line 117), before `createPythonExercise_noTestCases_returns400`:

```java
    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createExercise_withDeadline_returnsDeadlineInResponse() throws Exception {
        String body = """
                {"title":"T","description":"D","type":"PYTHON","difficulty":"EASY",
                 "deadline":"2026-07-15T23:59:00",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.deadline").value("2026-07-15T23:59:00"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createExercise_withoutDeadline_returnsNullDeadline() throws Exception {
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.deadline").value(org.hamcrest.Matchers.nullValue()));
    }
```

Add to the same file, inside `updateExercise_createsNewVersion`'s test area — as a new test right after it (after line 217), before the `// ── Delete ──` comment:

```java
    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void updateExercise_setsAndClearsDeadline() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();

        String updateWithDeadline = """
                {"title":"FizzBuzz","description":"desc","difficulty":"MEDIUM",
                 "deadline":"2026-08-01T10:00:00",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(put("/v1/exercises/" + id)
                        .contentType(MediaType.APPLICATION_JSON).content(updateWithDeadline))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deadline").value("2026-08-01T10:00:00"));

        String updateClearingDeadline = """
                {"title":"FizzBuzz","description":"desc","difficulty":"MEDIUM",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(put("/v1/exercises/" + id)
                        .contentType(MediaType.APPLICATION_JSON).content(updateClearingDeadline))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deadline").value(org.hamcrest.Matchers.nullValue()));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=ExerciseControllerTest -pl . 2>&1 | tail -60`
Expected: FAIL — `deadline` is not a recognized field on `CreateExerciseRequest`/`UpdateExerciseRequest` (Jackson silently ignores unknown JSON fields by default, so the requests still succeed, but `$.deadline` is absent/not equal to the expected value in the response since `ExerciseDetailDto` has no such field).

- [ ] **Step 3: Add `deadline` to `CreateExerciseRequest`**

Replace `backend/src/main/java/com/platform/exercise/exercise/CreateExerciseRequest.java`:

```java
package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import com.platform.exercise.domain.Exercise.Difficulty;
import com.platform.exercise.domain.Exercise.ExerciseType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;

public record CreateExerciseRequest(
        @NotBlank String title,
        @NotBlank String description,
        @NotNull ExerciseType type,
        @NotNull Difficulty difficulty,
        Long categoryId,
        List<String> hints,
        @NotNull JsonNode config,
        LocalDateTime deadline
) {}
```

- [ ] **Step 4: Add `deadline` to `UpdateExerciseRequest`**

Replace `backend/src/main/java/com/platform/exercise/exercise/UpdateExerciseRequest.java`:

```java
package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import com.platform.exercise.domain.Exercise.Difficulty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;

public record UpdateExerciseRequest(
        @NotBlank String title,
        @NotBlank String description,
        @NotNull Difficulty difficulty,
        Long categoryId,
        List<String> hints,
        @NotNull JsonNode config,
        LocalDateTime deadline
) {}
```

- [ ] **Step 5: Add `deadline` to `ExerciseDetailDto`**

Replace `backend/src/main/java/com/platform/exercise/exercise/ExerciseDetailDto.java`:

```java
package com.platform.exercise.exercise;

import java.time.LocalDateTime;

public record ExerciseDetailDto(
        Long id,
        String title,
        String type,
        String status,
        LocalDateTime deadline,
        ExerciseVersionDto currentVersion
) {}
```

- [ ] **Step 6: Persist and return `deadline` in `ExerciseService`**

In `backend/src/main/java/com/platform/exercise/exercise/ExerciseService.java`, in `createExercise` (lines 52-58), add one line after `exercise.setCategoryId(req.categoryId());`:

```java
        Exercise exercise = new Exercise();
        exercise.setTitle(req.title());
        exercise.setDescription(req.description());
        exercise.setType(req.type());
        exercise.setDifficulty(req.difficulty());
        exercise.setCategoryId(req.categoryId());
        exercise.setDeadline(req.deadline());
        exercise.setCreatedBy(userId);
```

In `updateExercise` (lines 97-101), add one line after `exercise.setCategoryId(req.categoryId());`:

```java
        exercise.setTitle(req.title());
        exercise.setDescription(req.description());
        exercise.setDifficulty(req.difficulty());
        exercise.setCategoryId(req.categoryId());
        exercise.setDeadline(req.deadline());
        exercise.setCurrentVersionId(savedVersion.getId());
```

In `toDetailDto` (lines 223-230), add `exercise.getDeadline()` as a new argument:

```java
    private ExerciseDetailDto toDetailDto(Exercise exercise, ExerciseVersion version) {
        return new ExerciseDetailDto(
                exercise.getId(),
                exercise.getTitle(),
                exercise.getType().name(),
                exercise.getStatus().name(),
                exercise.getDeadline(),
                toVersionDto(version, true));
    }
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=ExerciseControllerTest -pl . 2>&1 | tail -80`
Expected: `BUILD SUCCESS`, all tests pass, including the 3 new ones and every pre-existing test in the file (none of them assert on the full JSON shape in a way that a new field would break, since they use targeted `jsonPath` assertions).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/exercise/CreateExerciseRequest.java backend/src/main/java/com/platform/exercise/exercise/UpdateExerciseRequest.java backend/src/main/java/com/platform/exercise/exercise/ExerciseDetailDto.java backend/src/main/java/com/platform/exercise/exercise/ExerciseService.java backend/src/test/java/com/platform/exercise/exercise/ExerciseControllerTest.java
git commit -m "feat(exercise): persist and expose deadline on tutor create/edit APIs"
```

---

### Task 3: Backend — enforce the deadline on student submit, confirm import is exempt

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java`
- Modify: `backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java`
- Modify: `backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java`

**Interfaces:**
- Consumes: `Exercise.getDeadline()` from Task 1, `ErrorCode.EXERCISE_DEADLINE_PASSED` from Task 1.
- Produces: `submit()` throws `PlatformException(EXERCISE_DEADLINE_PASSED)` when the exercise's deadline is in the past.

- [ ] **Step 1: Write failing tests in `StudentSubmissionServiceTest`**

Add to `backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java`, after `submit_autoGradeAbsent_defaultsToTrue` (after line 100), before `history_autoGradeFalse_hidesStoredScores`:

```java
    @Test
    void submit_deadlineInPast_throwsDeadlinePassed() {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCurrentVersionId(9L);
        ex.setDeadline(LocalDateTime.now().minusDays(1));
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(ex));

        com.platform.exercise.common.PlatformException thrown = assertThrows(
            com.platform.exercise.common.PlatformException.class,
            () -> service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null)));

        assertEquals(com.platform.exercise.common.ErrorCode.EXERCISE_DEADLINE_PASSED, thrown.getErrorCode());
        verify(submissionRepo, never()).save(any());
    }

    @Test
    void submit_deadlineInFuture_succeeds() {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCurrentVersionId(9L);
        ex.setDeadline(LocalDateTime.now().plusDays(1));
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(ex));
        ExerciseVersion v = new ExerciseVersion();
        v.setId(9L);
        v.setVersionNumber(1);
        v.setConfig("{\"autoGrade\":true,\"testCases\":[]}");
        when(versionRepo.findById(9L)).thenReturn(Optional.of(v));
        when(pythonGrader.grade(any(), any()))
            .thenReturn(new PythonGrader.Result(BigDecimal.valueOf(100), "{}"));

        SubmitResultDto result = service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null));

        assertTrue(result.showResult());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=StudentSubmissionServiceTest -pl . 2>&1 | tail -60`
Expected: `submit_deadlineInPast_throwsDeadlinePassed` FAILS — no exception is thrown today (the deadline is never checked), so `submit()` proceeds and throws a `NullPointerException` or similar from the missing version stub instead of the expected `PlatformException`. `submit_deadlineInFuture_succeeds` passes already (harmless, since no deadline check exists yet) — that's fine, it becomes a real regression guard once Step 3 lands.

- [ ] **Step 3: Add the deadline guard to `StudentSubmissionService.submit()`**

In `backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java`, insert immediately after the `Exercise exercise = ...orElseThrow(...)` statement (the block ending `.orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));` that filters on `PUBLISHED` status) and before the `ExerciseVersion version = ...` lookup line:

```java
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
            .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));

        if (exercise.getDeadline() != null && LocalDateTime.now().isAfter(exercise.getDeadline())) {
            throw new PlatformException(ErrorCode.EXERCISE_DEADLINE_PASSED,
                "The submission deadline for this exercise has passed.");
        }

        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
```

(This is a pure insertion between two existing statements — it does not depend on, and does not conflict with, the separate "already graded" resubmission check that the submission-latest-only plan inserts later in the same method, between the version lookup and the `autoGrade` computation.)

- [ ] **Step 4: Run `StudentSubmissionServiceTest` to verify all tests pass**

Run: `cd backend && mvn test -Dtest=StudentSubmissionServiceTest -pl . 2>&1 | tail -80`
Expected: `BUILD SUCCESS`, all tests pass — the 2 new ones plus every pre-existing test (their `Exercise` fixtures never set a deadline, so `exercise.getDeadline()` is `null` and the new guard is a no-op for them).

- [ ] **Step 5: Write a regression test proving tutor import is exempt from the deadline**

Add to `backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java`, after `processSingleFile_autoGradeFalse_skipsGradingAndStoresNullScore` (after line 247), before the `buildZipWithEntry` helper:

```java
    @Test
    void processSingleFile_pastDeadline_stillImportsSuccessfully() {
        Exercise exercise = new Exercise();
        exercise.setId(1L);
        exercise.setTitle("Hello");
        exercise.setType(ExerciseType.BLOCKLY);
        exercise.setCurrentVersionId(10L);
        exercise.setDeadline(java.time.LocalDateTime.now().minusDays(1));
        when(exerciseRepository.findByIdAndDeletedFalse(1L)).thenReturn(Optional.of(exercise));
        ExerciseVersion version = new ExerciseVersion();
        version.setId(10L);
        version.setVersionNumber(1);
        version.setConfig(BLOCKLY_CONFIG);
        when(versionRepository.findById(10L)).thenReturn(Optional.of(version));
        when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(false);
        Submission saved = new Submission();
        saved.setId(42L);
        when(submissionRepository.save(any())).thenReturn(saved);
        when(blocklyGrader.grade(anyString(), anyString()))
            .thenReturn(new BlocklyGrader.Result(new BigDecimal("100.00"),
                "{\"type\":\"BLOCKLY\",\"passed\":true}"));

        ImportResultDto result = service.processSingleFile("alex.json", validBlocklyJson(1L), "batch-1", false);

        assertThat(result.status()).isEqualTo("IMPORTED");
    }
```

- [ ] **Step 6: Run the test to verify it passes without any production code change**

Run: `cd backend && mvn test -Dtest=FileImportServiceTest -pl . 2>&1 | tail -60`
Expected: `BUILD SUCCESS` — this test passes with zero changes to `FileImportService.java`, confirming (and now permanently locking in via a regression test) that tutor import was never gated by the deadline.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java
git commit -m "feat(exercise): reject student submissions past the deadline; keep tutor import exempt"
```

---

### Task 4: Backend — expose `deadline` on the student-facing exercise detail

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentExerciseDetailDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java:61-90`
- Modify: `backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java`

**Interfaces:**
- Consumes: `Exercise.getDeadline()` from Task 1.
- Produces: `StudentExerciseDetailDto.deadline(): LocalDateTime`, serialized as `$.deadline` on `GET /v1/student/exercises/{id}`.

- [ ] **Step 1: Write failing controller tests**

Add to `backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java`, after `get_publishedPythonExercise_stripsHiddenTestCasesAndGradingRules` (after line 167), before `get_publishedBlocklyExercise_stripsGradingRulesKeepsAllowedBlocks`:

```java
    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_exerciseWithDeadline_includesDeadlineInResponse() throws Exception {
        jdbcTemplate.update("UPDATE exercises SET deadline = ? WHERE id = ?",
            java.sql.Timestamp.valueOf("2026-07-15 23:59:00"), publishedPythonExId);

        mockMvc.perform(get("/v1/student/exercises/" + publishedPythonExId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deadline").value("2026-07-15T23:59:00"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_exerciseWithoutDeadline_deadlineIsNull() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/" + publishedPythonExId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deadline").value(org.hamcrest.Matchers.nullValue()));
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=StudentExerciseControllerTest -pl . 2>&1 | tail -60`
Expected: `get_exerciseWithDeadline_includesDeadlineInResponse` FAILS — `StudentExerciseDetailDto` has no `deadline` field, so `$.deadline` doesn't equal `"2026-07-15T23:59:00"`. `get_exerciseWithoutDeadline_deadlineIsNull` currently passes trivially (field absent evaluates as null-ish depending on JsonPath) — treat it as a baseline to keep green after the change.

- [ ] **Step 3: Add `deadline` to `StudentExerciseDetailDto`**

Replace `backend/src/main/java/com/platform/exercise/student/StudentExerciseDetailDto.java`:

```java
package com.platform.exercise.student;

import java.time.LocalDateTime;

public record StudentExerciseDetailDto(
        Long id,
        String title,
        String type,
        String difficulty,
        CategoryRef category,
        StudentVersionDto version,
        int likeCount,
        boolean liked,
        LocalDateTime deadline
) {
    public record CategoryRef(Long id, String name) {}
}
```

- [ ] **Step 4: Populate `deadline` in `StudentExerciseService.toDetailDto`**

In `backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java`, replace the `return new StudentExerciseDetailDto(...)` statement (lines 83-86):

```java
            return new StudentExerciseDetailDto(
                    exercise.getId(), exercise.getTitle(),
                    exercise.getType().name(), exercise.getDifficulty().name(),
                    cat, versionDto, exercise.getLikeCount(), false, exercise.getDeadline());
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=StudentExerciseControllerTest -pl . 2>&1 | tail -80`
Expected: `BUILD SUCCESS`, all tests pass, including the 2 new ones and every pre-existing test in the file (they use targeted `jsonPath` assertions on other fields, unaffected by the new field).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentExerciseDetailDto.java backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java
git commit -m "feat(exercise): expose deadline on the student exercise detail endpoint"
```

---

### Task 5: Frontend — tutor exercise form: set/edit/clear the deadline

**Files:**
- Modify: `frontend/src/pages/tutor/ExerciseFormPage.jsx:47-141,226-239`
- Modify: `frontend/src/pages/tutor/ExerciseFormPage.test.jsx`

**Interfaces:**
- Consumes: `ex.deadline` (ISO datetime string or `null`) from `exerciseApi.get(id)`, per Task 2's `ExerciseDetailDto`.
- Produces: `deadline` (string, `datetime-local` format `YYYY-MM-DDTHH:mm`, or `''`) included in `exerciseApi.create`/`exerciseApi.update` payloads as `deadline: deadline || null`.

- [ ] **Step 1: Write failing tests**

Add to `frontend/src/pages/tutor/ExerciseFormPage.test.jsx`, after `it('includes autoGrade true in the create payload by default', ...)` (after line 85):

```jsx
it('sends deadline null in the create payload when left blank', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: null })
    )
  );
});

it('sends the entered deadline in the create payload', async () => {
  await renderCreateForm('PYTHON');
  fillRequiredFields();
  fireEvent.change(screen.getByLabelText(/deadline/i), { target: { value: '2026-07-15T23:59' } });

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: '2026-07-15T23:59' })
    )
  );
});

it('prefills the deadline field when editing an exercise that has one', async () => {
  exerciseApi.get = vi.fn().mockResolvedValue({
    id: 1, title: 'Existing', type: 'PYTHON', categoryId: null,
    currentVersion: { description: 'd', difficulty: 'EASY', hints: [], config: {} },
    deadline: '2026-07-15T23:59:00',
  });
  render(
    <MemoryRouter initialEntries={['/tutor/exercises/1/edit']}>
      <Routes>
        <Route path="/tutor/exercises/:id/edit" element={<ExerciseFormPage />} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => expect(screen.getByLabelText(/deadline/i).value).toBe('2026-07-15T23:59'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/tutor/ExerciseFormPage.test.jsx 2>&1 | tail -80`
Expected: all 3 new tests FAIL — there is no "Deadline" field in the form yet (`getByLabelText(/deadline/i)` throws), and the create/update payload never includes a `deadline` key.

- [ ] **Step 3: Add `deadline` state**

In `frontend/src/pages/tutor/ExerciseFormPage.jsx`, add after line 52 (`const [categoryId, setCategoryId] = useState('');`):

```jsx
  const [deadline, setDeadline] = useState('');
```

- [ ] **Step 4: Prefill `deadline` when loading an exercise for edit**

In `loadExercise()` (lines 64-82), add after `setCategoryId(ex.categoryId ? String(ex.categoryId) : '');` (after line 71):

```jsx
      setDeadline(ex.deadline ? ex.deadline.slice(0, 16) : '');
```

- [ ] **Step 5: Include `deadline` in the create/update payload**

In `handleSubmit` (lines 93-141), add `deadline: deadline || null,` to the `payload` object (lines 119-126):

```jsx
      const payload = {
        title,
        description,
        difficulty,
        categoryId: categoryId ? Number(categoryId) : null,
        hints: hints.split('\n').map(h => h.trim()).filter(Boolean),
        config,
        deadline: deadline || null,
      };
```

- [ ] **Step 6: Render the Deadline input**

In `frontend/src/pages/tutor/ExerciseFormPage.jsx`, add a new field inside the existing grid `<div>` (after the Hints field, which ends at line 239, and before the grid's closing `</div>` on line 240):

```jsx
            <div>
              <label htmlFor="deadline" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
                Deadline (optional)
              </label>
              <input id="deadline" type="datetime-local" value={deadline}
                onChange={e => setDeadline(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }} />
            </div>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/tutor/ExerciseFormPage.test.jsx 2>&1 | tail -80`
Expected: `all tests pass`, including the 3 new ones and every pre-existing test in the file (the new field and payload key are additive and don't change any existing assertion's target).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/tutor/ExerciseFormPage.jsx frontend/src/pages/tutor/ExerciseFormPage.test.jsx
git commit -m "feat(exercise): add deadline field to the tutor exercise form"
```

---

### Task 6: Frontend — student practice pages show the deadline and disable Submit once passed

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx:1-12,46-47,225,262-265`
- Modify: `frontend/src/pages/student/PythonPracticePage.jsx:1-6,17-18,142,179-182`
- Modify: `frontend/src/pages/student/BlocklyPracticePage.test.jsx`
- Modify: `frontend/src/pages/student/PythonPracticePage.test.jsx`

**Interfaces:**
- Consumes: `exercise.deadline` (ISO datetime string or `undefined`/`null`) from the `exercise` prop, per Task 4's `StudentExerciseDetailDto`.
- Produces: no new exported interfaces — purely presentational within each page.

- [ ] **Step 1: Write failing tests for `BlocklyPracticePage`**

Add to `frontend/src/pages/student/BlocklyPracticePage.test.jsx`, as a new `describe` block after the `describe('Save and Submit', ...)` block (after line 303):

```jsx
describe('Deadline', () => {
  it('disables Submit and shows a message when the deadline has passed', async () => {
    const exercise = { ...makeExercise(), deadline: '2020-01-01T00:00:00' };
    render(<MemoryRouter><BlocklyPracticePage exercise={exercise} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    expect(screen.getByText(/deadline for this exercise has passed/i)).toBeInTheDocument();
  });

  it('keeps Submit enabled when the deadline is in the future', async () => {
    const exercise = { ...makeExercise(), deadline: '2099-01-01T00:00:00' };
    render(<MemoryRouter><BlocklyPracticePage exercise={exercise} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
  });

  it('keeps Submit enabled when there is no deadline', async () => {
    render(<MemoryRouter><BlocklyPracticePage exercise={makeExercise()} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Write failing tests for `PythonPracticePage`**

Add to `frontend/src/pages/student/PythonPracticePage.test.jsx`, as a new `describe` block after `describe('PythonPracticePage submit/draft', ...)` (after line 94):

```jsx
describe('PythonPracticePage deadline', () => {
  it('disables Submit and shows a message when the deadline has passed', async () => {
    studentApi.getDraft.mockResolvedValue(null);
    const pastDeadlineExercise = { ...exercise, deadline: '2020-01-01T00:00:00' };
    render(<MemoryRouter><PythonPracticePage exercise={pastDeadlineExercise} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
    expect(screen.getByText(/deadline for this exercise has passed/i)).toBeInTheDocument();
  });

  it('keeps Submit enabled when there is no deadline', async () => {
    studentApi.getDraft.mockResolvedValue(null);
    render(<MemoryRouter><PythonPracticePage exercise={exercise} /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
  });
});
```

- [ ] **Step 3: Run both test files to verify the new tests fail**

Run: `cd frontend && npx vitest run src/pages/student/BlocklyPracticePage.test.jsx src/pages/student/PythonPracticePage.test.jsx 2>&1 | tail -100`
Expected: the deadline-related tests FAIL — neither page reads `exercise.deadline` yet, so Submit is never disabled and no deadline message renders.

- [ ] **Step 4: Add deadline handling to `BlocklyPracticePage.jsx`**

Add the import next to the other imports (after line 8, `import { createBlocklyBlobWorker } from '../../utils/blocklyWorker';`):

```jsx
import { formatDateTime } from '../../utils/dateFormat';
```

Add the computed flag after line 47 (`const config = version.config;`):

```jsx
  const deadlinePassed = exercise.deadline != null && new Date(exercise.deadline) < new Date();
```

Add the deadline notice after line 225 (`<h1>{exercise.title}</h1>`):

```jsx
      {exercise.deadline && (
        <p style={{ fontSize: 13, color: deadlinePassed ? '#c62828' : '#555', margin: '0 0 12px' }}>
          Deadline: {formatDateTime(exercise.deadline)}
          {deadlinePassed && ' — the deadline for this exercise has passed. Submissions are closed.'}
        </p>
      )}
```

Replace the Submit button (lines 262-265):

```jsx
        <button onClick={handleSubmit} disabled={submitting || deadlinePassed}
          style={{ background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px',
            cursor: deadlinePassed ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
```

- [ ] **Step 5: Add the same deadline handling to `PythonPracticePage.jsx`**

Add the import next to the other imports (after line 4, `import MarkdownRenderer from '../../components/MarkdownRenderer';`):

```jsx
import { formatDateTime } from '../../utils/dateFormat';
```

Add the computed flag after line 18 (`const config = version.config;`):

```jsx
  const deadlinePassed = exercise.deadline != null && new Date(exercise.deadline) < new Date();
```

Add the deadline notice after line 142 (`<h1>{exercise.title}</h1>`):

```jsx
      {exercise.deadline && (
        <p style={{ fontSize: 13, color: deadlinePassed ? '#c62828' : '#555', margin: '0 0 12px' }}>
          Deadline: {formatDateTime(exercise.deadline)}
          {deadlinePassed && ' — the deadline for this exercise has passed. Submissions are closed.'}
        </p>
      )}
```

Replace the Submit button (lines 179-182):

```jsx
        <button onClick={handleSubmit} disabled={submitting || deadlinePassed}
          style={{ background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px',
            cursor: deadlinePassed ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
```

- [ ] **Step 6: Run both test files to verify all tests pass**

Run: `cd frontend && npx vitest run src/pages/student/BlocklyPracticePage.test.jsx src/pages/student/PythonPracticePage.test.jsx 2>&1 | tail -100`
Expected: all tests pass, including the 5 new ones and every pre-existing test on both pages (their fixtures never set `deadline`, so `exercise.deadline` is `undefined` and `deadlinePassed` evaluates to `false`, matching today's behavior).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx frontend/src/pages/student/BlocklyPracticePage.test.jsx frontend/src/pages/student/PythonPracticePage.jsx frontend/src/pages/student/PythonPracticePage.test.jsx
git commit -m "feat(exercise): show deadline and disable Submit once passed on practice pages"
```

---

## Self-Review Notes

- Spec coverage: schema/entity/error-code (Task 1), tutor create/edit persistence (Task 2), student-submit enforcement + import exemption (Task 3), student-facing exposure (Task 4), tutor form UI (Task 5), student practice-page UX (Task 6) — every spec requirement maps to a task.
- No placeholders — all steps show full code and exact commands.
- Type consistency: `Exercise.getDeadline(): LocalDateTime` (Task 1) is threaded consistently through `CreateExerciseRequest.deadline()`/`UpdateExerciseRequest.deadline()` (Task 2), `ErrorCode.EXERCISE_DEADLINE_PASSED` (Task 1) matches the exact name used in Task 3's `submit()` guard and test assertions, and `StudentExerciseDetailDto.deadline()` (Task 4) matches the `exercise.deadline` property name read by both practice pages in Task 6.
- Cross-plan interaction: Task 1 Step 3 and Task 3 Step 3 explicitly account for the "submission-latest-only" plan touching `ErrorCode.java` and `StudentSubmissionService.submit()` too, so this plan is safe to run before, after, or interleaved with that one.
