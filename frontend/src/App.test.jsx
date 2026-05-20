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
vi.mock('./api/authApi', () => ({
  authApi: {
    refresh: vi.fn().mockRejectedValue(new Error('no session')),
  },
}));
vi.mock('./components/AppShell', () => ({
  default: () => <div data-testid="app-shell">AppShell</div>,
}));

test('/login renders LoginPage', () => {
  window.history.pushState({}, '', '/login');
  render(<App />);
  expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
});

test('/app redirects to /login when unauthenticated', async () => {
  window.history.pushState({}, '', '/app');
  render(<App />);
  // Wait for AuthProvider to finish initializing (authApi.refresh rejects → initializing becomes false)
  // then ProtectedRoute redirects unauthenticated user to /login
  expect(await screen.findByRole('button', { name: /login/i })).toBeInTheDocument();
});
