import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { submissionApi } from '../../api/submissionApi';
import Breadcrumb from '../../components/Breadcrumb';

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

  useEffect(() => {
    submissionApi.getById(id).then(data => {
      setSubmission(data);
      if (data.tutorScore != null) setTutorScore(String(data.tutorScore));
      if (data.tutorComment) setTutorComment(data.tutorComment);
    });
  }, [id]);

  useEffect(() => {
    if (!submission || !editorRef.current) return;
    import('monaco-editor').then(monaco => {
      if (monacoRef.current) monacoRef.current.dispose();
      monacoRef.current = monaco.editor.create(editorRef.current, {
        value: submission.answerData || '',
        language: submission.exerciseType === 'PYTHON' ? 'python' : 'javascript',
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
      setSaveError(err.response?.data?.error?.message || 'Save failed.');
    } finally {
      setSaving(false);
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
      <div ref={editorRef} style={{ height: 300, border: '1px solid #ddd', borderRadius: 4, marginBottom: 24 }} />

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
    </div>
  );
}
