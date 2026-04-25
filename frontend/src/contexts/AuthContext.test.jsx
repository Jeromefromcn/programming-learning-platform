import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { vi } from 'vitest';

vi.mock('../api/axiosInstance', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  setAuthHandlers: vi.fn(),
}));

function ShowAuth() {
  const { user, accessToken } = useAuth();
  return (
    <>
      <span data-testid="user">{user?.username ?? 'none'}</span>
      <span data-testid="token">{accessToken ?? 'none'}</span>
    </>
  );
}

test('initial state is null', () => {
  render(<AuthProvider><ShowAuth /></AuthProvider>);
  expect(screen.getByTestId('user')).toHaveTextContent('none');
  expect(screen.getByTestId('token')).toHaveTextContent('none');
});
