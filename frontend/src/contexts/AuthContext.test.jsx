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
  resolveReauthQueue: vi.fn(),
  rejectReauthQueue: vi.fn(),
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

function ShowReauth() {
  const {
    user, reauthVisible, confirmVisible,
    onReauthSuccess, onReauthCancel, onConfirmLogin, onConfirmCancel,
  } = useAuth();
  return (
    <>
      <span data-testid="user">{user?.username ?? 'none'}</span>
      <span data-testid="reauth">{String(reauthVisible)}</span>
      <span data-testid="confirm">{String(confirmVisible)}</span>
      <button onClick={() => onReauthSuccess('new-tok', { username: 'alice', role: 'STUDENT' })}>
        ReauthSuccess
      </button>
      <button onClick={onReauthCancel}>ReauthCancel</button>
      <button onClick={onConfirmLogin}>ConfirmLogin</button>
      <button onClick={onConfirmCancel}>ConfirmCancel</button>
    </>
  );
}

test('onUnauthorized: shows ReauthModal without clearing user', async () => {
  // Bootstrap with a valid session first
  vi.mocked(axiosInstance.post).mockResolvedValueOnce({
    data: { accessToken: 'tok', user: { username: 'alice', role: 'STUDENT', id: 1 } },
  });
  render(<AuthProvider><ShowReauth /></AuthProvider>);
  await waitFor(() =>
    expect(screen.getByTestId('user')).toHaveTextContent('alice')
  );

  const { setAuthHandlers } = await import('../api/axiosInstance');
  const unauthorizedHandler = vi.mocked(setAuthHandlers).mock.calls.at(-1)[1];
  unauthorizedHandler();

  expect(screen.getByTestId('user')).toHaveTextContent('alice'); // user preserved
  expect(screen.getByTestId('reauth')).toHaveTextContent('true');
});

test('onReauthSuccess: sets new token, closes modal, calls resolveReauthQueue', async () => {
  const { resolveReauthQueue } = await import('../api/axiosInstance');
  render(<AuthProvider><ShowReauth /></AuthProvider>);

  const { setAuthHandlers } = await import('../api/axiosInstance');
  const unauthorizedHandler = vi.mocked(setAuthHandlers).mock.calls.at(-1)[1];
  unauthorizedHandler();

  await userEvent.click(screen.getByText('ReauthSuccess'));

  expect(screen.getByTestId('reauth')).toHaveTextContent('false');
  expect(vi.mocked(resolveReauthQueue)).toHaveBeenCalledWith('new-tok');
});

test('onReauthCancel: closes modal, marks dismissed, calls rejectReauthQueue', async () => {
  const { rejectReauthQueue } = await import('../api/axiosInstance');
  render(<AuthProvider><ShowReauth /></AuthProvider>);

  const { setAuthHandlers } = await import('../api/axiosInstance');
  const unauthorizedHandler = vi.mocked(setAuthHandlers).mock.calls.at(-1)[1];
  unauthorizedHandler(); // open modal
  await userEvent.click(screen.getByText('ReauthCancel')); // cancel

  expect(screen.getByTestId('reauth')).toHaveTextContent('false');
  expect(vi.mocked(rejectReauthQueue)).toHaveBeenCalled();

  // Second onUnauthorized should show ConfirmReauthDialog instead of modal
  unauthorizedHandler();
  expect(screen.getByTestId('reauth')).toHaveTextContent('false');
  expect(screen.getByTestId('confirm')).toHaveTextContent('true');
});

test('onConfirmLogin: closes confirm dialog, opens modal', async () => {
  render(<AuthProvider><ShowReauth /></AuthProvider>);

  const { setAuthHandlers } = await import('../api/axiosInstance');
  const unauthorizedHandler = vi.mocked(setAuthHandlers).mock.calls.at(-1)[1];
  unauthorizedHandler();
  await userEvent.click(screen.getByText('ReauthCancel')); // dismiss modal → dismissed flag set
  unauthorizedHandler(); // next action → confirm dialog

  await userEvent.click(screen.getByText('ConfirmLogin'));
  expect(screen.getByTestId('confirm')).toHaveTextContent('false');
  expect(screen.getByTestId('reauth')).toHaveTextContent('true');
});

test('onConfirmCancel: closes confirm dialog, calls rejectReauthQueue', async () => {
  const { rejectReauthQueue } = await import('../api/axiosInstance');
  render(<AuthProvider><ShowReauth /></AuthProvider>);

  const { setAuthHandlers } = await import('../api/axiosInstance');
  const unauthorizedHandler = vi.mocked(setAuthHandlers).mock.calls.at(-1)[1];
  unauthorizedHandler();
  await userEvent.click(screen.getByText('ReauthCancel'));
  unauthorizedHandler();

  await userEvent.click(screen.getByText('ConfirmCancel'));
  expect(screen.getByTestId('confirm')).toHaveTextContent('false');
  expect(vi.mocked(rejectReauthQueue)).toHaveBeenCalled();
});
