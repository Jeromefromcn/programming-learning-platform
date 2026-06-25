# Blockly Submission Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only but executable Blockly workspace to `SubmissionDetailPage` so tutors can see student block layouts and run them, instead of only seeing generated JavaScript.

**Architecture:** Student export gains a `workspaceXml` field alongside the existing `answer` JS field. A new nullable `workspace_xml` DB column stores it. A new `BlocklySubmissionViewer` component renders a `readOnly: true` Blockly workspace loaded from the XML, with a Run button using the same Web Worker pattern as the practice page. `SubmissionDetailPage` swaps its Monaco editor for `BlocklySubmissionViewer` when `exerciseType === 'BLOCKLY'`.

**Tech Stack:** React 18, Blockly 12.5.0, Vitest 4, @testing-library/react, Spring Boot 3.5, Flyway 9, JUnit 5, Mockito

## Global Constraints

- No new npm dependencies
- Inline styles only — no CSS files (project-wide convention)
- Grading path (`answer_data` → `BlocklyGrader`) must not change
- Old submissions with `workspace_xml = null` must degrade gracefully
- Run button uses `createBlocklyBlobWorker` from `../../utils/blocklyWorker` (same as practice page)
- 3-second TLE timeout (same as practice page)
- Next Flyway migration is **V6** (`V5__add_user_expiration.sql` already exists)

---

### Task 1: Backend — workspace_xml column + entity + DTO + import

**Files:**
- Create: `backend/src/main/resources/db/migration/V6__add_workspace_xml.sql`
- Modify: `backend/src/main/java/com/platform/exercise/domain/Submission.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionDetailDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/submission/FileImportService.java`
- Modify: `backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java`

**Interfaces:**
- Produces: `Submission.getWorkspaceXml(): String | null` — used by `SubmissionDetailDto.of()`
- Produces: `SubmissionDetailDto.workspaceXml(): String | null` — consumed by Task 4 frontend

- [ ] **Step 1: Write failing test — workspaceXml stored when present in JSON**

In `FileImportServiceTest.java`, add a helper and a new test after the existing `processSingleFile_validJson_returnsImported` test:

```java
private byte[] blocklyJsonWithXml(long exerciseId) {
    return String.format("""
        {"platformVersion":"1.0","exerciseId":%d,"exerciseTitle":"Hello","exerciseType":"BLOCKLY",
         "exerciseVersion":1,"studentName":"Alex","answer":"print('Hello');",
         "workspaceXml":"<xml xmlns=\\"https://developers.google.com/blockly/xml\\"><block type=\\"text_print\\"></block></xml>",
         "exportedAt":"2026-05-01T10:00:00Z"}""", exerciseId).getBytes();
}

@Test
void processSingleFile_withWorkspaceXml_storesXmlOnSubmission() {
    stubExercise(1L, 10L);
    when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
        .thenReturn(false);
    Submission saved = new Submission();
    saved.setId(42L);
    when(submissionRepository.save(any())).thenReturn(saved);
    when(blocklyGrader.grade(anyString(), anyString()))
        .thenReturn(new BlocklyGrader.Result(new BigDecimal("100.00"),
            "{\"type\":\"BLOCKLY\",\"passed\":true}"));

    service.processSingleFile("alex.json", blocklyJsonWithXml(1L), "batch-1", false);

    var captor = org.mockito.ArgumentCaptor.forClass(Submission.class);
    verify(submissionRepository).save(captor.capture());
    assertThat(captor.getValue().getWorkspaceXml())
        .contains("text_print");
}

@Test
void processSingleFile_withoutWorkspaceXml_storesNull() {
    stubExercise(1L, 10L);
    when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
        .thenReturn(false);
    Submission saved = new Submission();
    saved.setId(42L);
    when(submissionRepository.save(any())).thenReturn(saved);
    when(blocklyGrader.grade(anyString(), anyString()))
        .thenReturn(new BlocklyGrader.Result(new BigDecimal("100.00"),
            "{\"type\":\"BLOCKLY\",\"passed\":true}"));

    service.processSingleFile("alex.json", validBlocklyJson(1L), "batch-1", false);

    var captor = org.mockito.ArgumentCaptor.forClass(Submission.class);
    verify(submissionRepository).save(captor.capture());
    assertThat(captor.getValue().getWorkspaceXml()).isNull();
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && mvn test -pl . -Dtest=FileImportServiceTest -q 2>&1 | tail -20
```

Expected: 2 new tests FAIL — `getWorkspaceXml()` does not exist on `Submission`

- [ ] **Step 3: Create migration**

Create `backend/src/main/resources/db/migration/V6__add_workspace_xml.sql`:

```sql
ALTER TABLE submissions
  ADD COLUMN workspace_xml MEDIUMTEXT NULL
  COMMENT 'Blockly workspace XML for visual replay; null for pre-V6 submissions';
```

- [ ] **Step 4: Add field to Submission entity**

In `Submission.java`, after the `answerData` field (line 33), add:

```java
@Column(name = "workspace_xml", columnDefinition = "MEDIUMTEXT")
private String workspaceXml;
```

- [ ] **Step 5: Update SubmissionDetailDto**

Replace the entire `SubmissionDetailDto.java` with:

```java
package com.platform.exercise.submission;

import com.platform.exercise.domain.Submission;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SubmissionDetailDto(
    Long id,
    String studentName,
    String exerciseTitle,
    String exerciseType,
    String answerData,
    String workspaceXml,
    LocalDateTime exportTimestamp,
    boolean versionMismatch,
    Integer studentVersionNumber,
    Integer gradedVersionNumber,
    BigDecimal autoScore,
    String autoGradeDetails,
    BigDecimal tutorScore,
    String tutorComment,
    LocalDateTime createdAt
) {
    public static SubmissionDetailDto of(Submission sub, String exerciseTitle, int gradedVersionNumber) {
        return new SubmissionDetailDto(
            sub.getId(), sub.getStudentName(), exerciseTitle,
            sub.getExerciseType(), sub.getAnswerData(), sub.getWorkspaceXml(),
            sub.getExportTimestamp(),
            sub.isVersionMismatch(), sub.getStudentVersionNumber(), gradedVersionNumber,
            sub.getAutoScore(), sub.getAutoGradeDetails(),
            sub.getTutorScore(), sub.getTutorComment(), sub.getCreatedAt());
    }
}
```

- [ ] **Step 6: Update FileImportService to read and store workspaceXml**

In `FileImportService.java`, after `sub.setAnswerData(answer);` (line 149), add:

```java
sub.setWorkspaceXml(node.path("workspaceXml").asText(null));
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
cd backend && mvn test -pl . -Dtest=FileImportServiceTest -q 2>&1 | tail -20
```

Expected: all 7 tests PASS (5 original + 2 new)

- [ ] **Step 8: Run full backend test suite**

```bash
cd backend && mvn test -q 2>&1 | tail -20
```

Expected: BUILD SUCCESS

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/resources/db/migration/V6__add_workspace_xml.sql \
        backend/src/main/java/com/platform/exercise/domain/Submission.java \
        backend/src/main/java/com/platform/exercise/submission/SubmissionDetailDto.java \
        backend/src/main/java/com/platform/exercise/submission/FileImportService.java \
        backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java
git commit -m "feat(submission): add workspace_xml column and expose in DTO for Blockly visual replay"
```

---

### Task 2: Frontend — add workspaceXml to student export

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx`
- Modify: `frontend/src/pages/student/BlocklyPracticePage.test.jsx`

**Interfaces:**
- Produces: exported JSON now contains `workspaceXml: string` field alongside `answer`

- [ ] **Step 1: Write failing test for export payload**

In `BlocklyPracticePage.test.jsx`, add a new describe block after the existing ones:

```jsx
describe('Export payload', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    // Spy on Blob to capture the JSON passed to it
    vi.stubGlobal('Blob', vi.fn((parts) => {
      global.__lastBlobParts = parts;
      return { size: 1, type: 'application/json' };
    }));
    // Stub anchor click so no real download fires
    const anchor = { href: '', download: '', click: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete global.__lastBlobParts;
  });

  test('exported JSON includes workspaceXml field', async () => {
    const { default: Blockly } = await import('blockly');
    vi.mocked(Blockly.Xml.domToText).mockReturnValue('<xml xmlns="..."><block type="text_print"></block></xml>');

    render(<BlocklyPracticePage exercise={makeExercise()} />);

    // Open export modal
    fireEvent.click(screen.getByRole('button', { name: /export/i }));
    // Enter student name
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alice' } });
    // Click Download JSON
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /download json/i }));
    });

    expect(global.__lastBlobParts).toBeDefined();
    const json = JSON.parse(global.__lastBlobParts[0]);
    expect(json).toHaveProperty('workspaceXml');
    expect(json.workspaceXml).toContain('text_print');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/student/BlocklyPracticePage.test.jsx 2>&1 | tail -20
```

Expected: FAIL — `workspaceXml` property missing from exported JSON

- [ ] **Step 3: Update export payload in BlocklyPracticePage.jsx**

In `BlocklyPracticePage.jsx`, inside `handleExport`, replace the `payload` object (lines 160-171) with:

```js
const payload = {
  platformVersion: '1.0',
  exerciseId: exercise.id,
  exerciseTitle: exercise.title,
  exerciseType: 'BLOCKLY',
  exerciseVersion: version.versionNumber,
  studentName: name,
  answer: workspaceRef.current
    ? javascriptGenerator.workspaceToCode(workspaceRef.current)
    : '',
  workspaceXml: workspaceRef.current
    ? Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspaceRef.current))
    : '',
  exportedAt: new Date().toISOString(),
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/pages/student/BlocklyPracticePage.test.jsx 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx \
        frontend/src/pages/student/BlocklyPracticePage.test.jsx
git commit -m "feat(blockly): include workspaceXml in student export payload"
```

---

### Task 3: Frontend — BlocklySubmissionViewer component

**Files:**
- Create: `frontend/src/components/BlocklySubmissionViewer.jsx`
- Create: `frontend/src/components/BlocklySubmissionViewer.test.jsx`

**Interfaces:**
- Consumes: `workspaceXml: string | null` prop
- Produces: renders read-only Blockly workspace + Run button + output, or fallback message

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/BlocklySubmissionViewer.test.jsx`:

```jsx
import { vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import BlocklySubmissionViewer from './BlocklySubmissionViewer';

// Blockly cannot run in jsdom — mock it entirely
vi.mock('blockly', () => {
  const mockWorkspace = {
    addChangeListener: vi.fn(),
    dispose: vi.fn(),
  };
  const mockBlockly = {
    inject: vi.fn(() => mockWorkspace),
    Xml: {
      workspaceToDom: vi.fn(() => ({})),
      domToText: vi.fn(() => '<xml></xml>'),
      domToWorkspace: vi.fn(),
    },
    utils: { xml: { textToDom: vi.fn(() => ({})) } },
  };
  return { default: mockBlockly, ...mockBlockly };
});
vi.mock('blockly/blocks', () => ({}));
vi.mock('blockly/javascript', () => ({
  javascriptGenerator: { workspaceToCode: vi.fn(() => 'HighlightBlock();') },
}));
vi.mock('blockly/python', () => ({
  pythonGenerator: { workspaceToCode: vi.fn(() => '') },
}));
vi.mock('../utils/blocklyWorker', () => ({
  createBlocklyBlobWorker: vi.fn(),
}));

const SAMPLE_XML = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="text_print"></block></xml>';
const XML_WITH_INPUT = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="text_prompt_ext"></block></xml>';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BlocklySubmissionViewer', () => {
  test('shows fallback message when workspaceXml is null', () => {
    render(<BlocklySubmissionViewer workspaceXml={null} />);
    expect(screen.getByText(/visual replay not available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run/i })).not.toBeInTheDocument();
  });

  test('calls Blockly.inject and loads XML when workspaceXml is provided', async () => {
    const { default: Blockly } = await import('blockly');
    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    expect(Blockly.inject).toHaveBeenCalled();
    expect(Blockly.Xml.domToWorkspace).toHaveBeenCalled();
  });

  test('renders Run button when workspaceXml is provided', () => {
    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    expect(screen.getByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  test('Run button shows "Running…" and is disabled while running', async () => {
    const { createBlocklyBlobWorker } = await import('../utils/blocklyWorker');
    const workerInstance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.mocked(createBlocklyBlobWorker).mockReturnValue(workerInstance);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    const btn = screen.getByRole('button', { name: /run/i });
    fireEvent.click(btn);

    expect(screen.getByRole('button', { name: /running/i })).toBeDisabled();

    vi.restoreAllMocks();
  });

  test('shows output after worker responds', async () => {
    const { createBlocklyBlobWorker } = await import('../utils/blocklyWorker');
    const workerInstance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.mocked(createBlocklyBlobWorker).mockReturnValue(workerInstance);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => {
      workerInstance.onmessage({ data: { output: 'hello tutor', error: null } });
    });
    expect(screen.getByText('hello tutor')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  test('shows TLE warning after 3 seconds', async () => {
    vi.useFakeTimers();
    const { createBlocklyBlobWorker } = await import('../utils/blocklyWorker');
    const workerInstance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
    vi.mocked(createBlocklyBlobWorker).mockReturnValue(workerInstance);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    fireEvent.click(screen.getByRole('button', { name: /run/i }));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText(/time limit exceeded/i)).toBeInTheDocument();

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('shows input textarea when XML contains text_prompt_ext', () => {
    render(<BlocklySubmissionViewer workspaceXml={XML_WITH_INPUT} />);
    expect(screen.getByLabelText(/input \(one value per line\)/i)).toBeInTheDocument();
  });

  test('does not show input textarea when XML has no text_prompt_ext', () => {
    render(<BlocklySubmissionViewer workspaceXml={SAMPLE_XML} />);
    expect(screen.queryByLabelText(/input \(one value per line\)/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/BlocklySubmissionViewer.test.jsx 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './BlocklySubmissionViewer'`

- [ ] **Step 3: Create BlocklySubmissionViewer.jsx**

Create `frontend/src/components/BlocklySubmissionViewer.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks';
import { javascriptGenerator } from 'blockly/javascript';
import { createBlocklyBlobWorker } from '../utils/blocklyWorker';

const OUTPUT_STYLE = {
  background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace',
  fontSize: 13, padding: 12, borderRadius: 4,
  maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', margin: 0,
};

function mapError(msg) {
  if (!msg) return 'An error occurred.';
  return msg;
}

export default function BlocklySubmissionViewer({ workspaceXml }) {
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);
  const sharedBufferRef = useRef(null);

  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [tle, setTle] = useState(false);
  const [preDefinedInputs, setPreDefinedInputs] = useState('');
  const [inputModalMsg, setInputModalMsg] = useState(null);
  const [inputValue, setInputValue] = useState('');

  const hasInputBlock = workspaceXml?.includes('type="text_prompt_ext"') ?? false;

  useEffect(() => {
    if (!workspaceXml || !containerRef.current) return;

    const workspace = Blockly.inject(containerRef.current, {
      readOnly: true,
      scrollbars: true,
    });
    workspaceRef.current = workspace;

    try {
      Blockly.Xml.domToWorkspace(
        Blockly.utils.xml.textToDom(workspaceXml),
        workspace
      );
    } catch { /* malformed XML — workspace stays empty */ }

    return () => {
      workspace.dispose();
      workspaceRef.current = null;
    };
  }, [workspaceXml]);

  function handleRun() {
    if (!workspaceRef.current) return;
    setRunning(true);
    setOutput(null);
    setTle(false);
    setInputModalMsg(null);

    if (workerRef.current) workerRef.current.terminate();
    clearTimeout(timeoutRef.current);

    const inputs = hasInputBlock
      ? preDefinedInputs.split('\n').filter(s => s !== '')
      : [];
    const sharedBuffer = hasInputBlock ? new SharedArrayBuffer(1028) : null;
    sharedBufferRef.current = sharedBuffer;

    const jsCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
    const worker = createBlocklyBlobWorker(jsCode, inputs, sharedBuffer);
    workerRef.current = worker;

    timeoutRef.current = setTimeout(() => {
      worker.terminate();
      workerRef.current = null;
      setRunning(false);
      setTle(true);
      setInputModalMsg(null);
    }, 3000);

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
      setInputModalMsg(null);
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
    const raw = new TextEncoder().encode(inputValue);
    let encoded = raw;
    if (raw.length > 1020) {
      let end = 1020;
      while (end > 0 && (raw[end] & 0xC0) === 0x80) end--;
      encoded = raw.slice(0, end);
    }
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

  if (!workspaceXml) {
    return (
      <p style={{ color: '#888', fontSize: 14, fontStyle: 'italic' }}>
        Visual replay not available for this submission (exported before workspace XML was recorded).
      </p>
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        style={{ height: 400, border: '1px solid #ddd', borderRadius: 4, marginBottom: 16 }}
      />

      {hasInputBlock && (
        <div style={{ marginBottom: 12 }}>
          <label
            htmlFor="viewer-input"
            style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#555' }}
          >
            Input (one value per line):
          </label>
          <textarea
            id="viewer-input"
            rows={3}
            value={preDefinedInputs}
            onChange={e => setPreDefinedInputs(e.target.value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box', padding: 6 }}
          />
        </div>
      )}

      <button
        onClick={handleRun}
        disabled={running}
        style={{
          background: running ? '#90caf9' : '#1976d2',
          color: '#fff', border: 'none', borderRadius: 4,
          padding: '8px 20px', cursor: running ? 'not-allowed' : 'pointer',
          marginBottom: 16,
        }}
      >
        {running ? 'Running…' : 'Run'}
      </button>

      {tle && (
        <div style={{
          background: '#fff3e0', border: '1px solid #ffb74d',
          borderRadius: 4, padding: 12, marginBottom: 12,
        }}>
          ⚠ Time Limit Exceeded (3 seconds)
        </div>
      )}

      {output !== null && <pre style={OUTPUT_STYLE}>{output}</pre>}

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
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/BlocklySubmissionViewer.test.jsx 2>&1 | tail -20
```

Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BlocklySubmissionViewer.jsx \
        frontend/src/components/BlocklySubmissionViewer.test.jsx
git commit -m "feat(submission): add BlocklySubmissionViewer read-only workspace component"
```

---

### Task 4: Frontend — wire BlocklySubmissionViewer into SubmissionDetailPage

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.jsx`

**Interfaces:**
- Consumes (from Task 1): `submission.workspaceXml: string | null` from API response
- Consumes (from Task 3): `<BlocklySubmissionViewer workspaceXml={...} />` component

- [ ] **Step 1: Add import and replace BLOCKLY section**

Replace the full contents of `frontend/src/pages/tutor/SubmissionDetailPage.jsx` with:

```jsx
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { submissionApi } from '../../api/submissionApi';
import { isReauthCancelled } from '../../api/axiosInstance';
import Breadcrumb from '../../components/Breadcrumb';
import BlocklySubmissionViewer from '../../components/BlocklySubmissionViewer';

export default function SubmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  const [submission, setSubmission] = useState(null);
  const [tutorScore, setTutorScore] = useState('');
  const [tutorComment, setTutorComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    submissionApi.getById(id).then(data => {
      setSubmission(data);
      if (data.tutorScore != null) setTutorScore(String(data.tutorScore));
      if (data.tutorComment) setTutorComment(data.tutorComment);
    });
  }, [id]);

  useEffect(() => {
    if (!submission || submission.exerciseType !== 'PYTHON' || !editorRef.current) return;
    import('monaco-editor').then(monaco => {
      if (monacoRef.current) monacoRef.current.dispose();
      monacoRef.current = monaco.editor.create(editorRef.current, {
        value: submission.answerData || '',
        language: 'python',
        readOnly: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
      });
    });
    return () => { monacoRef.current?.dispose(); monacoRef.current = null; };
  }, [submission]);

  async function handleSave() {
    const score = parseFloat(tutorScore);
    if (isNaN(score) || score < 0 || score > 100) {
      setSaveError('Score must be a number between 0 and 100.');
      return;
    }
    setSaveError('');
    setSaving(true);
    try {
      const data = await submissionApi.grade(id, {
        tutorScore: score,
        tutorComment: tutorComment || null,
      });
      setSubmission(data);
    } catch (err) {
      if (isReauthCancelled(err)) return;
      setSaveError(err.response?.data?.error?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this submission? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await submissionApi.delete(id);
      navigate('/tutor/submissions');
    } catch {
      alert('Failed to delete submission.');
      setDeleting(false);
    }
  }

  function renderAutoGrade(details) {
    if (!details) return null;
    try {
      const d = JSON.parse(details);
      if (d.type === 'BLOCKLY') {
        return (
          <div>
            <p><strong>Rule:</strong> {d.rule}</p>
            <p><strong>Passed:</strong> {String(d.passed)}</p>
            {d.expected != null && <p><strong>Expected:</strong> <code>{d.expected}</code></p>}
            {d.actual != null && <p><strong>Actual:</strong> <code>{d.actual}</code></p>}
            {d.error && <p style={{ color: '#c62828' }}><strong>Error:</strong> {d.error}</p>}
          </div>
        );
      }
      if (d.type === 'PYTHON') {
        return (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                {['#', 'Passed', 'Actual', 'Time (ms)', 'Error'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', border: '1px solid #ddd' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d.results || []).map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd' }}>{r.index}</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd', color: r.passed ? '#2e7d32' : '#c62828' }}>
                    {r.passed ? '✓' : '✗'}
                  </td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd' }}><code>{r.actual}</code></td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd' }}>{r.executionTimeMs}</td>
                  <td style={{ padding: '6px 10px', border: '1px solid #ddd', color: '#c62828' }}>{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
    } catch { /* ignore */ }
    return <pre style={{ fontSize: 12 }}>{details}</pre>;
  }

  if (!submission) return <p style={{ padding: 32 }}>Loading…</p>;

  const effectiveScore = submission.tutorScore ?? submission.autoScore;

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <Breadcrumb items={[
        { label: 'Submissions', to: '/tutor/submissions' },
        { label: 'Submission Detail' },
      ]} />
      <button onClick={() => navigate('/tutor/submissions')}
        style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        ← Back to Submissions
      </button>

      <h1 style={{ marginBottom: 4 }}>{submission.exerciseTitle}</h1>
      <p style={{ color: '#555', margin: '0 0 16px' }}>
        {submission.exerciseType} · {submission.studentName}
      </p>

      {submission.versionMismatch && (
        <div style={{
          background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4,
          padding: '10px 16px', marginBottom: 16, color: '#e65100',
        }}>
          This submission was answered against version {submission.studentVersionNumber}.
          The exercise has since been updated to version {submission.gradedVersionNumber}.
        </div>
      )}

      {effectiveScore != null && (
        <div style={{
          display: 'inline-block', padding: '4px 14px', borderRadius: 20,
          background: submission.tutorScore != null ? '#1976d2' : '#388e3c',
          color: '#fff', fontWeight: 700, marginBottom: 20,
        }}>
          {submission.tutorScore != null ? 'Tutor' : 'Auto'} Score: {effectiveScore}
        </div>
      )}

      <h2 style={{ marginBottom: 8 }}>Student Answer</h2>
      {submission.exerciseType === 'BLOCKLY' ? (
        <div style={{ marginBottom: 24 }}>
          <BlocklySubmissionViewer workspaceXml={submission.workspaceXml} />
        </div>
      ) : (
        <div ref={editorRef} style={{ height: 300, border: '1px solid #ddd', borderRadius: 4, marginBottom: 24 }} />
      )}

      <h2 style={{ marginBottom: 8 }}>Auto-Grade Details</h2>
      <div style={{ background: '#fafafa', border: '1px solid #ddd', borderRadius: 4, padding: 16, marginBottom: 24 }}>
        {renderAutoGrade(submission.autoGradeDetails)}
      </div>

      <h2 style={{ marginBottom: 12 }}>Manual Grade</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 400 }}>
        <label style={{ fontSize: 14 }}>
          Score (0–100):
          <input
            type="number" min="0" max="100" step="0.01"
            value={tutorScore}
            onChange={e => setTutorScore(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
          />
        </label>
        <label style={{ fontSize: 14 }}>
          Comment (max 500 chars):
          <textarea
            maxLength={500}
            value={tutorComment}
            onChange={e => setTutorComment(e.target.value)}
            rows={4}
            style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
          />
        </label>
        {saveError && <p style={{ color: '#c62828', margin: 0 }}>{saveError}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4,
            padding: '8px 20px', cursor: 'pointer', alignSelf: 'flex-start',
          }}
        >
          {saving ? 'Saving…' : 'Save Grade'}
        </button>
      </div>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #eee' }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            background: 'none', color: '#c62828', border: '1px solid #c62828',
            borderRadius: 4, padding: '8px 20px',
            cursor: deleting ? 'default' : 'pointer',
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? 'Deleting…' : 'Delete Submission'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run full frontend test suite**

```bash
cd frontend && npx vitest run 2>&1 | tail -30
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/tutor/SubmissionDetailPage.jsx
git commit -m "feat(submission): show read-only Blockly workspace in submission detail page"
```

---

## Self-Review

**Spec coverage:**
- ✓ `workspaceXml` added to student export → Task 2
- ✓ `V6__add_workspace_xml.sql` migration → Task 1
- ✓ `Submission.java` field → Task 1
- ✓ `FileImportService.java` reads and stores → Task 1
- ✓ `SubmissionDetailDto.java` exposes field → Task 1
- ✓ `BlocklySubmissionViewer` read-only workspace → Task 3
- ✓ Run button + Web Worker + output → Task 3
- ✓ Input detection via `includes('type="text_prompt_ext"')` → Task 3
- ✓ Fallback for null workspaceXml → Task 3
- ✓ `SubmissionDetailPage` BLOCKLY → viewer, PYTHON → Monaco → Task 4
- ✓ Old submissions degrade gracefully → Task 3 (null branch) + Task 1 (nullable column)
- ✓ 7 test cases for `BlocklySubmissionViewer` → Task 3
- ✓ 2 new backend tests → Task 1

**Placeholder scan:** No TBD, no TODO, all code blocks complete.

**Type consistency:**
- `workspaceXml` used as prop name in Tasks 3 and 4 — consistent
- `submission.workspaceXml` in Task 4 matches `SubmissionDetailDto.workspaceXml()` from Task 1
- `createBlocklyBlobWorker` import path `'../utils/blocklyWorker'` matches existing usage in `BlocklyPracticePage`
