import { createContext, useContext, useState } from 'react';

const TabContext = createContext(null);

const uid = () => Math.random().toString(36).slice(2, 10);

export function TabProvider({ children, initialSection }) {
  const [{ tabs, activeTabId }, setState] = useState(() => {
    if (!initialSection) return { tabs: [], activeTabId: null };
    const id = uid();
    return { tabs: [{ id, section: initialSection }], activeTabId: id };
  });

  function openTab(section) {
    setState(prev => {
      const existing = prev.tabs.find(t => t.section === section);
      if (existing) return { ...prev, activeTabId: existing.id };
      const id = uid();
      return {
        tabs: [...prev.tabs, { id, section }],
        activeTabId: id,
      };
    });
  }

  function openTabAt(section, path) {
    setState(prev => {
      const withoutSection = prev.tabs.filter(t => t.section !== section);
      const id = uid();
      return {
        tabs: [...withoutSection, { id, section, initialPath: path }],
        activeTabId: id,
      };
    });
  }

  function closeTab(id) {
    setState(prev => {
      const idx = prev.tabs.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const next = prev.tabs.filter(t => t.id !== id);
      let nextActive = prev.activeTabId;
      if (prev.activeTabId === id) {
        const fallback = next[Math.max(0, idx - 1)];
        nextActive = fallback?.id ?? null;
      }
      return { tabs: next, activeTabId: nextActive };
    });
  }

  function switchTab(id) {
    setState(prev => ({ ...prev, activeTabId: id }));
  }

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, openTabAt, closeTab, switchTab }}>
      {children}
    </TabContext.Provider>
  );
}

export function useTab() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error('useTab must be used inside TabProvider');
  return ctx;
}
