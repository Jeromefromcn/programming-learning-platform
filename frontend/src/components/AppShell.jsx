import { useState, Component } from 'react';
import { MemoryRouter, UNSAFE_LocationContext, UNSAFE_RouteContext } from 'react-router-dom';
import { TabProvider, useTab } from '../contexts/TabContext';
import { useAuth } from '../contexts/AuthContext';
import { getInitialPath } from './sectionConfig';
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

function TabPanel({ tab, isActive, role }) {
  const initialPath = getInitialPath(tab.section, role);
  return (
    <div style={{ display: isActive ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
      <UNSAFE_RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false }}>
      <UNSAFE_LocationContext.Provider value={null}>
        <MemoryRouter initialEntries={[initialPath]}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <TabErrorBoundary>
              <SectionRouter section={tab.section} role={role} />
            </TabErrorBoundary>
          </div>
        </MemoryRouter>
      </UNSAFE_LocationContext.Provider>
      </UNSAFE_RouteContext.Provider>
    </div>
  );
}

function AppShellInner() {
  const { user, logout, menuSections } = useAuth();
  const { tabs, activeTabId, openTab, closeTab, switchTab } = useTab();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );

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

  const activeSection = tabs.find(t => t.id === activeTabId)?.section ?? null;
  const openTabSections = new Set(tabs.map(t => t.section));

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
        <Sidebar
          menuSections={menuSections}
          activeSection={activeSection}
          openTabSections={openTabSections}
          collapsed={collapsed}
          onOpen={openTab}
        />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {tabs.map(tab => (
            <TabPanel
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              role={user.role}
            />
          ))}
          {tabs.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              Select a section from the menu
            </div>
          )}
        </div>
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
