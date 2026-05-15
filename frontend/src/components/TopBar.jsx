export default function TopBar({ username, role, collapsed, onToggleSidebar, onLogout }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', background: '#1565c0',
      padding: '0 16px', height: 46, gap: 12, flexShrink: 0,
    }}>
      <button
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
        style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,.85)',
          fontSize: 20, cursor: 'pointer', padding: '4px 6px', borderRadius: 4,
          lineHeight: 1,
        }}
      >
        ☰
      </button>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>🎓 Platform</span>
      <div style={{ flex: 1 }} />
      <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}>{username}</span>
      <span style={{
        background: 'rgba(255,255,255,.2)', color: '#fff',
        fontSize: 11, borderRadius: 10, padding: '2px 9px',
      }}>
        {role}
      </span>
      <button
        onClick={onLogout}
        style={{
          background: 'none', border: '1px solid rgba(255,255,255,.35)',
          color: 'rgba(255,255,255,.9)', padding: '5px 12px',
          borderRadius: 4, cursor: 'pointer', fontSize: 12,
        }}
      >
        Logout
      </button>
    </div>
  );
}
