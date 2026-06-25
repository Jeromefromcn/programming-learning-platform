# Blockly: Missing Blocks & Keyboard Input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 25 missing Blockly blocks to the tutor block picker and implement keyboard input support (pre-defined queue + interactive mid-run modal via SharedArrayBuffer + Atomics) in both the tutor authoring workspace and student practice page.

**Architecture:** Missing blocks are pure data additions to `AVAILABLE_BLOCKS`. Input support refactors `blocklyWorker.js` to an init-message architecture: jsCode is still embedded in the blob script, but `SharedArrayBuffer` and pre-defined inputs are passed via a `postMessage` init call after worker creation. The UI adds a conditional textarea (above Run) and a modal (shown on `input-request` messages from the worker). TLE timer pauses during input and restarts on OK.

**Tech Stack:** React 18, Vitest, @testing-library/react, SharedArrayBuffer + Atomics (Web APIs, available in Node.js without headers for tests), Nginx 1.25

## Global Constraints

- All tests run with: `cd frontend && npm test`
- Baseline: 144 tests passing — every commit must stay green
- No new npm packages
- No backend changes; no Python practice page changes
- Follow existing inline-style pattern (no CSS files)
- `text_prompt_ext` in `allowedBlocks` is the sole signal to show input UI in both pages
- SharedArrayBuffer layout: `[0–3]` Int32 state (0 = idle, 1 = response ready) · `[4–7]` Int32 response byte length · `[8–1027]` Uint8[1020] response UTF-8 bytes · **1028 bytes total**
- TLE timeout: 3 s (unchanged), cleared on `input-request`, restarted on OK submit
- `SharedArrayBuffer` is globally available in Node.js 18+ — no browser headers needed in tests

---

## File Map

| File | Change |
|---|---|
| `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx` | Add 25 blocks to `AVAILABLE_BLOCKS`; add input textarea + modal; update `handleRun` |
| `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx` | Update block-count assertions; update Run postMessage assertion; add input tests |
| `frontend/src/pages/student/BlocklyPracticePage.jsx` | Add input textarea + modal; update `handleRun` + `onmessage` |
| `frontend/src/pages/student/BlocklyPracticePage.test.jsx` | Update Run postMessage assertion; add input textarea + modal tests |
| `frontend/src/utils/blocklyWorker.js` | New signature; init-message architecture; prompt override with queue + Atomics |
| `frontend/src/utils/blocklyWorker.test.js` | New file — unit tests for factory function |
| `nginx/nginx.conf` | Add COOP/COEP headers |

---

### Task 1: Add Missing Blocks to AVAILABLE_BLOCKS

**Files:**
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx` lines 9–33
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx`

**Interfaces:**
- Produces: `AVAILABLE_BLOCKS` with 48 entries (was 23); `BLOCK_CATEGORIES` unchanged (7 categories)
- Category sizes: Control 6 · Logic 6 · Math 13 · Text 9 · Lists 8 · Variables 2 · Functions 4

- [ ] **Step 1: Update tests first (TDD)**

In `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx`, replace the entire `AVAILABLE_BLOCKS data` describe block (lines 39–61) with:

```js
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

  test('all 48 blocks are present', () => {
    expect(AVAILABLE_BLOCKS).toHaveLength(48);
  });
});
```

Then update the three category-count assertions in the `Block category accordion` describe (lines 75–87):

```js
test('shows (0/N) count for each category when nothing selected', () => {
  renderWorkspace();
  fireEvent.click(screen.getByText(/Allowed Blocks/));
  expect(screen.getByText(/Control \(0\/6\)/)).toBeInTheDocument();
  expect(screen.getByText(/Logic \(0\/6\)/)).toBeInTheDocument();
  expect(screen.getByText(/Math \(0\/13\)/)).toBeInTheDocument();
});

test('shows correct selected count when some blocks are pre-selected', () => {
  renderWorkspace({ allowedBlocks: ['controls_if', 'controls_for'] });
  fireEvent.click(screen.getByText(/Allowed Blocks/));
  expect(screen.getByText(/Control \(2\/6\)/)).toBeInTheDocument();
});
```

Replace the Select-all test (lines 89–101) with:

```js
test('Select all button calls onAllowedBlocksChange with all blocks in category', () => {
  const props = renderWorkspace({ allowedBlocks: [] });
  fireEvent.click(screen.getByText(/Allowed Blocks/));
  const selectAllButtons = screen.getAllByRole('button', { name: 'Select all', hidden: true });
  fireEvent.click(selectAllButtons[0]);
  const called = props.onAllowedBlocksChange.mock.calls[0][0];
  expect(called).toHaveLength(6);
  expect(called).toEqual(
    expect.arrayContaining([
      'controls_if', 'controls_repeat_ext', 'controls_for', 'controls_whileUntil',
      'controls_forEach', 'controls_flow_statements',
    ])
  );
});
```

Replace the Deselect-all test (lines 103–112) with:

```js
test('Deselect all button calls onAllowedBlocksChange without category blocks', () => {
  const allControl = [
    'controls_if', 'controls_repeat_ext', 'controls_for', 'controls_whileUntil',
    'controls_forEach', 'controls_flow_statements',
  ];
  const props = renderWorkspace({ allowedBlocks: allControl });
  fireEvent.click(screen.getByText(/Allowed Blocks/));
  fireEvent.click(screen.getByText(/Control \(6\/6\)/));
  fireEvent.click(screen.getByRole('button', { name: 'Deselect all', hidden: true }));
  const called = props.onAllowedBlocksChange.mock.calls[0][0];
  allControl.forEach(t => expect(called).not.toContain(t));
});
```

- [ ] **Step 2: Run tests — confirm failures**

```bash
cd frontend && npm test -- BlocklyAuthoringWorkspace --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL"
```

Expected: `all 48 blocks are present` FAIL (got 23); category count tests FAIL.

- [ ] **Step 3: Replace AVAILABLE_BLOCKS in BlocklyAuthoringWorkspace.jsx**

Replace lines 9–33 (the entire `AVAILABLE_BLOCKS` export) with:

```js
export const AVAILABLE_BLOCKS = [
  { type: 'controls_if',              label: 'If/Else',                 category: 'Control'   },
  { type: 'controls_repeat_ext',      label: 'Repeat',                  category: 'Control'   },
  { type: 'controls_for',             label: 'For Loop',                category: 'Control'   },
  { type: 'controls_whileUntil',      label: 'While Loop',              category: 'Control'   },
  { type: 'controls_forEach',         label: 'For Each in List',        category: 'Control'   },
  { type: 'controls_flow_statements', label: 'Break / Continue',        category: 'Control'   },
  { type: 'logic_compare',            label: 'Compare',                 category: 'Logic'     },
  { type: 'logic_operation',          label: 'And / Or',                category: 'Logic'     },
  { type: 'logic_negate',             label: 'Not',                     category: 'Logic'     },
  { type: 'logic_boolean',            label: 'True / False',            category: 'Logic'     },
  { type: 'logic_null',               label: 'Null',                    category: 'Logic'     },
  { type: 'logic_ternary',            label: 'Ternary If',              category: 'Logic'     },
  { type: 'math_number',              label: 'Number',                  category: 'Math'      },
  { type: 'math_arithmetic',          label: 'Arithmetic',              category: 'Math'      },
  { type: 'math_single',              label: 'Math (sqrt, abs…)',       category: 'Math'      },
  { type: 'math_modulo',              label: 'Remainder (%)',           category: 'Math'      },
  { type: 'math_round',               label: 'Round / Floor / Ceil',    category: 'Math'      },
  { type: 'math_on_list',             label: 'Sum / Min / Max of list', category: 'Math'      },
  { type: 'math_random_int',          label: 'Random integer',          category: 'Math'      },
  { type: 'math_random_float',        label: 'Random 0–1',              category: 'Math'      },
  { type: 'math_change',              label: 'Change variable by',      category: 'Math'      },
  { type: 'math_number_property',     label: 'Is even / Is odd…',      category: 'Math'      },
  { type: 'math_trig',                label: 'Sin / Cos / Tan',         category: 'Math'      },
  { type: 'math_constant',            label: 'π / e / …',              category: 'Math'      },
  { type: 'math_constrain',           label: 'Constrain between',       category: 'Math'      },
  { type: 'text',                     label: 'Text (string)',           category: 'Text'      },
  { type: 'text_print',               label: 'Print',                   category: 'Text'      },
  { type: 'text_join',                label: 'Join text',               category: 'Text'      },
  { type: 'text_length',              label: 'Text length',             category: 'Text'      },
  { type: 'text_charAt',              label: 'Character at index',      category: 'Text'      },
  { type: 'text_indexOf',             label: 'Find in text',            category: 'Text'      },
  { type: 'text_append',              label: 'Append to variable',      category: 'Text'      },
  { type: 'text_isEmpty',             label: 'Is text empty',           category: 'Text'      },
  { type: 'text_prompt_ext',          label: 'Ask for input',           category: 'Text'      },
  { type: 'lists_create_with',        label: 'Create list',             category: 'Lists'     },
  { type: 'lists_length',             label: 'List length',             category: 'Lists'     },
  { type: 'lists_getIndex',           label: 'Get item',                category: 'Lists'     },
  { type: 'lists_setIndex',           label: 'Set item',                category: 'Lists'     },
  { type: 'lists_create_empty',       label: 'Create empty list',       category: 'Lists'     },
  { type: 'lists_isEmpty',            label: 'Is list empty',           category: 'Lists'     },
  { type: 'lists_repeat',             label: 'List with repeated item', category: 'Lists'     },
  { type: 'lists_reverse',            label: 'Reverse list',            category: 'Lists'     },
  { type: 'variables_get',            label: 'Get variable',            category: 'Variables' },
  { type: 'variables_set',            label: 'Set variable',            category: 'Variables' },
  { type: 'procedures_defnoreturn',   label: 'Define function',         category: 'Functions' },
  { type: 'procedures_defreturn',     label: 'Define function (return)',category: 'Functions' },
  { type: 'procedures_callnoreturn',  label: 'Call function',           category: 'Functions' },
  { type: 'procedures_callreturn',    label: 'Call function (return)',  category: 'Functions' },
];
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd frontend && npm test -- BlocklyAuthoringWorkspace --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL"
```

Expected: All `BlocklyAuthoringWorkspace` tests PASS.

- [ ] **Step 5: Run full suite — confirm no regressions**

```bash
cd frontend && npm test 2>&1 | tail -5
```

Expected: 144+ tests pass, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx \
        frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx
git commit -m "feat(blockly): add 25 missing blocks to AVAILABLE_BLOCKS (48 total)"
```

---

### Task 2: Nginx COOP/COEP Headers

**Files:**
- Modify: `nginx/nginx.conf`

**Interfaces:**
- No code interfaces — HTTP header change enables `SharedArrayBuffer` in the browser

- [ ] **Step 1: Add headers to nginx.conf**

In `nginx/nginx.conf`, after the existing `add_header Content-Security-Policy` line (line 15), add two lines so the header block becomes:

```nginx
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;" always;
add_header Cross-Origin-Opener-Policy  "same-origin" always;
add_header Cross-Origin-Embedder-Policy "require-corp" always;
```

- [ ] **Step 2: Commit**

```bash
git add nginx/nginx.conf
git commit -m "feat(nginx): add COOP/COEP headers to enable SharedArrayBuffer"
```

Manual verification after deploy: `curl -I http://localhost | grep -i cross-origin` should show both headers.

---

### Task 3: Refactor blocklyWorker.js — Init-Message Architecture

**Files:**
- Modify: `frontend/src/utils/blocklyWorker.js`
- Create: `frontend/src/utils/blocklyWorker.test.js`

**Interfaces:**
- Produces: `createBlocklyBlobWorker(jsCode, preDefinedInputs = [], sharedBuffer = null): Worker`
  - Immediately calls `worker.postMessage({ inputs: preDefinedInputs, sharedBuffer })` before returning
  - Worker emits `{ type: 'input-request', message: string }` when blocking for interactive input
  - Worker emits `{ type: 'done', output: string | null, error: string | null }` when execution completes

- [ ] **Step 1: Write failing tests**

Create `frontend/src/utils/blocklyWorker.test.js`:

```js
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createBlocklyBlobWorker } from './blocklyWorker';

describe('createBlocklyBlobWorker', () => {
  let workerInstance;

  beforeEach(() => {
    workerInstance = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    };
    vi.stubGlobal('Worker', vi.fn(() => workerInstance));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('creates a Worker from a blob URL', () => {
    createBlocklyBlobWorker('var x = 1;');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(global.Worker).toHaveBeenCalledWith('blob:test-url');
  });

  test('revokes the blob URL after creating the worker', () => {
    createBlocklyBlobWorker('var x = 1;');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  test('sends init postMessage with empty inputs and null sharedBuffer by default', () => {
    createBlocklyBlobWorker('var x = 1;');
    expect(workerInstance.postMessage).toHaveBeenCalledWith({
      inputs: [],
      sharedBuffer: null,
    });
  });

  test('sends provided inputs array in init postMessage', () => {
    createBlocklyBlobWorker('var x = 1;', ['hello', '42']);
    expect(workerInstance.postMessage).toHaveBeenCalledWith({
      inputs: ['hello', '42'],
      sharedBuffer: null,
    });
  });

  test('sends provided SharedArrayBuffer in init postMessage', () => {
    const buf = new SharedArrayBuffer(1028);
    createBlocklyBlobWorker('var x = 1;', [], buf);
    expect(workerInstance.postMessage).toHaveBeenCalledWith({
      inputs: [],
      sharedBuffer: buf,
    });
  });

  test('returns the Worker instance', () => {
    const result = createBlocklyBlobWorker('var x = 1;');
    expect(result).toBe(workerInstance);
  });
});
```

- [ ] **Step 2: Run tests — confirm all 6 fail**

```bash
cd frontend && npm test -- blocklyWorker --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL"
```

Expected: All 6 tests FAIL (existing API does not call `postMessage`).

- [ ] **Step 3: Rewrite blocklyWorker.js**

Replace the entire contents of `frontend/src/utils/blocklyWorker.js` with:

```js
export function createBlocklyBlobWorker(jsCode, preDefinedInputs = [], sharedBuffer = null) {
  const script = [
    'var __lines = [];',
    'var __inputQueue = [];',
    'var __int32View = null;',
    'function print() {',
    '  __lines.push(Array.prototype.join.call(arguments, \' \'));',
    '}',
    'var window = {',
    '  alert: function(x) { print(String(x)); },',
    '  prompt: function(msg) {',
    '    if (__inputQueue.length > 0) { return __inputQueue.shift(); }',
    '    if (__int32View) {',
    '      self.postMessage({ type: "input-request", message: msg || "" });',
    '      try { Atomics.wait(__int32View, 0, 0); } catch(e) { return ""; }',
    '      var len = __int32View[1];',
    '      var bytes = new Uint8Array(__int32View.buffer, 8, len);',
    '      var response = new TextDecoder().decode(bytes);',
    '      Atomics.store(__int32View, 0, 0);',
    '      return response;',
    '    }',
    '    return "";',
    '  }',
    '};',
    'self.onmessage = function(e) {',
    '  __inputQueue = e.data.inputs || [];',
    '  var sharedBuf = e.data.sharedBuffer || null;',
    '  if (sharedBuf) { __int32View = new Int32Array(sharedBuf); }',
    '  try {',
    jsCode,
    '    self.postMessage({ type: "done", output: __lines.join("\\n"), error: null });',
    '  } catch(e) {',
    '    self.postMessage({ type: "done", output: null, error: e.message });',
    '  }',
    '};',
  ].join('\n');

  const blob = new Blob([script], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  worker.postMessage({ inputs: preDefinedInputs, sharedBuffer });
  return worker;
}
```

- [ ] **Step 4: Run blocklyWorker tests — confirm all 6 pass**

```bash
cd frontend && npm test -- blocklyWorker --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL"
```

Expected: All 6 PASS.

- [ ] **Step 5: Run full suite — note expected failures**

```bash
cd frontend && npm test 2>&1 | grep -E "FAIL|failed"
```

Expected: `BlocklyAuthoringWorkspace.test.jsx` and `BlocklyPracticePage.test.jsx` each have 1 failing test (the "without postMessage" assertion — fixed in Tasks 4 and 5). All other files still pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/blocklyWorker.js frontend/src/utils/blocklyWorker.test.js
git commit -m "feat(blockly): refactor worker to init-message architecture with input queue and Atomics"
```

---

### Task 4: Input UI in BlocklyPracticePage

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx`
- Modify: `frontend/src/pages/student/BlocklyPracticePage.test.jsx`

**Interfaces:**
- Consumes: `createBlocklyBlobWorker(jsCode, inputs, sharedBuffer)` — Task 3
- `config.allowedBlocks.includes('text_prompt_ext')` → show textarea and create `SharedArrayBuffer`
- Worker message `{ type: 'input-request', message }` → clear TLE timer, show modal
- Modal OK → write to SharedArrayBuffer, `Atomics.notify`, restart TLE timer, hide modal
- Worker message `{ type: 'done', output, error }` (or `{ output, error }` without type, for backward compat) → hide modal, show output

- [ ] **Step 1: Write failing tests**

In `frontend/src/pages/student/BlocklyPracticePage.test.jsx`:

**a)** Update the existing "clicking Run spawns a Worker" test (lines 89–94). Replace it with:

```js
test('clicking Run spawns a Worker from a blob URL and sends init message', () => {
  render(<BlocklyPracticePage exercise={makeExercise()} />);
  fireEvent.click(screen.getByRole('button', { name: /run/i }));
  expect(global.Worker).toHaveBeenCalledWith('blob:mock-url');
  expect(workerInstance.postMessage).toHaveBeenCalledWith({
    inputs: [],
    sharedBuffer: null,
  });
});
```

**b)** Add two new describe blocks after the existing `Back button` describe block (after line 140):

```js
describe('Input textarea', () => {
  test('not rendered when text_prompt_ext is absent from allowedBlocks', () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    expect(screen.queryByLabelText(/Input \(one value per line\)/i)).not.toBeInTheDocument();
  });

  test('rendered when text_prompt_ext is in allowedBlocks', () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_print', 'text_prompt_ext'],
    })} />);
    expect(screen.getByLabelText(/Input \(one value per line\)/i)).toBeInTheDocument();
  });
});

describe('Interactive input modal', () => {
  let workerInstance;

  beforeEach(() => {
    workerInstance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.stubGlobal('Worker', vi.fn(() => workerInstance));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('modal not shown initially', () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_prompt_ext'],
    })} />);
    expect(screen.queryByRole('heading', { name: /enter input/i })).not.toBeInTheDocument();
  });

  test('modal appears when worker sends input-request', async () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_prompt_ext'],
    })} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'input-request', message: 'Enter your name:' } });
    });
    expect(screen.getByRole('heading', { name: /enter input/i })).toBeInTheDocument();
    expect(screen.getByText('Enter your name:')).toBeInTheDocument();
  });

  test('modal closes and output shown when worker sends done', async () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_prompt_ext'],
    })} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'input-request', message: 'Enter:' } });
    });
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'done', output: 'result', error: null } });
    });
    expect(screen.queryByRole('heading', { name: /enter input/i })).not.toBeInTheDocument();
    expect(screen.getByText('result')).toBeInTheDocument();
  });

  test('clicking OK in modal closes it', async () => {
    render(<BlocklyPracticePage exercise={makeExercise({
      allowedBlocks: ['text_prompt_ext'],
    })} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'input-request', message: 'Enter:' } });
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ok/i }));
    });
    expect(screen.queryByRole('heading', { name: /enter input/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — confirm failures**

```bash
cd frontend && npm test -- BlocklyPracticePage --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL"
```

Expected: "init message" test FAIL; all 6 new input tests FAIL.

- [ ] **Step 3: Update BlocklyPracticePage.jsx — state and refs**

After the existing state declarations (after line 35 `const [pythonCode, setPythonCode] = useState('');`), add:

```js
const [preDefinedInputs, setPreDefinedInputs] = useState('');
const [inputModalMsg, setInputModalMsg] = useState(null);
const [inputValue, setInputValue] = useState('');
const sharedBufferRef = useRef(null);
```

- [ ] **Step 4: Update BlocklyPracticePage.jsx — replace handleRun**

Replace the entire `handleRun` function (lines 71–104) with:

```js
function handleRun() {
  if (!workspaceRef.current) return;
  setRunning(true);
  setOutput(null);
  setTle(false);
  setInputModalMsg(null);

  if (workerRef.current) workerRef.current.terminate();
  clearTimeout(timeoutRef.current);

  const hasInputBlock = config.allowedBlocks?.includes('text_prompt_ext');
  const inputs = hasInputBlock
    ? preDefinedInputs.split('\n').filter(s => s !== '')
    : [];
  const sharedBuffer = hasInputBlock ? new SharedArrayBuffer(1028) : null;
  sharedBufferRef.current = sharedBuffer;

  const jsCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
  const worker = createBlocklyBlobWorker(jsCode, inputs, sharedBuffer);
  workerRef.current = worker;

  function startTle() {
    timeoutRef.current = setTimeout(() => {
      worker.terminate();
      workerRef.current = null;
      setRunning(false);
      setTle(true);
      setInputModalMsg(null);
    }, 3000);
  }
  startTle();

  worker.onmessage = ({ data }) => {
    if (data.type === 'input-request') {
      clearTimeout(timeoutRef.current);
      setInputValue('');
      setInputModalMsg(data.message || '');
      return;
    }
    clearTimeout(timeoutRef.current);
    workerRef.current = null;
    setRunning(false);
    setOutput(data.error ? `Error: ${mapError(data.error)}` : (data.output ?? '(no output)'));
  };

  worker.onerror = (e) => {
    clearTimeout(timeoutRef.current);
    workerRef.current = null;
    setRunning(false);
    setOutput(`Error: ${mapError(e.message)}`);
  };
}

function handleInputSubmit() {
  if (!sharedBufferRef.current) return;
  const int32View = new Int32Array(sharedBufferRef.current);
  const uint8View = new Uint8Array(sharedBufferRef.current);
  const encoded = new TextEncoder().encode(inputValue.slice(0, 1020));
  int32View[1] = encoded.length;
  uint8View.set(encoded, 8);
  Atomics.store(int32View, 0, 1);
  Atomics.notify(int32View, 0, 1);
  setInputModalMsg(null);
  setInputValue('');
  if (workerRef.current) {
    timeoutRef.current = setTimeout(() => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setRunning(false);
      setTle(true);
      setInputModalMsg(null);
    }, 3000);
  }
}
```

- [ ] **Step 5: Update BlocklyPracticePage.jsx — add input textarea to JSX**

In the JSX return, after the `showCodeView` panel and before the button row (before the `<div style={{ display: 'flex', gap: 12, marginBottom: 16` line), add:

```jsx
{config.allowedBlocks?.includes('text_prompt_ext') && (
  <div style={{ marginBottom: 16 }}>
    <label
      htmlFor="practice-input"
      style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#555' }}
    >
      Input (one value per line):
    </label>
    <textarea
      id="practice-input"
      rows={3}
      value={preDefinedInputs}
      onChange={e => setPreDefinedInputs(e.target.value)}
      style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box', padding: 6 }}
    />
  </div>
)}
```

- [ ] **Step 6: Update BlocklyPracticePage.jsx — add input modal to JSX**

Just before the final closing `</div>` of the component return, add:

```jsx
{inputModalMsg !== null && (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  }}>
    <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320 }}>
      <h3 style={{ marginTop: 0 }}>Enter input</h3>
      {inputModalMsg && (
        <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>{inputModalMsg}</p>
      )}
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleInputSubmit()}
        style={{ width: '100%', padding: 8, boxSizing: 'border-box', marginBottom: 16 }}
        autoFocus
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleInputSubmit}
          style={{
            background: '#1976d2', color: '#fff', border: 'none',
            borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
          }}
        >
          OK
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Run BlocklyPracticePage tests — confirm all pass**

```bash
cd frontend && npm test -- BlocklyPracticePage --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL"
```

Expected: All tests PASS (including updated init-message test and 6 new input tests).

- [ ] **Step 8: Run full suite — confirm no regressions (only BlocklyAuthoringWorkspace still has 1 failing test)**

```bash
cd frontend && npm test 2>&1 | grep -E "FAIL|failed"
```

Expected: Only `BlocklyAuthoringWorkspace.test.jsx` still failing (1 test — fixed in Task 5).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx \
        frontend/src/pages/student/BlocklyPracticePage.test.jsx
git commit -m "feat(blockly): add keyboard input support to student practice page"
```

---

### Task 5: Input UI in BlocklyAuthoringWorkspace

**Files:**
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx`
- Modify: `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx`

**Interfaces:**
- Consumes: `createBlocklyBlobWorker(jsCode, inputs, sharedBuffer)` — Task 3
- Prop: `allowedBlocks: string[]` — input UI shown when `'text_prompt_ext'` included
- Worker messages: same as Task 4

- [ ] **Step 1: Write failing tests**

In `frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx`:

**a)** Update the "clicking Run" test inside `Run button` describe (lines 142–148). Replace it with:

```js
test('clicking Run spawns a Worker from a blob URL and sends init message', () => {
  renderWorkspace();
  fireEvent.click(screen.getByRole('button', { name: /▶ Run/i }));
  expect(global.Worker).toHaveBeenCalledWith('blob:mock-url');
  expect(workerInstance.postMessage).toHaveBeenCalledWith({
    inputs: [],
    sharedBuffer: null,
  });
});
```

**b)** Add two new describe blocks after the closing `}` of the `Run button` describe (after line 184):

```js
describe('Input textarea', () => {
  test('not rendered when text_prompt_ext is absent from allowedBlocks', () => {
    renderWorkspace({ allowedBlocks: ['text_print'] });
    expect(screen.queryByLabelText(/Input \(one value per line\)/i)).not.toBeInTheDocument();
  });

  test('rendered when text_prompt_ext is in allowedBlocks', () => {
    renderWorkspace({ allowedBlocks: ['text_prompt_ext'] });
    expect(screen.getByLabelText(/Input \(one value per line\)/i)).toBeInTheDocument();
  });
});

describe('Interactive input modal', () => {
  let workerInstance;

  beforeEach(() => {
    workerInstance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.stubGlobal('Worker', vi.fn(() => workerInstance));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('modal not shown initially', () => {
    renderWorkspace({ allowedBlocks: ['text_prompt_ext'] });
    expect(screen.queryByRole('heading', { name: /enter input/i })).not.toBeInTheDocument();
  });

  test('modal appears when worker sends input-request', async () => {
    renderWorkspace({ allowedBlocks: ['text_prompt_ext'] });
    fireEvent.click(screen.getByRole('button', { name: /▶ Run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'input-request', message: 'Enter a number:' } });
    });
    expect(screen.getByRole('heading', { name: /enter input/i })).toBeInTheDocument();
    expect(screen.getByText('Enter a number:')).toBeInTheDocument();
  });

  test('modal closes and output shown when worker sends done', async () => {
    renderWorkspace({ allowedBlocks: ['text_prompt_ext'] });
    fireEvent.click(screen.getByRole('button', { name: /▶ Run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'input-request', message: 'Enter:' } });
    });
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'done', output: 'hello', error: null } });
    });
    expect(screen.queryByRole('heading', { name: /enter input/i })).not.toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  test('clicking OK in modal closes it', async () => {
    renderWorkspace({ allowedBlocks: ['text_prompt_ext'] });
    fireEvent.click(screen.getByRole('button', { name: /▶ Run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { type: 'input-request', message: 'Enter:' } });
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'world' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /ok/i }));
    });
    expect(screen.queryByRole('heading', { name: /enter input/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — confirm failures**

```bash
cd frontend && npm test -- BlocklyAuthoringWorkspace --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL"
```

Expected: "init message" test FAIL; all 6 new input tests FAIL.

- [ ] **Step 3: Update BlocklyAuthoringWorkspace.jsx — state and refs**

After the existing state declarations (after `const timeoutRef = useRef(null);`, line 62), add:

```js
const [preDefinedInputs, setPreDefinedInputs] = useState('');
const [inputModalMsg, setInputModalMsg] = useState(null);
const [inputValue, setInputValue] = useState('');
const sharedBufferRef = useRef(null);
```

- [ ] **Step 4: Update BlocklyAuthoringWorkspace.jsx — replace handleRun and add handleInputSubmit**

Replace the entire `handleRun` function (lines 145–177) with:

```js
function handleRun() {
  if (!workspaceRef.current) return;
  setRunning(true);
  setOutput(null);
  setTle(false);
  setInputModalMsg(null);
  if (workerRef.current) workerRef.current.terminate();
  clearTimeout(timeoutRef.current);

  const hasInputBlock = allowedBlocks.includes('text_prompt_ext');
  const inputs = hasInputBlock
    ? preDefinedInputs.split('\n').filter(s => s !== '')
    : [];
  const sharedBuffer = hasInputBlock ? new SharedArrayBuffer(1028) : null;
  sharedBufferRef.current = sharedBuffer;

  const jsCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
  const worker = createBlocklyBlobWorker(jsCode, inputs, sharedBuffer);
  workerRef.current = worker;

  function startTle() {
    timeoutRef.current = setTimeout(() => {
      worker.terminate();
      workerRef.current = null;
      setRunning(false);
      setTle(true);
      setInputModalMsg(null);
    }, 3000);
  }
  startTle();

  worker.onmessage = ({ data }) => {
    if (data.type === 'input-request') {
      clearTimeout(timeoutRef.current);
      setInputValue('');
      setInputModalMsg(data.message || '');
      return;
    }
    clearTimeout(timeoutRef.current);
    workerRef.current = null;
    setRunning(false);
    setOutput(data.error ? `Error: ${data.error}` : (data.output ?? '(no output)'));
  };

  worker.onerror = (e) => {
    clearTimeout(timeoutRef.current);
    workerRef.current = null;
    setRunning(false);
    setOutput(`Error: ${e.message}`);
  };
}

function handleInputSubmit() {
  if (!sharedBufferRef.current) return;
  const int32View = new Int32Array(sharedBufferRef.current);
  const uint8View = new Uint8Array(sharedBufferRef.current);
  const encoded = new TextEncoder().encode(inputValue.slice(0, 1020));
  int32View[1] = encoded.length;
  uint8View.set(encoded, 8);
  Atomics.store(int32View, 0, 1);
  Atomics.notify(int32View, 0, 1);
  setInputModalMsg(null);
  setInputValue('');
  if (workerRef.current) {
    timeoutRef.current = setTimeout(() => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setRunning(false);
      setTle(true);
      setInputModalMsg(null);
    }, 3000);
  }
}
```

- [ ] **Step 5: Update BlocklyAuthoringWorkspace.jsx — add input textarea to JSX**

After the `{/* Blockly workspace */}` div (the `<div ref={containerRef} .../>` on line 243) and before the `{/* Run controls */}` div, add:

```jsx
{allowedBlocks.includes('text_prompt_ext') && (
  <div style={{ marginTop: 12 }}>
    <label
      htmlFor="authoring-input"
      style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#555' }}
    >
      Input (one value per line):
    </label>
    <textarea
      id="authoring-input"
      rows={3}
      value={preDefinedInputs}
      onChange={e => setPreDefinedInputs(e.target.value)}
      style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box', padding: 6 }}
    />
  </div>
)}
```

- [ ] **Step 6: Update BlocklyAuthoringWorkspace.jsx — add input modal to JSX**

Just before the final closing `</div>` of the component return (after the Python code panel block), add:

```jsx
{inputModalMsg !== null && (
  <div style={{
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  }}>
    <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320 }}>
      <h3 style={{ marginTop: 0 }}>Enter input</h3>
      {inputModalMsg && (
        <p style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>{inputModalMsg}</p>
      )}
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleInputSubmit()}
        style={{ width: '100%', padding: 8, boxSizing: 'border-box', marginBottom: 16 }}
        autoFocus
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleInputSubmit}
          style={{
            background: '#1976d2', color: '#fff', border: 'none',
            borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
          }}
        >
          OK
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Run BlocklyAuthoringWorkspace tests — confirm all pass**

```bash
cd frontend && npm test -- BlocklyAuthoringWorkspace --reporter=verbose 2>&1 | grep -E "✓|✗|PASS|FAIL"
```

Expected: All tests PASS.

- [ ] **Step 8: Run full suite — confirm clean**

```bash
cd frontend && npm test 2>&1 | tail -5
```

Expected: All tests pass (150+ tests, 0 failures).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/tutor/BlocklyAuthoringWorkspace.jsx \
        frontend/src/components/tutor/BlocklyAuthoringWorkspace.test.jsx
git commit -m "feat(blockly): add keyboard input support to tutor authoring workspace"
```
