# My Progress Auto-Grade Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the student "My Progress" page show only the auto-grade score (never the tutor score), leave the score cell blank when no auto-grade exists, and rename the column header to "Auto Grade".

**Architecture:** `ProgressSubmissionDto.of()` currently merges `tutorScore ?? autoScore` into a single `score` field and exposes a `graded` flag; the frontend's `ScoreChip` uses `graded` to decide whether to show "Pending"/"—"/the score. This plan removes the merge (DTO returns `autoScore` directly, drops `graded`) and simplifies `ScoreChip` to a single `score` prop that renders nothing when `null`.

**Tech Stack:** Java 25, Spring Boot 3.5.0, JUnit 5 + Mockito (backend); React 18.3.1, Vitest + Testing Library (frontend).

## Global Constraints

- No DB/migration changes — `autoScore` already exists and is populated on submit/import.
- No change to tutor-facing grading screens, CSV export, or `Submission.tutorScore`/`graded` storage — this is a display-only change scoped to the student progress view.
- Spec: `docs/superpowers/specs/2026-07-02-progress-auto-grade-score-design.md`

---

### Task 1: Backend — `ProgressSubmissionDto` returns auto-grade score only

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java`
- Modify: `backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java:31-58`

**Interfaces:**
- Produces: `ProgressSubmissionDto` record with fields `(Long submissionId, Long exerciseId, String exerciseTitle, String exerciseType, String source, BigDecimal score, String answerData, String workspaceXml, LocalDateTime createdAt)` — note `graded` is removed and `score` is now `sub.getAutoScore()` directly.

- [ ] **Step 1: Update the existing test to assert auto-grade-only behavior, and add a new test for the null case**

Replace the first test in `backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java` (currently `getProgress_returnsSubmissionsForUser`, lines 31-58) with:

```java
    @Test
    void getProgress_returnsAutoScoreEvenWhenTutorScoreAndGradedAreSet() {
        Submission sub = new Submission();
        sub.setId(1L);
        sub.setExerciseId(10L);
        sub.setExerciseType("PYTHON");
        sub.setSource("STUDENT");
        sub.setGraded(true);
        sub.setAutoScore(new BigDecimal("70.00"));
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
        assertEquals(new BigDecimal("70.00"), item.score());
    }

    @Test
    void getProgress_scoreIsNullWhenAutoScoreNotSet() {
        Submission sub = new Submission();
        sub.setId(2L);
        sub.setExerciseId(10L);
        sub.setExerciseType("PYTHON");
        sub.setSource("STUDENT");
        sub.setGraded(true);
        sub.setTutorScore(new BigDecimal("90.00"));
        sub.setCreatedAt(LocalDateTime.now());

        Exercise exercise = new Exercise();
        exercise.setId(10L);
        exercise.setTitle("Loops");

        when(submissionRepository.findByUserIdFiltered(
                eq(42L), isNull(), isNull(), isNull(), any())).thenReturn(new PageImpl<>(List.of(sub)));
        when(exerciseRepository.findAllById(List.of(10L))).thenReturn(List.of(exercise));

        StudentProgressDto result = service.getProgress(42L, 0, 20, null, null, null);

        ProgressSubmissionDto item = result.submissions().content().get(0);
        assertNull(item.score());
    }
```

- [ ] **Step 2: Run the tests to verify they fail (compile error — `graded` still referenced elsewhere is fine, but `score` assertions will fail against current merge logic)**

Run: `cd backend && mvn test -Dtest=StudentProgressServiceTest -pl . 2>&1 | tail -60`
Expected: `getProgress_returnsAutoScoreEvenWhenTutorScoreAndGradedAreSet` FAILS — expected `70.00` but got `85.00` (tutorScore still wins). `getProgress_scoreIsNullWhenAutoScoreNotSet` FAILS — expected `null` but got `90.00`.

- [ ] **Step 3: Update `ProgressSubmissionDto` — drop the tutor-score merge and the `graded` field**

Replace `backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java` with:

```java
package com.platform.exercise.student;

import com.platform.exercise.domain.Submission;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ProgressSubmissionDto(
    Long submissionId,
    Long exerciseId,
    String exerciseTitle,
    String exerciseType,
    String source,        // STUDENT | IMPORT
    BigDecimal score,     // autoScore only — tutor review status is not shown here
    String answerData,
    String workspaceXml,
    LocalDateTime createdAt
) {
    public static ProgressSubmissionDto of(Submission sub, String exerciseTitle) {
        return new ProgressSubmissionDto(
            sub.getId(), sub.getExerciseId(), exerciseTitle,
            sub.getExerciseType(), sub.getSource(),
            sub.getAutoScore(),
            sub.getAnswerData(), sub.getWorkspaceXml(),
            sub.getCreatedAt());
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=StudentProgressServiceTest -pl . 2>&1 | tail -40`
Expected: `BUILD SUCCESS`, all tests in `StudentProgressServiceTest` pass (including the two rewritten above and the two existing filter/empty tests, which don't reference `graded()`/`score()` and are unaffected).

- [ ] **Step 5: Compile the whole backend to catch any other reference to the removed `graded` field**

Run: `cd backend && mvn compile test-compile 2>&1 | tail -40`
Expected: `BUILD SUCCESS` (no other file references `ProgressSubmissionDto.graded()` — confirmed via `grep -rn "item.graded\|ProgressSubmissionDto" backend/src` before writing this plan).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java
git commit -m "feat(progress): show auto-grade score only in My Progress DTO"
```

---

### Task 2: Frontend — simplify `ScoreChip` and rename the column header

**Files:**
- Modify: `frontend/src/pages/student/ProgressPage.jsx:10-24` (ScoreChip), `:130` (header), `:157` (call site)
- Modify: `frontend/src/pages/student/ProgressPage.test.jsx` (add new tests)

**Interfaces:**
- Consumes: `sub.score` (BigDecimal-as-number or `null`) from the `ProgressSubmissionDto` produced by Task 1.
- Produces: `ScoreChip({ score })` — no longer takes a `graded` prop.

- [ ] **Step 1: Write failing tests for the new column header and score rendering**

Add to `frontend/src/pages/student/ProgressPage.test.jsx` (after the existing `emptyData`/`beforeEach` block, before the first `it(...)`):

```jsx
const dataWithSubmissions = {
  submissions: {
    content: [
      { submissionId: 1, exerciseId: 10, exerciseTitle: 'Loops', exerciseType: 'PYTHON', source: 'STUDENT', score: 75, createdAt: '2026-07-01T10:00:00' },
      { submissionId: 2, exerciseId: 11, exerciseTitle: 'Arrays', exerciseType: 'PYTHON', source: 'STUDENT', score: 40, createdAt: '2026-07-01T10:00:00' },
      { submissionId: 3, exerciseId: 12, exerciseTitle: 'Recursion', exerciseType: 'PYTHON', source: 'IMPORT', score: null, createdAt: '2026-07-01T10:00:00' },
    ],
    totalPages: 1,
    totalElements: 3,
  },
};

it('renders "Auto Grade" as the score column header', async () => {
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('columnheader', { name: 'Auto Grade' })).toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Score' })).not.toBeInTheDocument();
});

it('renders a green chip for a passing auto-grade score, red for failing, and blank when null', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  expect(screen.getByText('75.0')).toBeInTheDocument();
  expect(screen.getByText('40.0')).toBeInTheDocument();

  const rows = screen.getAllByRole('row').slice(1); // skip header row
  const recursionRow = rows.find(r => r.textContent.includes('Recursion'));
  const scoreCell = recursionRow.querySelectorAll('td')[3];
  expect(scoreCell.textContent).toBe('');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/student/ProgressPage.test.jsx 2>&1 | tail -60`
Expected: FAIL — header text is still `Score`, and `75.0`/`40.0` are not rendered because `graded` is `undefined` in the fixtures (so `ScoreChip` currently renders "Pending").

- [ ] **Step 3: Simplify `ScoreChip` and update the header/call site**

In `frontend/src/pages/student/ProgressPage.jsx`, replace lines 10-24 with:

```jsx
function ScoreChip({ score }) {
  if (score == null) return null;
  const val = score.toFixed(1);
  const pass = score >= 60;
  return (
    <span style={{
      background: pass ? '#e8f5e9' : '#ffebee',
      color: pass ? '#2e7d32' : '#c62828',
      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
    }}>
      {val}
    </span>
  );
}
```

Replace line 130 (`<th style={{ padding: '8px 12px' }}>Score</th>`) with:

```jsx
              <th style={{ padding: '8px 12px' }}>Auto Grade</th>
```

Replace line 157 (`<ScoreChip score={sub.score} graded={sub.graded} />`) with:

```jsx
                  <ScoreChip score={sub.score} />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/student/ProgressPage.test.jsx 2>&1 | tail -60`
Expected: all tests pass, including the pre-existing filter/search tests (unaffected by this change).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/ProgressPage.jsx frontend/src/pages/student/ProgressPage.test.jsx
git commit -m "feat(progress): rename Score column to Auto Grade and drop tutor-score/graded logic"
```

---

## Self-Review Notes

- Spec coverage: DTO change (score = autoScore only, `graded` removed) → Task 1. Blank cell when no auto-score, header rename, chip coloring unchanged → Task 2. No DB/migration or tutor-facing changes, per spec's "Out of Scope" — none made.
- No placeholders — all steps contain full code/commands.
- Type consistency: `ScoreChip({ score })` signature matches the call site `<ScoreChip score={sub.score} />` in both the plan's Task 2 Step 3 and Step 1 test fixtures (`score: 75`, `score: null`).
