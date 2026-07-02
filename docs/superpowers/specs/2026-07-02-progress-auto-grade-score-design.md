# My Progress: Show Auto-Grade Score Only — Design Spec

**Date:** 2026-07-02
**Branch:** main

## Summary

The student "My Progress" page currently merges `tutorScore` (if present) over `autoScore` into a single `Score` column, and hides that score entirely (showing "Pending") until a tutor has manually marked the submission `graded = true`. This means the auto-grade result — already computed at submit/import time — is invisible to students until a tutor reviews it. This spec changes the column to show only the auto-grade score, immediately, with no dependency on tutor review, and renames the column header to make that explicit.

## Background

`ProgressSubmissionDto.of()` (`backend/src/main/java/com/platform/exercise/student/ProgressSubmissionDto.java`) computes:

```java
BigDecimal score = sub.getTutorScore() != null ? sub.getTutorScore() : sub.getAutoScore();
```

`ProgressPage.jsx`'s `ScoreChip` then branches on the `graded` boolean (set only by `SubmissionService.grade()` during tutor manual review — see `SubmissionService.java:236`):

```js
if (!graded && score == null) return '—';
if (!graded) return 'Pending';
// else render colored score chip
```

Net effect: even when `autoScore` is populated (which happens on every submit/import where auto-grading is enabled — see `StudentSubmissionService.submit()` / `FileImportService.processSingleFile()`), the student sees "Pending" until a tutor separately marks the row graded. Tutor review is a distinct, often-delayed workflow; students should see their auto-grade result immediately.

## Requirements

- The `My Progress` table shows only `autoScore`. `tutorScore` and the `graded` flag are no longer consulted for this view.
- If `autoScore` is `null` (auto-grading disabled for the exercise, or auto-grading not yet run), the score cell is blank — no "Pending", no "—" placeholder.
- The column header changes from `Score` to `Auto Grade`.
- Pass/fail coloring (green ≥60, red <60) is unchanged, just driven by `autoScore` directly.
- No change to what data is stored (`autoScore`, `tutorScore`, `graded` remain on `Submission` as-is) — this is a display-only change scoped to the student progress view. Tutor-facing grading workflows (`SubmissionDetailPage.jsx`, CSV export) are unaffected.

## Backend Changes

`ProgressSubmissionDto.java`:
- Remove the `tutorScore ?? autoScore` merge; `score` field is set directly from `sub.getAutoScore()`.
- Remove the `graded` field (no longer read by the frontend for this view).

`StudentProgressService.java`: no change — already passes the full `Submission` into `ProgressSubmissionDto.of()`.

## Frontend Changes

`ProgressPage.jsx`:
- `ScoreChip` simplifies to a single `score` prop:
  ```jsx
  function ScoreChip({ score }) {
    if (score == null) return null;
    const pass = score >= 60;
    return (
      <span style={{ background: pass ? '#e8f5e9' : '#ffebee', color: pass ? '#2e7d32' : '#c62828',
        borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
        {score.toFixed(1)}
      </span>
    );
  }
  ```
- Table header cell text changes from `Score` to `Auto Grade`.
- Call site `<ScoreChip score={sub.score} graded={sub.graded} />` drops the now-unused `graded` prop.

## Out of Scope

- Any change to tutor-facing grading screens, CSV export, or the underlying `Submission.tutorScore`/`graded` fields — those remain exactly as-is.
- Adding a separate tutor-score column to My Progress (considered and declined — student view is auto-grade-only per this spec).

## Tests

### Backend
- `ProgressSubmissionDtoTest` (or wherever DTO mapping is covered): submission with `autoScore` set and `tutorScore` set → `score` reflects `autoScore`, not `tutorScore`. Submission with `autoScore == null` → `score` is `null` regardless of `graded`/`tutorScore`.

### Frontend
- `ProgressPage.test.jsx`: header renders `Auto Grade` (not `Score`). Row with `sub.score = null` renders an empty score cell (no "Pending"/"—" text). Row with `sub.score = 75` renders a green chip `75.0`; `sub.score = 40` renders a red chip `40.0`.
