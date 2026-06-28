# Blockly "View Answer" Feature — Design

**Date:** 2026-06-28
**Scope:** Blockly exercises only (per request: "blockly 代码工作区" / "不可编辑的 blockly 工作区"). Python exercises are unaffected.

## Summary

Let a tutor mark a Blockly exercise's authored workspace as a viewable answer. The tutor's
authoring workspace is always saved as the answer; a new checkbox controls whether students may
view it. On the student practice page, an "Answer" button appears only when viewing is allowed,
opening a modal with the answer rendered in a read-only Blockly workspace.

## Data Model

`exercise_versions.config` is already a JSON column — **no DB migration required**. Two new fields
are added to the Blockly config object:

- `answerWorkspaceXml: string` — copy of the tutor's authoring workspace XML. Saved on **every**
  save, regardless of the checkbox.
- `canViewAnswer: boolean` — defaults to `false`.

## Tutor Edit Page — `frontend/src/pages/tutor/ExerciseFormPage.jsx`

- Add a checkbox **"Allow students to view the answer (允许学生查看答案)"**, rendered only for
  `BLOCKLY` exercises, alongside the existing "Show instant result feedback" checkbox. Bound to
  `blocklyConfig.canViewAnswer`.
- On submit (Blockly path in `handleSubmit`): set
  `config.answerWorkspaceXml = blocklyConfig.initialWorkspaceXml` (the current authoring workspace)
  and include `config.canViewAnswer`.
- On load (`loadExercise`): the existing `setBlocklyConfig(ex.currentVersion.config ...)` already
  restores `canViewAnswer`; ensure `EMPTY_BLOCKLY_CONFIG` includes `canViewAnswer: false` so new
  exercises have a defined default.

## Backend — `StudentExerciseService.stripConfig`

In `backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java`:

- For `BLOCKLY` type: keep `canViewAnswer` in the stripped config (the frontend needs it to decide
  button visibility), but **remove `answerWorkspaceXml` whenever `canViewAnswer` is not `true`**.
- This reuses the same protection pattern already applied to `gradingRules` and hidden Python test
  cases, ensuring the answer never reaches a student's browser unless viewing is explicitly allowed.

## Student Practice Page — `frontend/src/pages/student/BlocklyPracticePage.jsx`

- When `config.canViewAnswer === true`, render an **"Answer (答案)"** button in the action row.
- Clicking it opens a modal that reuses the existing
  `frontend/src/components/BlocklySubmissionViewer.jsx` component (already a read-only
  `Blockly.inject({ readOnly: true })` workspace loaded from an XML string), passing
  `config.answerWorkspaceXml` as `workspaceXml`. The modal has a close button.
- The button does not appear when `canViewAnswer` is absent/false (and in that case the XML is not
  even present in the response).

## Reuse Decision

No new read-only Blockly component is needed. `BlocklySubmissionViewer` already renders a read-only
workspace from an XML string and is reused for the answer modal.

## Testing (TDD, red-green)

**Backend** (`StudentExerciseServiceTest` or equivalent):
- `answerWorkspaceXml` is removed from the student config when `canViewAnswer` is `false` or absent.
- `answerWorkspaceXml` and `canViewAnswer: true` are both present when viewing is allowed.

**Frontend:**
- `ExerciseFormPage.test.jsx`: the "Allow students to view the answer" checkbox renders for Blockly;
  saving sends a payload whose `config` includes `canViewAnswer` and `answerWorkspaceXml`.
- `BlocklyPracticePage.test.jsx`: the "Answer" button appears only when `config.canViewAnswer` is
  true; clicking it opens the read-only viewer modal.

## Notes / Non-Goals

- The student practice page already starts from an empty workspace (it never loads
  `initialWorkspaceXml`), so reusing that XML as the answer does not conflict with any student
  starter state.
- Python exercises are out of scope.
- No change to grading, export/import, or version immutability semantics — answers ride inside the
  existing immutable versioned config.
