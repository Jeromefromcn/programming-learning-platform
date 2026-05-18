import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { submissionApi, csvExportUrl } from '../../api/submissionApi';
import Pagination from '../../components/Pagination';

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export default function SubmissionListPage() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [studentName, setStudentName] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchSubmissions = useCallback(async (params) => {
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
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedFetch = useCallback(debounce(fetchSubmissions, 300), [fetchSubmissions]);

  useEffect(() => {
    const params = { page, size: 20 };
    if (studentName.trim()) params.studentName = studentName.trim();
    if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
    debouncedFetch(params);
  }, [page, studentName, exerciseId, debouncedFetch]);

  async function handleDelete(e, id) {
    e.stopPropagation();
    if (!window.confirm('Delete this submission? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await submissionApi.delete(id);
      if (submissions.length === 1 && page > 0) {
        setPage(page - 1); // useEffect will fetch the previous page
      } else {
        const params = { page, size: 20 };
        if (studentName.trim()) params.studentName = studentName.trim();
        if (exerciseId.trim()) params.exerciseId = exerciseId.trim();
        fetchSubmissions(params);
      }
    } catch {
      alert('Failed to delete submission.');
    } finally {
      setDeletingId(null);
    }
  }

  const csvHref = csvExportUrl(exerciseId.trim() || null);

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Submissions</h1>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href={csvHref} download style={{
            background: '#388e3c', color: '#fff', padding: '8px 18px', borderRadius: 4,
            textDecoration: 'none', fontSize: 14,
          }}>
            Export CSV
          </a>
          <button
            onClick={() => navigate('/tutor/submissions/import')}
            style={{
              background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4,
              padding: '8px 18px', cursor: 'pointer', fontSize: 14,
            }}
          >
            Import Files
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Filter by student name…"
          value={studentName}
          onChange={e => { setStudentName(e.target.value); setPage(0); }}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', flex: 1 }}
        />
        <input
          placeholder="Filter by exercise ID…"
          value={exerciseId}
          onChange={e => { setExerciseId(e.target.value); setPage(0); }}
          style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', width: 180 }}
        />
      </div>

      {loading ? (
        <p style={{ color: '#888' }}>Loading…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
              {['Student Name', 'Exercise', 'Type', 'Auto Score', 'Tutor Score', 'Mismatch', 'Date', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #ddd' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {submissions.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#888' }}>No submissions found.</td></tr>
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
                  {sub.versionMismatch && (
                    <span style={{
                      background: '#fff3e0', color: '#e65100', padding: '2px 8px',
                      borderRadius: 4, fontSize: 12, fontWeight: 600,
                    }}>Mismatch</span>
                  )}
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
