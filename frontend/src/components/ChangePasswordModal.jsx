import { useState } from 'react';
import { userApi } from '../api/userApi';

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await userApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      onClose();
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setError(code === 'WRONG_CURRENT_PASSWORD' ? 'Current password is incorrect' : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form role="dialog" aria-modal="true" aria-labelledby="cpw-title" onSubmit={submit} style={{ background: '#fff', borderRadius: 8, padding: 32, width: 400 }}>
        <h3 id="cpw-title" style={{ marginBottom: 16 }}>Change Password</h3>
        {error && <div role="alert" style={{ marginBottom: 12, color: '#c62828' }}>{error}</div>}
        {[
          ['currentPassword', 'Current Password', 'current-password'],
          ['newPassword', 'New Password', 'new-password'],
          ['confirmPassword', 'Confirm New Password', 'confirm-password'],
        ].map(([k, label, id]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label htmlFor={id}>{label}</label>
            <input id={id} type="password" value={form[k]} onChange={update(k)} required
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
