# Progress Tutor Grade Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the tutor's grade next to the auto grade on the student "My Progress" page, with the tutor's comment available behind a popup button.

**Architecture:** Backend DTO change exposes three existing `Submission` fields (`tutorScore`, `tutorComment`, `graded`) that were already being computed by tutor grading but never surfaced to students. Frontend adds one table column and one small modal component, both scoped to `ProgressPage.jsx`.

**Tech Stack:** Java 25 / Spring Boot (JUnit 5 + Mockito for backend tests) · React 18 (Vitest + Testing Library for frontend tests)

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-28-progress-tutor-grade-column-design.md`
- Tutor Grade column position: immediately after Auto Grade, before Date.
- Ungraded submission (`graded === false`): Tutor Grade cell shows `—`, no comment button.
- Graded submission with no comment: score chip only, no comment button.
- Graded submission with a comment: score chip + comment button (💬) that opens a modal; clicking it must not trigger the row's navigate-to-detail-view behavior.
- No changes to `SubmissionViewer`, tutor-facing grading UI, CSV export, or `Submission`/`SubmissionService`.

---

### Task 1: Backend — expose tutor grade fields in `ProgressSubmissionDto`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java`
- Test: `backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java`

**Interfaces:**
- Produces: `ProgressSubmissionDto` record gains accessors `tutorScore(): BigDecimal`, `tutorComment(): String`, `graded(): boolean`, consumed by Task 2's frontend fixtures (JSON field names `tutorScore`, `tutorComment`, `graded`).

- [ ] **Step 1: Write the failing tests**

Add these two test methods to `StudentProgressServiceTest.java`, right after the existing `getProgress_passesFiltersThroughToRepository` method (before the class's closing `}`):

```java
    @Test
    void getProgress_includesTutorScoreCommentAndGradedWhenGraded() {
        Submission sub = new Submission();
        sub.setId(3L);
        sub.setExerciseId(10L);
        sub.setExerciseType("PYTHON");
        sub.setSource("STUDENT");
        sub.setGraded(true);
        sub.setAutoScore(new BigDecimal("70.00"));
        sub.setTutorScore(new BigDecimal("85.00"));
        sub.setTutorComment("Nice work, watch your indentation.");
        sub.setCreatedAt(LocalDateTime.now());

        Exercise exercise = new Exercise();
        exercise.setId(10L);
        exercise.setTitle("Loops");

        when(submissionRepository.findByUserIdFiltered(
                eq(42L), isNull(), isNull(), isNull(), any())).thenReturn(new PageImpl<>(List.of(sub)));
        when(exerciseRepository.findAllById(List.of(10L))).thenReturn(List.of(exercise));

        StudentProgressDto result = service.getProgress(42L, 0, 20, null, null, null);

        ProgressSubmissionDto item = result.submissions().content().get(0);
        assertEquals(new BigDecimal("85.00"), item.tutorScore());
        assertEquals("Nice work, watch your indentation.", item.tutorComment());
        assertTrue(item.graded());
    }

    @Test
    void getProgress_tutorFieldsNullAndGradedFalseWhenNotGraded() {
        Submission sub = new Submission();
        sub.setId(4L);
        sub.setExerciseId(10L);
        sub.setExerciseType("PYTHON");
        sub.setSource("STUDENT");
        sub.setAutoScore(new BigDecimal("70.00"));
        sub.setCreatedAt(LocalDateTime.now());

        Exercise exercise = new Exercise();
        exercise.setId(10L);
        exercise.setTitle("Loops");

        when(submissionRepository.findByUserIdFiltered(
                eq(42L), isNull(), isNull(), isNull(), any())).thenReturn(new PageImpl<>(List.of(sub)));
        when(exerciseRepository.findAllById(List.of(10L))).thenReturn(List.of(exercise));

        StudentProgressDto result = service.getProgress(42L, 0, 20, null, null, null);

        ProgressSubmissionDto item = result.submissions().content().get(0);
        assertNull(item.tutorScore());
        assertNull(item.tutorComment());
        assertFalse(item.graded());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=StudentProgressServiceTest`
Expected: compile error — `ProgressSubmissionDto` has no `tutorScore()`/`tutorComment()`/`graded()` methods.

- [ ] **Step 3: Implement — add the fields to the DTO**

Replace the full contents of `ProgressSubmissionDto.java` with:

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
    BigDecimal score,     // autoScore
    BigDecimal tutorScore,
    String tutorComment,
    boolean graded,
    String answerData,
    String workspaceXml,
    LocalDateTime createdAt
) {
    public static ProgressSubmissionDto of(Submission sub, String exerciseTitle) {
        return new ProgressSubmissionDto(
            sub.getId(), sub.getExerciseId(), exerciseTitle,
            sub.getExerciseType(), sub.getSource(),
            sub.getAutoScore(),
            sub.getTutorScore(), sub.getTutorComment(), sub.isGraded(),
            sub.getAnswerData(), sub.getWorkspaceXml(),
            sub.getCreatedAt());
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=StudentProgressServiceTest`
Expected: PASS (all 6 tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java backend/src/test/java/com/platform/exercise/student/StudentProgressServiceTest.java
git commit -m "feat(progress): expose tutor score, comment, and graded status in student progress DTO"
```

---

### Task 2: Frontend — Tutor Grade column and comment modal on `ProgressPage`

**Files:**
- Modify: `frontend/src/pages/student/ProgressPage.jsx`
- Test: `frontend/src/pages/student/ProgressPage.test.jsx`

**Interfaces:**
- Consumes: `ProgressSubmissionDto` JSON shape from Task 1 — each submission row now includes `tutorScore` (number|null), `tutorComment` (string|null), `graded` (boolean).
- Produces: no new exports; purely internal page behavior.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/pages/student/ProgressPage.test.jsx`, change the import line to add `within`:

```js
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
```

Then add this fixture and these test cases at the end of the file:

```js
const dataWithGradedSubmissions = {
  submissions: {
    content: [
      { submissionId: 1, exerciseId: 10, exerciseTitle: 'Loops', exerciseType: 'PYTHON', source: 'STUDENT', score: 70, graded: true, tutorScore: 85, tutorComment: 'Nice work, watch indentation.', createdAt: '2026-07-01T10:00:00' },
      { submissionId: 2, exerciseId: 11, exerciseTitle: 'Arrays', exerciseType: 'PYTHON', source: 'STUDENT', score: 40, graded: true, tutorScore: 35, tutorComment: null, createdAt: '2026-07-01T10:00:00' },
    ],
    totalPages: 1,
    totalElements: 2,
  },
};

it('renders "Tutor Grade" column header immediately after "Auto Grade"', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
  expect(headers.indexOf('Tutor Grade')).toBe(headers.indexOf('Auto Grade') + 1);
});

it('shows an em dash in Tutor Grade for an ungraded submission', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  const rows = screen.getAllByRole('row').slice(1);
  const loopsRow = rows.find(r => r.textContent.includes('Loops'));
  const tutorCell = loopsRow.querySelectorAll('td')[4];
  expect(tutorCell.textContent).toBe('—');
});

it('shows a tutor score chip and comment button when graded with a comment', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithGradedSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  expect(screen.getByText('85.0')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /view tutor comment/i })).toBeInTheDocument();
});

it('hides the comment button when graded with no comment', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithGradedSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  const rows = screen.getAllByRole('row').slice(1);
  const arraysRow = rows.find(r => r.textContent.includes('Arrays'));
  expect(within(arraysRow).queryByRole('button', { name: /view tutor comment/i })).not.toBeInTheDocument();
});

it('clicking the comment button opens a modal with the comment text, without navigating to the detail view', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithGradedSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole('button', { name: /view tutor comment/i }));

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Nice work, watch indentation.')).toBeInTheDocument();
  expect(screen.queryByText('← Back to My Progress')).not.toBeInTheDocument();
});

it('closing the tutor comment modal removes it', async () => {
  progressApi.getProgress = vi.fn().mockResolvedValue(dataWithGradedSubmissions);
  render(<ProgressPage />);
  await waitFor(() => expect(progressApi.getProgress).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole('button', { name: /view tutor comment/i }));
  fireEvent.click(screen.getByRole('button', { name: /close/i }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- ProgressPage.test.jsx`
Expected: FAIL — no "Tutor Grade" column header exists yet, no comment button/dialog exists yet.

- [ ] **Step 3: Implement — add the column and modal**

In `ProgressPage.jsx`, add a `commentModal` state next to the other `useState` calls (after the `pendingFilters` line):

```jsx
  const [commentModal, setCommentModal] = useState(null);
```

Add the `Tutor Grade` header cell right after the `Auto Grade` header cell:

```jsx
              <th style={{ padding: '8px 12px' }}>Auto Grade</th>
              <th style={{ padding: '8px 12px' }}>Tutor Grade</th>
              <th style={{ padding: '8px 12px' }}>Date</th>
```

Add the Tutor Grade data cell right after the Auto Grade `<td>` (which renders `<ScoreChip score={sub.score} />`):

```jsx
                <td style={{ padding: '10px 12px' }}>
                  <ScoreChip score={sub.score} />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {sub.graded ? (
                    <>
                      <ScoreChip score={sub.tutorScore} />
                      {sub.tutorComment && (
                        <button
                          onClick={e => { e.stopPropagation(); setCommentModal(sub.tutorComment); }}
                          aria-label="View tutor comment"
                          title="View tutor comment"
                          style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                        >
                          💬
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ color: '#aaa' }}>—</span>
                  )}
                </td>
```

Render the modal at the end of the main return, right before the closing `</div>` that wraps the table/pagination (after the `<Pagination .../>` line):

```jsx
      <Pagination page={page} totalPages={submissions.totalPages} onPageChange={p => load(p, filters)} />
      {commentModal && (
        <TutorCommentModal comment={commentModal} onClose={() => setCommentModal(null)} />
      )}
    </div>
  );
}
```

Add the `TutorCommentModal` component after `ScoreChip` (near the top of the file, before `export default function ProgressPage()`):

```jsx
function TutorCommentModal({ comment, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div role="dialog" aria-modal="true" aria-label="Tutor comment" style={{ background: '#fff', borderRadius: 8, padding: 24, width: 400, maxWidth: '90%' }}>
        <h3 style={{ marginBottom: 12 }}>Tutor Comment</h3>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{comment}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test -- ProgressPage.test.jsx`
Expected: PASS (all tests, including the 5 new ones and the pre-existing ones — the pre-existing "blank when null" test checks `td` index 3, which is still the Auto Grade cell since Tutor Grade was inserted after it).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/ProgressPage.jsx frontend/src/pages/student/ProgressPage.test.jsx
git commit -m "feat(progress): show tutor grade and comment popup on My Progress"
```

---

## Self-Review Notes

- **Spec coverage:** Tutor Grade column position (Task 2 Step 3), em-dash for ungraded (Task 2 tests), score chip + conditional comment button (Task 2 tests), modal with stopPropagation to avoid navigating to detail view (Task 2 tests + implementation), backend DTO fields (Task 1) — all covered. `SubmissionViewer`/tutor UI/CSV export explicitly untouched, per Out of Scope.
- **Type consistency:** `tutorScore: BigDecimal` (Task 1) serializes to a plain JSON number, matching the `tutorScore: 85` shape used in Task 2's frontend fixture — consistent with how `score`/`autoScore` already round-trip in the existing tests. `graded: boolean` / `tutorComment: String|null` similarly match the JS fixture shapes.
- **No placeholders:** every step has literal code, no "add tests for the above" or "similar to Task N" shortcuts.
