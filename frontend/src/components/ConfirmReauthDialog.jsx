import { useAuth } from '../contexts/AuthContext';

export default function ConfirmReauthDialog() {
  const { confirmVisible, onConfirmLogin, onConfirmCancel } = useAuth();

  if (!confirmVisible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, fontFamily: 'sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, width: 360,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      }}>
        <p style={{ marginBottom: 20 }}>
          Your session has expired. Please log in to continue this action.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onConfirmCancel}
            style={{
              padding: '8px 16px', border: '1px solid #ccc',
              borderRadius: 4, cursor: 'pointer', background: '#fff',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirmLogin}
            style={{
              padding: '8px 16px', background: '#1976d2',
              color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}
