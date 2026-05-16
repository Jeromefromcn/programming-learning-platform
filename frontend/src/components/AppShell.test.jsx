import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('../api/axiosInstance', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
  setAuthHandlers: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: vi.fn(),
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
  default: ({ tabs }) => (
    <div>
      {tabs.map(t => <span key={t.id} data-testid="tab">{t.section}</span>)}
    </div>
  ),
}));

vi.mock('./Sidebar', () => ({
  default: ({ menuSections, onOpen }) => (
    <div data-testid="sidebar">
      {(menuSections ?? []).map(s => (
        <button key={s} onClick={() => onOpen(s)}>{s}</button>
      ))}
    </div>
  ),
}));

import { useAuth } from '../contexts/AuthContext';
import AppShell from './AppShell';

function setup(role, menuSections) {
  useAuth.mockReturnValue({
    user: { username: 'alice', role },
    menuSections,
    logout: vi.fn(),
    accessToken: 'tok',
  });
  return render(<AppShell />);
}

test('no tab is opened by default after login', () => {
  setup('TUTOR', ['exercises', 'courses']);
  expect(screen.queryAllByTestId('tab')).toHaveLength(0);
});

test('clicking sidebar section opens tab', async () => {
  setup('TUTOR', ['exercises', 'courses']);
  await userEvent.click(screen.getByText('exercises'));
  const tabs = screen.getAllByTestId('tab');
  expect(tabs.some(t => t.textContent === 'exercises')).toBe(true);
});

test('renders username from auth context', async () => {
  setup('TUTOR', ['exercises']);
  expect(await screen.findByTestId('username')).toHaveTextContent('alice');
});

test('sidebar is rendered at AppShell level (not per tab)', () => {
  setup('TUTOR', ['exercises', 'courses']);
  expect(screen.getByTestId('sidebar')).toBeInTheDocument();
});
