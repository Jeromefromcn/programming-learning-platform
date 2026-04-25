import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../api/authApi';

const ROLE_ROUTES = { STUDENT: '/student', TUTOR: '/tutor', SUPER_ADMIN: '/admin' };

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login(username, password);
      login(data.accessToken, data.user);
      navigate(ROLE_ROUTES[data.user.role] ?? '/student', { replace: true });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'ACCOUNT_DISABLED') {
        setError('Account disabled — please contact an administrator');
      } else {
        setError('Invalid username or password');
      }
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <form onSubmit={handleSubmit} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 32, width: 360 }}>
        <h2 style={{ marginBottom: 24 }}>Programming Exercise Platform</h2>
        {error && (
          <div role="alert" style={{ marginBottom: 16, padding: 10, background: '#fdecea', color: '#c62828', borderRadius: 4 }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="username">Username</label>
          <input id="username" value={username} onChange={e => setUsername(e.target.value)}
            required autoComplete="username"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            required autoComplete="current-password"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: 10, background: loading ? '#90caf9' : '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
}
