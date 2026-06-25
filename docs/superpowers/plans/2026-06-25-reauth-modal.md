# Session Re-authentication Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "navigate to /login on token expiry" flow with an overlay modal that keeps the page mounted and all in-progress work intact, so users can re-authenticate without losing unsaved state.

**Architecture:** When token refresh fails, `onUnauthorized` in AuthContext sets `reauthVisible = true` instead of clearing `user` — so `ProtectedRoute` never redirects and page components stay mounted. A `ReauthModal` overlay at the App root handles credential entry. Requests that failed due to expiry are held in a `reauthQueue` inside axiosInstance and are replayed (or rejected) once the modal resolves. After the modal is dismissed once, subsequent authenticated actions trigger a lightweight `ConfirmReauthDialog` before re-opening the modal.

**Tech Stack:** React 18, Vitest 4, @testing-library/react, axios

## Global Constraints

- No new npm dependencies
- All components use inline styles (existing project convention — no CSS files)
- `zIndex: 9000` for modal overlays (above all existing page content)
- Error codes to handle in ReauthModal: `ACCOUNT_DISABLED`, `ACCOUNT_EXPIRED`, `RATE_LIMITED`, and invalid credentials (same messages as LoginPage)
- `user` is NEVER cleared by `onUnauthorized` — only by explicit `logout()`
- No `navigate()` or route change during reauth; page URL stays the same
- Remove `sessionStorage.setItem('returnUrl', ...)` from `onUnauthorized` — page never navigates away so the return URL is irrelevant
- Remove the `toast.error('Your session has expired…')` call from `onUnauthorized` — the modal communicates the expiry

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/api/axiosInstance.js` | Modify | Add `reauthQueue`, `resolveReauthQueue`, `rejectReauthQueue`, `isReauthCancelled`; fix `pendingRequests` to drain on refresh failure |
| `frontend/src/api/axiosInstance.test.js` | Create | Tests for `isReauthCancelled` |
| `frontend/src/contexts/AuthContext.jsx` | Modify | Add `reauthVisible`, `confirmVisible`, `reauthDismissedRef`; rewrite `onUnauthorized`; add 4 new handlers |
| `frontend/src/contexts/AuthContext.test.jsx` | Modify | Update stale `onUnauthorized` test; add reauth handler tests |
| `frontend/src/components/ReauthModal.jsx` | Create | Full-screen overlay login form; reads context, calls `authApi.login` |
| `frontend/src/components/ReauthModal.test.jsx` | Create | Render, submit, error, and cancel tests |
| `frontend/src/components/ConfirmReauthDialog.jsx` | Create | Lightweight "Log in / Cancel" dialog |
| `frontend/src/components/ConfirmReauthDialog.test.jsx` | Create | Render and button tests |
| `frontend/src/App.jsx` | Modify | Mount `<ReauthModal />` and `<ConfirmReauthDialog />` inside `AuthProvider` |

---

### Task 1: Extend axiosInstance with reauthQueue

**Files:**
- Modify: `frontend/src/api/axiosInstance.js`
- Create: `frontend/src/api/axiosInstance.test.js`

**Interfaces:**
- Produces:
  - `resolveReauthQueue(newToken: string): void` — replay all queued requests with new token; exported, called by AuthContext's `onReauthSuccess`
  - `rejectReauthQueue(): void` — reject all queued requests with `Error('REAUTH_CANCELLED')`; exported, called by AuthContext's `onReauthCancel` and `onConfirmCancel`
  - `isReauthCancelled(err: unknown): boolean` — pure helper for callers to silence reauth-cancelled errors
  - `setAuthHandlers(tokenGetter, onUnauthorized)` — unchanged signature

- [ ] **Step 1: Write failing tests for `isReauthCancelled`**

Create `frontend/src/api/axiosInstance.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isReauthCancelled } from './axiosInstance';

describe('isReauthCancelled', () => {
  it('returns true for a REAUTH_CANCELLED error', () => {
    expect(isReauthCancelled(new Error('REAUTH_CANCELLED'))).toBe(true);
  });

  it('returns false for other error messages', () => {
    expect(isReauthCancelled(new Error('Network Error'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isReauthCancelled(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isReauthCancelled(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/api/axiosInstance.test.js
```

Expected: FAIL — `isReauthCancelled is not a function`

- [ ] **Step 3: Replace `frontend/src/api/axiosInstance.js` with the new implementation**

```js
import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

let getToken = () => null;
let onUnauthorized = () => {};

export function setAuthHandlers(tokenGetter, unauthorizedHandler) {
  getToken = tokenGetter;
  onUnauthorized = unauthorizedHandler;
}

axiosInstance.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
// Each entry: { onToken: (token: string) => void, reject: (err: Error) => void }
let pendingRequests = [];

// Requests waiting for the user to re-authenticate via the modal
let reauthQueue = [];
let isWaitingReauth = false;

export function resolveReauthQueue(newToken) {
  isWaitingReauth = false;
  const queue = reauthQueue;
  reauthQueue = [];
  queue.forEach(({ config, resolve }) => {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${newToken}`;
    resolve(axiosInstance(config));
  });
}

export function rejectReauthQueue() {
  isWaitingReauth = false;
  const queue = reauthQueue;
  reauthQueue = [];
  queue.forEach(({ reject }) => reject(new Error('REAUTH_CANCELLED')));
}

export function isReauthCancelled(err) {
  return err?.message === 'REAUTH_CANCELLED';
}

axiosInstance.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/v1/auth/')) {
      original._retry = true;
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const res = await axiosInstance.post('/v1/auth/refresh');
          const newToken = res.data.accessToken;
          pendingRequests.forEach(({ onToken }) => onToken(newToken));
          pendingRequests = [];
          return axiosInstance(original);
        } catch (_) {
          // Drain concurrent requests: reject them so callers get REAUTH_CANCELLED
          pendingRequests.forEach(({ reject }) => reject(new Error('REAUTH_CANCELLED')));
          pendingRequests = [];
          // Queue this request and signal that reauth is needed
          if (!isWaitingReauth) {
            isWaitingReauth = true;
            onUnauthorized();
          }
          return new Promise((resolve, reject) => {
            reauthQueue.push({ config: original, resolve, reject });
          });
        } finally {
          isRefreshing = false;
        }
      }
      // Concurrent request during active refresh — wait for the outcome
      return new Promise((resolve, reject) => {
        pendingRequests.push({
          onToken: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(axiosInstance(original));
          },
          reject,
        });
      });
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/api/axiosInstance.test.js
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/axiosInstance.js frontend/src/api/axiosInstance.test.js
git commit -m "feat(auth): add reauthQueue to axiosInstance for modal re-authentication"
```

---

### Task 2: Update AuthContext with reauth states and handlers

**Files:**
- Modify: `frontend/src/contexts/AuthContext.jsx`
- Modify: `frontend/src/contexts/AuthContext.test.jsx`

**Interfaces:**
- Consumes (from Task 1):
  - `resolveReauthQueue(newToken: string): void`
  - `rejectReauthQueue(): void`
- Produces (new context values):
  - `reauthVisible: boolean`
  - `confirmVisible: boolean`
  - `onReauthSuccess(token: string, userData: object): Promise<void>`
  - `onReauthCancel(): void`
  - `onConfirmLogin(): void`
  - `onConfirmCancel(): void`

- [ ] **Step 1: Update the axiosInstance mock in `AuthContext.test.jsx` to include new exports, and replace the stale `onUnauthorized` test**

At the top of `frontend/src/contexts/AuthContext.test.jsx`, the existing `vi.mock('../api/axiosInstance', ...)` block must include the two new exports. Find this block:

```js
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
```

Replace it with:

```js
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
```

Then delete the existing test named `'onUnauthorized: clears user state and saves returnUrl to sessionStorage'` (the entire `test(...)` block at the bottom of the file) and replace it with these four new tests. Append them after the last existing test:

```js
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
```

- [ ] **Step 2: Run the tests to confirm the new ones fail**

```bash
cd frontend && npx vitest run src/contexts/AuthContext.test.jsx
```

Expected: original 6 tests pass, 5 new ones fail (new context values not yet exported)

- [ ] **Step 3: Replace `frontend/src/contexts/AuthContext.jsx` with the new implementation**

```jsx
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance, { setAuthHandlers, resolveReauthQueue, rejectReauthQueue } from '../api/axiosInstance';
import { authApi } from '../api/authApi';
import { settingsApi } from '../api/settingsApi';
import { SECTIONS } from '../components/sectionConfig';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [menuSections, setMenuSections] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const [reauthVisible, setReauthVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const tokenRef = useRef(null);
  const reauthDismissedRef = useRef(false);

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  useEffect(() => {
    authApi.refresh()
      .then(async ({ accessToken: tok, user: userData }) => {
        tokenRef.current = tok;
        setAccessToken(tok);
        setUser(userData);
        try {
          const data = await settingsApi.getMenuConfig();
          setMenuSections(data.sections);
        } catch {
          const fallback = SECTIONS
            .filter(s => s.roles.includes(userData.role))
            .map(s => s.key);
          setMenuSections(fallback);
        }
      })
      .catch(() => {})
      .finally(() => setInitializing(false));
  }, []);

  const login = useCallback(async (token, userData) => {
    tokenRef.current = token;
    setAccessToken(token);
    setUser(userData);
    try {
      const data = await settingsApi.getMenuConfig();
      setMenuSections(data.sections);
    } catch {
      const fallback = SECTIONS
        .filter(s => s.roles.includes(userData.role))
        .map(s => s.key);
      setMenuSections(fallback);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await axiosInstance.post('/v1/auth/logout'); } catch (_) {}
    setAccessToken(null);
    setUser(null);
    setMenuSections([]);
  }, []);

  const onReauthSuccess = useCallback(async (token, userData) => {
    tokenRef.current = token;
    setAccessToken(token);
    setUser(userData);
    reauthDismissedRef.current = false;
    setReauthVisible(false);
    resolveReauthQueue(token);
    try {
      const data = await settingsApi.getMenuConfig();
      setMenuSections(data.sections);
    } catch {
      const fallback = SECTIONS
        .filter(s => s.roles.includes(userData.role))
        .map(s => s.key);
      setMenuSections(fallback);
    }
  }, []);

  const onReauthCancel = useCallback(() => {
    reauthDismissedRef.current = true;
    setReauthVisible(false);
    rejectReauthQueue();
  }, []);

  const onConfirmLogin = useCallback(() => {
    setConfirmVisible(false);
    setReauthVisible(true);
  }, []);

  const onConfirmCancel = useCallback(() => {
    setConfirmVisible(false);
    rejectReauthQueue();
  }, []);

  useEffect(() => {
    setAuthHandlers(
      () => tokenRef.current,
      () => {
        setAccessToken(null);
        tokenRef.current = null;
        if (!reauthDismissedRef.current) {
          setReauthVisible(true);
        } else {
          setConfirmVisible(true);
        }
      }
    );
  }, []);

  return (
    <AuthContext.Provider value={{
      user, accessToken, menuSections, login, logout, initializing,
      reauthVisible, confirmVisible,
      onReauthSuccess, onReauthCancel, onConfirmLogin, onConfirmCancel,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Run tests to confirm all pass**

```bash
cd frontend && npx vitest run src/contexts/AuthContext.test.jsx
```

Expected: PASS — 11 tests (6 original + 5 new)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/AuthContext.jsx frontend/src/contexts/AuthContext.test.jsx
git commit -m "feat(auth): add reauth modal state and handlers to AuthContext"
```

---

### Task 3: Create ReauthModal component

**Files:**
- Create: `frontend/src/components/ReauthModal.jsx`
- Create: `frontend/src/components/ReauthModal.test.jsx`

**Interfaces:**
- Consumes (from Task 2):
  - `reauthVisible: boolean` from `useAuth()`
  - `onReauthSuccess(token, userData): Promise<void>` from `useAuth()`
  - `onReauthCancel(): void` from `useAuth()`
- Consumes: `authApi.login(username, password)` from `../api/authApi`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/ReauthModal.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ReauthModal from './ReauthModal';

const mockOnReauthSuccess = vi.fn();
const mockOnReauthCancel = vi.fn();
let mockReauthVisible = true;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    reauthVisible: mockReauthVisible,
    onReauthSuccess: mockOnReauthSuccess,
    onReauthCancel: mockOnReauthCancel,
  }),
}));

vi.mock('../api/authApi', () => ({
  authApi: {
    login: vi.fn(),
  },
}));

import { authApi } from '../api/authApi';

beforeEach(() => {
  vi.clearAllMocks();
  mockReauthVisible = true;
});

describe('ReauthModal', () => {
  it('renders when reauthVisible is true', () => {
    render(<ReauthModal />);
    expect(screen.getByText('Session Expired')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('does not render when reauthVisible is false', () => {
    mockReauthVisible = false;
    render(<ReauthModal />);
    expect(screen.queryByText('Session Expired')).not.toBeInTheDocument();
  });

  it('calls onReauthSuccess with token and user on successful login', async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce({
      accessToken: 'new-tok',
      user: { username: 'alice', role: 'STUDENT', id: 1 },
    });
    render(<ReauthModal />);
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() =>
      expect(mockOnReauthSuccess).toHaveBeenCalledWith('new-tok', { username: 'alice', role: 'STUDENT', id: 1 })
    );
  });

  it('shows error message on invalid credentials', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: { data: { error: { code: 'INVALID_CREDENTIALS' } } },
    });
    render(<ReauthModal />);
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid username or password')
    );
  });

  it('shows account-disabled error', async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: { data: { error: { code: 'ACCOUNT_DISABLED' } } },
    });
    render(<ReauthModal />);
    await userEvent.type(screen.getByLabelText('Username'), 'alice');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Account disabled')
    );
  });

  it('calls onReauthCancel when Cancel is clicked', async () => {
    render(<ReauthModal />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockOnReauthCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/ReauthModal.test.jsx
```

Expected: FAIL — `Cannot find module './ReauthModal'`

- [ ] **Step 3: Create `frontend/src/components/ReauthModal.jsx`**

```jsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/authApi';

export default function ReauthModal() {
  const { reauthVisible, onReauthSuccess, onReauthCancel } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!reauthVisible) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login(username, password);
      setUsername('');
      setPassword('');
      onReauthSuccess(data.accessToken, data.user);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'ACCOUNT_DISABLED') {
        setError('Account disabled — please contact an administrator');
      } else if (code === 'ACCOUNT_EXPIRED') {
        setError('Account expired — please contact an administrator');
      } else if (code === 'RATE_LIMITED') {
        setError('Too many login attempts. Please try again in 1 minute.');
      } else {
        setError('Invalid username or password');
      }
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, fontFamily: 'sans-serif',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', borderRadius: 8, padding: 32, width: 360,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <h2 style={{ marginBottom: 8 }}>Session Expired</h2>
        <p style={{ marginBottom: 24, color: '#555', fontSize: 14 }}>
          Please log in to continue.
        </p>
        {error && (
          <div role="alert" style={{
            marginBottom: 16, padding: 10,
            background: '#fdecea', color: '#c62828', borderRadius: 4,
          }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="reauth-username">Username</label>
          <input
            id="reauth-username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoComplete="username"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="reauth-password">Password</label>
          <input
            id="reauth-password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onReauthCancel}
            disabled={loading}
            style={{
              padding: '10px 20px', border: '1px solid #ccc', borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer', background: '#fff',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: loading ? '#90caf9' : '#1976d2',
              color: '#fff', border: 'none', borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/ReauthModal.test.jsx
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReauthModal.jsx frontend/src/components/ReauthModal.test.jsx
git commit -m "feat(auth): add ReauthModal overlay component"
```

---

### Task 4: Create ConfirmReauthDialog component

**Files:**
- Create: `frontend/src/components/ConfirmReauthDialog.jsx`
- Create: `frontend/src/components/ConfirmReauthDialog.test.jsx`

**Interfaces:**
- Consumes (from Task 2):
  - `confirmVisible: boolean` from `useAuth()`
  - `onConfirmLogin(): void` from `useAuth()`
  - `onConfirmCancel(): void` from `useAuth()`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/ConfirmReauthDialog.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ConfirmReauthDialog from './ConfirmReauthDialog';

const mockOnConfirmLogin = vi.fn();
const mockOnConfirmCancel = vi.fn();
let mockConfirmVisible = true;

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    confirmVisible: mockConfirmVisible,
    onConfirmLogin: mockOnConfirmLogin,
    onConfirmCancel: mockOnConfirmCancel,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockConfirmVisible = true;
});

describe('ConfirmReauthDialog', () => {
  it('renders when confirmVisible is true', () => {
    render(<ConfirmReauthDialog />);
    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not render when confirmVisible is false', () => {
    mockConfirmVisible = false;
    render(<ConfirmReauthDialog />);
    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
  });

  it('calls onConfirmLogin when Log in is clicked', async () => {
    render(<ConfirmReauthDialog />);
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(mockOnConfirmLogin).toHaveBeenCalledOnce();
  });

  it('calls onConfirmCancel when Cancel is clicked', async () => {
    render(<ConfirmReauthDialog />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockOnConfirmCancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/ConfirmReauthDialog.test.jsx
```

Expected: FAIL — `Cannot find module './ConfirmReauthDialog'`

- [ ] **Step 3: Create `frontend/src/components/ConfirmReauthDialog.jsx`**

```jsx
import { useAuth } from '../contexts/AuthContext';

export default function ConfirmReauthDialog() {
  const { confirmVisible, onConfirmLogin, onConfirmCancel } = useAuth();

  if (!confirmVisible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000, fontFamily: 'sans-serif',
    }}>
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, width: 360,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      }}>
        <p style={{ marginBottom: 20 }}>
          Your session has expired. Please log in to continue this action.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onConfirmCancel}
            style={{
              padding: '8px 16px', border: '1px solid #ccc',
              borderRadius: 4, cursor: 'pointer', background: '#fff',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirmLogin}
            style={{
              padding: '8px 16px', background: '#1976d2',
              color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
            }}
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/ConfirmReauthDialog.test.jsx
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ConfirmReauthDialog.jsx frontend/src/components/ConfirmReauthDialog.test.jsx
git commit -m "feat(auth): add ConfirmReauthDialog for post-dismissal authenticated actions"
```

---

### Task 5: Wire up in App.jsx and run full test suite

**Files:**
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes (from Tasks 3 & 4): `ReauthModal`, `ConfirmReauthDialog` components

- [ ] **Step 1: Update `frontend/src/App.jsx`**

Add the two imports after the existing imports:

```jsx
import ReauthModal from './components/ReauthModal';
import ConfirmReauthDialog from './components/ConfirmReauthDialog';
```

Replace the return body — mount both components inside `AuthProvider`, outside `BrowserRouter` so they are never unmounted by route changes:

```jsx
export default function App() {
  return (
    <AppErrorBoundary>
      <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute requiredRole="STUDENT">
                  <AppShell />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
        <ReauthModal />
        <ConfirmReauthDialog />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
```

- [ ] **Step 2: Run the full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass. If `App.test.jsx` fails because it checks for toast calls from `onUnauthorized`, update it to not assert on that toast — the behaviour has been removed.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(auth): mount ReauthModal and ConfirmReauthDialog in App root"
```

---

## Self-Review Checklist

- [x] **Spec: `onUnauthorized` keeps `user` alive** → Task 2 Step 3: `setUser` is never called in the new `onUnauthorized`
- [x] **Spec: first expiry shows ReauthModal directly** → Task 2: `!reauthDismissedRef.current` → `setReauthVisible(true)`
- [x] **Spec: dismissed modal → ConfirmReauthDialog on next action** → Task 2: `reauthDismissedRef.current = true` in `onReauthCancel`; checked in `onUnauthorized`
- [x] **Spec: ConfirmReauthDialog Log in → ReauthModal** → `onConfirmLogin` closes confirm, opens modal (Task 2)
- [x] **Spec: ConfirmReauthDialog Cancel → reject operation, page stays** → `onConfirmCancel` calls `rejectReauthQueue()` (Tasks 1 & 2)
- [x] **Spec: re-login success replays queued requests** → `resolveReauthQueue(token)` called in `onReauthSuccess` (Task 2)
- [x] **Spec: cancel rejects queued requests silently** → `rejectReauthQueue()` called in `onReauthCancel` (Tasks 1 & 2); `isReauthCancelled` helper exported for callers
- [x] **Spec: concurrent 401s during refresh only call `onUnauthorized` once** → `isWaitingReauth` guard in axiosInstance (Task 1)
- [x] **Spec: error codes in ReauthModal match LoginPage** → Task 3: `ACCOUNT_DISABLED`, `ACCOUNT_EXPIRED`, `RATE_LIMITED`, fallback (Task 3)
- [x] **Spec: no new dependencies** → all changes use existing axios, React, authApi
- [x] **Spec: `zIndex: 9000`** → both overlay components (Tasks 3 & 4)
- [x] **Spec: sessionStorage returnUrl logic removed from `onUnauthorized`** → Task 2 Step 3: not present in new implementation
- [x] **Spec: toast.error removed from `onUnauthorized`** → Task 2 Step 3: `toast` import removed, not called
