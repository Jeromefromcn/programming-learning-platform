import { useEffect, useState } from 'react';
import { settingsApi } from '../../api/settingsApi';
import { SECTIONS } from '../../components/sectionConfig';

const ROLES = ['STUDENT', 'TUTOR', 'SUPER_ADMIN'];

const FORCED_ON = {
  exercises: ['STUDENT', 'TUTOR', 'SUPER_ADMIN'],
  settings: ['SUPER_ADMIN'],
};
const DISABLED_FOR = {
  users: ['STUDENT', 'TUTOR'],
  settings: ['STUDENT', 'TUTOR'],
};

function isForced(sectionKey, role) {
  return (FORCED_ON[sectionKey] ?? []).includes(role);
}

function isDisabled(sectionKey, role) {
  return isForced(sectionKey, role) || (DISABLED_FOR[sectionKey] ?? []).includes(role);
}

export default function GlobalSettingsPage() {
  const [courseFilterEnabled, setCourseFilterEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [fullConfig, setFullConfig] = useState(null);
  const [editConfig, setEditConfig] = useState(null);
  const [menuSaving, setMenuSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      settingsApi.get(),
      settingsApi.getFullMenuConfig(),
    ]).then(([settings, config]) => {
      setCourseFilterEnabled(settings.courseFilterEnabled);
      setFullConfig(config);
      setEditConfig(JSON.parse(JSON.stringify(config)));
    }).finally(() => setLoading(false));
  }, []);

  async function handleToggle() {
    const newValue = !courseFilterEnabled;
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
      setCourseFilterEnabled(res.courseFilterEnabled);
      setToast(res.message ?? (newValue ? 'Course filter enabled' : 'Course filter disabled'));
      setTimeout(() => setToast(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  function toggleSection(role, sectionKey) {
    if (isDisabled(sectionKey, role)) return;
    setEditConfig(prev => {
      const current = prev[role] ?? [];
      const next = current.includes(sectionKey)
        ? current.filter(s => s !== sectionKey)
        : [...current, sectionKey];
      return { ...prev, [role]: next };
    });
  }

  function isChecked(role, sectionKey) {
    return (editConfig?.[role] ?? []).includes(sectionKey);
  }

  async function handleMenuSave() {
    setMenuSaving(true);
    try {
      await settingsApi.updateMenuConfig(editConfig);
      setFullConfig(JSON.parse(JSON.stringify(editConfig)));
      setToast('Menu configuration saved');
      setTimeout(() => setToast(''), 4000);
    } catch {
      setToast('Failed to save — please try again');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setMenuSaving(false);
    }
  }

  function handleMenuReset() {
    setEditConfig(JSON.parse(JSON.stringify(fullConfig)));
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
            background: courseFilterEnabled ? '#388e3c' : '#ccc', position: 'relative', transition: 'background 0.2s',
          }}>
          <span style={{
            position: 'absolute', top: 3, left: courseFilterEnabled ? 30 : 4,
            width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
        <span style={{ color: courseFilterEnabled ? '#388e3c' : '#757575' }}>
          {courseFilterEnabled ? 'ON — Students see only enrolled-course exercises' : 'OFF — Students see all published exercises'}
        </span>
      </div>

      {editConfig && (
        <div style={{ marginTop: 48 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Menu Visibility</h2>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
            Choose which sections each role sees in the left menu. Changes take effect on next login.
          </p>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#e3f2fd' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', border: '1px solid #bbdefb', minWidth: 180 }}>Section</th>
                {ROLES.map(r => (
                  <th key={r} style={{ padding: '10px 16px', textAlign: 'center', border: '1px solid #bbdefb', width: 110 }}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section, i) => (
                <tr key={section.key} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 16px', border: '1px solid #e0e0e0' }}>
                    {section.icon} {section.label}
                  </td>
                  {ROLES.map(role => (
                    <td key={role} style={{ padding: '10px 16px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isChecked(role, section.key)}
                        disabled={isDisabled(section.key, role)}
                        onChange={() => toggleSection(role, section.key)}
                        style={{ width: 15, height: 15, cursor: isDisabled(section.key, role) ? 'not-allowed' : 'pointer' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={handleMenuSave}
              disabled={menuSaving}
              style={{ background: '#1976d2', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 4, fontSize: 13, cursor: menuSaving ? 'not-allowed' : 'pointer' }}
            >
              {menuSaving ? 'Saving…' : 'Save Configuration'}
            </button>
            <button
              onClick={handleMenuReset}
              disabled={menuSaving}
              style={{ background: '#fff', color: '#555', border: '1px solid #ccc', padding: '8px 20px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}
            >
              Discard Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
