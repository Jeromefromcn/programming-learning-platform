# Blockly "View Answer" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tutor mark a Blockly exercise's authored workspace as a viewable answer, shown to students through an "Answer" button that opens a read-only Blockly modal.

**Architecture:** Two new fields (`answerWorkspaceXml`, `canViewAnswer`) ride inside the existing JSON `exercise_versions.config` (no DB migration). The tutor form always copies the authoring workspace XML into `answerWorkspaceXml` on save and adds a checkbox bound to `canViewAnswer`. The backend strips `answerWorkspaceXml` from the student response unless `canViewAnswer` is true. The student page conditionally shows an "Answer" button that opens a modal reusing the existing read-only `BlocklySubmissionViewer`.

**Tech Stack:** Java 25 / Spring Boot 3.5 / JUnit + MockMvc (backend); React 18 / Vite / Vitest / Testing Library / Blockly 12 (frontend).

## Global Constraints

- Scope is BLOCKLY exercises only. Python exercises must be unaffected.
- No DB migration: both new fields live inside the JSON `exercise_versions.config` object.
- Answer privacy: when `canViewAnswer` is not `true`, `answerWorkspaceXml` MUST NOT appear in the student API response (same protection pattern as `gradingRules`).
- No new read-only Blockly component: reuse `frontend/src/components/BlocklySubmissionViewer.jsx`.
- Frontend tests mock `blockly` entirely (jsdom can't run it); follow the existing mock setup in each test file.
- Commit after each task. Conventional Commits, e.g. `feat(exercise): ...`.

---

### Task 1: Backend — strip `answerWorkspaceXml` unless viewable

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java` (method `stripConfig`, around lines 92-111)
- Test: `backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java` (add helper + two tests)

**Interfaces:**
- Consumes: existing `stripConfig(String type, JsonNode config)` returning a stripped `ObjectNode`.
- Produces: same signature. For BLOCKLY, the returned config keeps `canViewAnswer` (boolean, default false when absent) and removes `answerWorkspaceXml` unless `canViewAnswer == true`.

- [ ] **Step 1: Write the failing tests**

Add a helper to `StudentExerciseControllerTest.java` (next to `createBlocklyExercise`) that lets a Blockly exercise carry the new fields:

```java
private Long createBlocklyExerciseWithAnswer(String title, boolean canViewAnswer,
                                             Long createdBy, Long catId) {
    jdbcTemplate.update(
        "INSERT INTO exercises (title, description, type, difficulty, category_id, status, created_by) VALUES (?,?,?,?,?,?,?)",
        title, "A description", "BLOCKLY", "EASY", catId, "PUBLISHED", createdBy);
    Long exId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    jdbcTemplate.update(
        "INSERT INTO exercise_versions (exercise_id, version_number, title, description, difficulty, hints, config) VALUES (?,?,?,?,?,?,?)",
        exId, 1, title, "A description", "EASY", null,
        "{\"allowedBlocks\":[\"text_print\"]," +
        "\"initialWorkspaceXml\":\"<xml/>\",\"showCodeView\":false," +
        "\"canViewAnswer\":" + canViewAnswer + "," +
        "\"answerWorkspaceXml\":\"<xml><block type=\\\"text_print\\\"></block></xml>\"," +
        "\"gradingRules\":{\"outputMatch\":{\"enabled\":false,\"expectedOutput\":\"\"}}}");
    Long verId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    jdbcTemplate.update("UPDATE exercises SET current_version_id=? WHERE id=?", verId, exId);
    return exId;
}
```

Add two tests in the "Get by ID" section:

```java
@Test
@WithMockUser(username = "student1", roles = "STUDENT")
void get_blocklyExercise_viewAnswerOn_keepsAnswerWorkspaceXml() throws Exception {
    Long exId = createBlocklyExerciseWithAnswer("Viewable", true, tutorId, categoryId);
    mockMvc.perform(get("/v1/student/exercises/" + exId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version.config.canViewAnswer").value(true))
        .andExpect(jsonPath("$.version.config.answerWorkspaceXml").exists());
}

@Test
@WithMockUser(username = "student1", roles = "STUDENT")
void get_blocklyExercise_viewAnswerOff_stripsAnswerWorkspaceXml() throws Exception {
    Long exId = createBlocklyExerciseWithAnswer("Hidden", false, tutorId, categoryId);
    mockMvc.perform(get("/v1/student/exercises/" + exId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version.config.canViewAnswer").value(false))
        .andExpect(jsonPath("$.version.config.answerWorkspaceXml").doesNotExist());
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=StudentExerciseControllerTest test`
Expected: FAIL — `get_blocklyExercise_viewAnswerOff_stripsAnswerWorkspaceXml` fails because `answerWorkspaceXml` still exists in the response.

- [ ] **Step 3: Implement the stripping**

In `StudentExerciseService.stripConfig`, after the existing `stripped.remove("gradingRules");` line, add a BLOCKLY branch:

```java
private JsonNode stripConfig(String type, JsonNode config) {
    ObjectNode stripped = (ObjectNode) config.deepCopy();
    stripped.remove("gradingRules");
    if ("BLOCKLY".equals(type)) {
        if (!stripped.path("canViewAnswer").asBoolean(false)) {
            stripped.remove("answerWorkspaceXml");
        }
    }
    if ("PYTHON".equals(type)) {
        // ... unchanged ...
```

(Leave the existing PYTHON block exactly as-is.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=StudentExerciseControllerTest test`
Expected: PASS — all tests green, including the existing `get_publishedBlocklyExercise_stripsGradingRulesKeepsAllowedBlocks` (its fixture has no `canViewAnswer`, so `answerWorkspaceXml` is absent and nothing breaks).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentExerciseService.java \
        backend/src/test/java/com/platform/exercise/student/StudentExerciseControllerTest.java
git commit -m "feat(exercise): strip blockly answer XML from student response unless viewable"
```

---

### Task 2: Tutor form — checkbox + save answer XML

**Files:**
- Modify: `frontend/src/pages/tutor/ExerciseFormPage.jsx` (`EMPTY_BLOCKLY_CONFIG`, `handleSubmit`, and the checkbox area near lines 225-238)
- Test: `frontend/src/pages/tutor/ExerciseFormPage.test.jsx`

**Interfaces:**
- Consumes: existing `blocklyConfig` state and `handleSubmit` building `payload.config`.
- Produces: for BLOCKLY create/update, `payload.config` includes `canViewAnswer` (boolean) and `answerWorkspaceXml` (string equal to `blocklyConfig.initialWorkspaceXml`).

- [ ] **Step 1: Write the failing tests**

Add to `ExerciseFormPage.test.jsx`. The BlocklyAuthoringWorkspace is already mocked as an empty div, so `initialWorkspaceXml` stays at its `EMPTY_BLOCKLY_CONFIG` default and `canViewAnswer` is driven purely by the checkbox.

```js
it('renders the view-answer checkbox for Blockly and defaults canViewAnswer false', async () => {
  await renderCreateForm('BLOCKLY');
  fillRequiredFields();

  expect(screen.getByLabelText(/view the answer/i)).not.toBeChecked();

  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          canViewAnswer: false,
          answerWorkspaceXml: expect.any(String),
        }),
      })
    )
  );
});

it('checking view-answer sends canViewAnswer true', async () => {
  await renderCreateForm('BLOCKLY');
  fillRequiredFields();

  fireEvent.click(screen.getByLabelText(/view the answer/i));
  fireEvent.click(screen.getByRole('button', { name: /create exercise/i }));

  await waitFor(() =>
    expect(exerciseApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ canViewAnswer: true }),
      })
    )
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/tutor/ExerciseFormPage.test.jsx`
Expected: FAIL — `getByLabelText(/view the answer/i)` finds no element.

- [ ] **Step 3: Add the default field**

In `ExerciseFormPage.jsx`, add `canViewAnswer: false` to `EMPTY_BLOCKLY_CONFIG`:

```js
const EMPTY_BLOCKLY_CONFIG = {
  allowedBlocks: [],
  initialWorkspaceXml: '<xml xmlns="https://developers.google.com/blockly/xml"></xml>',
  showCodeView: false,
  canViewAnswer: false,
  gradingRules: {
    outputMatch: { enabled: false, expectedOutput: '' },
    requiredBlocks: { enabled: false, blocks: [] },
    forbiddenBlocks: { enabled: false, blocks: [] },
    blockCountLimit: { enabled: false, max: null },
  },
};
```

- [ ] **Step 4: Copy answer XML on submit**

In `handleSubmit`, replace the `config` line so the Blockly config carries the answer:

```js
const config = exerciseType === 'BLOCKLY'
  ? { ...blocklyConfig, answerWorkspaceXml: blocklyConfig.initialWorkspaceXml }
  : pythonConfig;
```

- [ ] **Step 5: Add the checkbox (Blockly only)**

Inside the `exerciseType === 'BLOCKLY'` branch, just under the opening `<h3>Blockly Configuration</h3>` line, add:

```jsx
<label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
  <input
    type="checkbox"
    checked={blocklyConfig.canViewAnswer === true}
    onChange={e =>
      setBlocklyConfig(prev => ({ ...prev, canViewAnswer: e.target.checked }))}
  />
  Allow students to view the answer (允许学生查看答案)
</label>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/tutor/ExerciseFormPage.test.jsx`
Expected: PASS — all tests in the file green (existing Python `showResult` tests still pass; the new Blockly config spread preserves `showResult`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/tutor/ExerciseFormPage.jsx frontend/src/pages/tutor/ExerciseFormPage.test.jsx
git commit -m "feat(exercise): add view-answer toggle and save authoring workspace as answer"
```

---

### Task 3: Student page — "Answer" button + read-only modal

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx` (action-row buttons + a new modal + one state flag)
- Test: `frontend/src/pages/student/BlocklyPracticePage.test.jsx`

**Interfaces:**
- Consumes: `config.canViewAnswer` (boolean) and `config.answerWorkspaceXml` (string) from the exercise prop; existing `config` destructured at the top of the component.
- Produces: an "Answer" button rendered only when `config.canViewAnswer === true`; clicking sets a modal-open state that renders `BlocklySubmissionViewer` with `workspaceXml={config.answerWorkspaceXml}`.

- [ ] **Step 1: Write the failing tests**

Add to `BlocklyPracticePage.test.jsx`. Mock `BlocklySubmissionViewer` so the modal is assertable without real Blockly:

```js
vi.mock('../../components/BlocklySubmissionViewer', () => ({
  default: ({ workspaceXml }) => (
    <div data-testid="answer-viewer">{workspaceXml}</div>
  ),
}));
```

```js
describe('View answer', () => {
  test('no Answer button when canViewAnswer is false', async () => {
    render(<BlocklyPracticePage exercise={makeExercise({ canViewAnswer: false })} />);
    expect(screen.queryByRole('button', { name: /answer/i })).toBeNull();
  });

  test('shows Answer button and opens read-only viewer when canViewAnswer is true', async () => {
    const exercise = makeExercise({
      canViewAnswer: true,
      answerWorkspaceXml: '<xml><block type="text_print"></block></xml>',
    });
    render(<BlocklyPracticePage exercise={exercise} />);

    const btn = screen.getByRole('button', { name: /answer/i });
    fireEvent.click(btn);

    const viewer = await screen.findByTestId('answer-viewer');
    expect(viewer).toHaveTextContent('text_print');
  });
});
```

Note: `makeExercise` sets `initialWorkspaceXml`; the "Export" button label contains "Export" not "Answer", and "Save"/"Submit" don't match `/answer/i`, so `getByRole('button', { name: /answer/i })` is unambiguous.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/student/BlocklyPracticePage.test.jsx`
Expected: FAIL — `getByRole('button', { name: /answer/i })` finds no element in the second test.

- [ ] **Step 3: Add import and state**

In `BlocklyPracticePage.jsx`, add the import near the other component imports:

```js
import BlocklySubmissionViewer from '../../components/BlocklySubmissionViewer';
```

Add a state flag near the other `useState` calls:

```js
const [answerModal, setAnswerModal] = useState(false);
```

The component already destructures `config` from `version`; `config.canViewAnswer` and `config.answerWorkspaceXml` are available directly.

- [ ] **Step 4: Add the Answer button**

In the action-row `<div style={{ display: 'flex', gap: 12, ... }}>`, add the button after the Submit button and before the Export button:

```jsx
{config.canViewAnswer && (
  <button onClick={() => setAnswerModal(true)}
    style={{ border: '1px solid #f57c00', color: '#f57c00', background: '#fff', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}>
    Answer
  </button>
)}
```

- [ ] **Step 5: Add the modal**

Near the other modals at the end of the returned JSX (e.g. just before the `inputModalMsg` modal), add:

```jsx
{answerModal && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
    <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 'min(820px, 92vw)', maxHeight: '90vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Answer</h2>
        <button onClick={() => setAnswerModal(false)}
          style={{ marginLeft: 'auto', border: '1px solid #ccc', background: '#fff', borderRadius: 4, padding: '6px 14px', cursor: 'pointer' }}>
          Close
        </button>
      </div>
      <BlocklySubmissionViewer workspaceXml={config.answerWorkspaceXml} />
    </div>
  </div>
)}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/student/BlocklyPracticePage.test.jsx`
Expected: PASS — all tests in the file green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx frontend/src/pages/student/BlocklyPracticePage.test.jsx
git commit -m "feat(student): add answer button and read-only answer modal for blockly"
```

---

## Final Verification

- [ ] Backend: `cd backend && mvn -q test` — all green.
- [ ] Frontend: `cd frontend && npx vitest run` — all green.
- [ ] Manual smoke (optional, per the deploy-after-dev memory): create a Blockly exercise with the toggle on, publish, and confirm the Answer button shows the authored blocks read-only; toggle off and confirm the button is gone and the network response has no `answerWorkspaceXml`.
