import { SECTIONS } from './sectionConfig';

const SECTION_MAP = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

export default function Sidebar({ menuSections, activeSection, openTabSections, collapsed, onOpen }) {
  const items = menuSections
    .map(key => SECTION_MAP[key])
    .filter(Boolean);

  if (collapsed) {
    return (
      <div style={{
        width: 44, background: '#263238', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 0', gap: 4,
      }}>
        {items.map(item => {
          const isActive = item.key === activeSection;
          const isOpen = openTabSections.has(item.key);
          return (
            <button
              key={item.key}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onOpen(item.key)}
              style={{
                width: 34, height: 34, display: 'flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: 6, cursor: 'pointer',
                background: isActive ? 'rgba(25,118,210,.45)' : 'transparent',
                color: isActive ? '#fff' : isOpen ? '#90caf9' : 'rgba(255,255,255,.6)',
                fontSize: 16, border: 'none',
              }}
            >
              {item.icon ?? '•'}
            </button>
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
        const isActive = item.key === activeSection;
        const isOpen = openTabSections.has(item.key);
        return (
          <button
            key={item.key}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onOpen(item.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              color: isActive ? '#fff' : isOpen ? '#90caf9' : 'rgba(255,255,255,.7)',
              background: isActive ? 'rgba(25,118,210,.35)' : 'transparent',
              borderLeft: isActive
                ? '3px solid #42a5f5'
                : isOpen ? '3px solid rgba(25,118,210,.35)' : '3px solid transparent',
              fontSize: 13, padding: '10px 13px',
              border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
