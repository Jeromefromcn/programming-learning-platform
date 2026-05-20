import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import axiosInstance from '../api/axiosInstance';

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

test('initializing is true before bootstrap resolves', () => {
  vi.mocked(axiosInstance.post).mockReturnValueOnce(new Promise(() => {}));
  function ShowInit() {
    const { initializing } = useAuth();
    return <span data-testid="init">{String(initializing)}</span>;
  }
  render(<AuthProvider><ShowInit /></AuthProvider>);
  expect(screen.getByTestId('init')).toHaveTextContent('true');
});

test('bootstrap: restores user and token from valid refresh cookie', async () => {
  vi.mocked(axiosInstance.post).mockResolvedValueOnce({
    data: { accessToken: 'restored-tok', user: { username: 'bob', role: 'TUTOR', id: 2 } },
  });
  function ShowAuth() {
    const { user, accessToken, initializing } = useAuth();
    return (
      <>
        <span data-testid="user">{user?.username ?? 'none'}</span>
        <span data-testid="token">{accessToken ?? 'none'}</span>
        <span data-testid="init">{String(initializing)}</span>
      </>
    );
  }
  render(<AuthProvider><ShowAuth /></AuthProvider>);
  await waitFor(() =>
    expect(screen.getByTestId('init')).toHaveTextContent('false')
  );
  expect(screen.getByTestId('user')).toHaveTextContent('bob');
  expect(screen.getByTestId('token')).toHaveTextContent('restored-tok');
});

test('bootstrap: initializing becomes false when refresh fails', async () => {
  vi.mocked(axiosInstance.post).mockRejectedValueOnce(new Error('no cookie'));
  function ShowInit() {
    const { user, initializing } = useAuth();
    return (
      <>
        <span data-testid="init">{String(initializing)}</span>
        <span data-testid="user">{user?.username ?? 'none'}</span>
      </>
    );
  }
  render(<AuthProvider><ShowInit /></AuthProvider>);
  await waitFor(() =>
    expect(screen.getByTestId('init')).toHaveTextContent('false')
  );
  expect(screen.getByTestId('user')).toHaveTextContent('none');
});

test('onUnauthorized: clears user state and saves returnUrl to sessionStorage', async () => {
  vi.mocked(axiosInstance.post).mockRejectedValueOnce(new Error('no cookie'));
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

  function ShowUser() {
    const { user } = useAuth();
    return <span data-testid="user">{user?.username ?? 'none'}</span>;
  }
  render(<AuthProvider><ShowUser /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));

  const { setAuthHandlers } = await import('../api/axiosInstance');
  const unauthorizedHandler = vi.mocked(setAuthHandlers).mock.calls.at(-1)[1];

  unauthorizedHandler();

  expect(setItemSpy).toHaveBeenCalledWith('returnUrl', expect.stringContaining('/'));
  setItemSpy.mockRestore();
});
