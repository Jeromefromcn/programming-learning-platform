# Auth Session Persistence & Expiry Notification — Design Spec

**Date:** 2026-05-20
**Status:** Approved

## Problem

Two related auth UX issues:

1. **Page refresh loses session.** Access token is in-memory only. After a browser refresh, `user` is null and `ProtectedRoute` silently redirects to `/login`, even when a valid HttpOnly refresh token cookie exists.

2. **No expiry notification.** When both tokens expire mid-session, the axios interceptor calls `onUnauthorized()` which clears state and triggers a silent redirect to `/login`. The user sees no explanation.

## Constraints

- No localStorage for tokens (security requirement).
- No new infrastructure — single-server deployment.
- Refresh token already in HttpOnly cookie, survives page refresh.
- Toast library acceptable; team agreed to `react-hot-toast`.

## Solution Overview

Four coordinated changes:

1. **Backend:** `POST /v1/auth/refresh` returns `AuthResponse` (same shape as login) so the frontend gets user data without a second request.
2. **AuthContext bootstrap:** On mount, call `authApi.refresh()` to silently restore session from cookie. Show loading state until resolved.
3. **Session expiry toast:** `onUnauthorized` saves `returnUrl` to `sessionStorage`, shows a toast, then clears state (causing ProtectedRoute to redirect).
4. **LoginPage returnUrl:** After successful login, redirect to saved `returnUrl` if present.

---

## Part 1 — Backend: Refresh Returns User Data

**File:** `backend/src/main/java/com/platform/auth/AuthController.java`

Change `POST /v1/auth/refresh` return type from `Map<String, String>` to `AuthResponse`.

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

**File:** `backend/src/main/java/com/platform/auth/AuthService.java`

Change `refresh()` to return `AuthResponse` instead of `String`. Load the `User` entity (already done) and wrap in `AuthResponse`:

```java
public AuthResponse refresh(String rawToken) {
    // ... existing validation ...
    User user = userRepository.findById(rt.getUserId()) ...;
    String accessToken = jwtUtil.generateToken(user.getId(), user.getRole().name());
    return new AuthResponse(accessToken, UserDto.from(user));
}
```

**Backward compatibility:** The existing axios interceptor only reads `res.data.accessToken` — the added `user` field is ignored, so no change needed there.

---

## Part 2 — AuthContext: Session Bootstrap

**File:** `frontend/src/contexts/AuthContext.jsx`

Add `initializing` state (starts `true`). On mount, attempt silent session restore.

### State changes

```js
const [initializing, setInitializing] = useState(true);
```

### Bootstrap effect

```js
useEffect(() => {
  authApi.refresh()
    .then(async ({ accessToken, user: userData }) => {
      tokenRef.current = accessToken;
      setAccessToken(accessToken);
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
      // No valid session — remain logged out
    })
    .finally(() => setInitializing(false));
}, []);
```

### Context value

Add `initializing` to the exported context value:

```js
<AuthContext.Provider value={{ user, accessToken, menuSections, login, logout, initializing }}>
```

### Loading state

`AuthProvider` does **not** short-circuit rendering during bootstrap. Instead, `ProtectedRoute` handles it (Part 2b below). This keeps the `AuthProvider` interface simple.

---

## Part 2b — ProtectedRoute: Loading State

**File:** `frontend/src/components/ProtectedRoute.jsx`

While `initializing === true`, render a loading indicator instead of making an auth decision.

```jsx
export default function ProtectedRoute({ children, requiredRole }) {
  const { user, initializing } = useAuth();
  if (initializing) return <div style={{ padding: 32, textAlign: 'center' }}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && roleRank[user.role] < roleRank[requiredRole]) {
    return <Navigate to="/unauthorized" replace />;
  }
  return children;
}
```

---

## Part 3 — Session Expiry Toast

### Dependency

Add `react-hot-toast` to `frontend/package.json`:

```
npm install react-hot-toast
```

### Toaster placement

**File:** `frontend/src/App.jsx`

Import and render `<Toaster>` inside `AppErrorBoundary`, at the root level (not inside a route — it must always be rendered):

```jsx
import { Toaster } from 'react-hot-toast';

// Inside App():
<AppErrorBoundary>
  <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
  <AuthProvider>
    <BrowserRouter>
      ...
    </BrowserRouter>
  </AuthProvider>
</AppErrorBoundary>
```

`react-hot-toast` renders into a `document.body` portal, so the toast persists across React Router route changes. It uses a module-level store — `toast()` can be called from anywhere in the codebase (including `AuthContext`, which is outside `AuthProvider`'s provider tree boundary) without any provider wrapping.

### onUnauthorized handler

**File:** `frontend/src/contexts/AuthContext.jsx`

Update the `setAuthHandlers` call:

```js
import toast from 'react-hot-toast';

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
```

Clearing state causes `ProtectedRoute` to render `<Navigate to="/login" replace />`. The toast, being in a portal, remains visible on the login page.

---

## Part 4 — LoginPage: Return URL Redirect

**File:** `frontend/src/pages/login/LoginPage.jsx`

After a successful login, check `sessionStorage` for a saved URL:

```js
async function handleSubmit(e) {
  // ... existing login logic ...
  login(data.accessToken, data.user);
  const returnUrl = sessionStorage.getItem('returnUrl');
  if (returnUrl) {
    sessionStorage.removeItem('returnUrl');
    navigate(returnUrl, { replace: true });
  } else {
    navigate(ROLE_ROUTES[data.user.role] ?? '/app', { replace: true });
  }
}
```

`sessionStorage` is tab-scoped and cleared when the tab closes — the returnUrl will not leak across browser sessions.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/.../AuthController.java` | Refresh returns `AuthResponse` |
| `backend/.../AuthService.java` | `refresh()` returns `AuthResponse` |
| `frontend/src/contexts/AuthContext.jsx` | Bootstrap effect, `initializing` state, toast in `onUnauthorized` |
| `frontend/src/components/ProtectedRoute.jsx` | Handle `initializing` state |
| `frontend/src/pages/login/LoginPage.jsx` | returnUrl redirect after login |
| `frontend/src/App.jsx` | Add `<Toaster>` |
| `frontend/package.json` | Add `react-hot-toast` |

---

## Testing Requirements

- **Bootstrap:** Refresh page while logged in → session restored, no redirect to login.
- **Bootstrap failure:** Clear cookie, refresh page → redirect to login (no crash).
- **Expiry toast:** Simulate expired tokens → toast appears, user lands on login page.
- **returnUrl:** Expire session on `/app/exercises/123` → log back in → land on `/app/exercises/123`.
- **No returnUrl loop:** `onUnauthorized` while on `/login` → no `returnUrl` saved.
- **Unit tests:** Update `AuthContext.test.jsx` for bootstrap behaviour; update `ProtectedRoute` tests for `initializing` state.

---

## Error Cases

| Scenario | Behaviour |
|----------|-----------|
| Bootstrap: network error | Treated as no session; user logs in normally |
| Bootstrap: refresh cookie expired | Same as network error |
| `onUnauthorized` fires on `/login` | No returnUrl saved (avoids redirect loop) |
| returnUrl points to unauthorized page | ProtectedRoute handles it (redirects to `/unauthorized`) |
| User navigates to `/login` directly while session is valid | Bootstrap restores session in AuthContext, but LoginPage does not redirect away — user sees login form. Out of scope for this change. |
