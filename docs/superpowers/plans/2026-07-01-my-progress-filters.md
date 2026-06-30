# My Progress Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Exercise (title), Type, and Source query filters to the student "My Progress" page, with a Search button that always re-fetches from the backend on click.

**Architecture:** Backend adds a new native-query repository method that joins `submissions` to `exercises` for title filtering, scoped to the logged-in user; service and controller pass three new optional params through. Frontend adds a pending/committed filter-state pair (matching the existing `ExerciseListPage.jsx` pattern) with an explicit `load(page, filters)` function invoked directly from the Search button's `onClick`, guaranteeing a fresh API call on every click.

**Tech Stack:** Spring Boot 3.5 / Spring Data JPA (native `@Query`) · MySQL 8 (prod) / H2 (test, `@DataJpaTest`) · React 18 · Vitest + React Testing Library · Axios.

## Global Constraints

- Submissions filtering must stay scoped to `user_id = :userId AND is_deleted = false` — no cross-user leakage (per CLAUDE.md: "No hidden test cases in student API responses" / soft-delete rules).
- Empty/blank filter values mean "no filter" (`NULL` in the query), consistent with the existing `(:param IS NULL OR ...)` convention used elsewhere in `SubmissionRepository` / `ExerciseRepository`.
- Frontend filters use the pending/committed pattern already established in `frontend/src/pages/student/ExerciseListPage.jsx` — changing a dropdown/input alone must NOT trigger a fetch; only clicking Search does, and it must do so every time, even with unchanged values.
- All new tests follow TDD: write the failing test first, watch it fail, then implement.

---

### Task 1: Backend repository — filtered query for student progress

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java:126-127` (insert new method before closing brace)
- Test: `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java` (append new tests)

**Interfaces:**
- Produces: `SubmissionRepository.findByUserIdFiltered(Long userId, String exerciseTitle, String exerciseType, String source, Pageable pageable) -> Page<Submission>` — consumed by Task 2.

- [ ] **Step 1: Write the failing repository tests**

Append to `backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java`, just before the final closing `}` (after `countGradedGroupByBatchId_returnsBulkStats`):

```java
    @Test
    void findByUserIdFiltered_byExerciseTitle_returnsOnlyMatchingTitle() {
        Exercise other = new Exercise();
        other.setTitle("FizzBuzz Challenge");
        other.setDescription("desc");
        other.setType(Exercise.ExerciseType.PYTHON);
        other.setDifficulty(Exercise.Difficulty.EASY);
        other.setStatus(Exercise.Status.PUBLISHED);
        other.setCreatedBy(userId7);
        Long otherExerciseId = ((Exercise) em.persistAndFlush(other)).getId();

        repository.save(sub("STUDENT", userId7, exerciseId));       // title "Test Exercise"
        repository.save(sub("STUDENT", userId7, otherExerciseId));  // title "FizzBuzz Challenge"

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, "fizz", null, null, PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
        assertEquals(otherExerciseId, result.getContent().get(0).getExerciseId());
    }

    @Test
    void findByUserIdFiltered_byExerciseType_returnsOnlyMatchingType() {
        Submission pythonSub = sub("STUDENT", userId7, exerciseId);
        pythonSub.setExerciseType("PYTHON");
        repository.save(pythonSub);

        Submission blocklySub = sub("STUDENT", userId7, exerciseId);
        blocklySub.setExerciseType("BLOCKLY");
        repository.save(blocklySub);

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, null, "BLOCKLY", null, PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
        assertEquals("BLOCKLY", result.getContent().get(0).getExerciseType());
    }

    @Test
    void findByUserIdFiltered_bySource_returnsOnlyMatchingSource() {
        repository.save(sub("STUDENT", userId7, exerciseId));
        repository.save(sub("IMPORT", userId7, exerciseId));

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, null, null, "IMPORT", PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
        assertEquals("IMPORT", result.getContent().get(0).getSource());
    }

    @Test
    void findByUserIdFiltered_combinedFilters_narrowCorrectly() {
        Submission match = sub("STUDENT", userId7, exerciseId);
        match.setExerciseType("PYTHON");
        repository.save(match);

        Submission wrongType = sub("STUDENT", userId7, exerciseId);
        wrongType.setExerciseType("BLOCKLY");
        repository.save(wrongType);

        Submission wrongSource = sub("IMPORT", userId7, exerciseId);
        wrongSource.setExerciseType("PYTHON");
        repository.save(wrongSource);

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, "Test", "PYTHON", "STUDENT", PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
    }

    @Test
    void findByUserIdFiltered_noMatch_returnsEmptyPage() {
        repository.save(sub("STUDENT", userId7, exerciseId));

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, "nonexistent-title", null, null, PageRequest.of(0, 20));

        assertEquals(0, result.getTotalElements());
    }

    @Test
    void findByUserIdFiltered_scopedToUser_excludesOtherUsersEvenWithMatchingFilters() {
        repository.save(sub("STUDENT", userId8, exerciseId));

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, null, null, null, PageRequest.of(0, 20));

        assertEquals(0, result.getTotalElements());
    }

    @Test
    void findByUserIdFiltered_excludesDeletedRows() {
        Submission deleted = sub("STUDENT", userId7, exerciseId);
        deleted.setDeleted(true);
        repository.save(deleted);
        repository.save(sub("STUDENT", userId7, exerciseId));

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, null, null, null, PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=SubmissionRepositoryTest test`
Expected: FAIL — compile error, `findByUserIdFiltered` does not exist on `SubmissionRepository`.

- [ ] **Step 3: Add the repository method**

In `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`, insert before the final closing `}` (after `softDeleteAllByBatchId`, line 126):

```java

    @Query(value = """
            SELECT s.* FROM submissions s
            LEFT JOIN exercises e ON e.id = s.exercise_id
            WHERE s.user_id = :userId
              AND s.is_deleted = false
              AND (:exerciseTitle IS NULL OR e.title LIKE CONCAT('%', :exerciseTitle, '%'))
              AND (:exerciseType IS NULL OR s.exercise_type = :exerciseType)
              AND (:source IS NULL OR s.source = :source)
            ORDER BY s.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM submissions s
            LEFT JOIN exercises e ON e.id = s.exercise_id
            WHERE s.user_id = :userId
              AND s.is_deleted = false
              AND (:exerciseTitle IS NULL OR e.title LIKE CONCAT('%', :exerciseTitle, '%'))
              AND (:exerciseType IS NULL OR s.exercise_type = :exerciseType)
              AND (:source IS NULL OR s.source = :source)
            """,
            nativeQuery = true)
    Page<Submission> findByUserIdFiltered(
            @Param("userId") Long userId,
            @Param("exerciseTitle") String exerciseTitle,
            @Param("exerciseType") String exerciseType,
            @Param("source") String source,
            Pageable pageable);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=SubmissionRepositoryTest test`
Expected: PASS — all `SubmissionRepositoryTest` tests green, including the 7 new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java backend/src/test/java/com/platform/exercise/repository/SubmissionRepositoryTest.java
git commit -m "feat(submission): add findByUserIdFiltered query for progress filters"
```

---

### Task 2: Backend service — apply filters in StudentProgressService

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentProgressService.java`
- Test: `backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java`

**Interfaces:**
- Consumes: `SubmissionRepository.findByUserIdFiltered(Long, String, String, String, Pageable) -> Page<Submission>` (Task 1).
- Produces: `StudentProgressService.getProgress(Long userId, int page, int size, String exerciseTitle, String exerciseType, String source) -> StudentProgressDto` — consumed by Task 3.

- [ ] **Step 1: Write the failing service test**

Replace the body of `backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java` with (same package/imports, updated mocks and an added filter-passthrough test):

```java
package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.repository.ExerciseRepository;
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

        when(submissionRepository.findByUserIdFiltered(
                eq(42L), isNull(), isNull(), isNull(), any())).thenReturn(new PageImpl<>(List.of(sub)));
        when(exerciseRepository.findAllById(List.of(10L))).thenReturn(List.of(exercise));

        StudentProgressDto result = service.getProgress(42L, 0, 20, null, null, null);

        assertEquals(1, result.submissions().totalElements());
        ProgressSubmissionDto item = result.submissions().content().get(0);
        assertEquals(1L, item.submissionId());
        assertEquals("Loops", item.exerciseTitle());
        assertTrue(item.graded());
        assertEquals(new BigDecimal("85.00"), item.score());
    }

    @Test
    void getProgress_emptyWhenNoSubmissions() {
        when(submissionRepository.findByUserIdFiltered(
                eq(99L), isNull(), isNull(), isNull(), any())).thenReturn(new PageImpl<>(List.of()));
        when(exerciseRepository.findAllById(List.of())).thenReturn(List.of());

        StudentProgressDto result = service.getProgress(99L, 0, 20, null, null, null);

        assertEquals(0, result.submissions().totalElements());
    }

    @Test
    void getProgress_passesFiltersThroughToRepository() {
        when(submissionRepository.findByUserIdFiltered(
                eq(42L), eq("fizz"), eq("PYTHON"), eq("STUDENT"), any()))
                .thenReturn(new PageImpl<>(List.of()));
        when(exerciseRepository.findAllById(List.of())).thenReturn(List.of());

        service.getProgress(42L, 0, 20, "fizz", "PYTHON", "STUDENT");

        verify(submissionRepository).findByUserIdFiltered(
                eq(42L), eq("fizz"), eq("PYTHON"), eq("STUDENT"), any());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn -q -Dtest=StudentProgressServiceTest test`
Expected: FAIL — compile error, `getProgress(Long, int, int, String, String, String)` does not exist; `findByUserIdFiltered` not stubbed/used by current implementation.

- [ ] **Step 3: Update StudentProgressService**

Replace `backend/src/main/java/com/platform/exercise/student/StudentProgressService.java` lines 24-36 (the `getProgress` method) with:

```java
    public StudentProgressDto getProgress(Long userId, int page, int size,
                                           String exerciseTitle, String exerciseType, String source) {
        Page<Submission> subPage = submissionRepository
            .findByUserIdFiltered(userId, exerciseTitle, exerciseType, source, PageRequest.of(page, size));

        List<Long> exerciseIds = subPage.map(Submission::getExerciseId).toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        Page<ProgressSubmissionDto> dtoPage = subPage.map(sub ->
            ProgressSubmissionDto.of(sub, titleMap.getOrDefault(sub.getExerciseId(), "Unknown")));

        return new StudentProgressDto(PageResponse.of(dtoPage));
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn -q -Dtest=StudentProgressServiceTest test`
Expected: PASS — all 3 `StudentProgressServiceTest` tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentProgressService.java backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java
git commit -m "feat(submission): apply exercise/type/source filters in StudentProgressService"
```

---

### Task 3: Backend controller — expose filter query params

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentProgressController.java`
- Test: `backend/src/test/java/com/platform/exercise/student/StudentProgressControllerTest.java`

**Interfaces:**
- Consumes: `StudentProgressService.getProgress(Long, int, int, String, String, String) -> StudentProgressDto` (Task 2).
- Produces: `GET /v1/student/progress?exercise=&type=&source=` query params, consumed by Task 4's `progressApi.getProgress`.

- [ ] **Step 1: Write the failing controller tests**

Append to `backend/src/test/java/com/platform/exercise/student/StudentProgressControllerTest.java`, just before the final closing `}` (after `unauthenticated_returns401`):

```java
    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void filterByExerciseTitle_returnsOnlyMatchingSubmission() throws Exception {
        savedSubmission(exercise1, student, new BigDecimal("80.00"), null); // "Hello World"
        savedSubmission(exercise2, student, new BigDecimal("50.00"), null); // "FizzBuzz"

        mockMvc.perform(get("/v1/student/progress").param("exercise", "fizz"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(1))
            .andExpect(jsonPath("$.submissions.content[0].exerciseTitle").value("FizzBuzz"));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void filterByType_returnsOnlyMatchingType() throws Exception {
        savedSubmission(exercise1, student, new BigDecimal("80.00"), null); // BLOCKLY
        savedSubmission(exercise2, student, new BigDecimal("50.00"), null); // PYTHON

        mockMvc.perform(get("/v1/student/progress").param("type", "PYTHON"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(1))
            .andExpect(jsonPath("$.submissions.content[0].exerciseType").value("PYTHON"));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void filterBySource_returnsOnlyMatchingSource() throws Exception {
        Submission imported = savedSubmission(exercise1, student, new BigDecimal("80.00"), null);
        imported.setSource("IMPORT");
        submissionRepository.save(imported);
        savedSubmission(exercise2, student, new BigDecimal("50.00"), null); // default STUDENT

        mockMvc.perform(get("/v1/student/progress").param("source", "IMPORT"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(1));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void combinedFilters_narrowCorrectly() throws Exception {
        savedSubmission(exercise1, student, new BigDecimal("80.00"), null); // "Hello World", BLOCKLY
        savedSubmission(exercise2, student, new BigDecimal("50.00"), null); // "FizzBuzz", PYTHON

        mockMvc.perform(get("/v1/student/progress")
                .param("exercise", "Hello")
                .param("type", "BLOCKLY")
                .param("source", "STUDENT"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(1))
            .andExpect(jsonPath("$.submissions.content[0].exerciseTitle").value("Hello World"));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void noMatchingFilter_returnsEmptyPage() throws Exception {
        savedSubmission(exercise1, student, new BigDecimal("80.00"), null);

        mockMvc.perform(get("/v1/student/progress").param("exercise", "nonexistent"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(0));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void blankFilterParams_treatedAsNoFilter() throws Exception {
        savedSubmission(exercise1, student, new BigDecimal("80.00"), null);

        mockMvc.perform(get("/v1/student/progress")
                .param("exercise", "")
                .param("type", "")
                .param("source", ""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(1));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void otherUserSubmissions_notIncludedEvenWithMatchingFilters() throws Exception {
        User other = new User();
        other.setUsername("other02");
        other.setDisplayName("Other Two");
        other.setPasswordHash(passwordEncoder.encode("pw"));
        other.setRole(User.Role.STUDENT);
        other.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(other);

        savedSubmission(exercise1, other, new BigDecimal("70.00"), null);

        mockMvc.perform(get("/v1/student/progress").param("type", "BLOCKLY"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(0));
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=StudentProgressControllerTest test`
Expected: FAIL — the `exercise`/`type`/`source` query params are silently ignored by the current controller, so e.g. `filterByExerciseTitle_returnsOnlyMatchingSubmission` gets `totalElements=2` instead of `1`.

- [ ] **Step 3: Update StudentProgressController**

Replace `backend/src/main/java/com/platform/exercise/student/StudentProgressController.java` lines 22-31 (the `getProgress` method) with:

```java
    @GetMapping
    public ResponseEntity<StudentProgressDto> getProgress(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String exercise,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String source) {
        User user = (authentication.getPrincipal() instanceof User u) ? u
                : userRepository.findByUsername(authentication.getName())
                        .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND));
        return ResponseEntity.ok(studentProgressService.getProgress(
                user.getId(), page, size,
                blankToNull(exercise), blankToNull(type), blankToNull(source)));
    }

    private static String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=StudentProgressControllerTest test`
Expected: PASS — all `StudentProgressControllerTest` tests green, including the 7 new ones.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS — no regressions in other test classes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentProgressController.java backend/src/test/java/com/platform/exercise/student/StudentProgressControllerTest.java
git commit -m "feat(submission): expose exercise/type/source filters on GET /v1/student/progress"
```

---

### Task 4: Frontend API — accept a params object

**Files:**
- Modify: `frontend/src/api/progressApi.js`
- Test: `frontend/src/api/progressApi.test.js` (new)

**Interfaces:**
- Produces: `progressApi.getProgress(params = {}) -> Promise<StudentProgressDto>` where `params` may include `page`, `size`, `exercise`, `type`, `source` — consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/progressApi.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axiosInstance from './axiosInstance';
import { progressApi } from './progressApi';

vi.mock('./axiosInstance');

describe('progressApi.getProgress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the params object straight through to axios', async () => {
    axiosInstance.get.mockResolvedValue({ data: { submissions: { content: [] } } });

    await progressApi.getProgress({ page: 1, size: 20, exercise: 'fizz', type: 'PYTHON', source: 'STUDENT' });

    expect(axiosInstance.get).toHaveBeenCalledWith('/v1/student/progress', {
      params: { page: 1, size: 20, exercise: 'fizz', type: 'PYTHON', source: 'STUDENT' },
    });
  });

  it('defaults to an empty params object when called with no arguments', async () => {
    axiosInstance.get.mockResolvedValue({ data: { submissions: { content: [] } } });

    await progressApi.getProgress();

    expect(axiosInstance.get).toHaveBeenCalledWith('/v1/student/progress', { params: {} });
  });

  it('resolves with response data', async () => {
    const payload = { submissions: { content: [], totalElements: 0 } };
    axiosInstance.get.mockResolvedValue({ data: payload });

    const result = await progressApi.getProgress({ page: 0, size: 20 });

    expect(result).toEqual(payload);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/api/progressApi.test.js`
Expected: FAIL — `progressApi.getProgress()` (no args) throws or the call shape doesn't match because the current signature is `getProgress(page = 0, size = 20)`.

- [ ] **Step 3: Update progressApi.js**

Replace `frontend/src/api/progressApi.js` entirely with:

```js
import axiosInstance from './axiosInstance';

export const progressApi = {
  getProgress: (params = {}) =>
    axiosInstance.get('/v1/student/progress', { params }).then(r => r.data),
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/api/progressApi.test.js`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/progressApi.js frontend/src/api/progressApi.test.js
git commit -m "feat(progress): accept a params object in progressApi.getProgress"
```

---

### Task 5: Frontend ProgressPage — filter bar wired to explicit load()

**Files:**
- Modify: `frontend/src/pages/student/ProgressPage.jsx:1-107` (the `ProgressPage` component only; `SubmissionViewer` below it is untouched)
- Test: `frontend/src/pages/student/ProgressPage.test.jsx` (new)

**Interfaces:**
- Consumes: `progressApi.getProgress(params) -> Promise<{ submissions: { content, totalElements, totalPages } }>` (Task 4).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/student/ProgressPage.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import ProgressPage from './ProgressPage';
import { progressApi } from '../../api/progressApi';

vi.mock('../../api/progressApi', () => ({
  progressApi: { getProgress: vi.fn() },
}));

const emptyPage = { submissions: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } };

beforeEach(() => {
  progressApi.getProgress = vi.fn().mockResolvedValue(emptyPage);
});

it('calls progressApi.getProgress once on mount', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));
  expect(progressApi.getProgress).toHaveBeenCalledWith({ page: 0, size: 20 });
});

it('does not call progressApi.getProgress when the Exercise input changes without clicking Search', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('textbox', { name: /exercise/i }), {
    target: { value: 'fizz' },
  });

  expect(progressApi.getProgress).toHaveBeenCalledTimes(1);
});

it('does not call progressApi.getProgress when the Type dropdown changes without clicking Search', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /type/i }), {
    target: { value: 'PYTHON' },
  });

  expect(progressApi.getProgress).toHaveBeenCalledTimes(1);
});

it('does not call progressApi.getProgress when the Source dropdown changes without clicking Search', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('combobox', { name: /source/i }), {
    target: { value: 'IMPORT' },
  });

  expect(progressApi.getProgress).toHaveBeenCalledTimes(1);
});

it('calls progressApi.getProgress with all three filters after clicking Search', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.change(screen.getByRole('textbox', { name: /exercise/i }), { target: { value: 'fizz' } });
  fireEvent.change(screen.getByRole('combobox', { name: /type/i }), { target: { value: 'PYTHON' } });
  fireEvent.change(screen.getByRole('combobox', { name: /source/i }), { target: { value: 'IMPORT' } });
  fireEvent.click(screen.getByRole('button', { name: /search/i }));

  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(2));
  expect(progressApi.getProgress).toHaveBeenLastCalledWith({
    page: 0, size: 20, exercise: 'fizz', type: 'PYTHON', source: 'IMPORT',
  });
});

it('calls progressApi.getProgress again when Search is clicked twice with unchanged filters', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  const searchButton = screen.getByRole('button', { name: /search/i });
  fireEvent.click(searchButton);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(2));

  fireEvent.click(searchButton);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(3));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/student/ProgressPage.test.jsx`
Expected: FAIL — no Exercise textbox, Type/Source comboboxes, or Search button exist yet; `getProgress` is called with `(0, 20)` (positional), not `{ page: 0, size: 20 }`.

- [ ] **Step 3: Update ProgressPage.jsx**

Replace `frontend/src/pages/student/ProgressPage.jsx` lines 24-107 (the `ProgressPage` function, from `export default function ProgressPage()` through its closing `}`) with:

```jsx
const EMPTY_FILTERS = { exercise: '', type: '', source: '' };

export default function ProgressPage() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // selected submission for detail view
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pendingFilters, setPendingFilters] = useState(EMPTY_FILTERS);

  async function load(p, f) {
    setLoading(true);
    setError(null);
    const params = { page: p, size: 20 };
    if (f.exercise) params.exercise = f.exercise;
    if (f.type) params.type = f.type;
    if (f.source) params.source = f.source;
    try {
      const result = await progressApi.getProgress(params);
      setData(result);
      setPage(p);
    } catch (err) {
      if (!isReauthCancelled(err)) setError('Failed to load progress.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(0, EMPTY_FILTERS);
  }, []);

  function handleSearch() {
    setFilters(pendingFilters);
    load(0, pendingFilters);
  }

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

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          Exercise:
          <input
            placeholder="Search by exercise title…"
            value={pendingFilters.exercise}
            onChange={e => setPendingFilters(prev => ({ ...prev, exercise: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          />
        </label>
        <label>
          Type:
          <select
            value={pendingFilters.type}
            onChange={e => setPendingFilters(prev => ({ ...prev, type: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value="">All Types</option>
            <option value="BLOCKLY">Blockly</option>
            <option value="PYTHON">Python</option>
          </select>
        </label>
        <label>
          Source:
          <select
            value={pendingFilters.source}
            onChange={e => setPendingFilters(prev => ({ ...prev, source: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value="">All Sources</option>
            <option value="STUDENT">Submitted</option>
            <option value="IMPORT">Imported</option>
          </select>
        </label>
        <button
          onClick={handleSearch}
          style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Search
        </button>
      </div>

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
                  {formatDate(sub.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={submissions.totalPages} onPageChange={p => load(p, filters)} />
    </div>
  );
}
```

This removes the old `useEffect(() => { ... }, [page])` that called `progressApi.getProgress(page, 20)`, and removes the now-unused `page`-only auto-fetch — pagination clicks now explicitly call `load(p, filters)` with the currently committed filters.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/student/ProgressPage.test.jsx`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — no regressions in other test files (in particular no other file imports `progressApi` with the old positional signature, per the codebase search done during planning).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/student/ProgressPage.jsx frontend/src/pages/student/ProgressPage.test.jsx
git commit -m "feat(progress): add exercise/type/source filters to My Progress page"
```

---

### Task 6: Manual verification

**Files:** none (manual check only)

- [ ] **Step 1: Start the dev stack**

Run: `docker compose up -d` (or `cd backend && mvn spring-boot:run` + `cd frontend && npm run dev` for faster iteration)

- [ ] **Step 2: Log in as a student with existing submissions and open My Progress**

Confirm the filter bar (Exercise text input, Type dropdown, Source dropdown, Search button) renders above the table.

- [ ] **Step 3: Verify filtering behavior**

- Type a partial exercise title, click Search → table narrows to matching rows only.
- Select Type = Python, click Search → only Python rows shown.
- Select Source = Imported, click Search → only imported rows shown.
- Combine all three, click Search → intersection of all three filters.
- Clear all filters back to "All"/empty, click Search → full list returns.
- Click Search twice in a row with no changes → confirm (via browser devtools Network tab) that a new `GET /v1/student/progress` request fires each time.

- [ ] **Step 4: Report results**

State which checks passed/failed in the conversation. Do not mark the feature complete until all checks in Step 3 pass.

---

## Summary

| Task | Layer | Deliverable |
|------|-------|-------------|
| 1 | Backend repository | `findByUserIdFiltered` native query + 7 tests |
| 2 | Backend service | `getProgress` accepts 3 filter params + passthrough test |
| 3 | Backend controller | `exercise`/`type`/`source` query params + 7 integration tests |
| 4 | Frontend API | `progressApi.getProgress(params)` + 3 tests |
| 5 | Frontend UI | Filter bar + Search button wired to `load()` + 7 tests |
| 6 | Manual | Verify in running app |
