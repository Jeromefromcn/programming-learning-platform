import { useNavigate, useLocation } from 'react-router-dom';
import { sidebarItems } from './sectionConfig';

export default function Sidebar({ section, role, collapsed }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const items = sidebarItems(section, role);

  if (collapsed) {
    return (
      <div style={{
        width: 44, background: '#263238', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 0', gap: 4,
      }}>
        {items.map(item => {
          const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
          return (
            <div
              key={item.path}
              title={item.label}
              onClick={() => navigate(item.path)}
              style={{
                width: 34, height: 34, display: 'flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: 6, cursor: 'pointer',
                background: isActive ? 'rgba(25,118,210,.45)' : 'transparent',
                color: isActive ? '#fff' : 'rgba(255,255,255,.6)',
                fontSize: 16,
              }}
            >
              {item.icon ?? '•'}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{
      width: 196, background: '#263238', flexShrink: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      {items.map(item => {
        const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              color: isActive ? '#fff' : 'rgba(255,255,255,.7)',
              background: isActive ? 'rgba(25,118,210,.35)' : 'transparent',
              borderLeft: isActive ? '3px solid #42a5f5' : '3px solid transparent',
              fontSize: 13, padding: '10px 13px',
              border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
