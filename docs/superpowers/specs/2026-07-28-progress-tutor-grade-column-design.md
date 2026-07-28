# My Progress: Show Tutor Grade Next to Auto Grade — Design Spec

**Date:** 2026-07-28
**Branch:** main

## Summary

The student "My Progress" page currently shows only the auto-grade result (`Auto Grade` column, see `2026-07-02-progress-auto-grade-score-design.md`). Tutor grading is fully implemented on the backend (`Submission.tutorScore` / `tutorComment` / `graded`, set via `SubmissionService.grade()`) and visible to tutors, but never surfaced to the student. This spec adds a `Tutor Grade` column immediately after `Auto Grade`, showing the tutor's score once graded, with the tutor's written comment available behind a small popup button.

## Background

`ProgressSubmissionDto` (`backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java`) currently exposes only `score` (mapped from `sub.getAutoScore()`). It does not expose `tutorScore`, `tutorComment`, or `graded`, even though `Submission` (`backend/src/main/java/com/platform/exercise/domain/Submission.java:53-69`) already carries all three, populated by the tutor-facing `SubmissionService.grade()` (`backend/src/main/java/com/platform/exercise/submission/SubmissionService.java:209-239`).

## Requirements

- `My Progress` table gains a `Tutor Grade` column, positioned immediately after `Auto Grade`.
- If `sub.graded` is `false`: the cell shows `—` (em dash). No score, no comment button.
- If `sub.graded` is `true`: the cell shows a score chip for `tutorScore`, using the same pass/fail coloring convention as `Auto Grade` (green ≥60, red <60).
  - If `tutorComment` is present (non-null, non-empty): also render a small comment button (💬) next to the chip.
    - Clicking it opens a modal showing the full comment text and a Close button. Click does not trigger the row's existing "open submission detail" navigation (`stopPropagation`).
  - If `tutorComment` is absent: no button is rendered.
- No changes to the existing `Auto Grade` column, row navigation, `SubmissionViewer` detail view, filters, or pagination.
- No changes to `Submission`, `SubmissionService`, or any tutor-facing grading screen — this is additive/read-only on the student side.

## Backend Changes

`ProgressSubmissionDto.java`:
- Add three fields: `BigDecimal tutorScore`, `String tutorComment`, `boolean graded`.
- `of()` maps them directly: `sub.getTutorScore()`, `sub.getTutorComment()`, `sub.isGraded()`. No merge/fallback logic — ungraded submissions naturally have `tutorScore = null`, `tutorComment = null`, `graded = false` on the entity already.

`StudentProgressService.java`: no change — already passes the full `Submission` into `ProgressSubmissionDto.of()`.

## Frontend Changes

`ProgressPage.jsx`:
- Add `<th>Tutor Grade</th>` after the `Auto Grade` header cell.
- Add a new cell after the `Auto Grade` cell:
  ```jsx
  <td style={{ padding: '10px 12px' }}>
    {sub.graded ? (
      <>
        <ScoreChip score={sub.tutorScore} />
        {sub.tutorComment && (
          <button
            onClick={e => { e.stopPropagation(); setCommentModal(sub.tutorComment); }}
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
- New local state: `const [commentModal, setCommentModal] = useState(null);` holding the comment string (or `null` when closed).
- New local component `TutorCommentModal({ comment, onClose })`, following the same overlay/dialog pattern as `ChangePasswordModal.jsx` (`position: fixed; inset: 0` overlay + centered `role="dialog" aria-modal="true"` box with a Close button), rendered at the bottom of `ProgressPage` when `commentModal` is non-null.

## Out of Scope

- `SubmissionViewer` detail view — tutor grade/comment stay table-row-only for this change (per explicit decision).
- Any change to tutor-facing grading UI, CSV export, or `Submission` entity/columns — all already correct and unaffected.
- Editing/replying to the tutor comment from the student side — read-only display only.

## Tests

### Backend
- `StudentProgressServiceTest` / DTO mapping: a graded submission (`graded=true`, `tutorScore=85.0`, `tutorComment="Nice work"`) maps to `tutorScore=85.0`, `tutorComment="Nice work"`, `graded=true` in the DTO. An ungraded submission maps to `tutorScore=null`, `tutorComment=null`, `graded=false`.

### Frontend
- `ProgressPage.test.jsx`:
  - Header row includes `Tutor Grade` after `Auto Grade`.
  - Ungraded row (`graded: false`) renders `—` in the Tutor Grade cell, no comment button.
  - Graded row with a comment (`graded: true, tutorScore: 85, tutorComment: 'Nice work'`) renders a score chip and a comment button.
  - Graded row without a comment (`tutorComment: null`) renders a score chip but no comment button.
  - Clicking the comment button opens a modal showing the comment text, and does not navigate to the submission detail view (row's `onClick` does not fire).
  - Closing the modal removes it from the document.
