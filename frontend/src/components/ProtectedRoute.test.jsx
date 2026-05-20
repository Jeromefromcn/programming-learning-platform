import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext';

test('shows loading while initializing', () => {
  vi.mocked(useAuth).mockReturnValue({ user: null, initializing: true });
  render(
    <MemoryRouter>
      <ProtectedRoute requiredRole="STUDENT"><span>protected</span></ProtectedRoute>
    </MemoryRouter>
  );
  expect(screen.getByText('Loading…')).toBeInTheDocument();
  expect(screen.queryByText('protected')).not.toBeInTheDocument();
});

test('redirects to /login when not initializing and no user', () => {
  vi.mocked(useAuth).mockReturnValue({ user: null, initializing: false });
  render(
    <MemoryRouter initialEntries={['/app']}>
      <ProtectedRoute requiredRole="STUDENT"><span>protected</span></ProtectedRoute>
    </MemoryRouter>
  );
  expect(screen.queryByText('protected')).not.toBeInTheDocument();
});

test('renders children when user has required role', () => {
  vi.mocked(useAuth).mockReturnValue({
    user: { role: 'TUTOR' },
    initializing: false,
  });
  render(
    <MemoryRouter>
      <ProtectedRoute requiredRole="STUDENT"><span>protected</span></ProtectedRoute>
    </MemoryRouter>
  );
  expect(screen.getByText('protected')).toBeInTheDocument();
});
