import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { exerciseApi } from '../../api/exerciseApi';
import { categoryApi } from '../../api/categoryApi';
import Pagination from '../../components/Pagination';

const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const STATUS_COLORS = { DRAFT: '#888', PUBLISHED: '#2e7d32' };

export default function ExerciseManagementPage() {
  const [exercises, setExercises] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);

  const [pendingFilters, setPendingFilters] = useState({
    type: '', status: '', categoryId: '', difficulty: '', title: '',
  });
  const [filters, setFilters] = useState({
    type: '', status: '', categoryId: '', difficulty: '', title: '',
  });

  async function load(p = 0, f = filters) {
    setLoading(true);
    try {
      const params = { page: p, size: 20 };
      if (f.type) params.type = f.type;
      if (f.status) params.status = f.status;
      if (f.categoryId) params.categoryId = f.categoryId;
      if (f.difficulty) params.difficulty = f.difficulty;
      if (f.title) params.title = f.title;

      const data = await exerciseApi.list(params);
      setExercises(data.content);
      setTotalPages(data.totalPages);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    categoryApi.list(0, 200).then(d => setCategories(d.content));
  }, []);

  useEffect(() => { load(0, filters); }, [filters]); // load is recreated each render; omitting it is intentional

  function handleSearch() {
    setFilters({ ...pendingFilters });
  }

  async function handleDelete(ex) {
    if (!confirm(`Delete exercise "${ex.title}"?`)) return;
    try {
      await exerciseApi.delete(ex.id);
      load(page, filters);
    } catch {
      alert('Failed to delete exercise.');
    }
  }

  async function handlePublishToggle(ex) {
    try {
      if (ex.status === 'PUBLISHED') {
        await exerciseApi.unpublish(ex.id);
      } else {
        await exerciseApi.publish(ex.id);
      }
      load(page, filters);
    } catch {
      alert('Failed to update status.');
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Exercise Management</h1>
        <Link to="/tutor/exercises/new"
          style={{ background: '#1976d2', color: '#fff', padding: '8px 16px', borderRadius: 4, textDecoration: 'none' }}>
          + New Exercise
        </Link>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Search title…"
          value={pendingFilters.title}
          onChange={e => setPendingFilters(p => ({ ...p, title: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, width: 200 }}
        />
        <select value={pendingFilters.type}
          onChange={e => setPendingFilters(p => ({ ...p, type: e.target.value }))}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Types</option>
          <option value="BLOCKLY">Blockly</option>
          <option value="PYTHON">Python</option>
        </select>
        <select value={pendingFilters.status}
          onChange={e => setPendingFilters(p => ({ ...p, status: e.target.value }))}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
        </select>
        <select value={pendingFilters.difficulty}
          onChange={e => setPendingFilters(p => ({ ...p, difficulty: e.target.value }))}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
        <select value={pendingFilters.categoryId}
          onChange={e => setPendingFilters(p => ({ ...p, categoryId: e.target.value }))}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          onClick={handleSearch}
          style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Search
        </button>
      </div>

      {loading ? <p style={{ marginTop: 24 }}>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Title</th>
              <th style={{ padding: 8 }}>Type</th>
              <th style={{ padding: 8 }}>Difficulty</th>
              <th style={{ padding: 8 }}>Category</th>
              <th style={{ padding: 8 }}>Version</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map(ex => (
              <tr key={ex.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>
                  <Link to={`/tutor/exercises/${ex.id}/edit`} style={{ color: '#1976d2' }}>{ex.title}</Link>
                </td>
                <td style={{ padding: 8 }}>{ex.type}</td>
                <td style={{ padding: 8 }}>{DIFFICULTY_LABELS[ex.difficulty] || ex.difficulty}</td>
                <td style={{ padding: 8 }}>{ex.category?.name || '—'}</td>
                <td style={{ padding: 8 }}>v{ex.currentVersionNumber}</td>
                <td style={{ padding: 8 }}>
                  <span style={{ color: STATUS_COLORS[ex.status] || '#333', fontWeight: 600 }}>
                    {ex.status}
                  </span>
                </td>
                <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                  <button onClick={() => handlePublishToggle(ex)}
                    style={{ padding: '3px 8px', cursor: 'pointer', borderRadius: 4,
                             border: '1px solid #1976d2', color: '#1976d2', background: 'none' }}>
                    {ex.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button onClick={() => handleDelete(ex)}
                    style={{ padding: '3px 8px', cursor: 'pointer', borderRadius: 4,
                             border: '1px solid #c62828', color: '#c62828', background: 'none' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {exercises.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: 24, color: '#999', textAlign: 'center' }}>
                  No exercises yet. <Link to="/tutor/exercises/new">Create one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={(p) => load(p, filters)} />
    </div>
  );
}
