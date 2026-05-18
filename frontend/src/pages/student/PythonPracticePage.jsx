import { useRef, useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import MarkdownRenderer from '../../components/MarkdownRenderer';

const OUTPUT_STYLE = {
  background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace',
  fontSize: 13, padding: 12, borderRadius: 4,
  maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', margin: 0,
};

export default function PythonPracticePage({ exercise }) {
  const version = exercise.version;
  const config = version.config;
  const visibleTestCases = config.visibleTestCases || [];
  const timeLimitSeconds = config.timeLimitSeconds || 5;
  const hints = version.hints || [];

  const [code, setCode] = useState(config.starterCode || '');
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [tle, setTle] = useState(false);
  const [runError, setRunError] = useState(null);
  const [hintIndex, setHintIndex] = useState(-1);
  const [exportModal, setExportModal] = useState(false);
  const [studentName, setStudentName] = useState('');
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../../workers/pyodideRunner.worker.js', import.meta.url),
      { type: 'classic' }
    );
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  function handleRun() {
    if (!workerRef.current || running) return;
    setRunning(true);
    setResults(null);
    setTle(false);
    setRunError(null);

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      workerRef.current.terminate();
      workerRef.current = new Worker(
        new URL('../../workers/pyodideRunner.worker.js', import.meta.url),
        { type: 'classic' }
      );
      workerRef.current.onmessage = handleWorkerMessage;
      workerRef.current.onerror = handleWorkerError;
      setRunning(false);
      setTle(true);
    }, timeLimitSeconds * 1000 + 500);

    workerRef.current.onmessage = handleWorkerMessage;
    workerRef.current.onerror = handleWorkerError;
    workerRef.current.postMessage({ code, visibleTestCases });
  }

  function handleWorkerMessage({ data: { results, error } }) {
    clearTimeout(timeoutRef.current);
    setRunning(false);
    if (error) setRunError(error);
    else setResults(results);
  }

  function handleWorkerError(e) {
    clearTimeout(timeoutRef.current);
    setRunning(false);
    setRunError(e.message || 'Worker error');
  }

  function handleExport() {
    const name = studentName.trim();
    if (!name) { alert('Please enter your name.'); return; }
    const payload = {
      platformVersion: '1.0',
      exerciseId: exercise.id,
      exerciseTitle: exercise.title,
      exerciseType: 'PYTHON',
      exerciseVersion: version.versionNumber,
      studentName: name,
      answer: code,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_')}_${exercise.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportModal(false);
    setStudentName('');
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h1>{exercise.title}</h1>
      <div style={{ color: '#555', marginBottom: 16 }}>
        <MarkdownRenderer content={version.description} />
      </div>

      <Editor
        height="320px"
        language="python"
        value={code}
        onChange={v => setCode(v || '')}
        options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
        theme="vs-dark"
      />

      <div style={{ display: 'flex', gap: 12, margin: '16px 0', flexWrap: 'wrap' }}>
        <button
          onClick={handleRun}
          disabled={running}
          style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}
        >
          {running ? 'Running…' : 'Run'}
        </button>

        {hints.length > 0 && (
          <button
            onClick={() => setHintIndex(i => Math.min(i + 1, hints.length - 1))}
            disabled={hintIndex >= hints.length - 1}
            style={{ border: '1px solid #ddd', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}
          >
            {hintIndex < 0 ? 'Hint' : `Hint (${hintIndex + 1}/${hints.length})`}
          </button>
        )}

        <button
          onClick={() => setExportModal(true)}
          style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer', marginLeft: 'auto' }}
        >
          Export
        </button>
      </div>

      {hintIndex >= 0 && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 4, padding: 12, marginBottom: 16 }}>
          {hints[hintIndex]}
        </div>
      )}

      <h3>Test Cases</h3>
      {visibleTestCases.length === 0 ? (
        <p style={{ color: '#888' }}>No visible test cases for this exercise.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleTestCases.map((tc, i) => {
            const res = results?.[i];
            const bg = res ? (res.passed ? '#e8f5e9' : '#fce4ec') : '#f5f5f5';
            const icon = res ? (res.passed ? '✅' : '❌') : '○';
            return (
              <div key={i} style={{ background: bg, border: '1px solid #ddd', borderRadius: 4, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{icon}</span>
                  <code style={{ fontSize: 13 }}>{tc.input}</code>
                </div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                  Expected: <code>{tc.expectedOutput}</code>
                </div>
                {res && !res.passed && res.actual !== null && (
                  <div style={{ fontSize: 12, color: '#c62828', marginTop: 2 }}>
                    Got: <code>{res.actual}</code>
                  </div>
                )}
                {res?.error && (
                  <div style={{ fontSize: 12, color: '#c62828', marginTop: 2 }}>
                    Error: {res.error}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>
        + hidden tests will also run on grading
      </p>

      {tle && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 4, padding: 12, marginTop: 12 }}>
          ⚠ Time Limit Exceeded ({timeLimitSeconds}s)
        </div>
      )}
      {runError && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 4, padding: 12, marginTop: 12 }}>
          Error: {runError}
        </div>
      )}

      {exportModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320 }}>
            <h2 style={{ marginTop: 0 }}>Export Answer</h2>
            <label style={{ display: 'block', marginBottom: 8 }}>Your name:</label>
            <input
              type="text"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleExport()}
              style={{ width: '100%', padding: 8, marginBottom: 16, boxSizing: 'border-box' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setExportModal(false)}>Cancel</button>
              <button
                onClick={handleExport}
                style={{ background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}
              >
                Download JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
