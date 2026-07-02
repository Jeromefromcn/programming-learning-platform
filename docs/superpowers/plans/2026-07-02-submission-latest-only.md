# Submissions: Keep Only the Latest Per Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new submission for a given `(exercise, student)` pair supersedes the previous one within the same source (`STUDENT` direct submit vs. tutor `IMPORT`), via soft-delete — except a `STUDENT` submission that has already been manually graded blocks resubmission entirely.

**Architecture:** Two independent write paths (`StudentSubmissionService.submit()`, `FileImportService.processSingleFile()`) each gain a pre-insert check against the active submission for their own source. `STUDENT` path: look up by `(userId, exerciseId, source)`, block if graded, else soft-delete-then-insert. `IMPORT` path: bulk soft-delete by `(studentName, exerciseId, source)` regardless of grading, then insert — tutors always win. A new `ErrorCode.SUBMISSION_ALREADY_GRADED` (409) surfaces the block to students; the frontend gains error handling for it (currently submit errors fail silently).

**Tech Stack:** Java 25, Spring Boot 3.5.0, Spring Data JPA, JUnit 5 + Mockito + AssertJ, `@DataJpaTest`/H2 (backend); React 18.3.1, Vitest + Testing Library (frontend).

## Global Constraints

- No hard deletes — superseded submissions are soft-deleted (`is_deleted = true`), never removed.
- `STUDENT` and `IMPORT` sources remain fully independent — one never soft-deletes or blocks the other for the same `(student, exercise)`.
- Tutor batch import is never blocked by the "already graded" rule — only `StudentSubmissionService.submit()` enforces it.
- Spec: `docs/superpowers/specs/2026-07-02-submission-latest-only-design.md`

---

### Task 1: Backend — `ErrorCode` and `SubmissionRepository` additions

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/common/ErrorCode.java:28-29`
- Modify: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`
- Modify: `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java`

**Interfaces:**
- Produces: `ErrorCode.SUBMISSION_ALREADY_GRADED` (HTTP 409). `SubmissionRepository.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(Long userId, Long exerciseId, String source): Optional<Submission>`. `SubmissionRepository.softDeleteActiveByStudentNameAndExerciseIdAndSource(String studentName, Long exerciseId, String source): int`.

- [ ] **Step 1: Write failing repository tests**

Add to `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java`, just before the final closing `}` of the class:

```java
    @Test
    void findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse_returnsActiveMatchOnly() {
        Submission activeStudent = repository.save(sub("STUDENT", userId7, exerciseId));
        Submission deletedStudent = sub("STUDENT", userId7, exerciseId);
        deletedStudent.setDeleted(true);
        repository.save(deletedStudent);
        repository.save(sub("IMPORT", userId7, exerciseId)); // different source, must not match

        var found = repository.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(userId7, exerciseId, "STUDENT");

        assertTrue(found.isPresent());
        assertEquals(activeStudent.getId(), found.get().getId());
    }

    @Test
    void findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse_emptyWhenNoActiveMatch() {
        var found = repository.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(userId7, exerciseId, "STUDENT");
        assertTrue(found.isEmpty());
    }

    @Test
    void softDeleteActiveByStudentNameAndExerciseIdAndSource_marksOnlyMatchingActiveImportRows() {
        Exercise other = new Exercise();
        other.setTitle("Other Exercise");
        other.setDescription("desc");
        other.setType(Exercise.ExerciseType.PYTHON);
        other.setDifficulty(Exercise.Difficulty.EASY);
        other.setStatus(Exercise.Status.PUBLISHED);
        other.setCreatedBy(userId7);
        Long otherExerciseId = ((Exercise) em.persistAndFlush(other)).getId();

        Submission targetImport = repository.save(sub("IMPORT", null, exerciseId));
        Submission differentSource = repository.save(sub("STUDENT", userId7, exerciseId));
        Submission differentExercise = repository.save(sub("IMPORT", null, otherExerciseId));

        int affected = repository.softDeleteActiveByStudentNameAndExerciseIdAndSource("Alice", exerciseId, "IMPORT");

        assertEquals(1, affected);
        assertTrue(repository.findById(targetImport.getId()).map(Submission::isDeleted).orElse(false));
        assertFalse(repository.findById(differentSource.getId()).map(Submission::isDeleted).orElse(true));
        assertFalse(repository.findById(differentExercise.getId()).map(Submission::isDeleted).orElse(true));
    }
```

- [ ] **Step 2: Run the tests to verify they fail (compile error — methods don't exist yet)**

Run: `cd backend && mvn test -Dtest=SubmissionRepositoryTest -pl . 2>&1 | tail -60`
Expected: compile FAILURE — `cannot find symbol` for `findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse` and `softDeleteActiveByStudentNameAndExerciseIdAndSource`.

- [ ] **Step 3: Add `SUBMISSION_ALREADY_GRADED` to `ErrorCode`**

In `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`, add it as the new final constant. If the file still ends with the original two constants (i.e. the separate "exercise-deadline" plan hasn't run yet), replace lines 28-29:

```java
    BATCH_NOT_FOUND(HttpStatus.NOT_FOUND),
    ACCOUNT_EXPIRED(HttpStatus.FORBIDDEN),
    SUBMISSION_ALREADY_GRADED(HttpStatus.CONFLICT);
```

If `EXERCISE_DEADLINE_PASSED(HttpStatus.CONFLICT)` is already present (the "exercise-deadline" plan ran first), instead append `SUBMISSION_ALREADY_GRADED(HttpStatus.CONFLICT)` immediately after it and move the terminating `;` to that new last line — the specific ordering of the two constants doesn't matter, only that each ends up present exactly once with a valid `HttpStatus` and the enum body ends with a single `;`.

- [ ] **Step 4: Add the two repository methods**

In `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`, add these methods right after `softDeleteAllByBatchId` (after line 129, before the `LOWER()` comment on line 131):

```java

    Optional<Submission> findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(
            Long userId, Long exerciseId, String source);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Submission s SET s.deleted = true
            WHERE s.studentName = :studentName AND s.exerciseId = :exerciseId
              AND s.source = :source AND s.deleted = false
            """)
    int softDeleteActiveByStudentNameAndExerciseIdAndSource(
            @Param("studentName") String studentName,
            @Param("exerciseId") Long exerciseId,
            @Param("source") String source);
```

Add `import java.util.Optional;` to the import block at the top of the file (alongside the existing `import java.util.List;`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=SubmissionRepositoryTest -pl . 2>&1 | tail -60`
Expected: `BUILD SUCCESS`, all tests in `SubmissionRepositoryTest` pass (the 3 new ones plus all pre-existing ones, unaffected).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/common/ErrorCode.java backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java
git commit -m "feat(submission): add repository support for latest-submission-only overwrite"
```

---

### Task 2: Backend — `StudentSubmissionService` blocks/overwrites on resubmit

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java:35-42`
- Modify: `backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java`

**Interfaces:**
- Consumes: `SubmissionRepository.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse` from Task 1.
- Produces: `submit()` now throws `PlatformException(ErrorCode.SUBMISSION_ALREADY_GRADED)` when the student's prior `STUDENT` submission for this exercise is already graded.

- [ ] **Step 1: Write failing tests**

Add to `backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java`, after `submit_autoGradeAbsent_defaultsToTrue` (after line 100) and before `history_autoGradeFalse_hidesStoredScores`:

```java
    @Test
    void submit_priorUngradedStudentSubmissionExists_softDeletesItAndInsertsNew() {
        stubExercise("{\"autoGrade\":true,\"testCases\":[]}");
        Submission prior = new Submission();
        prior.setId(50L);
        prior.setUserId(7L);
        prior.setExerciseId(2L);
        prior.setSource("STUDENT");
        prior.setGraded(false);
        when(submissionRepo.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(7L, 2L, "STUDENT"))
            .thenReturn(Optional.of(prior));

        service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null));

        assertTrue(prior.isDeleted());
        verify(submissionRepo, times(2)).save(any());
        verify(submissionRepo).save(prior);
    }

    @Test
    void submit_priorGradedStudentSubmissionExists_throwsAndDoesNotInsert() {
        stubExercise("{\"autoGrade\":true,\"testCases\":[]}");
        Submission prior = new Submission();
        prior.setId(50L);
        prior.setUserId(7L);
        prior.setExerciseId(2L);
        prior.setSource("STUDENT");
        prior.setGraded(true);
        when(submissionRepo.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(7L, 2L, "STUDENT"))
            .thenReturn(Optional.of(prior));

        com.platform.exercise.common.PlatformException ex = assertThrows(
            com.platform.exercise.common.PlatformException.class,
            () -> service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null)));

        assertEquals(com.platform.exercise.common.ErrorCode.SUBMISSION_ALREADY_GRADED, ex.getErrorCode());
        assertFalse(prior.isDeleted());
        verify(submissionRepo, never()).save(any());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=StudentSubmissionServiceTest -pl . 2>&1 | tail -60`
Expected: both new tests FAIL. First test fails with `Wanted but not invoked: submissionRepo.save(prior)` (submit() never checks for a prior submission today). Second test fails because no exception is thrown (submit() proceeds to insert unconditionally).

- [ ] **Step 3: Implement the check in `StudentSubmissionService.submit()`**

In `backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java`, replace lines 35-43:

```java
    @Transactional
    public SubmitResultDto submit(Long userId, String studentName, Long exerciseId, SubmitRequest req) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
            .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));

        submissionRepository.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(userId, exerciseId, "STUDENT")
            .ifPresent(existing -> {
                if (existing.isGraded()) {
                    throw new PlatformException(ErrorCode.SUBMISSION_ALREADY_GRADED,
                        "This exercise has already been graded and cannot be resubmitted.");
                }
                existing.setDeleted(true);
                submissionRepository.save(existing);
            });

        boolean autoGrade = autoGradeConfigResolver.isEnabled(version.getConfig());
```

(This keeps the rest of the method — from `String type = exercise.getType().name();` onward — unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=StudentSubmissionServiceTest -pl . 2>&1 | tail -60`
Expected: `BUILD SUCCESS`, all tests pass, including the 2 new ones and all 4 pre-existing ones (which don't stub `findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse`, so Mockito's default `Optional.empty()` keeps their `submit()` calls behaving exactly as before).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentSubmissionService.java backend/src/test/java/com/platform/exercise/student/StudentSubmissionServiceTest.java
git commit -m "feat(submission): block resubmission of already-graded exercises, overwrite ungraded ones"
```

---

### Task 3: Backend — `FileImportService` overwrites prior import on re-import

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/FileImportService.java:160-162`
- Modify: `backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java`

**Interfaces:**
- Consumes: `SubmissionRepository.softDeleteActiveByStudentNameAndExerciseIdAndSource` from Task 1.
- Produces: no change to `processSingleFile`'s public signature/return type.

- [ ] **Step 1: Write a failing test**

Add to `backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java`, after `processSingleFile_autoGradeFalse_skipsGradingAndStoresNullScore` (after line 247), before the `buildZipWithEntry` helper:

```java
    @Test
    void processSingleFile_nonDuplicateReimport_softDeletesPriorActiveImportForSameStudentAndExercise() {
        stubExercise(1L, 10L);
        when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(false);
        Submission saved = new Submission();
        saved.setId(42L);
        when(submissionRepository.save(any())).thenReturn(saved);
        when(blocklyGrader.grade(anyString(), anyString()))
            .thenReturn(new BlocklyGrader.Result(new BigDecimal("100.00"),
                "{\"type\":\"BLOCKLY\",\"passed\":true}"));

        service.processSingleFile("alex.json", validBlocklyJson(1L), "batch-1", false);

        verify(submissionRepository).softDeleteActiveByStudentNameAndExerciseIdAndSource("Alex", 1L, "IMPORT");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=FileImportServiceTest -pl . 2>&1 | tail -60`
Expected: FAIL — `Wanted but not invoked: submissionRepository.softDeleteActiveByStudentNameAndExerciseIdAndSource("Alex", 1L, "IMPORT")` (the call doesn't exist yet).

- [ ] **Step 3: Implement the soft-delete call in `FileImportService.processSingleFile`**

In `backend/src/main/java/com/platform/exercise/submission/FileImportService.java`, insert immediately before line 162 (`Submission sub = new Submission();`):

```java
            submissionRepository.softDeleteActiveByStudentNameAndExerciseIdAndSource(studentName, exerciseId, "IMPORT");

            Submission sub = new Submission();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=FileImportServiceTest -pl . 2>&1 | tail -60`
Expected: `BUILD SUCCESS`, all tests pass, including the new one and all pre-existing ones (which don't stub the new method — Mockito's mock default returns `0` for the unstubbed `int`-returning call, which is silently ignored by the production code, so no behavior change).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/FileImportService.java backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java
git commit -m "feat(submission): soft-delete prior active import when re-importing same student+exercise"
```

---

### Task 4: Frontend — surface submit errors instead of failing silently

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx:42-43` (state), `:112-124` (handleSubmit), after `:323` (error modal)
- Modify: `frontend/src/pages/student/PythonPracticePage.jsx:31` (state), `:101-111` (handleSubmit), after `:274` (error modal)
- Modify: `frontend/src/pages/student/BlocklyPracticePage.test.jsx`
- Modify: `frontend/src/pages/student/PythonPracticePage.test.jsx`

**Interfaces:**
- Consumes: `studentApi.submit(...)` rejecting with an axios error shaped `{ response: { data: { error: { message } } } }` (the standard API error envelope per CLAUDE.md).
- Produces: new `submitError` state (string or `null`) on both pages; rendered in a modal with an "OK" dismiss button.

- [ ] **Step 1: Write a failing test for `BlocklyPracticePage`**

Add to `frontend/src/pages/student/BlocklyPracticePage.test.jsx`, inside the `describe('Save and Submit', ...)` block (after the existing `it('renders Save and Submit buttons and submits', ...)`, before its closing `});` on line 303):

```jsx
  it('shows an error modal when submit is rejected (e.g. already graded)', async () => {
    const { studentApi } = await import('../../api/studentApi');
    studentApi.getDraft.mockResolvedValue(null);
    studentApi.submit.mockRejectedValue({
      response: { data: { error: { message: 'This exercise has already been graded and cannot be resubmitted.' } } },
    });
    render(<MemoryRouter><BlocklyPracticePage exercise={blocklyExercise} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/already been graded and cannot be resubmitted/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Write a failing test for `PythonPracticePage`**

Add to `frontend/src/pages/student/PythonPracticePage.test.jsx`, inside `describe('PythonPracticePage submit/draft', ...)` (after `it('submit shows result modal when showResult true', ...)`, before its closing `});` on line 94):

```jsx
  it('shows an error message when submit is rejected (e.g. already graded)', async () => {
    studentApi.getDraft.mockResolvedValue(null);
    studentApi.submit.mockRejectedValue({
      response: { data: { error: { message: 'This exercise has already been graded and cannot be resubmitted.' } } },
    });
    render(<MemoryRouter><PythonPracticePage exercise={exercise} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/already been graded and cannot be resubmitted/i)).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run both test files to verify the new tests fail**

Run: `cd frontend && npx vitest run src/pages/student/BlocklyPracticePage.test.jsx src/pages/student/PythonPracticePage.test.jsx 2>&1 | tail -80`
Expected: both new tests FAIL/time out — `studentApi.submit` rejection is currently unhandled (no `catch`), so no error text ever renders.

- [ ] **Step 4: Add error state and handling to `BlocklyPracticePage.jsx`**

Add state next to line 43:

```jsx
  const [submitResult, setSubmitResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
```

Replace `handleSubmit` (lines 112-124):

```jsx
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitResult(null);
    setSubmitError(null);
    const jsCode = currentJsCode();
    const xml = currentWorkspaceXml();
    try { await studentApi.saveDraft(exercise.id, { answerData: jsCode, workspaceXml: xml }); } catch { /* best-effort */ }
    try {
      const res = await studentApi.submit(exercise.id, { answerData: jsCode, workspaceXml: xml });
      setSubmitResult(res);
    } catch (e) {
      setSubmitError(e.response?.data?.error?.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }
```

Add a new modal block immediately after the `{submitResult && ( ... )}` block closes (after line 323, before the final closing of the outer JSX):

```jsx
      {submitError && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, color: '#c62828' }}>Submission Failed</h2>
            <p>{submitError}</p>
            <button onClick={() => setSubmitError(null)}
              style={{ marginTop: 16, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Add the same error state and handling to `PythonPracticePage.jsx`**

Add state next to line 31:

```jsx
  const [submitResult, setSubmitResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
```

Replace `handleSubmit` (lines 101-111):

```jsx
  async function handleSubmit() {
    setSubmitting(true);
    setSubmitResult(null);
    setSubmitError(null);
    try { await studentApi.saveDraft(exercise.id, { answerData: code }); } catch { /* best-effort */ }
    try {
      const res = await studentApi.submit(exercise.id, { answerData: code });
      setSubmitResult(res);
    } catch (e) {
      setSubmitError(e.response?.data?.error?.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }
```

Add the same error modal block immediately after the `{submitResult && ( ... )}` block closes (after line 274):

```jsx
      {submitError && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, color: '#c62828' }}>Submission Failed</h2>
            <p>{submitError}</p>
            <button onClick={() => setSubmitError(null)}
              style={{ marginTop: 16, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Run both test files to verify all tests pass**

Run: `cd frontend && npx vitest run src/pages/student/BlocklyPracticePage.test.jsx src/pages/student/PythonPracticePage.test.jsx 2>&1 | tail -80`
Expected: all tests pass, including the 2 new ones and every pre-existing test on both pages (unaffected — successful-submit and non-submit tests never trigger the new `catch` branch).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx frontend/src/pages/student/BlocklyPracticePage.test.jsx frontend/src/pages/student/PythonPracticePage.jsx frontend/src/pages/student/PythonPracticePage.test.jsx
git commit -m "feat(submission): surface submit errors (e.g. already-graded) to students instead of failing silently"
```

---

## Self-Review Notes

- Spec coverage: STUDENT-source block/overwrite (Task 2), IMPORT-source unconditional overwrite (Task 3), repository plumbing for both (Task 1), frontend error surfacing (Task 4). "My Progress"/CSV export need no changes per spec (already query non-deleted rows only) — no task added for them, correctly.
- No placeholders — every step has full code and exact run commands.
- Type consistency: `findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(Long, Long, String): Optional<Submission>` and `softDeleteActiveByStudentNameAndExerciseIdAndSource(String, Long, String): int` are defined in Task 1 and used with matching argument order/types in Tasks 2 and 3. `submitError` state name is consistent across Task 4's Blockly and Python changes.
