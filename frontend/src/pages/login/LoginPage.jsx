export default function LoginPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 32, width: 360 }}>
        <h2 style={{ marginBottom: 24 }}>Programming Exercise Platform</h2>
        <div style={{ marginBottom: 16 }}>
          <label>Username</label>
          <input disabled style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label>Password</label>
          <input type="password" disabled style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <button disabled style={{ width: '100%', padding: 10, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'not-allowed', opacity: 0.7 }}>
          Login
        </button>
      </div>
    </div>
  )
}
