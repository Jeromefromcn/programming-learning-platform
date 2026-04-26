import { useEffect, useState } from 'react';
import { categoryApi } from '../../api/categoryApi';

export default function CategoryManagementPage() {
  const [categories, setCategories] = useState([]);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await categoryApi.list();
      setCategories(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddError('');
    try {
      await categoryApi.create(newName.trim());
      setNewName('');
      load();
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setAddError(code === 'CATEGORY_DUPLICATE'
        ? 'This category already exists.'
        : 'Failed to create category.');
    }
  }

  async function handleDelete(cat) {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await categoryApi.delete(cat.id);
      load();
    } catch (err) {
      const code = err.response?.data?.error?.code;
      alert(code === 'CATEGORY_HAS_EXERCISES'
        ? 'This category has exercises — please remove associations first.'
        : 'Failed to delete category.');
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h1>Category Management</h1>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginTop: 24, marginBottom: 4 }}>
        <input
          value={newName}
          onChange={e => { setNewName(e.target.value); setAddError(''); }}
          placeholder="New category name"
          style={{ padding: 8, width: 240, border: '1px solid #ccc', borderRadius: 4 }}
        />
        <button type="submit"
          style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
          + Add
        </button>
      </form>
      {addError && <p style={{ color: '#c62828', margin: '4px 0 0' }}>{addError}</p>}

      {loading ? <p style={{ marginTop: 16 }}>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Exercise Count</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => (
              <tr key={cat.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{cat.name}</td>
                <td style={{ padding: 8 }}>{cat.exerciseCount}</td>
                <td style={{ padding: 8 }}>
                  <button
                    onClick={() => handleDelete(cat)}
                    disabled={cat.exerciseCount > 0}
                    title={cat.exerciseCount > 0 ? 'Has exercises — remove associations first' : ''}
                    style={{
                      padding: '4px 10px',
                      cursor: cat.exerciseCount > 0 ? 'not-allowed' : 'pointer',
                      opacity: cat.exerciseCount > 0 ? 0.4 : 1,
                    }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 16, color: '#999', textAlign: 'center' }}>
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
