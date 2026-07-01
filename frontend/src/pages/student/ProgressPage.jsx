import { useEffect, useRef, useState } from 'react';
import { progressApi } from '../../api/progressApi';
import { isReauthCancelled } from '../../api/axiosInstance';
import Pagination from '../../components/Pagination';
import BlocklySubmissionViewer from '../../components/BlocklySubmissionViewer';
import { formatDate } from '../../utils/dateFormat';

const EMPTY_FILTERS = { exercise: '', type: '', source: '' };

function ScoreChip({ score, graded }) {
  if (!graded && score == null) return <span style={{ color: '#888' }}>—</span>;
  if (!graded) return <span style={{ color: '#888', fontSize: 12 }}>Pending</span>;
  const val = score != null ? score.toFixed(1) : '—';
  const pass = score != null && score >= 60;
  return (
    <span style={{
      background: pass ? '#e8f5e9' : '#ffebee',
      color: pass ? '#2e7d32' : '#c62828',
      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
    }}>
      {val}
    </span>
  );
}

export default function ProgressPage() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pendingFilters, setPendingFilters] = useState(EMPTY_FILTERS);

  async function load(p, f) {
    setLoading(true);
    setError(null);
    try {
      const params = { page: p, size: 20 };
      if (f.exercise) params.exercise = f.exercise;
      if (f.type) params.type = f.type;
      if (f.source) params.source = f.source;
      const result = await progressApi.getProgress(params);
      setData(result);
      setPage(p);
    } catch (err) {
      if (!isReauthCancelled(err)) setError('Failed to load progress.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(0, EMPTY_FILTERS); }, []);

  function handleSearch() {
    setFilters(pendingFilters);
    load(0, pendingFilters);
  }

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;
  if (error)   return <div style={{ padding: 32, color: 'red' }}>{error}</div>;

  const { submissions } = data;

  if (selected) {
    return (
      <SubmissionViewer
        submission={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>My Progress</h2>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          Exercise:
          <input
            type="text"
            value={pendingFilters.exercise}
            onChange={e => setPendingFilters(prev => ({ ...prev, exercise: e.target.value }))}
            placeholder="Search by title"
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          />
        </label>
        <label>
          Type:
          <select
            value={pendingFilters.type}
            onChange={e => setPendingFilters(prev => ({ ...prev, type: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value="">All Types</option>
            <option value="BLOCKLY">Blockly</option>
            <option value="PYTHON">Python</option>
          </select>
        </label>
        <label>
          Source:
          <select
            value={pendingFilters.source}
            onChange={e => setPendingFilters(prev => ({ ...prev, source: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value="">All Sources</option>
            <option value="STUDENT">Submitted</option>
            <option value="IMPORT">Imported</option>
          </select>
        </label>
        <button
          onClick={handleSearch}
          style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Search
        </button>
      </div>

      {submissions.totalElements === 0 ? (
        <p style={{ color: '#888' }}>No submissions yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Exercise</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px' }}>Source</th>
              <th style={{ padding: '8px 12px' }}>Score</th>
              <th style={{ padding: '8px 12px' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {submissions.content.map(sub => (
              <tr
                key={sub.submissionId}
                onClick={() => setSelected(sub)}
                style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={{ padding: '10px 12px', fontWeight: 500 }}>{sub.exerciseTitle}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    background: sub.exerciseType === 'BLOCKLY' ? '#ede9fe' : '#dbeafe',
                    color: sub.exerciseType === 'BLOCKLY' ? '#7c3aed' : '#1d4ed8',
                    borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                  }}>
                    {sub.exerciseType}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#555' }}>
                  {sub.source === 'STUDENT' ? 'Submitted' : 'Imported'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <ScoreChip score={sub.score} graded={sub.graded} />
                </td>
                <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                  {formatDate(sub.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={submissions.totalPages} onPageChange={p => load(p, filters)} />
    </div>
  );
}

function SubmissionViewer({ submission, onBack }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const workerRef = useRef(null);
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);

  const isPython = submission.exerciseType === 'PYTHON';

  useEffect(() => {
    if (!isPython || !editorRef.current) return;
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
  }, [submission, isPython]);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  function handleRun() {
    setRunning(true);
    setOutput('');
    if (workerRef.current) workerRef.current.terminate();

    const worker = new Worker(
      new URL('../../workers/pyodide-runner.js', import.meta.url)
    );
    workerRef.current = worker;
    const timer = setTimeout(() => {
      worker.terminate();
      setOutput('Execution timed out (10s).');
      setRunning(false);
    }, 10000);
    worker.onmessage = e => {
      clearTimeout(timer);
      setOutput(e.data.output ?? e.data.error ?? '(no output)');
      setRunning(false);
      worker.terminate();
    };
    worker.onerror = () => {
      clearTimeout(timer);
      setOutput('Worker error — could not run Python.');
      setRunning(false);
      worker.terminate();
    };
    worker.postMessage({ code: submission.answerData });
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', padding: 0, marginBottom: 16 }}
      >
        ← Back to My Progress
      </button>
      <h2 style={{ marginBottom: 4 }}>{submission.exerciseTitle}</h2>
      <p style={{ color: '#555', margin: '0 0 20px', fontSize: 13 }}>
        {submission.exerciseType} · {submission.source === 'STUDENT' ? 'Submitted' : 'Imported'} ·{' '}
        {formatDate(submission.createdAt)}
      </p>

      {isPython ? (
        <>
          <div ref={editorRef} style={{ height: 300, border: '1px solid #ddd', borderRadius: 4 }} />
          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleRun}
              disabled={running}
              style={{
                background: '#388e3c', color: '#fff', border: 'none', borderRadius: 4,
                padding: '8px 20px', cursor: 'pointer', fontSize: 14,
              }}
            >
              {running ? 'Running…' : 'Run'}
            </button>
          </div>
          {output && (
            <pre style={{
              marginTop: 12, padding: '12px 16px', background: '#1e1e1e', color: '#d4d4d4',
              borderRadius: 4, fontSize: 13, whiteSpace: 'pre-wrap', overflowX: 'auto',
            }}>
              {output}
            </pre>
          )}
        </>
      ) : (
        <BlocklySubmissionViewer workspaceXml={submission.workspaceXml} />
      )}
    </div>
  );
}
