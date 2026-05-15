import { useState, useEffect, useRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { TabProvider, useTab } from '../contexts/TabContext';
import { useAuth } from '../contexts/AuthContext';
import { sectionsForRole, getInitialPath, getDefaultSection } from './sectionConfig';
import TopBar from './TopBar';
import TabBar from './TabBar';
import Sidebar from './Sidebar';
import SectionRouter from './SectionRouter';

function TabPanel({ tab, isActive, role, collapsed }) {
  const initialPath = getInitialPath(tab.section, role);
  return (
    <div style={{ display: isActive ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar section={tab.section} role={role} collapsed={collapsed} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <SectionRouter section={tab.section} role={role} />
        </div>
      </MemoryRouter>
    </div>
  );
}

function AppShellInner() {
  const { user, logout } = useAuth();
  const { tabs, activeTabId, openTab, closeTab, switchTab } = useTab();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );
  const initializedRef = useRef(false);

  useEffect(() => {
    if (user && !initializedRef.current) {
      initializedRef.current = true;
      openTab(getDefaultSection(user.role));
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggle() {
    setCollapsed(v => {
      localStorage.setItem('sidebar_collapsed', String(!v));
      return !v;
    });
  }

  async function handleLogout() {
    await logout();
    window.location.replace('/login');
  }

  if (!user) return null;

  const availableSections = sectionsForRole(user.role);
  const openSections = availableSections
    .map(s => s.key)
    .filter(key => !tabs.some(t => t.section === key));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar
        username={user.username}
        role={user.role}
        collapsed={collapsed}
        onToggleSidebar={handleToggle}
        onLogout={handleLogout}
      />
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        openSections={openSections}
        onSwitch={switchTab}
        onClose={closeTab}
        onOpen={openTab}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {tabs.map(tab => (
          <TabPanel
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            role={user.role}
            collapsed={collapsed}
          />
        ))}
        {tabs.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            Use + to open a section
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppShell() {
  return (
    <TabProvider>
      <AppShellInner />
    </TabProvider>
  );
}
