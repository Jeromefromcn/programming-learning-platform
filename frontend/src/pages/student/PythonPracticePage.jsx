import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { formatDateTime } from '../../utils/dateFormat';
import { studentApi } from '../../api/studentApi';
import { useAuth } from '../../contexts/AuthContext';

const OUTPUT_STYLE = {
  background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace',
  fontSize: 13, padding: 12, borderRadius: 4,
  maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', margin: 0,
};

export default function PythonPracticePage({ exercise }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const version = exercise.version;
  const config = version.config;
  const visibleTestCases = config.visibleTestCases || [];
  const timeLimitSeconds = config.timeLimitSeconds || 5;
  const hints = version.hints || [];
  const deadlinePassed = exercise.deadline != null && new Date(exercise.deadline) < new Date();

  const [code, setCode] = useState(config.starterCode || '');
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const [pyodideReady, setPyodideReady] = useState(false);
  const [tle, setTle] = useState(false);
  const [runError, setRunError] = useState(null);
  const [hintIndex, setHintIndex] = useState(-1);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [savedToast, setSavedToast] = useState(false);
  const workerRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../../workers/pyodideRunner.worker.js', import.meta.url),
      { type: 'classic' }
    );
    workerRef.current.onmessage = handleWorkerMessage;
    workerRef.current.onerror = handleWorkerError;
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  useEffect(() => {
    studentApi.getDraft(exercise.id)
      .then(d => { if (d && d.answerData != null) setCode(d.answerData); })
      .catch(() => { /* no draft / ignore */ });
  }, [exercise.id]);

  function handleRun() {
    if (!workerRef.current || running || !pyodideReady) return;
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
      setPyodideReady(false);
    }, timeLimitSeconds * 1000 + 500);

    workerRef.current.postMessage({ code, visibleTestCases });
  }

  function handleWorkerMessage({ data }) {
    if (data.type === 'ready') {
      setPyodideReady(true);
      return;
    }
    clearTimeout(timeoutRef.current);
    setRunning(false);
    if (data.error) setRunError(data.error);
    else setResults(data.results);
  }

  function handleWorkerError(e) {
    clearTimeout(timeoutRef.current);
    setRunning(false);
    setRunError(e.message || 'Worker error');
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      await studentApi.saveDraft(exercise.id, { answerData: code });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitResult(null);
    setSubmitError(null);
    try { await studentApi.saveDraft(exercise.id, { answerData: code }); } catch { /* best-effort */ }
    try {
      const res = await studentApi.submit(exercise.id, { answerData: code });
      setSubmitResult(res);
    } catch (e) {
      setSubmitError(e.response?.data?.error?.message || 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleExport() {
    const payload = {
      platformVersion: '1.0',
      exerciseId: exercise.id,
      exerciseTitle: exercise.title,
      exerciseType: 'PYTHON',
      exerciseVersion: version.versionNumber,
      studentName: user.username,
      displayName: user.displayName,
      answer: code,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${user.username}_${exercise.title.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/student/exercises')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, marginBottom: 16, fontSize: 14 }}
      >
        ← Back to exercises
      </button>
      <h1>{exercise.title}</h1>
      {exercise.deadline && (
        <p style={{ fontSize: 13, color: deadlinePassed ? '#c62828' : '#555', margin: '0 0 12px' }}>
          Deadline: {formatDateTime(exercise.deadline)}
          {deadlinePassed && ' — the deadline for this exercise has passed. Submissions are closed.'}
        </p>
      )}
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
          disabled={running || !pyodideReady}
          title={pyodideReady ? undefined : 'Loading Python environment…'}
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

        <button onClick={handleSaveDraft} disabled={saving}
          style={{ border: '1px solid #1976d2', color: '#1976d2', background: '#fff', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={handleSubmit} disabled={submitting || deadlinePassed}
          style={{ background: '#7b1fa2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px',
            cursor: deadlinePassed ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>

        <button
          onClick={handleExport}
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

      {savedToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#323232', color: '#fff', padding: '10px 20px', borderRadius: 4, zIndex: 1100 }}>
          Saved
        </div>
      )}

      {submitResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320, textAlign: 'center' }}>
            {submitResult.showResult ? (
              <>
                <h2 style={{ marginTop: 0 }}>
                  {submitResult.passed ? '✅ Passed' : '❌ Failed'}
                </h2>
                <p style={{ fontSize: 32, margin: '8px 0' }}>{submitResult.score}</p>
              </>
            ) : (
              <h2 style={{ marginTop: 0 }}>Submitted</h2>
            )}
            <button onClick={() => setSubmitResult(null)}
              style={{ marginTop: 16, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, color: '#c62828' }}>Submission Failed</h2>
            <p>{submitError}</p>
            <button onClick={() => setSubmitError(null)}
              style={{ marginTop: 16, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 24px', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
