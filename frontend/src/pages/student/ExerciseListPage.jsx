import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { categoryApi } from '../../api/categoryApi';
import Pagination from '../../components/Pagination';

const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };
const TYPE_LABELS = { BLOCKLY: 'Blockly', PYTHON: 'Python' };

const EMPTY_FILTERS = { type: '', categoryId: '', difficulty: '' };

export default function ExerciseListPage() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [categories, setCategories] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pendingFilters, setPendingFilters] = useState(EMPTY_FILTERS);

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
    categoryApi.list(0, 200).then(d => setCategories(d.content));
    load(0);
  }, []);

  function handleSearch() {
    setFilters(pendingFilters);
    load(0, pendingFilters);
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Exercises</h1>

      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
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
          Difficulty:
          <select
            value={pendingFilters.difficulty}
            onChange={e => setPendingFilters(prev => ({ ...prev, difficulty: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value="">All Difficulties</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </label>
        <label>
          Category:
          <select
            value={pendingFilters.categoryId}
            onChange={e => setPendingFilters(prev => ({ ...prev, categoryId: e.target.value }))}
            style={{ marginLeft: 6, padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4 }}
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button
          onClick={handleSearch}
          style={{ padding: '6px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
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

      <Pagination page={page} totalPages={totalPages} onPageChange={(p) => load(p)} />
    </div>
  );
}
