# Blockly Authoring UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add block category groupings with Select all, a Run button, and a visible trashcan to the Blockly exercise authoring workspace.

**Architecture:** All changes are confined to two existing React components. A new `src/utils/blocklyTrashcan.js` utility extracts the trashcan DOM manipulation so both the authoring and student pages share it. No backend changes.

**Tech Stack:** React 18, Blockly 12.5.0, Vitest + Testing Library, Web Worker (existing `blocklyRunner.worker.js`)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx` | Modify | Add category data, accordion UI, Run button |
| `frontend/src/pages/student/BlocklyPracticePage.jsx` | Modify | Apply trashcan styling |
| `frontend/src/utils/blocklyTrashcan.js` | Create | Shared `applyTrashcanStyles(container)` utility |
| `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx` | Create | Tests for all authoring changes |
| `frontend/src/utils/blocklyTrashcan.test.js` | Create | Tests for trashcan utility |

---

## Task 1: Add `category` field to `AVAILABLE_BLOCKS` and export `BLOCK_CATEGORIES`

**Files:**
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx:6-30`
- Create: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx`:

```jsx
import { vi } from 'vitest';
import { AVAILABLE_BLOCKS, BLOCK_CATEGORIES } from './BlocklyAuthoringWorkspace';

// Blockly cannot run in jsdom — mock it entirely
vi.mock('blockly', () => ({
  default: {
    inject: vi.fn(() => ({
      addChangeListener: vi.fn(),
      dispose: vi.fn(),
    })),
    Xml: {
      workspaceToDom: vi.fn(() => ({})),
      domToText: vi.fn(() => '<xml></xml>'),
      domToWorkspace: vi.fn(),
    },
    utils: { xml: { textToDom: vi.fn(() => ({})) } },
  },
}));
vi.mock('blockly/blocks', () => ({}));
vi.mock('blockly/javascript', () => ({
  javascriptGenerator: { workspaceToCode: vi.fn(() => '') },
}));
vi.mock('blockly/python', () => ({
  pythonGenerator: { workspaceToCode: vi.fn(() => '') },
}));

describe('AVAILABLE_BLOCKS data', () => {
  test('every block has a category field', () => {
    AVAILABLE_BLOCKS.forEach(b => {
      expect(b.category, `block ${b.type} missing category`).toBeTruthy();
    });
  });

  test('BLOCK_CATEGORIES exports all 7 categories', () => {
    expect(BLOCK_CATEGORIES).toEqual([
      'Control', 'Logic', 'Math', 'Text', 'Lists', 'Variables', 'Functions',
    ]);
  });

  test('every block category is in BLOCK_CATEGORIES', () => {
    AVAILABLE_BLOCKS.forEach(b => {
      expect(BLOCK_CATEGORIES).toContain(b.category);
    });
  });

  test('all 23 blocks are still present', () => {
    expect(AVAILABLE_BLOCKS).toHaveLength(23);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npm test -- --reporter=verbose BlocklyAuthoringWorkspace.test
```

Expected: FAIL — `BLOCK_CATEGORIES is not defined` or `category` field missing.

- [ ] **Step 3: Add `category` field to each block and export `BLOCK_CATEGORIES`**

Replace the `AVAILABLE_BLOCKS` array in `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx` lines 6-30:

```js
export const AVAILABLE_BLOCKS = [
  { type: 'controls_if',          label: 'If/Else',                category: 'Control' },
  { type: 'controls_repeat_ext',  label: 'Repeat',                  category: 'Control' },
  { type: 'controls_for',         label: 'For Loop',                category: 'Control' },
  { type: 'controls_whileUntil',  label: 'While Loop',              category: 'Control' },
  { type: 'logic_compare',        label: 'Compare',                 category: 'Logic' },
  { type: 'logic_operation',      label: 'And / Or',                category: 'Logic' },
  { type: 'logic_negate',         label: 'Not',                     category: 'Logic' },
  { type: 'logic_boolean',        label: 'True / False',            category: 'Logic' },
  { type: 'math_number',          label: 'Number',                  category: 'Math' },
  { type: 'math_arithmetic',      label: 'Arithmetic',              category: 'Math' },
  { type: 'math_single',          label: 'Math (sqrt, abs…)',  category: 'Math' },
  { type: 'text',                 label: 'Text (string)',           category: 'Text' },
  { type: 'text_print',           label: 'Print',                   category: 'Text' },
  { type: 'text_join',            label: 'Join text',               category: 'Text' },
  { type: 'text_length',          label: 'Text length',             category: 'Text' },
  { type: 'lists_create_with',    label: 'Create list',             category: 'Lists' },
  { type: 'lists_length',         label: 'List length',             category: 'Lists' },
  { type: 'lists_getIndex',       label: 'Get item',                category: 'Lists' },
  { type: 'lists_setIndex',       label: 'Set item',                category: 'Lists' },
  { type: 'variables_get',        label: 'Get variable',            category: 'Variables' },
  { type: 'variables_set',        label: 'Set variable',            category: 'Variables' },
  { type: 'procedures_defnoreturn', label: 'Define function',       category: 'Functions' },
  { type: 'procedures_defreturn',   label: 'Define function (return)', category: 'Functions' },
];

export const BLOCK_CATEGORIES = ['Control', 'Logic', 'Math', 'Text', 'Lists', 'Variables', 'Functions'];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --reporter=verbose BlocklyAuthoringWorkspace.test
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx \
        frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx
git commit -m "feat(blockly): add category metadata to AVAILABLE_BLOCKS"
```

---

## Task 2: Per-category accordion UI with Select all/Deselect all

**Files:**
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx` (checklist section)
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx` (add tests)

- [ ] **Step 1: Add failing tests**

Append to `BlocklyAuthoringWorkspace.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import BlocklyAuthoringWorkspace from './BlocklyAuthoringWorkspace';

function renderWorkspace(overrides = {}) {
  const props = {
    allowedBlocks: [],
    onAllowedBlocksChange: vi.fn(),
    onWorkspaceXmlChange: vi.fn(),
    onShowCodeViewChange: vi.fn(),
    ...overrides,
  };
  render(<BlocklyAuthoringWorkspace {...props} />);
  return props;
}

describe('Block category accordion', () => {
  test('renders all 7 category names', () => {
    renderWorkspace();
    // Open the outer details first
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    ['Control', 'Logic', 'Math', 'Text', 'Lists', 'Variables', 'Functions'].forEach(cat => {
      expect(screen.getByText(new RegExp(cat))).toBeInTheDocument();
    });
  });

  test('shows (0/N) count for each category when nothing selected', () => {
    renderWorkspace();
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    expect(screen.getByText(/Control \(0\/4\)/)).toBeInTheDocument();
    expect(screen.getByText(/Logic \(0\/4\)/)).toBeInTheDocument();
    expect(screen.getByText(/Math \(0\/3\)/)).toBeInTheDocument();
  });

  test('shows correct selected count when some blocks are pre-selected', () => {
    renderWorkspace({ allowedBlocks: ['controls_if', 'controls_for'] });
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    expect(screen.getByText(/Control \(2\/4\)/)).toBeInTheDocument();
  });

  test('Select all button calls onAllowedBlocksChange with all blocks in category', () => {
    const props = renderWorkspace({ allowedBlocks: [] });
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    // Open Control accordion
    fireEvent.click(screen.getByText(/Control \(0\/4\)/));
    fireEvent.click(screen.getByRole('button', { name: 'Select all', hidden: true }));
    expect(props.onAllowedBlocksChange).toHaveBeenCalledWith(
      expect.arrayContaining(['controls_if', 'controls_repeat_ext', 'controls_for', 'controls_whileUntil'])
    );
  });

  test('Deselect all button calls onAllowedBlocksChange without category blocks', () => {
    const allControl = ['controls_if', 'controls_repeat_ext', 'controls_for', 'controls_whileUntil'];
    const props = renderWorkspace({ allowedBlocks: allControl });
    fireEvent.click(screen.getByText(/Allowed Blocks/));
    fireEvent.click(screen.getByText(/Control \(4\/4\)/));
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all', hidden: true }));
    const called = props.onAllowedBlocksChange.mock.calls[0][0];
    allControl.forEach(t => expect(called).not.toContain(t));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --reporter=verbose BlocklyAuthoringWorkspace.test
```

Expected: FAIL — category headings not found.

- [ ] **Step 3: Replace the flat checklist with per-category accordions**

In `BlocklyAuthoringWorkspace.jsx`, replace the `toggleBlock` function and the entire `<details>` block (lines 109–139) with:

```jsx
function toggleBlock(type, checked) {
  const next = checked
    ? [...allowedBlocks, type]
    : allowedBlocks.filter(b => b !== type);
  onAllowedBlocksChange?.(next);
}

function toggleCategory(cat, selectAll) {
  const catTypes = AVAILABLE_BLOCKS.filter(b => b.category === cat).map(b => b.type);
  const next = selectAll
    ? [...new Set([...allowedBlocks, ...catTypes])]
    : allowedBlocks.filter(t => !catTypes.includes(t));
  onAllowedBlocksChange?.(next);
}
```

Replace the `<details>` checklist JSX with:

```jsx
<details style={{ marginBottom: 12 }}>
  <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '4px 0' }}>
    Allowed Blocks ({allowedBlocks.length} selected)
  </summary>
  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
    {BLOCK_CATEGORIES.map(cat => {
      const catBlocks = AVAILABLE_BLOCKS.filter(b => b.category === cat);
      const selectedCount = catBlocks.filter(b => allowedBlocks.includes(b.type)).length;
      const allSelected = selectedCount === catBlocks.length;
      return (
        <details key={cat}>
          <summary style={{
            cursor: 'pointer', fontWeight: 600, fontSize: 13,
            padding: '3px 8px', background: '#e8eaf6', borderRadius: 3,
            display: 'flex', alignItems: 'center', listStyle: 'none',
          }}>
            {cat} ({selectedCount}/{catBlocks.length})
            <button
              type="button"
              onClick={e => { e.stopPropagation(); toggleCategory(cat, !allSelected); }}
              style={{
                marginLeft: 'auto', fontSize: 12, color: '#1976d2',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 4px 4px' }}>
            {catBlocks.map(b => (
              <label key={b.type} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                border: '1px solid #ddd', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
                background: allowedBlocks.includes(b.type) ? '#e3f2fd' : '#fff',
              }}>
                <input
                  type="checkbox"
                  checked={allowedBlocks.includes(b.type)}
                  onChange={e => toggleBlock(b.type, e.target.checked)}
                />
                {b.label}
              </label>
            ))}
          </div>
        </details>
      );
    })}
  </div>
</details>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --reporter=verbose BlocklyAuthoringWorkspace.test
```

Expected: PASS (all tests including Task 1's).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx \
        frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx
git commit -m "feat(blockly): per-category accordion with Select all in block checklist"
```

---

## Task 3: Run button with Web Worker output panel

**Files:**
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx`
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx`

- [ ] **Step 1: Add failing tests**

Append to `BlocklyAuthoringWorkspace.test.jsx`:

```jsx
describe('Run button', () => {
  let workerInstance;

  beforeEach(() => {
    workerInstance = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
    vi.stubGlobal('Worker', vi.fn(() => workerInstance));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('renders a Run button', () => {
    renderWorkspace();
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  test('clicking Run spawns a Worker and posts the JS code', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }));
    expect(global.Worker).toHaveBeenCalled();
    expect(workerInstance.postMessage).toHaveBeenCalledWith({ code: expect.any(String) });
  });

  test('shows output after worker responds', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { output: 'hello world', error: null } });
    });
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  test('shows error output when worker reports error', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { output: null, error: 'ReferenceError: x is not defined' } });
    });
    expect(screen.getByText(/ReferenceError/)).toBeInTheDocument();
  });

  test('shows TLE warning after 3 seconds', async () => {
    vi.useFakeTimers();
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /^run$/i }));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/Time Limit Exceeded/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
```

Add `import { act } from '@testing-library/react';` at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --reporter=verbose BlocklyAuthoringWorkspace.test
```

Expected: FAIL — Run button not found.

- [ ] **Step 3: Add Run button logic to BlocklyAuthoringWorkspace**

At the top of `BlocklyAuthoringWorkspace.jsx`, add `useRef` to the existing import and add the javascript generator import:

```jsx
import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';
```

Inside the component, add new state and refs after the existing `useState`/`useRef` declarations:

```jsx
const [output, setOutput] = useState(null);
const [running, setRunning] = useState(false);
const [tle, setTle] = useState(false);
const workerRef = useRef(null);
const timeoutRef = useRef(null);
```

Add a cleanup effect for the worker (after the existing useEffect):

```jsx
useEffect(() => {
  return () => {
    if (workerRef.current) workerRef.current.terminate();
    clearTimeout(timeoutRef.current);
  };
}, []);
```

Add the `handleRun` function (before the `return` statement):

```jsx
function handleRun() {
  if (!workspaceRef.current) return;
  setRunning(true);
  setOutput(null);
  setTle(false);
  if (workerRef.current) workerRef.current.terminate();
  clearTimeout(timeoutRef.current);

  const jsCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
  const worker = new Worker(
    new URL('../../workers/blocklyRunner.worker.js', import.meta.url)
  );
  workerRef.current = worker;

  timeoutRef.current = setTimeout(() => {
    worker.terminate();
    workerRef.current = null;
    setRunning(false);
    setTle(true);
  }, 3000);

  worker.onmessage = ({ data: { output, error } }) => {
    clearTimeout(timeoutRef.current);
    workerRef.current = null;
    setRunning(false);
    setOutput(error ? `Error: ${error}` : (output ?? '(no output)'));
  };

  worker.onerror = (e) => {
    clearTimeout(timeoutRef.current);
    workerRef.current = null;
    setRunning(false);
    setOutput(`Error: ${e.message}`);
  };

  worker.postMessage({ code: jsCode });
}
```

In the JSX `return`, add the Run button and output panel between the workspace div and the Python code panel:

```jsx
{/* Blockly workspace */}
<div ref={containerRef} style={{ height: 400, border: '1px solid #ddd', borderRadius: 4 }} />

{/* Run controls */}
<div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
  <button
    type="button"
    onClick={handleRun}
    disabled={running}
    style={{
      background: '#1976d2', color: '#fff', border: 'none',
      borderRadius: 4, padding: '6px 18px', cursor: running ? 'default' : 'pointer', fontSize: 14,
    }}
  >
    {running ? 'Running…' : '▶ Run'}
  </button>
</div>

{tle && (
  <div style={{ marginTop: 8, background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4, padding: '8px 12px', fontSize: 13 }}>
    Time Limit Exceeded (3 seconds)
  </div>
)}

{output !== null && (
  <pre style={{
    marginTop: 8, background: '#1e1e1e', color: '#d4d4d4',
    fontFamily: 'monospace', fontSize: 13, padding: 12,
    borderRadius: 4, overflow: 'auto', maxHeight: 200,
  }}>
    {output}
  </pre>
)}

{/* Python code panel */}
{showCodeView && ( /* existing code unchanged */ )}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --reporter=verbose BlocklyAuthoringWorkspace.test
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx \
        frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx
git commit -m "feat(blockly): add Run button with Web Worker output to authoring workspace"
```

---

## Task 4: Trashcan visibility utility + apply to authoring workspace

**Files:**
- Create: `frontend/src/utils/blocklyTrashcan.js`
- Create: `frontend/src/utils/blocklyTrashcan.test.js`
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx`

- [ ] **Step 1: Write failing tests for the utility**

Create `frontend/src/utils/blocklyTrashcan.test.js`:

```js
import { applyTrashcanStyles } from './blocklyTrashcan';

function makeContainer(hasTrash = true) {
  const container = document.createElement('div');
  if (hasTrash) {
    const trash = document.createElement('div');
    trash.className = 'blocklyTrash';
    container.appendChild(trash);
  }
  return container;
}

test('applies orange background to .blocklyTrash', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  const trash = container.querySelector('.blocklyTrash');
  expect(trash.style.background).toBe('#fff3e0');
});

test('applies dashed orange border to .blocklyTrash', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  const trash = container.querySelector('.blocklyTrash');
  expect(trash.style.border).toBe('2px dashed #ff9800');
});

test('sets width and height to 48px on .blocklyTrash', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  const trash = container.querySelector('.blocklyTrash');
  expect(trash.style.width).toBe('48px');
  expect(trash.style.height).toBe('48px');
});

test('inserts a "Drop to delete" label after .blocklyTrash', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  const label = container.querySelector('.blockly-trash-label');
  expect(label).not.toBeNull();
  expect(label.textContent).toBe('Drop to delete');
});

test('does not insert duplicate labels on repeated calls', () => {
  const container = makeContainer();
  applyTrashcanStyles(container);
  applyTrashcanStyles(container);
  expect(container.querySelectorAll('.blockly-trash-label')).toHaveLength(1);
});

test('does nothing when .blocklyTrash is absent', () => {
  const container = makeContainer(false);
  expect(() => applyTrashcanStyles(container)).not.toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --reporter=verbose blocklyTrashcan.test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the utility**

Create `frontend/src/utils/blocklyTrashcan.js`:

```js
export function applyTrashcanStyles(container) {
  const trash = container.querySelector('.blocklyTrash');
  if (!trash) return;

  Object.assign(trash.style, {
    background: '#fff3e0',
    border: '2px dashed #ff9800',
    borderRadius: '6px',
    width: '48px',
    height: '48px',
  });

  if (!container.querySelector('.blockly-trash-label')) {
    const label = document.createElement('div');
    label.className = 'blockly-trash-label';
    Object.assign(label.style, {
      fontSize: '10px',
      color: '#e65100',
      fontWeight: '600',
      textAlign: 'center',
      marginTop: '2px',
    });
    label.textContent = 'Drop to delete';
    trash.insertAdjacentElement('afterend', label);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --reporter=verbose blocklyTrashcan.test
```

Expected: PASS (6 tests).

- [ ] **Step 5: Apply utility in `BlocklyAuthoringWorkspace`**

Add the import at the top of `BlocklyAuthoringWorkspace.jsx`:

```jsx
import { applyTrashcanStyles } from '../../utils/blocklyTrashcan';
```

In the main `useEffect` (the one that calls `Blockly.inject`), add the trashcan call after workspace setup, before the `return` cleanup:

```jsx
// After workspace.addChangeListener(...) block, before return:
setTimeout(() => {
  if (containerRef.current) applyTrashcanStyles(containerRef.current);
}, 0);

return () => {
  workspace.dispose();
  workspaceRef.current = null;
};
```

> **Note:** Blockly renders the trashcan asynchronously during inject. The `setTimeout(..., 0)` defers the query to the next event loop tick, after Blockly has finished building the DOM. If `.blocklyTrash` is not found when you test in the browser, open DevTools, inspect the injected container, and find the actual class name — then update the selector in `applyTrashcanStyles`.

- [ ] **Step 6: Run all tests**

```bash
cd frontend && npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/blocklyTrashcan.js \
        frontend/src/utils/blocklyTrashcan.test.js \
        frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx
git commit -m "feat(blockly): styled trashcan with orange dashed border and Drop-to-delete label"
```

---

## Task 5: Apply trashcan styling to `BlocklyPracticePage`

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx`

- [ ] **Step 1: Add the import**

At the top of `frontend/src/pages/student/BlocklyPracticePage.jsx`, add:

```jsx
import { applyTrashcanStyles } from '../../utils/blocklyTrashcan';
```

- [ ] **Step 2: Call `applyTrashcanStyles` after workspace inject**

In the `useEffect` in `BlocklyPracticePage.jsx`, after the `if (config.initialWorkspaceXml)` block (around line 64), add:

```jsx
setTimeout(() => {
  if (containerRef.current) applyTrashcanStyles(containerRef.current);
}, 0);
```

The full useEffect return (existing) stays unchanged:

```jsx
return () => { workspace.dispose(); workspaceRef.current = null; };
```

- [ ] **Step 3: Run all tests**

```bash
cd frontend && npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx
git commit -m "feat(blockly): apply trashcan styling to student practice page"
```

---

## Self-Review

**Spec coverage:**
- ✅ Block categories — Task 1 (data) + Task 2 (UI accordion + Select all)
- ✅ Run button below workspace — Task 3
- ✅ Trashcan visibility (orange dashed + label) — Task 4 (authoring) + Task 5 (student)

**Placeholders:** None.

**Type consistency:**
- `BLOCK_CATEGORIES` defined in Task 1, used in Task 2 ✅
- `applyTrashcanStyles(container)` defined in Task 4, reused in Task 5 ✅
- `toggleCategory(cat, selectAll)` defined and used in Task 2 ✅
- Worker path `../../workers/blocklyRunner.worker.js` — correct from `components/tutor/` ✅
