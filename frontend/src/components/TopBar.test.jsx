import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import TopBar from './TopBar';

vi.mock('./ChangePasswordModal', () => ({
  default: () => <div role="dialog" aria-label="change password modal" />,
}));

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
  expect(screen.getByText('alice')).toBeInTheDocument();
});

test('renders role badge', () => {
  setup();
  expect(screen.getByText('TUTOR')).toBeInTheDocument();
});

test('toggle button calls onToggleSidebar', async () => {
  const { onToggleSidebar } = setup();
  await userEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
  expect(onToggleSidebar).toHaveBeenCalledOnce();
});

test('clicking user menu opens dropdown with Change Password and Logout', async () => {
  setup();
  expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /user menu/i }));
  expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
});

test('logout calls onLogout', async () => {
  const { onLogout } = setup();
  await userEvent.click(screen.getByRole('button', { name: /user menu/i }));
  await userEvent.click(screen.getByRole('button', { name: /logout/i }));
  expect(onLogout).toHaveBeenCalledOnce();
});

test('change password opens modal', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: /user menu/i }));
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  expect(screen.getByRole('dialog', { name: /change password modal/i })).toBeInTheDocument();
});
