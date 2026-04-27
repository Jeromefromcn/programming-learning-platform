import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [tab, setTab] = useState('students');
  const [loadingCourse, setLoadingCourse] = useState(true);

  // Students state
  const [students, setStudents] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  const debouncedQ = useDebounce(searchQ, 300);

  // Exercises state (placeholder — F4 not yet built)
  const [exercises, setExercises] = useState([]);

  useEffect(() => {
    courseApi.get(id)
      .then(setCourse)
      .catch(() => navigate('/tutor/courses'))
      .finally(() => setLoadingCourse(false));
  }, [id, navigate]);

  useEffect(() => {
    if (tab === 'students') loadStudents();
    if (tab === 'exercises') loadExercises();
  }, [tab, id]);

  async function loadStudents() {
    const data = await courseApi.listStudents(id).catch(() => []);
    setStudents(data);
  }

  async function loadExercises() {
    const data = await courseApi.listExercises(id).catch(() => []);
    setExercises(data);
  }

  useEffect(() => {
    if (!debouncedQ.trim()) { setSearchResults([]); return; }
    setSearching(true);
    courseApi.searchAvailableStudents(id, debouncedQ)
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }, [debouncedQ, id]);

  async function handleEnroll(userId) {
    setEnrollError('');
    setEnrolling(true);
    try {
      const result = await courseApi.enrollStudents(id, [userId]);
      if (result.enrolled > 0) {
        setSearchQ('');
        setSearchResults([]);
        loadStudents();
      } else {
        setEnrollError(result.errors?.[0] || 'Could not enroll student.');
      }
    } catch {
      setEnrollError('Failed to enroll student.');
    } finally {
      setEnrolling(false);
    }
  }

  async function handleRemoveStudent(studentId) {
    if (!confirm('Remove this student from the course?')) return;
    try {
      await courseApi.removeStudent(id, studentId);
      loadStudents();
    } catch {
      alert('Failed to remove student.');
    }
  }

  async function handleRemoveExercise(exerciseId) {
    if (!confirm('Remove this exercise from the course?')) return;
    try {
      await courseApi.removeExercise(id, exerciseId);
      loadExercises();
    } catch {
      alert('Failed to remove exercise.');
    }
  }

  if (loadingCourse) return <div style={{ padding: 32 }}>Loading…</div>;

  const tabStyle = (active) => ({
    padding: '8px 20px',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #1976d2' : '2px solid transparent',
    color: active ? '#1976d2' : '#333',
    fontWeight: active ? 600 : 400,
    fontSize: 15,
  });

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0 }}>{course?.name}</h1>
          {course?.description && (
            <p style={{ color: '#666', marginTop: 4 }}>{course.description}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(`/tutor/courses/${id}/edit`)}
            style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
            Edit
          </button>
          <button onClick={() => navigate('/tutor/courses')}
            style={{ padding: '6px 14px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
            ← Back
          </button>
        </div>
      </div>

      <div style={{ marginTop: 32, borderBottom: '1px solid #eee' }}>
        <button style={tabStyle(tab === 'students')} onClick={() => setTab('students')}>Students</button>
        <button style={tabStyle(tab === 'exercises')} onClick={() => setTab('exercises')}>Exercises</button>
      </div>

      {tab === 'students' && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 12 }}>Enroll Students</h3>
          <div style={{ position: 'relative', maxWidth: 360 }}>
            <input
              value={searchQ}
              onChange={e => { setSearchQ(e.target.value); setEnrollError(''); }}
              placeholder="Search by username or name…"
              style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
            />
            {(searching || searchResults.length > 0) && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: 4, zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}>
                {searching && <div style={{ padding: 8, color: '#999' }}>Searching…</div>}
                {!searching && searchResults.length === 0 && searchQ.trim() && (
                  <div style={{ padding: 8, color: '#999' }}>No students found.</div>
                )}
                {searchResults.map(u => (
                  <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                    <span>{u.displayName} <span style={{ color: '#999', fontSize: 13 }}>@{u.username}</span></span>
                    <button
                      disabled={enrolling}
                      onClick={() => handleEnroll(u.id)}
                      style={{ padding: '2px 10px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      Enroll
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {enrollError && <p style={{ color: '#c62828', marginTop: 8 }}>{enrollError}</p>}

          <h3 style={{ marginTop: 32, marginBottom: 12 }}>Enrolled Students ({students.length})</h3>
          {students.length === 0 ? (
            <p style={{ color: '#999' }}>No students enrolled yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Name</th>
                  <th style={{ padding: 8 }}>Username</th>
                  <th style={{ padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8 }}>{s.displayName}</td>
                    <td style={{ padding: 8 }}>@{s.username}</td>
                    <td style={{ padding: 8 }}>
                      <button
                        onClick={() => handleRemoveStudent(s.id)}
                        style={{ padding: '3px 10px', color: '#c62828', background: 'none', border: '1px solid #c62828', borderRadius: 4, cursor: 'pointer' }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'exercises' && (
        <div style={{ marginTop: 24 }}>
          {exercises.length === 0 ? (
            <p style={{ color: '#999' }}>No exercises linked to this course yet. Exercise management will be available in a future release.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Title</th>
                  <th style={{ padding: 8 }}>Type</th>
                  <th style={{ padding: 8 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map(ex => (
                  <tr key={ex.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: 8 }}>{ex.title}</td>
                    <td style={{ padding: 8 }}>{ex.exerciseType}</td>
                    <td style={{ padding: 8 }}>
                      <button
                        onClick={() => handleRemoveExercise(ex.id)}
                        style={{ padding: '3px 10px', color: '#c62828', background: 'none', border: '1px solid #c62828', borderRadius: 4, cursor: 'pointer' }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
