import { useState } from 'react';
import { userApi } from '../../api/userApi';

const ROLES = ['STUDENT', 'TUTOR', 'SUPER_ADMIN'];

export default function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'STUDENT' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const user = await userApi.create(form);
      onCreated(user);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setError(code === 'USERNAME_TAKEN' ? 'Username already taken' : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onSubmit={submit} style={{ background: '#fff', borderRadius: 8, padding: 32, width: 400 }}>
        <h3 style={{ marginBottom: 16 }}>New User</h3>
        {error && <div role="alert" style={{ marginBottom: 12, color: '#c62828' }}>{error}</div>}
        {[['username', 'Username'], ['displayName', 'Display Name'], ['password', 'Password']].map(([k, label]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label>{label}</label>
            <input type={k === 'password' ? 'password' : 'text'} value={form[k]}
              onChange={update(k)} required style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ marginBottom: 16 }}>
          <label>Role</label>
          <select value={form.role} onChange={update('role')}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px' }}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
