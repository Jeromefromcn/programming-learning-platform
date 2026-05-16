# Blockly Authoring UX Improvements — Design Spec

**Date:** 2026-05-16
**Scope:** Tutor exercise creation page (Blockly type)
**Files affected:**
- `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx`
- `frontend/src/pages/student/BlocklyPracticePage.jsx`

---

## 1. Allowed Blocks — Per-category accordion + Select all

### Problem
All 23 blocks are shown in a flat, unsorted list inside a single `<details>` element. Tutors cannot quickly find or enable groups of related blocks.

### Solution
Group blocks into 7 categories. Each category is a nested `<details>` accordion inside the outer `Allowed Blocks (N selected)` collapsible. Each category header shows selected count and a "Select all / Deselect all" toggle.

### Category Mapping

| Category | Block types |
|---|---|
| Control | `controls_if`, `controls_repeat_ext`, `controls_for`, `controls_whileUntil` |
| Logic | `logic_compare`, `logic_operation`, `logic_negate`, `logic_boolean` |
| Math | `math_number`, `math_arithmetic`, `math_single` |
| Text | `text`, `text_print`, `text_join`, `text_length` |
| Lists | `lists_create_with`, `lists_length`, `lists_getIndex`, `lists_setIndex` |
| Variables | `variables_get`, `variables_set` |
| Functions | `procedures_defnoreturn`, `procedures_defreturn` |

### Data Model Change
`AVAILABLE_BLOCKS` entries gain a `category` string field. A derived `BLOCK_CATEGORIES` structure groups them for rendering.

### UI Behaviour
- Outer `<details>` summary: `Allowed Blocks (N selected)` — unchanged label
- Each inner `<details>` summary: `Category name (n/total)` + right-aligned "Select all" / "Deselect all" link button
- "Select all" adds all blocks in that category; "Deselect all" removes them
- Individual checkboxes still work as before
- All category accordions start collapsed except none (tutor opens what they need)

---

## 2. Run Button — Below the Workspace

### Problem
The authoring workspace has no way to preview what the current blocks actually do. Tutors must save and switch to student view to test.

### Solution
Add a **Run** button directly below the Blockly workspace in `BlocklyAuthoringWorkspace`. Reuses the same Web Worker execution path as the student practice page.

### Behaviour
- Button label: `▶ Run` (idle) / `Running…` (executing) — blue `#1976d2`, same style as student page
- On click: generate JS via `javascriptGenerator.workspaceToCode`, post to `blocklyRunner.worker.js`
- Timeout: 3 seconds → show TLE warning (same as student page)
- Output panel: dark `pre` block (`background: #1e1e1e`, `color: #d4d4d4`) appears below button
- Worker is terminated and timeout cleared on component unmount

### Worker
Reuses existing `frontend/src/workers/blocklyRunner.worker.js` — no new file needed.

### Layout (below workspace, above Python code panel if visible)
```
[ Blockly workspace                          ]
[ ▶ Run ]
[ output panel (appears after run)           ]
[ Python code view (if showCodeView=true)    ]
```

---

## 3. Trashcan Visibility — Orange Dashed Border + Label

### Problem
Blockly's built-in trashcan is small and visually indistinct. Users don't recognise it as a delete target.

### Solution
After Blockly injects the workspace, find the `.blocklyTrash` DOM element and apply CSS overrides plus a text label node.

### Visual Treatment
- Background: `#fff3e0` (light orange)
- Border: `2px dashed #ff9800`
- Border-radius: `6px`
- Size: `48px × 48px` (up from Blockly's default ~30px)
- Text label: `"Drop to delete"` in `10px #e65100 bold`, inserted as a sibling `<div>` below the trashcan SVG container

### Implementation Approach
Use a `useEffect` that runs after workspace injection, queries `containerRef.current.querySelector('.blocklyTrash')`, then applies inline styles and appends the label node. A `MutationObserver` is not needed — the trashcan element is stable after inject.

### Scope
Apply to both:
- `BlocklyAuthoringWorkspace` (tutor authoring)
- `BlocklyPracticePage` (student practice)

---

## Out of Scope
- Changes to the Blockly toolbox XML structure (categories in the toolbox sidebar are unchanged)
- Any backend changes
- Python exercise authoring page
