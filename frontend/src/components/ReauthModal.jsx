import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/authApi';

export default function ReauthModal() {
  const { reauthVisible, onReauthSuccess, onReauthCancel } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!reauthVisible) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login(username, password);
      setUsername('');
      setPassword('');
      onReauthSuccess(data.accessToken, data.user);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'ACCOUNT_DISABLED') {
        setError('Account disabled — please contact an administrator');
      } else if (code === 'ACCOUNT_EXPIRED') {
        setError('Account expired — please contact an administrator');
      } else if (code === 'RATE_LIMITED') {
        setError('Too many login attempts. Please try again in 1 minute.');
      } else {
        setError('Invalid username or password');
      }
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, fontFamily: 'sans-serif',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', borderRadius: 8, padding: 32, width: 360,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <h2 style={{ marginBottom: 8 }}>Session Expired</h2>
        <p style={{ marginBottom: 24, color: '#555', fontSize: 14 }}>
          Please log in to continue.
        </p>
        {error && (
          <div role="alert" style={{
            marginBottom: 16, padding: 10,
            background: '#fdecea', color: '#c62828', borderRadius: 4,
          }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="reauth-username">Username</label>
          <input
            id="reauth-username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoComplete="username"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="reauth-password">Password</label>
          <input
            id="reauth-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onReauthCancel}
            disabled={loading}
            style={{
              padding: '10px 20px', border: '1px solid #ccc', borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer', background: '#fff',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: loading ? '#90caf9' : '#1976d2',
              color: '#fff', border: 'none', borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </div>
      </form>
    </div>
  );
}
