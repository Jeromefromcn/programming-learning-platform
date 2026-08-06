import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { exerciseApi } from '../../api/exerciseApi';
import { isReauthCancelled } from '../../api/axiosInstance';

const STARTER_CODE_EXAMPLE = `def add(a, b):
    """Return the sum of a and b."""
    # TODO: implement your solution here
    pass`;

function HelpPopover({ ariaLabel, width = 320, children }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={ariaLabel}
        style={{ width: 18, height: 18, lineHeight: '16px', padding: 0, borderRadius: '50%',
                 border: '1px solid #999', color: '#666', background: 'none',
                 fontSize: 12, cursor: 'pointer' }}>
        ?
      </button>
      {open && (
        <div role="tooltip" style={{ position: 'absolute', top: 24, left: 0, zIndex: 10,
                 width, padding: 12, background: '#fff', border: '1px solid #ccc',
                 borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 13, fontWeight: 400 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function StarterCodeHelp() {
  return (
    <HelpPopover ariaLabel="What is starter code?">
      <p style={{ margin: '0 0 8px' }}>
        Starter code is the initial code template shown in the editor when a student opens
        this exercise. It usually includes a function signature, required imports, or hint
        comments, so students can build on the skeleton instead of starting from scratch.
      </p>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Example (add two numbers):</p>
      <pre style={{ margin: 0, padding: 8, background: '#f5f5f5', borderRadius: 4,
               fontSize: 12, overflowX: 'auto' }}>
        <code>{STARTER_CODE_EXAMPLE}</code>
      </pre>
    </HelpPopover>
  );
}

function TestCasesHelp() {
  return (
    <HelpPopover ariaLabel="How do test cases work?" width={360}>
      <p style={{ margin: '0 0 8px' }}>
        <strong>Input expression</strong>: a line of Python run right after your Starter Code.
        It must print its result — a bare expression alone produces no output in a script, so
        wrap the call in print(...).
      </p>
      <pre style={{ margin: '0 0 8px', padding: 8, background: '#f5f5f5', borderRadius: 4,
               fontSize: 12, overflowX: 'auto' }}>
        <code>print(fizzbuzz(3))</code>
      </pre>
      <p style={{ margin: '0 0 8px' }}>
        <strong>Expected output</strong>: the exact text that print should produce, compared as
        plain stdout — no quotes around strings.
      </p>
      <pre style={{ margin: '0 0 8px', padding: 8, background: '#f5f5f5', borderRadius: 4,
               fontSize: 12, overflowX: 'auto' }}>
        <code>Fizz</code>
      </pre>
      <p style={{ margin: '0 0 8px' }}>
        <strong>+ Add Test Case</strong>: adds a new blank row below for you to fill in.
      </p>
      <p style={{ margin: 0 }}>
        <strong>Verify Test Cases</strong>: runs every test case above against the code
        currently in the Starter Code editor, using the sandbox, so you can catch mistakes
        (typos, wrong expected output, syntax errors) before saving. If your starter code is
        just a stub, tests will fail as expected — write a full solution temporarily to
        verify, then revert to the stub.
      </p>
    </HelpPopover>
  );
}

/**
 * Props:
 *   starterCode: string
 *   timeLimitSeconds: number
 *   testCases: Array<{input: string, expectedOutput: string, visible: boolean}>
 *   onStarterCodeChange: (code: string) => void
 *   onTimeLimitChange: (seconds: number) => void
 *   onTestCasesChange: (cases: Array) => void
 */
export default function PythonAuthoringEditor({
  starterCode = '',
  timeLimitSeconds = 5,
  testCases = [],
  onStarterCodeChange,
  onTimeLimitChange,
  onTestCasesChange,
}) {
  const [verifyResults, setVerifyResults] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  function addTestCase() {
    onTestCasesChange([...testCases, { input: '', expectedOutput: '', visible: true }]);
  }

  function removeTestCase(idx) {
    onTestCasesChange(testCases.filter((_, i) => i !== idx));
  }

  function updateTestCase(idx, field, value) {
    const next = testCases.map((tc, i) => i === idx ? { ...tc, [field]: value } : tc);
    onTestCasesChange(next);
  }

  async function handleVerify() {
    if (testCases.length === 0) {
      alert('Add at least one test case before verifying.');
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    setVerifyResults(null);
    try {
      const result = await exerciseApi.verify({
        starterCode,
        timeLimitSeconds,
        testCases: testCases.map(tc => ({ input: tc.input, expectedOutput: tc.expectedOutput })),
      });
      setVerifyResults(result.results || []);
    } catch (e) {
      if (isReauthCancelled(e)) return;
      setVerifyError(e.response?.data?.error?.message || 'Sandbox unavailable');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div>
      {/* Starter code */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <label style={{ fontWeight: 600 }}>Starter Code</label>
        <StarterCodeHelp />
      </div>
      <Editor
        height="300px"
        language="python"
        value={starterCode}
        onChange={value => onStarterCodeChange?.(value || '')}
        options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
        theme="light"
      />

      {/* Time limit */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontWeight: 600 }}>Time Limit (seconds):</label>
        <input
          type="number"
          min={1}
          max={30}
          value={timeLimitSeconds}
          onChange={e => onTimeLimitChange?.(parseInt(e.target.value, 10) || 5)}
          style={{ width: 70, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
        />
      </div>

      {/* Test cases */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontWeight: 600 }}>Test Cases</label>
            <TestCasesHelp />
          </div>
          <button type="button" onClick={addTestCase}
            style={{ padding: '4px 10px', cursor: 'pointer', borderRadius: 4,
                     border: '1px solid #1976d2', color: '#1976d2', background: 'none' }}>
            + Add Test Case
          </button>
        </div>

        {testCases.map((tc, idx) => (
          <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 4, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#555' }}>Input expression</label>
                <input
                  value={tc.input}
                  onChange={e => updateTestCase(idx, 'input', e.target.value)}
                  placeholder="e.g. print(fizzbuzz(3))"
                  style={{ display: 'block', width: '100%', padding: '4px 8px',
                           border: '1px solid #ccc', borderRadius: 4, marginTop: 2, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#555' }}>Expected output</label>
                <input
                  value={tc.expectedOutput}
                  onChange={e => updateTestCase(idx, 'expectedOutput', e.target.value)}
                  placeholder="e.g. Fizz"
                  style={{ display: 'block', width: '100%', padding: '4px 8px',
                           border: '1px solid #ccc', borderRadius: 4, marginTop: 2, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 12, color: '#555' }}>Visible</label>
                <input type="checkbox"
                  checked={tc.visible}
                  onChange={e => updateTestCase(idx, 'visible', e.target.checked)}
                  style={{ marginTop: 6 }}
                />
              </div>
              <button type="button" onClick={() => removeTestCase(idx)}
                style={{ alignSelf: 'flex-end', padding: '4px 8px', cursor: 'pointer',
                         border: '1px solid #c62828', color: '#c62828', borderRadius: 4, background: 'none' }}>
                Remove
              </button>
            </div>

            {/* Verify result for this test case */}
            {verifyResults && verifyResults[idx] && (
              <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 4,
                background: verifyResults[idx].passed ? '#e8f5e9' : '#ffebee', fontSize: 13 }}>
                {verifyResults[idx].passed
                  ? '✓ Passed'
                  : `✗ Failed — got: ${verifyResults[idx].actual || verifyResults[idx].error || '(no output)'}`}
              </div>
            )}
          </div>
        ))}

        {testCases.length === 0 && (
          <p style={{ color: '#999', fontSize: 13 }}>No test cases yet. Add at least one.</p>
        )}
      </div>

      {/* Verify button */}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying}
          style={{ padding: '6px 14px', cursor: verifying ? 'default' : 'pointer',
                   background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4 }}>
          {verifying ? 'Verifying…' : 'Verify Test Cases'}
        </button>
        {verifyError && (
          <span style={{ color: '#c62828', fontSize: 13 }}>Error: {verifyError}</span>
        )}
      </div>
    </div>
  );
}
