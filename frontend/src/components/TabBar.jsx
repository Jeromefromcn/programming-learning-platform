import { useState } from 'react';
import { SECTIONS } from './sectionConfig';

const SECTION_MAP = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

export default function TabBar({ tabs, activeTabId, openSections, onSwitch, onClose, onOpen }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleOpen(section) {
    setPickerOpen(false);
    onOpen(section);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', background: '#1976d2',
      padding: '0 16px', gap: 2, position: 'relative', flexShrink: 0,
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

      {openSections.length > 0 && (
        <div style={{ position: 'relative' }}>
          <button
            aria-label="Add tab"
            onClick={() => setPickerOpen(v => !v)}
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,.6)',
              fontSize: 20, cursor: 'pointer', padding: '4px 10px',
              borderRadius: '6px 6px 0 0', lineHeight: 1,
            }}
          >
            ＋
          </button>
          {pickerOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, background: '#fff',
              border: '1px solid #ccc', borderRadius: 4, zIndex: 100,
              minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,.15)',
            }}>
              {openSections.map(key => {
                const meta = SECTION_MAP[key] ?? { label: key, icon: '📄' };
                return (
                  <button
                    key={key}
                    onClick={() => handleOpen(key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '9px 14px', background: 'none',
                      border: 'none', cursor: 'pointer', fontSize: 13,
                      textAlign: 'left',
                    }}
                  >
                    <span aria-hidden="true">{meta.icon}</span>
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
