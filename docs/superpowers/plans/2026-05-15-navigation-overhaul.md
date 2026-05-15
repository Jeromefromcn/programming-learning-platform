# Navigation Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current fragmented, logout-less navigation with a 3-layer shell (TopBar + section-level TabBar + collapsible Sidebar) that solves all four reported navigation deficiencies.

**Architecture:** Each section (Exercises, Courses, etc.) opens as a tab. Each tab contains its own `MemoryRouter` that mirrors the existing absolute paths (`/tutor/exercises`, `/student/exercises`, etc.) so no page component needs its navigation links rewritten. The BrowserRouter in `App.jsx` shrinks to three routes: `/login`, `/app`, and a catch-all redirect.

**Tech Stack:** React 18, React Router v6, Vitest + @testing-library/react (jsdom), no new dependencies.

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `src/components/sectionConfig.js` | Section metadata, sidebar items, role filtering, initial MemoryRouter path |
| `src/contexts/TabContext.jsx` | Open-tabs list + active tab ID; openTab / closeTab / switchTab actions |
| `src/components/TopBar.jsx` | Brand, sidebar toggle button, user badge, Logout button |
| `src/components/TabBar.jsx` | Tab chips + ✕ close + ＋ section picker |
| `src/components/Sidebar.jsx` | Collapsible sidebar; expanded (196px labels) ↔ collapsed (44px icons + tooltips) |
| `src/components/Breadcrumb.jsx` | Reusable `[Section] › [Page]` row; last item is plain text, earlier items are links |
| `src/components/SectionRouter.jsx` | MemoryRouter + Routes for one section; role-aware component selection |
| `src/components/AppShell.jsx` | Root layout: owns collapsed state, mounts TabProvider, renders all layers |

### Modified files
| File | Change |
|------|--------|
| `src/App.jsx` | Replace 20 routes with 3: `/login`, `/app`, `*` |
| `src/pages/login/LoginPage.jsx` | Change `ROLE_ROUTES` to navigate every role to `/app` |
| `src/pages/tutor/CourseDetailPage.jsx` | Add `<Breadcrumb>` at top |
| `src/pages/tutor/CourseFormPage.jsx` | Add `<Breadcrumb>` at top |
| `src/pages/tutor/ExerciseFormPage.jsx` | Add `<Breadcrumb>` at top |
| `src/pages/tutor/SubmissionDetailPage.jsx` | Add `<Breadcrumb>` at top |
| `src/pages/tutor/SubmissionImportPage.jsx` | Add `<Breadcrumb>` + back button |

### Deleted files
- `src/pages/student/StudentPage.jsx` — replaced by AppShell
- `src/pages/tutor/TutorPage.jsx` — replaced by tab system
- `src/pages/admin/AdminDashboardPage.jsx` — replaced by tab system

---

## Task 1 — sectionConfig.js

**Files:**
- Create: `frontend/src/components/sectionConfig.js`
- Test: `frontend/src/components/sectionConfig.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/components/sectionConfig.test.js
import { describe, test, expect } from 'vitest';
import {
  sectionsForRole,
  sidebarItems,
  getInitialPath,
  SECTIONS,
} from './sectionConfig';

describe('sectionsForRole', () => {
  test('STUDENT gets exercises and progress only', () => {
    const keys = sectionsForRole('STUDENT').map(s => s.key);
    expect(keys).toEqual(['exercises', 'progress']);
  });

  test('TUTOR gets exercises, courses, categories, submissions', () => {
    const keys = sectionsForRole('TUTOR').map(s => s.key);
    expect(keys).toEqual(['exercises', 'courses', 'categories', 'submissions']);
  });

  test('SUPER_ADMIN gets all sections except progress', () => {
    const keys = sectionsForRole('SUPER_ADMIN').map(s => s.key);
    expect(keys).toEqual([
      'exercises', 'courses', 'categories', 'submissions', 'users', 'settings',
    ]);
  });
});

describe('sidebarItems', () => {
  test('exercises for STUDENT has no create link', () => {
    const items = sidebarItems('exercises', 'STUDENT');
    expect(items).toHaveLength(1);
    expect(items[0].path).toBe('/student/exercises');
  });

  test('exercises for TUTOR includes create link', () => {
    const items = sidebarItems('exercises', 'TUTOR');
    expect(items).toHaveLength(2);
    expect(items[1].path).toBe('/tutor/exercises/new');
  });

  test('courses includes All Courses and New Course', () => {
    const items = sidebarItems('courses', 'TUTOR');
    expect(items.map(i => i.path)).toEqual(['/tutor/courses', '/tutor/courses/new']);
  });

  test('submissions includes list and import', () => {
    const items = sidebarItems('submissions', 'TUTOR');
    expect(items.map(i => i.path)).toEqual([
      '/tutor/submissions', '/tutor/submissions/import',
    ]);
  });
});

describe('getInitialPath', () => {
  test('exercises for STUDENT starts at /student/exercises', () => {
    expect(getInitialPath('exercises', 'STUDENT')).toBe('/student/exercises');
  });

  test('exercises for TUTOR starts at /tutor/exercises', () => {
    expect(getInitialPath('exercises', 'TUTOR')).toBe('/tutor/exercises');
  });

  test('users starts at /admin/users', () => {
    expect(getInitialPath('users', 'SUPER_ADMIN')).toBe('/admin/users');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/sectionConfig.test.js
```
Expected: FAIL — `Cannot find module './sectionConfig'`

- [ ] **Step 3: Implement sectionConfig.js**

```js
// frontend/src/components/sectionConfig.js

export const SECTIONS = [
  { key: 'exercises',    label: 'Exercises',    icon: '📋', roles: ['STUDENT', 'TUTOR', 'SUPER_ADMIN'] },
  { key: 'progress',     label: 'My Progress',  icon: '📊', roles: ['STUDENT'] },
  { key: 'courses',      label: 'Courses',      icon: '📚', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'categories',   label: 'Categories',   icon: '🏷️', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'submissions',  label: 'Submissions',  icon: '📥', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'users',        label: 'Users',        icon: '👥', roles: ['SUPER_ADMIN'] },
  { key: 'settings',     label: 'Settings',     icon: '⚙️', roles: ['SUPER_ADMIN'] },
];

export function sectionsForRole(role) {
  return SECTIONS.filter(s => s.roles.includes(role));
}

export function sidebarItems(section, role) {
  const isStudent = role === 'STUDENT';
  switch (section) {
    case 'exercises':
      return isStudent
        ? [{ label: 'All Exercises', path: '/student/exercises' }]
        : [
            { label: 'All Exercises', path: '/tutor/exercises' },
            { label: '+ New Exercise', path: '/tutor/exercises/new' },
          ];
    case 'progress':
      return [{ label: 'Overview', path: '/student/progress' }];
    case 'courses':
      return [
        { label: 'All Courses', path: '/tutor/courses' },
        { label: '+ New Course', path: '/tutor/courses/new' },
      ];
    case 'categories':
      return [{ label: 'Category Management', path: '/tutor/categories' }];
    case 'submissions':
      return [
        { label: 'All Submissions', path: '/tutor/submissions' },
        { label: 'Import', path: '/tutor/submissions/import' },
      ];
    case 'users':
      return [{ label: 'User Management', path: '/admin/users' }];
    case 'settings':
      return [{ label: 'Global Settings', path: '/admin/settings' }];
    default:
      return [];
  }
}

export function getInitialPath(section, role) {
  const isStudent = role === 'STUDENT';
  switch (section) {
    case 'exercises':    return isStudent ? '/student/exercises' : '/tutor/exercises';
    case 'progress':     return '/student/progress';
    case 'courses':      return '/tutor/courses';
    case 'categories':   return '/tutor/categories';
    case 'submissions':  return '/tutor/submissions';
    case 'users':        return '/admin/users';
    case 'settings':     return '/admin/settings';
    default:             return '/';
  }
}

export function getDefaultSection(role) {
  if (role === 'SUPER_ADMIN') return 'users';
  return 'exercises';
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/sectionConfig.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/sectionConfig.js frontend/src/components/sectionConfig.test.js
git commit -m "feat(nav): add sectionConfig — section metadata, sidebar items, initial paths"
```

---

## Task 2 — TabContext

**Files:**
- Create: `frontend/src/contexts/TabContext.jsx`
- Test: `frontend/src/contexts/TabContext.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/contexts/TabContext.test.jsx
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabProvider, useTab } from './TabContext';

// Install userEvent: already available via @testing-library/react v16 bundled

function Inspector() {
  const { tabs, activeTabId, openTab, closeTab, switchTab } = useTab();
  return (
    <div>
      <span data-testid="count">{tabs.length}</span>
      <span data-testid="active">{activeTabId ?? 'none'}</span>
      <span data-testid="sections">{tabs.map(t => t.section).join(',')}</span>
      <button onClick={() => openTab('courses')}>open-courses</button>
      <button onClick={() => openTab('exercises')}>open-exercises</button>
      <button onClick={() => tabs[0] && closeTab(tabs[0].id)}>close-first</button>
      <button onClick={() => tabs[1] && switchTab(tabs[1].id)}>switch-second</button>
    </div>
  );
}

function wrap(initialSection) {
  return render(
    <TabProvider initialSection={initialSection}>
      <Inspector />
    </TabProvider>
  );
}

test('starts empty when no initialSection', () => {
  wrap(null);
  expect(screen.getByTestId('count')).toHaveTextContent('0');
  expect(screen.getByTestId('active')).toHaveTextContent('none');
});

test('initialSection opens one tab and makes it active', () => {
  wrap('exercises');
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  expect(screen.getByTestId('sections')).toHaveTextContent('exercises');
  expect(screen.getByTestId('active')).not.toHaveTextContent('none');
});

test('openTab adds a tab and activates it', async () => {
  wrap(null);
  await userEvent.click(screen.getByText('open-courses'));
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  expect(screen.getByTestId('sections')).toHaveTextContent('courses');
});

test('openTab on already-open section does not duplicate', async () => {
  wrap('exercises');
  await userEvent.click(screen.getByText('open-exercises'));
  expect(screen.getByTestId('count')).toHaveTextContent('1');
});

test('openTab on new section adds it and switches to it', async () => {
  wrap('exercises');
  await userEvent.click(screen.getByText('open-courses'));
  expect(screen.getByTestId('count')).toHaveTextContent('2');
  expect(screen.getByTestId('sections')).toHaveTextContent('exercises,courses');
});

test('closeTab removes the tab', async () => {
  wrap('exercises');
  await userEvent.click(screen.getByText('open-courses'));
  await userEvent.click(screen.getByText('close-first'));
  expect(screen.getByTestId('count')).toHaveTextContent('1');
  expect(screen.getByTestId('sections')).toHaveTextContent('courses');
});

test('closing active tab switches to the adjacent tab', async () => {
  wrap('exercises');
  await userEvent.click(screen.getByText('open-courses'));
  // exercises is index 0, courses is index 1
  // Make exercises active then close it — should switch to courses
  await userEvent.click(screen.getByText('close-first'));
  const active = screen.getByTestId('active').textContent;
  // active should now be the courses tab's id
  expect(active).not.toBe('none');
  expect(screen.getByTestId('sections')).toHaveTextContent('courses');
});

test('switchTab changes the active tab', async () => {
  wrap('exercises');
  await userEvent.click(screen.getByText('open-courses'));
  const activeBefore = screen.getByTestId('active').textContent;
  await userEvent.click(screen.getByText('switch-second'));
  expect(screen.getByTestId('active').textContent).not.toBe(activeBefore);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/contexts/TabContext.test.jsx
```
Expected: FAIL — `Cannot find module './TabContext'`

- [ ] **Step 3: Implement TabContext.jsx**

```jsx
// frontend/src/contexts/TabContext.jsx
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
    <TabContext.Provider value={{ tabs, activeTabId, openTab, closeTab, switchTab }}>
      {children}
    </TabContext.Provider>
  );
}

export function useTab() {
  const ctx = useContext(TabContext);
  if (!ctx) throw new Error('useTab must be used inside TabProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/contexts/TabContext.test.jsx
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/TabContext.jsx frontend/src/contexts/TabContext.test.jsx
git commit -m "feat(nav): add TabContext — open/close/switch section tabs"
```

---

## Task 3 — TopBar

**Files:**
- Create: `frontend/src/components/TopBar.jsx`
- Test: `frontend/src/components/TopBar.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/TopBar.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import TopBar from './TopBar';

function setup(props = {}) {
  const defaults = {
    username: 'alice',
    role: 'TUTOR',
    collapsed: false,
    onToggleSidebar: vi.fn(),
    onLogout: vi.fn(),
    ...props,
  };
  render(<TopBar {...defaults} />);
  return defaults;
}

test('renders username', () => {
  setup();
  expect(screen.getByText(/alice/)).toBeInTheDocument();
});

test('renders role badge', () => {
  setup();
  expect(screen.getByText(/TUTOR/)).toBeInTheDocument();
});

test('logout button calls onLogout', async () => {
  const { onLogout } = setup();
  await userEvent.click(screen.getByRole('button', { name: /logout/i }));
  expect(onLogout).toHaveBeenCalledOnce();
});

test('toggle button calls onToggleSidebar', async () => {
  const { onToggleSidebar } = setup();
  await userEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
  expect(onToggleSidebar).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/TopBar.test.jsx
```
Expected: FAIL — `Cannot find module './TopBar'`

- [ ] **Step 3: Implement TopBar.jsx**

```jsx
// frontend/src/components/TopBar.jsx

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
      <span style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}>
        {username}
      </span>
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/TopBar.test.jsx
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TopBar.jsx frontend/src/components/TopBar.test.jsx
git commit -m "feat(nav): add TopBar with toggle, user badge, logout button"
```

---

## Task 4 — TabBar

**Files:**
- Create: `frontend/src/components/TabBar.jsx`
- Test: `frontend/src/components/TabBar.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/TabBar.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import TabBar from './TabBar';
import { TabProvider } from '../contexts/TabContext';

const tabs = [
  { id: 'a', section: 'exercises' },
  { id: 'b', section: 'courses' },
];

function setup({ openSections = ['categories', 'submissions'] } = {}) {
  const openTab = vi.fn();
  render(
    <TabProvider initialSection={null}>
      <TabBar
        tabs={tabs}
        activeTabId="a"
        openSections={openSections}
        onSwitch={vi.fn()}
        onClose={vi.fn()}
        onOpen={openTab}
      />
    </TabProvider>
  );
  return { openTab };
}

test('renders all tab labels', () => {
  setup();
  expect(screen.getByText(/Exercises/i)).toBeInTheDocument();
  expect(screen.getByText(/Courses/i)).toBeInTheDocument();
});

test('active tab has distinct styling marker', () => {
  setup();
  // The active tab button should have aria-selected=true
  const exTab = screen.getByRole('tab', { name: /Exercises/i });
  expect(exTab).toHaveAttribute('aria-selected', 'true');
});

test('close button calls onClose with tab id', async () => {
  const onClose = vi.fn();
  render(
    <TabBar
      tabs={tabs}
      activeTabId="a"
      openSections={[]}
      onSwitch={vi.fn()}
      onClose={onClose}
      onOpen={vi.fn()}
    />
  );
  const closeBtns = screen.getAllByRole('button', { name: /close/i });
  await userEvent.click(closeBtns[0]);
  expect(onClose).toHaveBeenCalledWith('a');
});

test('add button shows available sections and calls onOpen', async () => {
  const onOpen = vi.fn();
  render(
    <TabBar
      tabs={tabs}
      activeTabId="a"
      openSections={['categories']}
      onSwitch={vi.fn()}
      onClose={vi.fn()}
      onOpen={onOpen}
    />
  );
  await userEvent.click(screen.getByRole('button', { name: /add tab/i }));
  await userEvent.click(screen.getByText(/Categories/i));
  expect(onOpen).toHaveBeenCalledWith('categories');
});

test('add button is hidden when no sections are available', () => {
  render(
    <TabBar
      tabs={tabs}
      activeTabId="a"
      openSections={[]}
      onSwitch={vi.fn()}
      onClose={vi.fn()}
      onOpen={vi.fn()}
    />
  );
  expect(screen.queryByRole('button', { name: /add tab/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/TabBar.test.jsx
```
Expected: FAIL — `Cannot find module './TabBar'`

- [ ] **Step 3: Implement TabBar.jsx**

```jsx
// frontend/src/components/TabBar.jsx
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
            <span>{meta.icon}</span>
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
                    <span>{meta.icon}</span>
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/TabBar.test.jsx
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TabBar.jsx frontend/src/components/TabBar.test.jsx
git commit -m "feat(nav): add TabBar — section tabs with close and add-section picker"
```

---

## Task 5 — Sidebar

**Files:**
- Create: `frontend/src/components/Sidebar.jsx`
- Test: `frontend/src/components/Sidebar.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/Sidebar.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

function LocationDisplay() {
  const loc = useLocation();
  return <span data-testid="loc">{loc.pathname}</span>;
}

function wrap(props) {
  return render(
    <MemoryRouter initialEntries={['/tutor/exercises']}>
      <Sidebar {...props} />
      <LocationDisplay />
    </MemoryRouter>
  );
}

const tutorExercisesProps = {
  section: 'exercises',
  role: 'TUTOR',
  collapsed: false,
};

test('renders sidebar items as links when expanded', () => {
  wrap(tutorExercisesProps);
  expect(screen.getByText('All Exercises')).toBeInTheDocument();
  expect(screen.getByText('+ New Exercise')).toBeInTheDocument();
});

test('does not render labels when collapsed', () => {
  wrap({ ...tutorExercisesProps, collapsed: true });
  expect(screen.queryByText('All Exercises')).not.toBeInTheDocument();
  expect(screen.queryByText('+ New Exercise')).not.toBeInTheDocument();
});

test('clicking an item navigates within MemoryRouter', async () => {
  wrap(tutorExercisesProps);
  await userEvent.click(screen.getByText('+ New Exercise'));
  expect(screen.getByTestId('loc')).toHaveTextContent('/tutor/exercises/new');
});

test('STUDENT exercises sidebar has no create link', () => {
  wrap({ section: 'exercises', role: 'STUDENT', collapsed: false });
  expect(screen.queryByText('+ New Exercise')).not.toBeInTheDocument();
  expect(screen.getByText('All Exercises')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/Sidebar.test.jsx
```
Expected: FAIL — `Cannot find module './Sidebar'`

- [ ] **Step 3: Implement Sidebar.jsx**

```jsx
// frontend/src/components/Sidebar.jsx
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
```

Note: The `sidebarItems` function returns `{ label, path }` objects. The collapsed icon view uses `item.icon` — add icon to sidebarItems return objects in sectionConfig.js:

Update `sectionConfig.js` `sidebarItems` to include icons:
```js
// In sidebarItems, add icon to each item
case 'exercises':
  return isStudent
    ? [{ label: 'All Exercises', icon: '📋', path: '/student/exercises' }]
    : [
        { label: 'All Exercises', icon: '📋', path: '/tutor/exercises' },
        { label: '+ New Exercise', icon: '➕', path: '/tutor/exercises/new' },
      ];
case 'progress':
  return [{ label: 'Overview', icon: '📊', path: '/student/progress' }];
case 'courses':
  return [
    { label: 'All Courses', icon: '📚', path: '/tutor/courses' },
    { label: '+ New Course', icon: '➕', path: '/tutor/courses/new' },
  ];
case 'categories':
  return [{ label: 'Category Management', icon: '🏷️', path: '/tutor/categories' }];
case 'submissions':
  return [
    { label: 'All Submissions', icon: '📥', path: '/tutor/submissions' },
    { label: 'Import', icon: '📤', path: '/tutor/submissions/import' },
  ];
case 'users':
  return [{ label: 'User Management', icon: '👥', path: '/admin/users' }];
case 'settings':
  return [{ label: 'Global Settings', icon: '⚙️', path: '/admin/settings' }];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/Sidebar.test.jsx src/components/sectionConfig.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/components/Sidebar.test.jsx frontend/src/components/sectionConfig.js
git commit -m "feat(nav): add Sidebar — collapsible, icon-only when collapsed, role-aware items"
```

---

## Task 6 — Breadcrumb

**Files:**
- Create: `frontend/src/components/Breadcrumb.jsx`
- Test: `frontend/src/components/Breadcrumb.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/Breadcrumb.test.jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Breadcrumb from './Breadcrumb';

function wrap(items) {
  return render(
    <MemoryRouter>
      <Breadcrumb items={items} />
    </MemoryRouter>
  );
}

test('renders all item labels', () => {
  wrap([{ label: 'Courses', to: '/tutor/courses' }, { label: 'Algorithm Basics' }]);
  expect(screen.getByText('Courses')).toBeInTheDocument();
  expect(screen.getByText('Algorithm Basics')).toBeInTheDocument();
});

test('items with `to` are rendered as links', () => {
  wrap([{ label: 'Courses', to: '/tutor/courses' }, { label: 'Detail' }]);
  expect(screen.getByRole('link', { name: 'Courses' })).toBeInTheDocument();
});

test('last item (no `to`) is not a link', () => {
  wrap([{ label: 'Courses', to: '/tutor/courses' }, { label: 'Detail' }]);
  expect(screen.queryByRole('link', { name: 'Detail' })).not.toBeInTheDocument();
  expect(screen.getByText('Detail')).toBeInTheDocument();
});

test('renders separator between items', () => {
  wrap([{ label: 'A', to: '/' }, { label: 'B' }]);
  expect(screen.getByText('›')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/Breadcrumb.test.jsx
```
Expected: FAIL — `Cannot find module './Breadcrumb'`

- [ ] **Step 3: Implement Breadcrumb.jsx**

```jsx
// frontend/src/components/Breadcrumb.jsx
import { Link } from 'react-router-dom';

export default function Breadcrumb({ items }) {
  return (
    <div style={{
      padding: '8px 20px', background: '#f8f9fa',
      borderBottom: '1px solid #e0e0e0', fontSize: 13, color: '#666',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: '#bbb' }}>›</span>}
          {item.to ? (
            <Link to={item.to} style={{ color: '#1976d2', textDecoration: 'none' }}>
              {item.label}
            </Link>
          ) : (
            <span style={{ color: '#333' }}>{item.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/Breadcrumb.test.jsx
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Breadcrumb.jsx frontend/src/components/Breadcrumb.test.jsx
git commit -m "feat(nav): add Breadcrumb component"
```

---

## Task 7 — SectionRouter

**Files:**
- Create: `frontend/src/components/SectionRouter.jsx`
- Test: `frontend/src/components/SectionRouter.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/SectionRouter.test.jsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SectionRouter from './SectionRouter';

// Mock all page components to avoid their API calls
vi.mock('../pages/student/ExerciseListPage', () => ({
  default: () => <div data-testid="page">ExerciseListPage</div>,
}));
vi.mock('../pages/student/ExercisePracticeRouter', () => ({
  default: () => <div data-testid="page">ExercisePracticeRouter</div>,
}));
vi.mock('../pages/student/ProgressPage', () => ({
  default: () => <div data-testid="page">ProgressPage</div>,
}));
vi.mock('../pages/tutor/ExerciseManagementPage', () => ({
  default: () => <div data-testid="page">ExerciseManagementPage</div>,
}));
vi.mock('../pages/tutor/ExerciseFormPage', () => ({
  default: () => <div data-testid="page">ExerciseFormPage</div>,
}));
vi.mock('../pages/tutor/CourseManagementPage', () => ({
  default: () => <div data-testid="page">CourseManagementPage</div>,
}));
vi.mock('../pages/tutor/CourseFormPage', () => ({
  default: () => <div data-testid="page">CourseFormPage</div>,
}));
vi.mock('../pages/tutor/CourseDetailPage', () => ({
  default: () => <div data-testid="page">CourseDetailPage</div>,
}));
vi.mock('../pages/tutor/CategoryManagementPage', () => ({
  default: () => <div data-testid="page">CategoryManagementPage</div>,
}));
vi.mock('../pages/tutor/SubmissionListPage', () => ({
  default: () => <div data-testid="page">SubmissionListPage</div>,
}));
vi.mock('../pages/tutor/SubmissionImportPage', () => ({
  default: () => <div data-testid="page">SubmissionImportPage</div>,
}));
vi.mock('../pages/tutor/SubmissionDetailPage', () => ({
  default: () => <div data-testid="page">SubmissionDetailPage</div>,
}));
vi.mock('../pages/admin/UserManagementPage', () => ({
  default: () => <div data-testid="page">UserManagementPage</div>,
}));
vi.mock('../pages/admin/GlobalSettingsPage', () => ({
  default: () => <div data-testid="page">GlobalSettingsPage</div>,
}));

function wrap(section, role, initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SectionRouter section={section} role={role} />
    </MemoryRouter>
  );
}

test('exercises + STUDENT renders ExerciseListPage', () => {
  wrap('exercises', 'STUDENT', '/student/exercises');
  expect(screen.getByTestId('page')).toHaveTextContent('ExerciseListPage');
});

test('exercises + TUTOR renders ExerciseManagementPage', () => {
  wrap('exercises', 'TUTOR', '/tutor/exercises');
  expect(screen.getByTestId('page')).toHaveTextContent('ExerciseManagementPage');
});

test('exercises/new + TUTOR renders ExerciseFormPage', () => {
  wrap('exercises', 'TUTOR', '/tutor/exercises/new');
  expect(screen.getByTestId('page')).toHaveTextContent('ExerciseFormPage');
});

test('courses renders CourseManagementPage', () => {
  wrap('courses', 'TUTOR', '/tutor/courses');
  expect(screen.getByTestId('page')).toHaveTextContent('CourseManagementPage');
});

test('courses/:id renders CourseDetailPage', () => {
  wrap('courses', 'TUTOR', '/tutor/courses/42');
  expect(screen.getByTestId('page')).toHaveTextContent('CourseDetailPage');
});

test('submissions renders SubmissionListPage', () => {
  wrap('submissions', 'TUTOR', '/tutor/submissions');
  expect(screen.getByTestId('page')).toHaveTextContent('SubmissionListPage');
});

test('submissions/import renders SubmissionImportPage', () => {
  wrap('submissions', 'TUTOR', '/tutor/submissions/import');
  expect(screen.getByTestId('page')).toHaveTextContent('SubmissionImportPage');
});

test('users renders UserManagementPage', () => {
  wrap('users', 'SUPER_ADMIN', '/admin/users');
  expect(screen.getByTestId('page')).toHaveTextContent('UserManagementPage');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/SectionRouter.test.jsx
```
Expected: FAIL — `Cannot find module './SectionRouter'`

- [ ] **Step 3: Implement SectionRouter.jsx**

```jsx
// frontend/src/components/SectionRouter.jsx
import { Routes, Route } from 'react-router-dom';
import ExerciseListPage from '../pages/student/ExerciseListPage';
import ExercisePracticeRouter from '../pages/student/ExercisePracticeRouter';
import ProgressPage from '../pages/student/ProgressPage';
import ExerciseManagementPage from '../pages/tutor/ExerciseManagementPage';
import ExerciseFormPage from '../pages/tutor/ExerciseFormPage';
import CourseManagementPage from '../pages/tutor/CourseManagementPage';
import CourseFormPage from '../pages/tutor/CourseFormPage';
import CourseDetailPage from '../pages/tutor/CourseDetailPage';
import CategoryManagementPage from '../pages/tutor/CategoryManagementPage';
import SubmissionListPage from '../pages/tutor/SubmissionListPage';
import SubmissionImportPage from '../pages/tutor/SubmissionImportPage';
import SubmissionDetailPage from '../pages/tutor/SubmissionDetailPage';
import UserManagementPage from '../pages/admin/UserManagementPage';
import GlobalSettingsPage from '../pages/admin/GlobalSettingsPage';

export default function SectionRouter({ section, role }) {
  const isStudent = role === 'STUDENT';

  return (
    <Routes>
      {section === 'exercises' && isStudent && (
        <>
          <Route path="/student/exercises" element={<ExerciseListPage />} />
          <Route path="/student/exercises/:id/practice" element={<ExercisePracticeRouter />} />
        </>
      )}
      {section === 'exercises' && !isStudent && (
        <>
          <Route path="/tutor/exercises" element={<ExerciseManagementPage />} />
          <Route path="/tutor/exercises/new" element={<ExerciseFormPage />} />
          <Route path="/tutor/exercises/:id/edit" element={<ExerciseFormPage />} />
        </>
      )}
      {section === 'progress' && (
        <Route path="/student/progress" element={<ProgressPage />} />
      )}
      {section === 'courses' && (
        <>
          <Route path="/tutor/courses" element={<CourseManagementPage />} />
          <Route path="/tutor/courses/new" element={<CourseFormPage />} />
          <Route path="/tutor/courses/:id/edit" element={<CourseFormPage />} />
          <Route path="/tutor/courses/:id" element={<CourseDetailPage />} />
        </>
      )}
      {section === 'categories' && (
        <Route path="/tutor/categories" element={<CategoryManagementPage />} />
      )}
      {section === 'submissions' && (
        <>
          <Route path="/tutor/submissions" element={<SubmissionListPage />} />
          <Route path="/tutor/submissions/import" element={<SubmissionImportPage />} />
          <Route path="/tutor/submissions/:id" element={<SubmissionDetailPage />} />
        </>
      )}
      {section === 'users' && (
        <Route path="/admin/users" element={<UserManagementPage />} />
      )}
      {section === 'settings' && (
        <Route path="/admin/settings" element={<GlobalSettingsPage />} />
      )}
    </Routes>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/SectionRouter.test.jsx
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SectionRouter.jsx frontend/src/components/SectionRouter.test.jsx
git commit -m "feat(nav): add SectionRouter — role-aware routes inside MemoryRouter tabs"
```

---

## Task 8 — AppShell

**Files:**
- Create: `frontend/src/components/AppShell.jsx`
- Test: `frontend/src/components/AppShell.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/AppShell.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AppShell from './AppShell';
import { AuthProvider } from '../contexts/AuthContext';

vi.mock('../api/axiosInstance', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
  setAuthHandlers: vi.fn(),
}));

// Mock heavy page components
vi.mock('./SectionRouter', () => ({
  default: ({ section }) => <div data-testid="section-router">{section}</div>,
}));

function wrap(user = { username: 'alice', role: 'TUTOR' }) {
  // Pre-seed AuthContext with a logged-in user
  const Seeder = ({ children }) => {
    const { login } = require('../contexts/AuthContext').useAuth();
    // Seed once on mount
    require('react').useEffect(() => { login('tok', user); }, []);
    return children;
  };

  return render(
    <MemoryRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </MemoryRouter>
  );
}
```

> **Note:** AppShell integration is complex to unit-test because it depends on AuthContext being populated. Write a simpler focused test instead:

```jsx
// frontend/src/components/AppShell.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TabProvider } from '../contexts/TabContext';

vi.mock('./SectionRouter', () => ({
  default: ({ section }) => <div data-testid="section-router">{section}</div>,
}));
vi.mock('./TopBar', () => ({
  default: ({ onLogout, onToggleSidebar }) => (
    <div>
      <button onClick={onLogout}>Logout</button>
      <button onClick={onToggleSidebar}>Toggle</button>
    </div>
  ),
}));
vi.mock('./TabBar', () => ({
  default: ({ tabs, onOpen }) => (
    <div>
      {tabs.map(t => <span key={t.id}>{t.section}</span>)}
      <button onClick={() => onOpen('courses')}>Open Courses</button>
    </div>
  ),
}));
vi.mock('../api/axiosInstance', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
  setAuthHandlers: vi.fn(),
}));

import AppShellInner from './AppShell';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';

function WithAuth({ role, children }) {
  const { login } = useAuth();
  useEffect(() => { login('tok', { username: 'u', role }); }, []);
  return children;
}

function wrap(role = 'TUTOR') {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <WithAuth role={role}>
          <AppShellInner />
        </WithAuth>
      </AuthProvider>
    </MemoryRouter>
  );
}

test('TUTOR default tab is exercises', async () => {
  wrap('TUTOR');
  expect(await screen.findByText('exercises')).toBeInTheDocument();
});

test('SUPER_ADMIN default tab is users', async () => {
  wrap('SUPER_ADMIN');
  expect(await screen.findByText('users')).toBeInTheDocument();
});

test('opening a tab renders its SectionRouter', async () => {
  wrap('TUTOR');
  await userEvent.click(await screen.findByText('Open Courses'));
  expect(screen.getByText('courses')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/AppShell.test.jsx
```
Expected: FAIL — `Cannot find module './AppShell'`

- [ ] **Step 3: Implement AppShell.jsx**

```jsx
// frontend/src/components/AppShell.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabProvider, useTab } from '../contexts/TabContext';
import { useAuth } from '../contexts/AuthContext';
import { sectionsForRole, getInitialPath, getDefaultSection } from './sectionConfig';
import TopBar from './TopBar';
import TabBar from './TabBar';
import Sidebar from './Sidebar';
import SectionRouter from './SectionRouter';
import { MemoryRouter } from 'react-router-dom';

function TabPanel({ tab, isActive, role, collapsed }) {
  const initialPath = getInitialPath(tab.section, role);
  return (
    <div style={{ display: isActive ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar section={tab.section} role={role} collapsed={collapsed} />
        <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
          <SectionRouter section={tab.section} role={role} />
        </div>
      </MemoryRouter>
    </div>
  );
}

function AppShellInner() {
  const { user, logout } = useAuth();
  const { tabs, activeTabId, openTab, closeTab, switchTab } = useTab();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );

  useEffect(() => {
    if (user) openTab(getDefaultSection(user.role));
  }, []); // open default tab once on mount

  function handleToggle() {
    setCollapsed(v => {
      localStorage.setItem('sidebar_collapsed', String(!v));
      return !v;
    });
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
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
            Use ＋ to open a section
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/AppShell.test.jsx
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AppShell.jsx frontend/src/components/AppShell.test.jsx
git commit -m "feat(nav): add AppShell — 3-layer layout with TabProvider, per-tab MemoryRouter"
```

---

## Task 9 — Update App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/App.test.jsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./api/axiosInstance', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
  setAuthHandlers: vi.fn(),
}));
vi.mock('./components/AppShell', () => ({
  default: () => <div data-testid="app-shell">AppShell</div>,
}));

test('/login renders LoginPage', () => {
  // jsdom default URL is http://localhost/
  window.history.pushState({}, '', '/login');
  render(<App />);
  expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
});

test('/app redirects to /login when unauthenticated', () => {
  window.history.pushState({}, '', '/app');
  render(<App />);
  // Unauthenticated: ProtectedRoute redirects to /login
  expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/App.test.jsx
```
Expected: FAIL

- [ ] **Step 3: Replace App.jsx**

```jsx
// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/login/LoginPage';
import AppShell from './components/AppShell';

function Unauthorized() {
  return (
    <div style={{ padding: 32 }}>
      <h2>Access Denied</h2>
      <p>You do not have permission to view this page.</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute requiredRole="STUDENT">
                <AppShell />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/App.test.jsx
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/App.test.jsx
git commit -m "feat(nav): replace App.jsx routing with single /app → AppShell route"
```

---

## Task 10 — Update LoginPage redirect

**Files:**
- Modify: `frontend/src/pages/login/LoginPage.jsx`

- [ ] **Step 1: Change `ROLE_ROUTES` to always redirect to `/app`**

In `frontend/src/pages/login/LoginPage.jsx`, find line 6:

```js
const ROLE_ROUTES = { STUDENT: '/student', TUTOR: '/tutor', SUPER_ADMIN: '/admin' };
```

Replace with:

```js
const ROLE_ROUTES = { STUDENT: '/app', TUTOR: '/app', SUPER_ADMIN: '/app' };
```

- [ ] **Step 2: Run all tests to check nothing broke**

```bash
cd frontend && npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/login/LoginPage.jsx
git commit -m "feat(nav): redirect all roles to /app after login"
```

---

## Task 11 — Add Breadcrumb to sub-pages

Add `<Breadcrumb>` at the top of each sub-page. The existing `navigate()` back calls already work inside MemoryRouter — we only add the breadcrumb row for visual context. Also add an explicit back button to `SubmissionImportPage` which currently has none.

**Files:**
- Modify: `frontend/src/pages/tutor/CourseDetailPage.jsx`
- Modify: `frontend/src/pages/tutor/CourseFormPage.jsx`
- Modify: `frontend/src/pages/tutor/ExerciseFormPage.jsx`
- Modify: `frontend/src/pages/tutor/SubmissionDetailPage.jsx`
- Modify: `frontend/src/pages/tutor/SubmissionImportPage.jsx`

### 11a — CourseDetailPage

- [ ] **Step 1: Add Breadcrumb import and render**

In `frontend/src/pages/tutor/CourseDetailPage.jsx`, add the import after the existing imports:

```js
import Breadcrumb from '../../components/Breadcrumb';
```

Then find the opening `<div` of the returned JSX (the container div around the course detail content). Add `<Breadcrumb>` as the first child inside it:

```jsx
<Breadcrumb items={[
  { label: 'Courses', to: '/tutor/courses' },
  { label: course?.name ?? '…' },
]} />
```

Place this immediately after the opening wrapper `<div>` tag and before the first `<h2>` or content element. Wrap the breadcrumb in a conditional: only render when `course` is loaded (so the name isn't empty on first render):

```jsx
{course && (
  <Breadcrumb items={[
    { label: 'Courses', to: '/tutor/courses' },
    { label: course.name },
  ]} />
)}
```

### 11b — CourseFormPage

- [ ] **Step 1: Add Breadcrumb import and render**

In `frontend/src/pages/tutor/CourseFormPage.jsx`, add:

```js
import Breadcrumb from '../../components/Breadcrumb';
```

Add as first child of the returned JSX:

```jsx
<Breadcrumb items={[
  { label: 'Courses', to: '/tutor/courses' },
  { label: isEdit ? 'Edit Course' : 'New Course' },
]} />
```

### 11c — ExerciseFormPage

- [ ] **Step 1: Add Breadcrumb import and render**

In `frontend/src/pages/tutor/ExerciseFormPage.jsx`, add:

```js
import Breadcrumb from '../../components/Breadcrumb';
```

Add as first child of the returned JSX:

```jsx
<Breadcrumb items={[
  { label: 'Exercises', to: '/tutor/exercises' },
  { label: isEdit ? 'Edit Exercise' : 'New Exercise' },
]} />
```

(`isEdit` is determined by `Boolean(id)` — check which variable name the page uses; it's `const { id } = useParams(); const isEdit = Boolean(id);` at line 3–4.)

### 11d — SubmissionDetailPage

- [ ] **Step 1: Add Breadcrumb import and render**

In `frontend/src/pages/tutor/SubmissionDetailPage.jsx`, add:

```js
import Breadcrumb from '../../components/Breadcrumb';
```

Add as first child of the returned JSX:

```jsx
<Breadcrumb items={[
  { label: 'Submissions', to: '/tutor/submissions' },
  { label: 'Submission Detail' },
]} />
```

### 11e — SubmissionImportPage

- [ ] **Step 1: Add Breadcrumb and back button**

In `frontend/src/pages/tutor/SubmissionImportPage.jsx`, add at the top of the file:

```js
import { useNavigate } from 'react-router-dom';
import Breadcrumb from '../../components/Breadcrumb';
```

Add `const navigate = useNavigate();` inside the component function (before the return).

Add as first children of the returned JSX:

```jsx
<Breadcrumb items={[
  { label: 'Submissions', to: '/tutor/submissions' },
  { label: 'Import' },
]} />
<div style={{ padding: '12px 20px 0' }}>
  <button
    onClick={() => navigate('/tutor/submissions')}
    style={{
      background: 'none', border: '1px solid #ccc', borderRadius: 4,
      padding: '5px 12px', fontSize: 13, cursor: 'pointer', color: '#555',
    }}
  >
    ← Back to Submissions
  </button>
</div>
```

- [ ] **Step 2: Run all tests**

```bash
cd frontend && npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add \
  frontend/src/pages/tutor/CourseDetailPage.jsx \
  frontend/src/pages/tutor/CourseFormPage.jsx \
  frontend/src/pages/tutor/ExerciseFormPage.jsx \
  frontend/src/pages/tutor/SubmissionDetailPage.jsx \
  frontend/src/pages/tutor/SubmissionImportPage.jsx
git commit -m "feat(nav): add Breadcrumb to tutor sub-pages; add back button to SubmissionImportPage"
```

---

## Task 12 — Delete old layout pages

These three files are no longer used. `StudentPage` was the student layout; `TutorPage` and `AdminDashboardPage` were link-only dashboards. All replaced by AppShell.

**Files:**
- Delete: `frontend/src/pages/student/StudentPage.jsx`
- Delete: `frontend/src/pages/tutor/TutorPage.jsx`
- Delete: `frontend/src/pages/admin/AdminDashboardPage.jsx`

- [ ] **Step 1: Verify these files are no longer imported anywhere**

```bash
grep -r "StudentPage\|TutorPage\|AdminDashboardPage" frontend/src --include="*.jsx" --include="*.js"
```
Expected: No results (App.jsx no longer imports them after Task 9).

- [ ] **Step 2: Delete the files**

```bash
rm frontend/src/pages/student/StudentPage.jsx
rm frontend/src/pages/tutor/TutorPage.jsx
rm frontend/src/pages/admin/AdminDashboardPage.jsx
```

- [ ] **Step 3: Run all tests to confirm nothing broke**

```bash
cd frontend && npx vitest run
```
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(nav): delete StudentPage, TutorPage, AdminDashboardPage — replaced by AppShell"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Problem 1 (no logout) → TopBar has Logout button wired to `logout()` + redirect (Task 8)
- ✅ Problem 2 (no back button) → Breadcrumb added to all sub-pages; existing `navigate()` calls preserved (Task 11)
- ✅ Problem 3 (can't jump between sections) → TabBar always visible (Task 8)
- ✅ Problem 4 (multiple sections) → Section-level tabs with MemoryRouter per tab (Tasks 2, 7, 8)
- ✅ Sidebar collapsible → `localStorage`-persisted collapsed state in AppShell (Task 8)
- ✅ Logout navigates to /login (Task 8, handleLogout)
- ✅ SUPER_ADMIN default tab is users (Task 1 getDefaultSection, Task 8)
- ✅ Old layout pages removed (Task 12)

**Type consistency:** `tab.section` used consistently throughout TabContext, TabBar, AppShell. `sidebarItems` returns `{ label, icon, path }` — Sidebar uses `item.path` and `item.label` and `item.icon`. `openSections` is an array of section key strings — TabBar receives and uses it as such.

**No placeholders:** All code blocks are complete.
