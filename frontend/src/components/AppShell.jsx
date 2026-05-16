import { useState, useEffect, useRef, Component } from 'react';
import { MemoryRouter, UNSAFE_LocationContext } from 'react-router-dom';
import { TabProvider, useTab } from '../contexts/TabContext';
import { useAuth } from '../contexts/AuthContext';
import { sectionsForRole, getInitialPath, getDefaultSection } from './sectionConfig';
import TopBar from './TopBar';
import TabBar from './TabBar';
import Sidebar from './Sidebar';
import SectionRouter from './SectionRouter';

class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', color: '#c62828' }}>
          <strong>Tab render error:</strong>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 }}>
            {String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function TabPanel({ tab, isActive, role, collapsed }) {
  const initialPath = getInitialPath(tab.section, role);
  // UNSAFE_LocationContext is set to null so MemoryRouter does not see the outer
  // BrowserRouter and avoids the "cannot render Router inside another Router" error.
  return (
    <div style={{ display: isActive ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
      <UNSAFE_LocationContext.Provider value={null}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Sidebar section={tab.section} role={role} collapsed={collapsed} />
          <div style={{ flex: 1, overflow: 'auto' }}>
            <TabErrorBoundary>
              <SectionRouter section={tab.section} role={role} />
            </TabErrorBoundary>
          </div>
        </MemoryRouter>
      </UNSAFE_LocationContext.Provider>
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
        onSwitch={switchTab}
        onClose={closeTab}
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
