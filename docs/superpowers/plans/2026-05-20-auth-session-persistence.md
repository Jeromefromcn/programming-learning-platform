# Auth Session Persistence & Expiry Notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two auth UX issues — page refresh no longer forces re-login (session restored from HttpOnly cookie), and session expiry shows a toast before redirecting to login with a returnUrl.

**Architecture:** Backend refresh endpoint is extended to return full `AuthResponse` (accessToken + user). `AuthContext` bootstraps on mount by calling `authApi.refresh()` to silently restore the session; a new `initializing` flag prevents premature login redirects. When both tokens expire, `onUnauthorized` saves the current path to `sessionStorage`, shows a `react-hot-toast` toast, and clears state — `ProtectedRoute` then redirects to `/login`. After re-login, `LoginPage` reads `sessionStorage` and navigates back to the saved path.

**Tech Stack:** Java 17 / Spring Boot 3.2.5 / MockMvc (backend); React 18 / Vitest / @testing-library/react / react-hot-toast (frontend)

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `backend/src/main/java/com/platform/exercise/auth/AuthService.java` | Modify | `refresh()` returns `AuthResponse` instead of `String` |
| `backend/src/main/java/com/platform/exercise/auth/AuthController.java` | Modify | `refresh` endpoint returns `ResponseEntity<AuthResponse>` |
| `backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java` | Modify | Add test: refresh returns user data |
| `frontend/package.json` | Modify | Add `react-hot-toast` dependency |
| `frontend/src/App.jsx` | Modify | Add `<Toaster>` component |
| `frontend/src/contexts/AuthContext.jsx` | Modify | Add `initializing` state, bootstrap effect, toast in `onUnauthorized` |
| `frontend/src/contexts/AuthContext.test.jsx` | Modify | Add tests for bootstrap behaviour and `initializing` |
| `frontend/src/components/ProtectedRoute.jsx` | Modify | Render loading indicator while `initializing === true` |
| `frontend/src/pages/login/LoginPage.jsx` | Modify | Read `returnUrl` from `sessionStorage` after login |

---

## Task 1: Backend — Refresh Returns User Data (TDD)

**Files:**
- Test: `backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java`
- Modify: `backend/src/main/java/com/platform/exercise/auth/AuthService.java`
- Modify: `backend/src/main/java/com/platform/exercise/auth/AuthController.java`

- [ ] **Step 1: Add the failing test**

Open `backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java` and add this test after the existing `refresh_noToken_returns401` test:

```java
@Test
void refresh_validCookie_returnsAccessTokenAndUser() throws Exception {
    // First login to obtain a refresh cookie
    var loginResult = mockMvc.perform(post("/v1/auth/login")
            .contentType("application/json")
            .content("{\"username\":\"testuser\",\"password\":\"password123\"}"))
        .andExpect(status().isOk())
        .andReturn();

    jakarta.servlet.http.Cookie refreshCookie = loginResult.getResponse().getCookie("refreshToken");

    // Now call refresh with that cookie
    mockMvc.perform(post("/v1/auth/refresh").cookie(refreshCookie))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accessToken").isNotEmpty())
        .andExpect(jsonPath("$.user.username").value("testuser"))
        .andExpect(jsonPath("$.user.role").value("STUDENT"));
}
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=AuthControllerTest#refresh_validCookie_returnsAccessTokenAndUser -q
```

Expected: FAIL — the response currently only has `accessToken`, no `user` field.

- [ ] **Step 3: Change `AuthService.refresh()` to return `AuthResponse`**

In `backend/src/main/java/com/platform/exercise/auth/AuthService.java`, replace the entire `refresh` method (lines 63–77):

```java
@Transactional
public AuthResponse refresh(String rawToken) {
    String hash = sha256(rawToken);
    RefreshToken rt = refreshTokenRepository.findByTokenHash(hash)
        .orElseThrow(() -> new PlatformException(ErrorCode.TOKEN_EXPIRED, "Refresh token invalid or expired"));

    if (rt.getExpiresAt().isBefore(LocalDateTime.now())) {
        refreshTokenRepository.delete(rt);
        throw new PlatformException(ErrorCode.TOKEN_EXPIRED, "Refresh token expired");
    }

    User user = userRepository.findById(rt.getUserId())
        .orElseThrow(() -> new PlatformException(ErrorCode.TOKEN_EXPIRED, "User not found"));

    String accessToken = jwtUtil.generateToken(user.getId(), user.getRole().name());
    return new AuthResponse(accessToken, UserDto.from(user));
}
```

- [ ] **Step 4: Change `AuthController.refresh()` to return `AuthResponse`**

In `backend/src/main/java/com/platform/exercise/auth/AuthController.java`, replace the entire `refresh` method (lines 31–37):

```java
@PostMapping("/refresh")
public ResponseEntity<AuthResponse> refresh(
        @CookieValue(name = "refreshToken", required = false) String refreshToken) {
    if (refreshToken == null) {
        throw new PlatformException(ErrorCode.TOKEN_EXPIRED, "No refresh token");
    }
    return ResponseEntity.ok(authService.refresh(refreshToken));
}
```

Also remove the now-unused `import java.util.Map;` line at the top of the file.

- [ ] **Step 5: Run all backend auth tests — expect PASS**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=AuthControllerTest -q
```

Expected: All 6 tests pass. The existing `refresh_noToken_returns401` test is unaffected because that path throws before returning a body.

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git add backend/src/main/java/com/platform/exercise/auth/AuthService.java \
        backend/src/main/java/com/platform/exercise/auth/AuthController.java \
        backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java
git commit -m "feat(auth): refresh endpoint returns AuthResponse with user data"
```

---

## Task 2: Frontend — Install react-hot-toast and Add Toaster

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/App.jsx`

No unit tests required — this is infrastructure only. The toast rendering is tested indirectly through AuthContext tests in Task 3.

- [ ] **Step 1: Install react-hot-toast**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npm install react-hot-toast
```

Expected: `package.json` and `package-lock.json` updated, `react-hot-toast` added under `dependencies`.

- [ ] **Step 2: Add `<Toaster>` to App.jsx**

Open `frontend/src/App.jsx`. Add the import at the top (after existing imports):

```jsx
import { Toaster } from 'react-hot-toast';
```

Then add `<Toaster>` as the first child of `<AppErrorBoundary>`, before `<AuthProvider>`. The full `App` function becomes:

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
      </AuthProvider>
    </AppErrorBoundary>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git add frontend/package.json frontend/package-lock.json frontend/src/App.jsx
git commit -m "feat(auth): add react-hot-toast Toaster to app root"
```

---

## Task 3: Frontend — AuthContext Bootstrap (TDD)

**Files:**
- Test: `frontend/src/contexts/AuthContext.test.jsx`
- Modify: `frontend/src/contexts/AuthContext.jsx`

- [ ] **Step 1: Add bootstrap tests to AuthContext.test.jsx**

The existing file mocks `axiosInstance` at the module level. The bootstrap calls `authApi.refresh()` which calls `axiosInstance.post('/v1/auth/refresh').then(r => r.data)`. The existing mock returns `{}` for all `post` calls, so `r.data` is `undefined` — the bootstrap `.then()` destructures `undefined` and throws, caught by `.catch()`. Existing tests remain unaffected.

Add these new tests at the end of `frontend/src/contexts/AuthContext.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import axiosInstance from '../api/axiosInstance';
```

The imports are already at the top of the file. Only add the new test cases below the existing ones. The full addition is:

```jsx
test('initializing is true before bootstrap resolves', () => {
  // post mock returns a pending promise (never resolves during this synchronous check)
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
  // Arrange: bootstrap fails so initializing resolves immediately
  vi.mocked(axiosInstance.post).mockRejectedValueOnce(new Error('no cookie'));
  const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

  function ShowUser() {
    const { user } = useAuth();
    return <span data-testid="user">{user?.username ?? 'none'}</span>;
  }
  render(<AuthProvider><ShowUser /></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));

  // Capture the unauthorized handler registered with setAuthHandlers
  // setAuthHandlers is called in a useEffect — it will have run by now
  const { setAuthHandlers } = await import('../api/axiosInstance');
  const unauthorizedHandler = vi.mocked(setAuthHandlers).mock.calls.at(-1)[1];

  // window.location.pathname is '/' in jsdom (not '/login'), so returnUrl should be saved
  unauthorizedHandler();

  expect(setItemSpy).toHaveBeenCalledWith('returnUrl', expect.stringContaining('/'));
  setItemSpy.mockRestore();
});
```

- [ ] **Step 2: Run the new tests — expect FAIL**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npx vitest run src/contexts/AuthContext.test.jsx 2>&1 | tail -20
```

Expected: The three new tests fail because `initializing` is not in context and bootstrap effect doesn't exist yet.

- [ ] **Step 3: Update AuthContext.jsx with bootstrap logic**

Replace the full contents of `frontend/src/contexts/AuthContext.jsx` with:

```jsx
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import axiosInstance, { setAuthHandlers } from '../api/axiosInstance';
import { authApi } from '../api/authApi';
import { settingsApi } from '../api/settingsApi';
import { SECTIONS } from '../components/sectionConfig';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [menuSections, setMenuSections] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const tokenRef = useRef(null);

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  // Silently restore session from HttpOnly refresh cookie on mount
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
      .catch(() => {
        // No valid session — user must log in
      })
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

  useEffect(() => {
    setAuthHandlers(
      () => tokenRef.current,
      () => {
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath !== '/login') {
          sessionStorage.setItem('returnUrl', currentPath);
        }
        toast.error('Your session has expired. Please log in again.');
        setAccessToken(null);
        setUser(null);
        setMenuSections([]);
      }
    );
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, menuSections, login, logout, initializing }}>
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

- [ ] **Step 4: Run all AuthContext tests — expect PASS**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npx vitest run src/contexts/AuthContext.test.jsx 2>&1 | tail -20
```

Expected: All tests pass (existing 3 + new 3 = 6 total).

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git add frontend/src/contexts/AuthContext.jsx frontend/src/contexts/AuthContext.test.jsx
git commit -m "feat(auth): bootstrap session on mount, add initializing state and expiry toast"
```

---

## Task 4: Frontend — ProtectedRoute Loading State (TDD)

**Files:**
- Create: `frontend/src/components/ProtectedRoute.test.jsx`
- Modify: `frontend/src/components/ProtectedRoute.jsx`

- [ ] **Step 1: Create the failing test file**

Create `frontend/src/components/ProtectedRoute.test.jsx` with this content:

```jsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';

// Mock useAuth so we control what context returns
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
  // MemoryRouter won't render a visible /login page — just check protected content is gone
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
```

- [ ] **Step 2: Run the new tests — expect FAIL**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npx vitest run src/components/ProtectedRoute.test.jsx 2>&1 | tail -20
```

Expected: FAIL — `initializing` is not read from context and "Loading…" is never rendered.

- [ ] **Step 3: Update ProtectedRoute.jsx**

Replace the full contents of `frontend/src/components/ProtectedRoute.jsx` with:

```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const roleRank = { STUDENT: 1, TUTOR: 2, SUPER_ADMIN: 3 };

export default function ProtectedRoute({ children, requiredRole }) {
  const { user, initializing } = useAuth();
  if (initializing) return <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && (roleRank[user.role] ?? 0) < (roleRank[requiredRole] ?? 0)) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
}
```

- [ ] **Step 4: Run all ProtectedRoute tests — expect PASS**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npx vitest run src/components/ProtectedRoute.test.jsx 2>&1 | tail -20
```

Expected: All 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git add frontend/src/components/ProtectedRoute.jsx \
        frontend/src/components/ProtectedRoute.test.jsx
git commit -m "feat(auth): show loading indicator while session bootstrap is in progress"
```

---

## Task 5: Frontend — LoginPage returnUrl Redirect (TDD)

**Files:**
- Create: `frontend/src/pages/login/LoginPage.test.jsx`
- Modify: `frontend/src/pages/login/LoginPage.jsx`

- [ ] **Step 1: Create the failing test file**

Create `frontend/src/pages/login/LoginPage.test.jsx`:

```jsx
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

test('redirects to /app after login when no returnUrl saved', async () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText('Username'), 'alice');
  await userEvent.type(screen.getByLabelText('Password'), 'pass');
  await userEvent.click(screen.getByRole('button', { name: /login/i }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  expect(mockNavigate).toHaveBeenCalledWith('/app', { replace: true });
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
```

- [ ] **Step 2: Run the tests — expect FAIL**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npx vitest run src/pages/login/LoginPage.test.jsx 2>&1 | tail -20
```

Expected: FAIL — `returnUrl` is not read from `sessionStorage`.

- [ ] **Step 3: Update LoginPage.jsx**

Replace the full contents of `frontend/src/pages/login/LoginPage.jsx` with:

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../api/authApi';

const ROLE_ROUTES = { STUDENT: '/app', TUTOR: '/app', SUPER_ADMIN: '/app' };

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login(username, password);
      login(data.accessToken, data.user);
      const returnUrl = sessionStorage.getItem('returnUrl');
      if (returnUrl) {
        sessionStorage.removeItem('returnUrl');
        navigate(returnUrl, { replace: true });
      } else {
        navigate(ROLE_ROUTES[data.user.role] ?? '/app', { replace: true });
      }
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'ACCOUNT_DISABLED') {
        setError('Account disabled — please contact an administrator');
      } else {
        setError('Invalid username or password');
      }
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <form onSubmit={handleSubmit} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 32, width: 360 }}>
        <h2 style={{ marginBottom: 24 }}>Programming Exercise Platform</h2>
        {error && (
          <div role="alert" style={{ marginBottom: 16, padding: 10, background: '#fdecea', color: '#c62828', borderRadius: 4 }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="username">Username</label>
          <input id="username" value={username} onChange={e => setUsername(e.target.value)}
            required autoComplete="username"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            required autoComplete="current-password"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: 10, background: loading ? '#90caf9' : '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run all login page tests — expect PASS**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npx vitest run src/pages/login/LoginPage.test.jsx 2>&1 | tail -20
```

Expected: Both tests pass.

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git add frontend/src/pages/login/LoginPage.jsx \
        frontend/src/pages/login/LoginPage.test.jsx
git commit -m "feat(auth): redirect to returnUrl after re-login"
```

---

## Task 6: Full Test Suite and Final Verification

**Files:** No changes — verification only.

- [ ] **Step 1: Run all backend tests**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -q
```

Expected: BUILD SUCCESS with no failures.

- [ ] **Step 2: Run all frontend tests**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npx vitest run 2>&1 | tail -30
```

Expected: All test suites pass. New tests added: `AuthContext.test.jsx` (+3), `ProtectedRoute.test.jsx` (+3), `LoginPage.test.jsx` (+2).

- [ ] **Step 3: Verify the design doc spec path is correct in the spec**

The spec listed `backend/.../AuthController.java` — the actual path is `backend/src/main/java/com/platform/exercise/auth/AuthController.java`. This was implemented correctly in the tasks above. No action needed.

- [ ] **Step 4: Final commit (if any uncommitted changes remain)**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git status
```

If clean: done. If anything remains staged or modified, commit with an appropriate message.
