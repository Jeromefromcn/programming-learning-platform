import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';

export default function CourseManagementPage() {
  const [courses, setCourses] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load(p = 0) {
    setLoading(true);
    try {
      const data = await courseApi.list(p, 20);
      setCourses(data.content);
      setTotalPages(data.totalPages);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(0); }, []);

  async function handleDelete(course) {
    if (!confirm(`Delete course "${course.name}"? This cannot be undone.`)) return;
    try {
      await courseApi.delete(course.id);
      load(page);
    } catch {
      alert('Failed to delete course.');
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Course Management</h1>
        <Link to="/tutor/courses/new"
          style={{ background: '#1976d2', color: '#fff', padding: '8px 16px', borderRadius: 4, textDecoration: 'none' }}>
          + New Course
        </Link>
      </div>

      {loading ? <p style={{ marginTop: 24 }}>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Exercises</th>
              <th style={{ padding: 8 }}>Students</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {courses.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>
                  <Link to={`/tutor/courses/${c.id}`} style={{ color: '#1976d2' }}>{c.name}</Link>
                  {c.description && (
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: '#666' }}>{c.description}</p>
                  )}
                </td>
                <td style={{ padding: 8 }}>{c.exerciseCount}</td>
                <td style={{ padding: 8 }}>{c.studentCount}</td>
                <td style={{ padding: 8, display: 'flex', gap: 8 }}>
                  <Link to={`/tutor/courses/${c.id}/edit`}
                    style={{ padding: '4px 10px', border: '1px solid #ccc', borderRadius: 4, textDecoration: 'none', color: '#333' }}>
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(c)}
                    style={{ padding: '4px 10px', cursor: 'pointer', color: '#c62828', background: 'none', border: '1px solid #c62828', borderRadius: 4 }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 24, color: '#999', textAlign: 'center' }}>
                  No courses yet. <Link to="/tutor/courses/new">Create one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => load(page - 1)} disabled={page === 0}
            style={{ padding: '4px 12px', cursor: page === 0 ? 'default' : 'pointer' }}>
            ← Prev
          </button>
          <span>Page {page + 1} of {totalPages}</span>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages - 1}
            style={{ padding: '4px 12px', cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
