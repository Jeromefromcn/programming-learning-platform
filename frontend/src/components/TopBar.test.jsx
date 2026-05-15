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
