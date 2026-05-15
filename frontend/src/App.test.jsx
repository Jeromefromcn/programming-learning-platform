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
