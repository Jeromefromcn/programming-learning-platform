import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submissionApi } from '../../api/submissionApi';
import Pagination from '../../components/Pagination';

export default function SubmissionListPage() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [pendingStudentName, setPendingStudentName] = useState('');
  const [pendingExerciseId, setPendingExerciseId] = useState('');
  const [pendingBatchId, setPendingBatchId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [source, setSource] = useState('IMPORT');
  const [pendingSource, setPendingSource] = useState('IMPORT');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  async function fetchSubmissions(params) {
    setLoading(true);
    try {
      const data = await submissionApi.list(params);
      setSubmissions(data.content);
      setTotalPages(data.totalPages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = { page, size: 20, source };
    if (studentName.trim()) params.studentName = studentName.trim();
    if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
    if (batchId.trim()) params.batchId = batchId.trim();
    fetchSubmissions(params);
  }, [page, studentName, exerciseId, batchId, source]);

  function handleSearch() {
    setPage(0);
    setStudentName(pendingStudentName);
    setExerciseId(pendingExerciseId);
    setBatchId(pendingBatchId);
    setSource(pendingSource);
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!window.confirm('Delete this submission? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await submissionApi.delete(id);
      if (submissions.length === 1 && page > 0) {
        setPage(page - 1); // useEffect will fetch the previous page
      } else {
        const params = { page, size: 20, source };
        if (studentName.trim()) params.studentName = studentName.trim();
        if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
        if (batchId.trim()) params.batchId = batchId.trim();
        fetchSubmissions(params);
      }
    } catch {
      alert('Failed to delete submission.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Submissions</h1>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input
          placeholder="Filter by student name…"
          value={pendingStudentName}
          onChange={e => setPendingStudentName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', flex: 1 }}
        />
        <input
          placeholder="Filter by exercise ID…"
          value={pendingExerciseId}
          onChange={e => setPendingExerciseId(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', width: 180 }}
        />
        <input
          placeholder="Filter by batch ID…"
          value={pendingBatchId}
          onChange={e => setPendingBatchId(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', width: 160 }}
        />
        <label>
          Source:
          <select value={pendingSource} onChange={e => setPendingSource(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="IMPORT">Imported</option>
            <option value="STUDENT">Student</option>
          </select>
        </label>
        <button
          onClick={handleSearch}
          style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Search
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
              {['Student Name', 'Exercise', 'Type', 'Auto Score', 'Tutor Score', 'Graded', 'Mismatch', 'Batch', 'Date', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 ? (
              <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No submissions found.</td></tr>
            ) : submissions.map(sub => (
              <tr
                key={sub.id}
                onClick={() => navigate(`/tutor/submissions/${sub.id}`)}
                style={{ cursor: 'pointer', borderBottom: '1px solid #eee' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                <td style={{ padding: '10px 12px' }}>{sub.studentName}</td>
                <td style={{ padding: '10px 12px' }}>{sub.exerciseTitle}</td>
                <td style={{ padding: '10px 12px' }}>{sub.exerciseType}</td>
                <td style={{ padding: '10px 12px' }}>{sub.autoScore ?? '—'}</td>
                <td style={{ padding: '10px 12px' }}>{sub.tutorScore ?? '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  {sub.graded ? (
                    <span style={{
                      background: '#e3f2fd', color: '#1565c0',
                      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                    }}>Graded</span>
                  ) : '—'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {sub.versionMismatch && (
                    <span style={{
                      background: '#fff3e0', color: '#e65100', padding: '2px 8px',
                      borderRadius: 4, fontSize: 12, fontWeight: 600,
                    }}>Mismatch</span>
                  )}
                </td>
                <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                  {sub.batchId ?? ''}
                </td>
                <td style={{ padding: '10px 12px', color: '#888', fontSize: 12 }}>
                  {new Date(sub.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <button
                    onClick={e => handleDelete(e, sub.id)}
                    disabled={deletingId === sub.id}
                    style={{
                      padding: '3px 10px', color: '#c62828', background: 'none',
                      border: '1px solid #c62828', borderRadius: 4,
                      cursor: deletingId === sub.id ? 'default' : 'pointer', fontSize: 12,
                      opacity: deletingId === sub.id ? 0.5 : 1,
                    }}
                  >
                    {deletingId === sub.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
