import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';

export default function CourseFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    setLoading(true);
    courseApi.get(id)
      .then(data => {
        setName(data.name);
        setDescription(data.description || '');
      })
      .catch(() => setError('Failed to load course.'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        await courseApi.update(id, { name: name.trim(), description: description.trim() });
      } else {
        await courseApi.create({ name: name.trim(), description: description.trim() });
      }
      navigate('/tutor/courses');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save course.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <div style={{ padding: 32, maxWidth: 560 }}>
      <h1>{isEdit ? 'Edit Course' : 'New Course'}</h1>

      <form onSubmit={handleSubmit} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Name <span style={{ color: '#c62828' }}>*</span>
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={200}
            required
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        {error && <p style={{ color: '#c62828', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Course'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/tutor/courses')}
            style={{ background: 'none', border: '1px solid #ccc', borderRadius: 4, padding: '8px 20px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
