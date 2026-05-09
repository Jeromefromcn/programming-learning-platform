import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { categoryApi } from '../../api/categoryApi';

const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const TYPE_LABELS = { BLOCKLY: 'Blockly', PYTHON: 'Python' };

export default function ExerciseListPage() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ type: '', categoryId: '', difficulty: '' });

  async function load(p = 0, f = filters) {
    setLoading(true);
    try {
      const params = { page: p, size: 20 };
      if (f.type) params.type = f.type;
      if (f.categoryId) params.categoryId = f.categoryId;
      if (f.difficulty) params.difficulty = f.difficulty;
      const data = await studentApi.listExercises(params);
      setExercises(data.content);
      setTotalPages(data.totalPages);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    categoryApi.list().then(setCategories);
    load(0);
  }, []);

  function handleFilterChange(key, value) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    load(0, next);
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Exercises</h1>

      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <select value={filters.type} onChange={e => handleFilterChange('type', e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Types</option>
          <option value="BLOCKLY">Blockly</option>
          <option value="PYTHON">Python</option>
        </select>
        <select value={filters.difficulty} onChange={e => handleFilterChange('difficulty', e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
        <select value={filters.categoryId} onChange={e => handleFilterChange('categoryId', e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
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
              <th style={{ padding: 8 }}>Likes</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map(ex => (
              <tr key={ex.id}
                onClick={() => navigate(`/student/exercises/${ex.id}/practice`)}
                style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: 8, color: '#1976d2', fontWeight: 500 }}>{ex.title}</td>
                <td style={{ padding: 8 }}>{TYPE_LABELS[ex.type] || ex.type}</td>
                <td style={{ padding: 8 }}>{DIFFICULTY_LABELS[ex.difficulty] || ex.difficulty}</td>
                <td style={{ padding: 8 }}>{ex.category?.name || '—'}</td>
                <td style={{ padding: 8 }}>v{ex.currentVersionNumber}</td>
                <td style={{ padding: 8 }}>{ex.likeCount}</td>
              </tr>
            ))}
            {exercises.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, color: '#999', textAlign: 'center' }}>
                  No exercises available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
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
