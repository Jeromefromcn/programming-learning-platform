import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

vi.mock('../../api/authApi', () => ({
  authApi: {
    login: vi.fn(),
  },
}));

import { authApi } from '../../api/authApi';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(authApi.login).mockResolvedValue({
    accessToken: 'tok',
    user: { username: 'alice', role: 'STUDENT' },
  });
});

test('redirects to /dashboard after login when no returnUrl saved', async () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText('Username'), 'alice');
  await userEvent.type(screen.getByLabelText('Password'), 'pass');
  await userEvent.click(screen.getByRole('button', { name: /login/i }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
});

test('shows expired error when ACCOUNT_EXPIRED is returned', async () => {
  vi.mocked(authApi.login).mockRejectedValue({
    response: { data: { error: { code: 'ACCOUNT_EXPIRED' } } },
  });
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText('Username'), 'expireduser');
  await userEvent.type(screen.getByLabelText('Password'), 'pass');
  await userEvent.click(screen.getByRole('button', { name: /login/i }));
  await waitFor(() => {
    expect(screen.getByText(/account expired/i)).toBeInTheDocument();
  });
});

test('shows rate limit message when RATE_LIMITED is returned', async () => {
  vi.mocked(authApi.login).mockRejectedValue({
    response: { data: { error: { code: 'RATE_LIMITED' } } },
  });
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText('Username'), 'alice');
  await userEvent.type(screen.getByLabelText('Password'), 'pass');
  await userEvent.click(screen.getByRole('button', { name: /login/i }));
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Too many login attempts. Please try again in 1 minute.');
  });
});

test('redirects to returnUrl after login when one is saved in sessionStorage', async () => {
  sessionStorage.setItem('returnUrl', '/app/exercises/42');
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText('Username'), 'alice');
  await userEvent.type(screen.getByLabelText('Password'), 'pass');
  await userEvent.click(screen.getByRole('button', { name: /login/i }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  expect(mockNavigate).toHaveBeenCalledWith('/app/exercises/42', { replace: true });
  expect(sessionStorage.getItem('returnUrl')).toBeNull();
});
