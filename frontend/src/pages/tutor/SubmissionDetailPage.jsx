import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { submissionApi } from '../../api/submissionApi';
import { exerciseApi } from '../../api/exerciseApi';
import { isReauthCancelled } from '../../api/axiosInstance';
import Breadcrumb from '../../components/Breadcrumb';
import BlocklySubmissionViewer from '../../components/BlocklySubmissionViewer';

export default function SubmissionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = location.state?.backTo ?? '/tutor/submissions';
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  const [submission, setSubmission] = useState(null);
  const [rubricDimensions, setRubricDimensions] = useState(null); // null = auto type
  const [dimensionScores, setDimensionScores] = useState({});
  const [tutorScore, setTutorScore] = useState('');
  const [tutorComment, setTutorComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    submissionApi.getById(id).then(data => {
      setSubmission(data);
      if (data.tutorComment) setTutorComment(data.tutorComment);

      // Load exercise to get rubric config
      exerciseApi.get(data.exerciseId).then(ex => {
        const config = ex.currentVersion?.config;
        if (config && config.autoGrade === false && config.rubric?.dimensions?.length) {
          setRubricDimensions(config.rubric.dimensions);
          // Pre-fill from saved tutorGradeDetails if present
          if (data.tutorGradeDetails) {
            try {
              const saved = JSON.parse(data.tutorGradeDetails);
              const map = {};
              saved.forEach(d => { map[d.name] = String(d.score); });
              setDimensionScores(map);
            } catch { /* ignore */ }
          }
        } else {
          if (data.tutorScore != null) setTutorScore(String(data.tutorScore));
        }
      }).catch(() => {
        if (data.tutorScore != null) setTutorScore(String(data.tutorScore));
      });
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
    setSaveError('');
    setSaving(true);
    try {
      let payload;
      if (rubricDimensions) {
        // Validate each dimension score
        for (const d of rubricDimensions) {
          const val = parseFloat(dimensionScores[d.name]);
          if (isNaN(val) || val < 0 || val > 100) {
            setSaveError(`Score for "${d.name}" must be a number between 0 and 100.`);
            setSaving(false);
            return;
          }
        }
        payload = {
          dimensionScores: rubricDimensions.map(d => ({
            name: d.name,
            weight: d.weight,
            score: parseFloat(dimensionScores[d.name]),
          })),
          tutorComment: tutorComment || null,
        };
      } else {
        const score = parseFloat(tutorScore);
        if (isNaN(score) || score < 0 || score > 100) {
          setSaveError('Score must be a number between 0 and 100.');
          setSaving(false);
          return;
        }
        payload = { tutorScore: score, tutorComment: tutorComment || null };
      }
      await submissionApi.grade(id, payload);
      navigate(backTo);
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
      navigate(backTo);
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
        { label: 'Submissions', to: backTo },
        { label: 'Submission Detail' },
      ]} />
      <button onClick={() => navigate(backTo)}
        style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        ← Back to Submissions
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{submission.exerciseTitle}</h1>
        {submission.graded && (
          <span style={{
            background: '#1976d2', color: '#fff', borderRadius: 12,
            padding: '3px 12px', fontSize: 12, fontWeight: 700,
          }}>
            Tutor Graded
          </span>
        )}
      </div>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
        {rubricDimensions ? (
          <>
            {rubricDimensions.map(d => (
              <label key={d.name} style={{ fontSize: 14 }}>
                {d.name} <span style={{ color: '#888', fontSize: 12 }}>(weight: {d.weight})</span>:
                {d.description && (
                  <span style={{ display: 'block', color: '#666', fontSize: 12, marginTop: 2 }}>
                    {d.description}
                  </span>
                )}
                <input
                  type="number" min="0" max="100" step="0.01"
                  value={dimensionScores[d.name] ?? ''}
                  onChange={e => setDimensionScores(prev => ({ ...prev, [d.name]: e.target.value }))}
                  style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
                />
              </label>
            ))}
          </>
        ) : (
          <label style={{ fontSize: 14 }}>
            Score (0–100):
            <input
              type="number" min="0" max="100" step="0.01"
              value={tutorScore}
              onChange={e => setTutorScore(e.target.value)}
              style={{ display: 'block', width: '100%', padding: '6px 10px', marginTop: 4, borderRadius: 4, border: '1px solid #ccc' }}
            />
          </label>
        )}
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
