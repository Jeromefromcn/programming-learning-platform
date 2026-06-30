# Design: Dimension Description + Export Tweaks

**Date:** 2026-06-28

## Summary

Four focused changes:

1. Add an optional description field to each scoring dimension in the exercise editor.
2. Display that description in the grading panel so tutors know what each dimension means.
3. Remove the standalone "Export CSV" button from the Submission List page.
4. Include the tutor comment as the last column in the group-submission batch CSV export.

No database migrations, no new API endpoints. Dimension `description` is stored inside the existing `config` JSON column on `exercise_versions`.

---

## Change 1 — RubricEditor: dimension description field

**File:** `frontend/src/components/RubricEditor.jsx`

Each dimension object changes from `{ name, weight }` to `{ name, weight, description }`.

Layout per dimension (two rows):
```
Row 1: [Name input ────────────] [Weight 0–1] [Remove]
Row 2: [Description input — optional, full width, placeholder "Description (optional)"]
```

The `updateDim` helper already accepts any field name, so updating it to handle `description` requires only adding the second-row `<input>` element.

Backward-compat: existing dimensions without `description` are treated as `""` — no saved exercise breaks.

---

## Change 2 — SubmissionDetailPage: show description in grading panel

**File:** `frontend/src/pages/tutor/SubmissionDetailPage.jsx`

When the grading panel renders rubric dimensions, each label currently reads:

> `{d.name} (weight: {d.weight}):`

After this change, if `d.description` is non-empty, a second line is shown:

> `{d.name} (weight: {d.weight}):`  
> `<small style grey>{d.description}</small>`

No logic change — description is display-only.

---

## Change 3 — SubmissionListPage: remove Export CSV button

**File:** `frontend/src/pages/tutor/SubmissionListPage.jsx`

Delete:
- The `<a href={csvHref} download …>Export CSV</a>` element and its wrapper `<div>`.
- The `const csvHref = csvExportUrl(…)` variable.
- The `csvExportUrl` named import from `submissionApi` (if unused elsewhere in this file).

The backend `GET /v1/submissions/export-csv` endpoint is left untouched.

---

## Change 4 — ImportBatchService: add Tutor Comment to batch export

**File:** `backend/src/main/java/com/platform/exercise/submission/ImportBatchService.java`

`buildHeaders()` adds `"Tutor Comment"` after `"Total Score"`:

```
Student Name | Display Name | Exercise Title | [dim cols] | Total Score | Tutor Comment
```

In `exportBatchCsv`, after `row.add(totalScore)` append:

```java
row.add(sub.getTutorComment() != null ? sub.getTutorComment() : "");
```

---

## Affected Files

| File | Change |
|---|---|
| `frontend/src/components/RubricEditor.jsx` | Add description input row per dimension |
| `frontend/src/pages/tutor/SubmissionDetailPage.jsx` | Render dimension description as subtitle in grading panel |
| `frontend/src/pages/tutor/SubmissionListPage.jsx` | Remove Export CSV button + related variable/import |
| `backend/.../submission/ImportBatchService.java` | Add Tutor Comment as last column in batch CSV |

## Out of Scope

- Backend validation of the `description` field (it is optional and free-text; no length constraint enforced server-side).
- Modifying the `GET /v1/submissions/export-csv` standalone export endpoint.
- Any change to how existing exercises without dimension descriptions behave.
