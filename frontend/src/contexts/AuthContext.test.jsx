import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const mockGet = vi.hoisted(() => vi.fn());

vi.mock('../api/axiosInstance', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    get: mockGet,
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
  setAuthHandlers: vi.fn(),
}));

function ShowAuth() {
  const { user, accessToken, menuSections, login } = useAuth();
  return (
    <>
      <span data-testid="user">{user?.username ?? 'none'}</span>
      <span data-testid="token">{accessToken ?? 'none'}</span>
      <span data-testid="sections">{menuSections.join(',')}</span>
      <button onClick={() => login('tok', { username: 'alice', role: 'STUDENT' })}>Login</button>
    </>
  );
}

beforeEach(() => {
  mockGet.mockResolvedValue({ data: { sections: ['exercises', 'progress'] } });
});

test('initial state: user null, token null, menuSections empty', () => {
  render(<AuthProvider><ShowAuth /></AuthProvider>);
  expect(screen.getByTestId('user')).toHaveTextContent('none');
  expect(screen.getByTestId('token')).toHaveTextContent('none');
  expect(screen.getByTestId('sections')).toHaveTextContent('');
});

test('login sets menuSections from API', async () => {
  render(<AuthProvider><ShowAuth /></AuthProvider>);
  await userEvent.click(screen.getByText('Login'));
  await waitFor(() =>
    expect(screen.getByTestId('sections')).toHaveTextContent('exercises,progress')
  );
});

test('login falls back to sectionConfig defaults when API fails', async () => {
  mockGet.mockRejectedValueOnce(new Error('network error'));
  render(<AuthProvider><ShowAuth /></AuthProvider>);
  await userEvent.click(screen.getByText('Login'));
  await waitFor(() =>
    expect(screen.getByTestId('sections')).toHaveTextContent('exercises,progress')
  );
});
