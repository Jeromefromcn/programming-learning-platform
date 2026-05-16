import { useState, useRef, useEffect } from 'react';
import ChangePasswordModal from './ChangePasswordModal';

export default function TopBar({ username, role, collapsed, onToggleSidebar, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', background: '#1565c0',
        padding: '0 16px', height: 46, gap: 12, flexShrink: 0,
      }}>
        <button
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.85)', fontSize: 20, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, lineHeight: 1 }}
        >
          ☰
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>🎓 Platform</span>
        <div style={{ flex: 1 }} />
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="User menu"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
            }}
          >
            <span>{username}</span>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>{role}</span>
            <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 36, right: 0, background: '#fff', color: '#333',
              borderRadius: 4, boxShadow: '0 3px 12px rgba(0,0,0,0.2)', minWidth: 170,
              fontSize: 13, zIndex: 200,
            }}>
              <button
                onClick={() => { setMenuOpen(false); setShowChangePassword(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', textAlign: 'left' }}
              >
                Change Password
              </button>
              <button
                onClick={onLogout}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', textAlign: 'left' }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}
