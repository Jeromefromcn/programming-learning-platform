import { useEffect, useState } from 'react';
import { exerciseApi } from '../../api/exerciseApi';
import { submissionApi } from '../../api/submissionApi';

export default function DataManagementPage() {
  const [exercises, setExercises] = useState([]);
  const [form, setForm] = useState({ before: '', exerciseId: '', source: '' });
  const [previewCount, setPreviewCount] = useState(null);
  const [loading, setLoading] = useState({ preview: false, soft: false, hard: false });
  const [toast, setToast] = useState('');

  useEffect(() => {
    exerciseApi.list({ size: 1000 }).then(res => setExercises(res.content ?? []));
  }, []);

  function handleFormChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setPreviewCount(null);
  }

  function buildParams() {
    return {
      before: form.before,
      exerciseId: form.exerciseId ? Number(form.exerciseId) : undefined,
      source: form.source || undefined,
    };
  }

  async function handlePreview() {
    setLoading(l => ({ ...l, preview: true }));
    try {
      const res = await submissionApi.previewPurge(buildParams());
      setPreviewCount(res.count);
    } catch {
      showToast('Preview failed — please try again.');
    } finally {
      setLoading(l => ({ ...l, preview: false }));
    }
  }

  async function handlePurge(mode) {
    const sourceLabel = form.source || 'all sources';
    const exLabel = exercises.find(e => String(e.id) === form.exerciseId)?.title ?? 'all exercises';
    const msg = mode === 'HARD'
      ? `Permanently delete ${previewCount} submissions created before ${form.before} (exercise: ${exLabel}, source: ${sourceLabel})? This cannot be undone and rows will be removed from the database.`
      : `Soft-delete ${previewCount} submissions created before ${form.before} (exercise: ${exLabel}, source: ${sourceLabel})? Records will be marked as deleted but remain in the database.`;

    if (!window.confirm(msg)) return;

    const key = mode === 'HARD' ? 'hard' : 'soft';
    setLoading(l => ({ ...l, [key]: true }));
    try {
      const res = await submissionApi.purge({ ...buildParams(), mode });
      const count = res.deletedCount;
      showToast(mode === 'HARD'
        ? `${count} submissions permanently deleted.`
        : `${count} submissions soft-deleted.`);
      setPreviewCount(null);
    } catch {
      showToast('Purge failed — please try again.');
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  }

  const previewDisabled = !form.before || loading.preview;
  const purgeDisabled = previewCount === null;

  return (
    <div style={{ padding: 32, maxWidth: 640 }}>
      <h1>Data Management</h1>

      {toast && (
        <div role="status" style={{ marginBottom: 16, padding: 12, background: '#e8f5e9', borderRadius: 4, color: '#2e7d32' }}>
          {toast}
        </div>
      )}

      <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 16 }}>Purge Submissions</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label htmlFor="before-date" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Before Date (required)
          </label>
          <input
            id="before-date"
            type="date"
            value={form.before}
            onChange={e => handleFormChange('before', e.target.value)}
            aria-label="Before date"
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
          />
        </div>

        <div>
          <label htmlFor="exercise-filter" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Exercise (optional)
          </label>
          <select
            id="exercise-filter"
            value={form.exerciseId}
            onChange={e => handleFormChange('exerciseId', e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14, minWidth: 220 }}
          >
            <option value="">All exercises</option>
            {exercises.map(ex => (
              <option key={ex.id} value={ex.id}>{ex.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="source-filter" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Source (optional)
          </label>
          <select
            id="source-filter"
            value={form.source}
            onChange={e => handleFormChange('source', e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
          >
            <option value="">All sources</option>
            <option value="IMPORT">IMPORT</option>
            <option value="ONLINE">ONLINE</option>
          </select>
        </div>

        <div>
          <button
            onClick={handlePreview}
            disabled={previewDisabled}
            style={{
              background: '#1976d2', color: '#fff', border: 'none',
              padding: '8px 20px', borderRadius: 4, fontSize: 14,
              cursor: previewDisabled ? 'not-allowed' : 'pointer', opacity: previewDisabled ? 0.6 : 1,
            }}
          >
            {loading.preview ? 'Loading…' : 'Preview'}
          </button>
        </div>

        {previewCount !== null && (
          <div style={{ padding: 12, background: '#e3f2fd', borderRadius: 4, fontWeight: 600, color: '#1565c0' }}>
            {previewCount} submissions match these filters
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={() => handlePurge('SOFT')}
            disabled={purgeDisabled || loading.soft}
            style={{
              background: purgeDisabled ? '#ccc' : '#388e3c', color: '#fff', border: 'none',
              padding: '8px 20px', borderRadius: 4, fontSize: 14,
              cursor: (purgeDisabled || loading.soft) ? 'not-allowed' : 'pointer',
            }}
          >
            {loading.soft ? 'Deleting…' : `Soft Delete${previewCount !== null ? ` (${previewCount} records)` : ''}`}
          </button>

          <div>
            <button
              onClick={() => handlePurge('HARD')}
              disabled={purgeDisabled || loading.hard}
              style={{
                background: purgeDisabled ? '#ccc' : '#c62828', color: '#fff', border: 'none',
                padding: '8px 20px', borderRadius: 4, fontSize: 14,
                cursor: (purgeDisabled || loading.hard) ? 'not-allowed' : 'pointer',
              }}
            >
              {loading.hard ? 'Deleting…' : `Hard Delete${previewCount !== null ? ` (${previewCount} records)` : ''}`}
            </button>
            <div style={{ fontSize: 11, color: '#c62828', marginTop: 4 }}>Permanent — cannot be undone</div>
          </div>
        </div>
      </div>
    </div>
  );
}
