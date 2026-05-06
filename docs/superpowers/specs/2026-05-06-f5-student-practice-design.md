# F-5 Student Practice — Design

**Date:** 2026-05-06
**Feature:** F-5 from p0.md
**Approach:** Vertical slices (B), strict TDD

---

## Decisions Made

| Question | Decision |
|---|---|
| `likeCount` / `liked` | Query `exercise_likes` for real count; always return `liked: false` |
| Worker unit tests | Skip — rely on backend MockMvc tests + manual browser verification |
| Implementation order | Vertical slices: Browse → Blockly Practice → Python Practice |

---

## Architecture

Three slices built in dependency order. Each slice is independently runnable once complete.

```
Slice 1 — Browse
  StudentExerciseController  (/v1/student/exercises)
  StudentExerciseService     (course filter + config stripping)
  ExerciseListPage.jsx       (filter bar, paginated cards)

Slice 2 — Blockly Practice
  BlocklyPracticePage.jsx    (workspace + Run + Hint + Export)
  blocklyRunner.worker.js    (executes generated JS, overrides print())

Slice 3 — Python Practice
  PythonPracticePage.jsx     (Monaco + visible test cases + Run + Export)
  pyodideRunner.worker.js    (Pyodide WASM, stdout redirect, per-test results)
```

### New Files

**Backend:**
- `com.platform.exercise.student.StudentExerciseController`
- `com.platform.exercise.student.StudentExerciseService`
- `com.platform.exercise.student.StudentExerciseListDto`
- `com.platform.exercise.student.StudentExerciseDetailDto`
- `backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java`

**Frontend:**
- `src/api/studentApi.js`
- `src/pages/student/ExerciseListPage.jsx`
- `src/pages/student/ExercisePracticeRouter.jsx` (thin: fetches type, renders correct page)
- `src/pages/student/BlocklyPracticePage.jsx`
- `src/pages/student/PythonPracticePage.jsx`
- `src/workers/blocklyRunner.worker.js`
- `src/workers/pyodideRunner.worker.js`

**Routing additions to `App.jsx`:**
```
/student                → StudentPage (updated: becomes nav dashboard)
/student/exercises      → ExerciseListPage
/student/exercises/:id  → BlocklyPracticePage or PythonPracticePage (branched on exercise type)
```

---

## Slice 1 — Browse Exercises

### Backend

**Endpoints** — both `@PreAuthorize("hasRole('STUDENT')")`:

```
GET /v1/student/exercises?type=&categoryId=&difficulty=&page=0&size=20
GET /v1/student/exercises/{id}
```

**Course filter logic:**

```
enabled = settingsService.getSettings().courseFilterEnabled()  // @Cacheable 30s

if disabled:
    WHERE status = PUBLISHED AND is_deleted = false

if enabled:
    WHERE status = PUBLISHED AND is_deleted = false
    AND id IN (
        SELECT exercise_id FROM course_exercises
        WHERE course_id IN (
            SELECT course_id FROM course_students WHERE user_id = currentUserId
        )
    )
    // no enrollment → empty PageResponse (not an error)
```

**Config stripping** (on `exercise_versions.config` JsonNode before DTO mapping):
- Python: remove test case entries where `visible: false`; rename remaining to `visibleTestCases`; remove `gradingRules`
- Blockly: remove `gradingRules`; keep all other fields

**`likeCount`:** `SELECT COUNT(*) FROM exercise_likes WHERE exercise_id = ?`
**`liked`:** always `false`

**Student list DTO** (used for `GET /v1/student/exercises`):
```json
{
  "id": 1, "title": "FizzBuzz", "type": "PYTHON", "difficulty": "MEDIUM",
  "category": { "id": 1, "name": "Loops" },
  "currentVersionNumber": 2, "status": "PUBLISHED",
  "likeCount": 8
}
```

**Student detail DTO** (used for `GET /v1/student/exercises/{id}`):
```json
{
  "id": 1, "title": "FizzBuzz", "type": "PYTHON", "difficulty": "MEDIUM",
  "category": { "id": 1, "name": "Loops" },
  "version": {
    "id": 10, "versionNumber": 2,
    "description": "Write a FizzBuzz function.",
    "hints": ["Think about modulo", "Use if/elif/else"],
    "config": {
      "starterCode": "def fizzbuzz(n):\n    pass",
      "timeLimitSeconds": 5,
      "visibleTestCases": [{ "input": "fizzbuzz(3)", "expectedOutput": "\"Fizz\"" }]
    }
  },
  "likeCount": 8, "liked": false
}
```
For Blockly, `config` contains `allowedBlocks`, `initialWorkspaceXml`, `showCodeView` — `gradingRules` is stripped. `visibleTestCases` key is Python-only.

**Tests — `StudentExerciseControllerTest` (MockMvc + `@WithMockUser(roles="STUDENT")`):**
- course filter off → all published exercises returned
- course filter on + student enrolled in course with exercises → those exercises returned
- course filter on + student has no enrollments → empty page
- `type` filter works
- `categoryId` filter works
- `difficulty` filter works
- hidden test cases (`visible: false`) absent from Python detail response
- `gradingRules` absent from Python detail response
- `gradingRules` absent from Blockly detail response
- 404 on soft-deleted exercise
- 404 on non-existent exercise
- TUTOR role on student endpoint → 403

### Frontend

**`studentApi.js`:**
```js
studentApi.listExercises(params)   // GET /v1/student/exercises
studentApi.getExercise(id)         // GET /v1/student/exercises/:id
```

**`ExerciseListPage.jsx`:**
- Filter bar: Type (All / Blockly / Python), Category (dropdown from `GET /v1/categories`), Difficulty (All / Easy / Medium / Hard)
- Paginated grid of exercise cards (title, type badge, difficulty badge, category, likeCount)
- Click card → `navigate(/student/exercises/:id)`

**`StudentPage.jsx`** updated to show nav link to exercise list.

---

## Slice 2 — Blockly Practice

### `BlocklyPracticePage.jsx`

1. Fetch exercise via `studentApi.getExercise(id)`
2. Init Blockly workspace with `allowedBlocks` only + load `initialWorkspaceXml`
3. If `showCodeView: true`, render read-only panel updated live via `Blockly.JavaScript.workspaceToCode`
4. **Run:**
   - `jsCode = Blockly.JavaScript.workspaceToCode(workspace)`
   - Spawn `new Worker(blocklyRunner.worker.js)`
   - `worker.postMessage({ code: jsCode })`
   - `setTimeout(3000, () => { worker.terminate(); showTLE(); })`
   - `worker.onmessage` → display output in monospace panel (max 200px, scrollable)
   - `worker.onerror` → display error message
   - New worker spawned per run (clean state after timeout)
5. **Hints:** revealed one at a time; label "Hint (1/3)"; button disabled after last hint
6. **Export:** modal prompts student name → constructs export JSON → `<a download>` programmatic click

**Export JSON:**
```json
{
  "platformVersion": "1.0",
  "exerciseId": 1,
  "exerciseTitle": "Hello World",
  "exerciseType": "BLOCKLY",
  "exerciseVersion": 2,
  "studentName": "Alex Chen",
  "answer": "<xml>...</xml>",
  "exportedAt": "2026-04-11T09:00:00Z"
}
```
`answer` = current workspace XML via `Blockly.Xml.workspaceToDom()` serialised to string.

### `blocklyRunner.worker.js`

```js
self.onmessage = ({ data: { code } }) => {
  const lines = [];
  const print = (...args) => lines.push(args.join(' '));
  try {
    new Function('print', code)(print);
    self.postMessage({ output: lines.join('\n'), error: null });
  } catch (e) {
    self.postMessage({ output: null, error: e.message });
  }
};
```

- No `importScripts` from external domains
- Timeout enforced from main thread via `worker.terminate()`

---

## Slice 3 — Python Practice

### `PythonPracticePage.jsx`

1. Fetch exercise via `studentApi.getExercise(id)`
2. Render Monaco editor (dynamic `import()`, already installed) pre-filled with `starterCode`
3. List visible test cases below editor
4. Note: "+ N hidden tests will run on submission"
5. **Run:**
   - Send `{ code, visibleTestCases, timeLimitSeconds }` to `pyodideRunner.worker.js`
   - `setTimeout(timeLimitSeconds * 1000 + 500, () => { worker.terminate(); showTLE(); })`
   - `worker.onmessage({ results })` → render per-test ✅/❌ with actual vs expected
   - Pyodide worker reused across runs (loaded once, then kept alive)
6. **Export:** same pattern as Blockly; `answer` = current Monaco editor value

**Export JSON:**
```json
{
  "platformVersion": "1.0",
  "exerciseId": 1,
  "exerciseTitle": "FizzBuzz",
  "exerciseType": "PYTHON",
  "exerciseVersion": 2,
  "studentName": "Alex Chen",
  "answer": "def fizzbuzz(n):\n    ...",
  "exportedAt": "2026-04-11T09:00:00Z"
}
```

### `pyodideRunner.worker.js`

```js
importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
let pyodide = null;

self.onmessage = async ({ data: { code, visibleTestCases } }) => {
  if (!pyodide) pyodide = await loadPyodide();
  // redirect sys.stdout, run each test case, collect results
  // map raw errors to human-readable messages before postMessage
  self.postMessage({ results });
};
```

**Error message mapping (minimum 5):**
| Python Error | Human Message |
|---|---|
| `IndentationError` | "Check your indentation" |
| `NameError` | "Variable not defined: `<name>`" |
| `SyntaxError` | "Syntax error on line N" |
| `TypeError` | "Type mismatch: `<detail>`" |
| `IndexError` | "List index out of range" |

Pyodide version: 0.26.x from CDN. Loaded once on first run, reused thereafter. Main thread kills worker on timeout.

---

## Routing

`App.jsx` additions:
```jsx
<Route path="/student/exercises" element={
  <ProtectedRoute requiredRole="STUDENT"><ExerciseListPage /></ProtectedRoute>
} />
<Route path="/student/exercises/:id" element={
  <ProtectedRoute requiredRole="STUDENT"><ExercisePracticeRouter /></ProtectedRoute>
} />
```

`ExercisePracticeRouter` is a thin component that fetches the exercise type and renders `BlocklyPracticePage` or `PythonPracticePage` accordingly — keeps routing logic out of both practice pages.

---

## Out of Scope (per p0.md)

- Server-side "Run" execution
- Online submission / turn-in
- Student-side version history
- Python third-party libraries
- Mobile support
- Like action (likeCount displayed, liked always false)
