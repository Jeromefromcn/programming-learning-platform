import { SECTIONS } from './sectionConfig';

const SECTION_MAP = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

export default function TabBar({ tabs, activeTabId, onSwitch, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', background: '#1976d2',
      padding: '0 16px', gap: 2, flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const meta = SECTION_MAP[tab.section] ?? { label: tab.section, icon: '📄' };
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-label={meta.label}
            onClick={() => onSwitch(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 12px', borderRadius: '6px 6px 0 0',
              border: 'none', cursor: 'pointer', fontSize: 12,
              background: isActive ? '#fff' : 'rgba(0,0,0,.15)',
              color: isActive ? '#1565c0' : 'rgba(255,255,255,.8)',
              fontWeight: isActive ? 600 : 400,
            }}
          >
            <span aria-hidden="true">{meta.icon}</span>
            <span>{meta.label}</span>
            <span
              role="button"
              aria-label={`Close ${meta.label}`}
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              style={{ opacity: .55, fontSize: 10, lineHeight: 1 }}
            >
              ✕
            </span>
          </button>
        );
      })}
    </div>
  );
}
