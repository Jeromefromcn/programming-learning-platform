import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { useEffect } from 'react';

vi.mock('../api/axiosInstance', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
  setAuthHandlers: vi.fn(),
}));

vi.mock('./SectionRouter', () => ({
  default: ({ section }) => <div data-testid="section-router" data-section={section} />,
}));
vi.mock('./TopBar', () => ({
  default: ({ onLogout, onToggleSidebar, username }) => (
    <div>
      <span data-testid="username">{username}</span>
      <button onClick={onLogout}>Logout</button>
      <button onClick={onToggleSidebar}>Toggle</button>
    </div>
  ),
}));
vi.mock('./TabBar', () => ({
  default: ({ tabs, onOpen }) => (
    <div>
      {tabs.map(t => <span key={t.id} data-testid="tab">{t.section}</span>)}
      <button onClick={() => onOpen('courses')}>Open Courses</button>
    </div>
  ),
}));
vi.mock('./Sidebar', () => ({
  default: () => <div data-testid="sidebar" />,
}));

import AppShell from './AppShell';

function WithAuth({ role, children }) {
  const { login } = useAuth();
  useEffect(() => { login('tok', { username: 'alice', role }); }, []);
  return children;
}

function wrap(role = 'TUTOR') {
  return render(
    <AuthProvider>
      <WithAuth role={role}>
        <AppShell />
      </WithAuth>
    </AuthProvider>
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

test('opening a tab renders its section', async () => {
  wrap('TUTOR');
  await screen.findByText('exercises'); // wait for mount
  await userEvent.click(screen.getByText('Open Courses'));
  expect(screen.getByText('courses')).toBeInTheDocument();
});

test('renders username from auth context', async () => {
  wrap('TUTOR');
  expect(await screen.findByTestId('username')).toHaveTextContent('alice');
});
