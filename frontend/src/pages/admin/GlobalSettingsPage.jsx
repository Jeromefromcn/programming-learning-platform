import { useEffect, useState } from 'react';
import { settingsApi } from '../../api/settingsApi';

export default function GlobalSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    settingsApi.get().then(d => setEnabled(d.courseFilterEnabled)).finally(() => setLoading(false));
  }, []);

  async function handleToggle() {
    const newValue = !enabled;

    if (newValue) {
      const impact = await settingsApi.getImpact();
      const count = impact.unenrolledStudentCount;
      const msg = count === 0
        ? 'No students are currently unenrolled. Enable the course filter?'
        : `${count} student(s) have no course enrollment and will see no exercises. Enable the filter anyway?`;
      if (!confirm(msg)) return;
    }

    setSaving(true);
    try {
      const res = await settingsApi.updateCourseFilter(newValue);
      setEnabled(res.courseFilterEnabled);
      setToast(res.message ?? (newValue ? 'Course filter enabled' : 'Course filter disabled'));
      setTimeout(() => setToast(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <div style={{ padding: 32 }}>
      <h1>Global Settings</h1>

      {toast && (
        <div role="status" style={{ marginBottom: 16, padding: 12, background: '#e8f5e9', borderRadius: 4, color: '#2e7d32' }}>
          {toast}
        </div>
      )}

      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>Course Filter</span>
        <button
          onClick={handleToggle}
          disabled={saving}
          style={{
            width: 56, height: 28, borderRadius: 14, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: enabled ? '#388e3c' : '#ccc', position: 'relative', transition: 'background 0.2s',
          }}>
          <span style={{
            position: 'absolute', top: 3, left: enabled ? 30 : 4,
            width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
        <span style={{ color: enabled ? '#388e3c' : '#757575' }}>
          {enabled ? 'ON — Students see only enrolled-course exercises' : 'OFF — Students see all published exercises'}
        </span>
      </div>
    </div>
  );
}
