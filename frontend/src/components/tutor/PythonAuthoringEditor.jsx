import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { exerciseApi } from '../../api/exerciseApi';
import { isReauthCancelled } from '../../api/axiosInstance';

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
      <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Starter Code</label>
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
          <label style={{ fontWeight: 600 }}>Test Cases</label>
          <button onClick={addTestCase}
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
                  placeholder="e.g. fizzbuzz(3)"
                  style={{ display: 'block', width: '100%', padding: '4px 8px',
                           border: '1px solid #ccc', borderRadius: 4, marginTop: 2, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: '#555' }}>Expected output</label>
                <input
                  value={tc.expectedOutput}
                  onChange={e => updateTestCase(idx, 'expectedOutput', e.target.value)}
                  placeholder='e.g. "Fizz"'
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
              <button onClick={() => removeTestCase(idx)}
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
