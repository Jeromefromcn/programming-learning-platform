---
name: blockly-submission-viewer
description: Read-only but executable Blockly workspace on the tutor submission detail page
metadata:
  type: project
---

# Blockly Submission Viewer — Design Spec

**Date:** 2026-06-25
**Goal:** Add a visual, read-only Blockly workspace to `SubmissionDetailPage` so tutors can see the student's submitted blocks and run them, instead of only seeing generated JavaScript in Monaco.

---

## Problem

Blockly answers are currently exported as generated JavaScript (commit `afd0eff`) so that `BlocklyGrader` (Rhino) can execute them. The `answer_data` column therefore stores JS, not workspace XML. A Blockly workspace can only be visually reconstructed from XML, so the tutor currently sees raw JS in Monaco — not the visual blocks the student built.

---

## Approach: Store XML alongside JS (Approach A)

Add `workspaceXml` to the student export payload. Store it in a new nullable `workspace_xml` DB column. Grading continues to use `answer_data` (JS) unchanged. Old submissions fall back gracefully.

---

## Data Layer

### Student export (`BlocklyPracticePage.jsx`)

Add `workspaceXml` to the exported JSON alongside the existing `answer` (JS):

```json
{
  "platformVersion": "1.0",
  "exerciseId": "...",
  "exerciseType": "BLOCKLY",
  "answer": "// generated JS for grading",
  "workspaceXml": "<xml xmlns=\"...\">...</xml>",
  "exportedAt": "..."
}
```

`answer` and all grading logic are untouched.

### DB migration — `V5__add_workspace_xml.sql`

```sql
ALTER TABLE submissions
  ADD COLUMN workspace_xml MEDIUMTEXT NULL
  COMMENT 'Blockly workspace XML for visual replay; null for pre-V5 submissions';
```

### Backend — 3 small changes

| File | Change |
|------|--------|
| `Submission.java` | Add `@Column(name = "workspace_xml") private String workspaceXml;` |
| `FileImportService.java` | `sub.setWorkspaceXml(node.path("workspaceXml").asText(null))` |
| `SubmissionDetailDto.java` | Add `String workspaceXml` to the record |

Old submissions import with `workspaceXml` absent in JSON → `.asText(null)` → stored as NULL → backward-compatible.

---

## Frontend

### New component: `BlocklySubmissionViewer.jsx`

Extracted into its own file to keep `SubmissionDetailPage` from growing too large.

**Props:**
```jsx
<BlocklySubmissionViewer workspaceXml={submission.workspaceXml} />
```

**Behaviour by state:**

| `workspaceXml` | Renders |
|----------------|---------|
| `null` / absent | Grey info line: "Visual replay not available for this submission" |
| non-null string | Read-only Blockly workspace + Run button + output panel |

**Workspace injection:**
```js
Blockly.inject(containerRef.current, {
  readOnly: true,   // hides toolbox and trashcan, disables drag/add/delete
  scrollbars: true,
});
Blockly.Xml.domToWorkspace(
  Blockly.utils.xml.textToDom(workspaceXml),
  workspace
);
```

**Run button:**
- Calls `javascriptGenerator.workspaceToCode(workspace)` → `createBlocklyBlobWorker(jsCode, inputs, sharedBuffer)`
- 3-second TLE timeout (same as practice page)
- Output shown below workspace in dark pre block

**Input handling:**
- Detect via `workspaceXml.includes('type="text_prompt_ext"')` 
- If true: show pre-defined inputs textarea + interactive input modal (SharedArrayBuffer, same as practice page)
- If false: no input UI shown

### `SubmissionDetailPage.jsx` change

- `exerciseType === 'BLOCKLY'`: replace Monaco editor `<div ref={editorRef}>` with `<BlocklySubmissionViewer workspaceXml={submission.workspaceXml} />`
- `exerciseType === 'PYTHON'`: Monaco editor unchanged
- Remove `editorRef`, `monacoRef`, and the Monaco `useEffect` when they are no longer needed for BLOCKLY (keep only for PYTHON)

---

## Testing

### `BlocklySubmissionViewer.test.jsx` (new)

Mock `blockly` and `../../utils/blocklyWorker` (same pattern as `BlocklyPracticePage.test.jsx`).

Tests:
1. `workspaceXml` null → renders fallback message, no Run button
2. `workspaceXml` provided → `Blockly.inject` called, Run button present
3. Click Run → worker started, button shows "Running…"
4. Worker returns output → output displayed
5. Worker timeout → TLE warning shown
6. XML contains `type="text_prompt_ext"` → input textarea rendered
7. XML does not contain `text_prompt_ext` → no input textarea

### `SubmissionDetailPage` existing tests

Update any existing mocks/fixtures that include submission data to include `workspaceXml: null` (or a sample XML string for BLOCKLY tests).

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/pages/student/BlocklyPracticePage.jsx` | Add `workspaceXml` to export payload |
| `frontend/src/components/BlocklySubmissionViewer.jsx` | **Create** |
| `frontend/src/components/BlocklySubmissionViewer.test.jsx` | **Create** |
| `frontend/src/pages/tutor/SubmissionDetailPage.jsx` | Swap BLOCKLY section to use `BlocklySubmissionViewer` |
| `backend/src/main/resources/db/migration/V5__add_workspace_xml.sql` | **Create** |
| `backend/src/main/java/com/platform/exercise/domain/Submission.java` | Add `workspaceXml` field |
| `backend/src/main/java/com/platform/exercise/submission/FileImportService.java` | Read and store `workspaceXml` |
| `backend/src/main/java/com/platform/exercise/submission/SubmissionDetailDto.java` | Add `workspaceXml` to record |

---

## Constraints

- No new npm dependencies
- Inline styles only (project convention)
- Run button uses same Web Worker pattern as `BlocklyPracticePage` and `BlocklyAuthoringWorkspace`
- Old submissions (null `workspace_xml`) must degrade gracefully — no crash, clear message
- Grading path (`answer_data` → `BlocklyGrader`) is untouched
