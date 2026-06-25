# Re-authentication Modal Design

**Date:** 2026-06-25
**Status:** Approved

## Problem

When the JWT access token expires and the refresh token is also expired (or revoked), the current `onUnauthorized` handler clears `user` state and relies on `ProtectedRoute` to redirect to `/login`. This unmounts the entire page component tree, destroying all in-memory work (Blockly XML, Python code, form state).

## Goal

When a session expires or any re-login is required:
1. Show a login Modal overlay — do not navigate away from the current page
2. After successful re-login, resume exactly where the user was, with all work content intact
3. If the user dismisses the Modal and later triggers an authenticated action, show a lightweight confirmation dialog before re-opening the Modal

## Behaviour Specification

### Trigger Flow

```
Access token expires → refresh attempt → refresh fails
  └─ onUnauthorized() fires
        ├─ First time (modal not yet dismissed): show ReauthModal directly
        └─ Modal was dismissed before: show ConfirmReauthDialog instead

ConfirmReauthDialog:
  ├─ [Log in]  → close dialog, open ReauthModal, queue the triggering request
  └─ [Cancel]  → close dialog, reject the triggering request, page stays unchanged

ReauthModal:
  ├─ Login success → set new token, replay reauthQueue, clear expired state
  └─ [Cancel]      → close modal, mark as "dismissed", reject reauthQueue
```

### State Machine

| accessToken | user | reauthDismissed | Meaning |
|-------------|------|-----------------|---------|
| set | set | false | Normal authenticated state |
| null | set | false | Refresh just failed → ReauthModal shown |
| null | set | true | User dismissed Modal → ConfirmReauthDialog on next action |
| null | null | false | Explicit logout |

## Architecture

### Files Changed

| File | Change |
|------|--------|
| `frontend/src/contexts/AuthContext.jsx` | Add reauth states and handlers |
| `frontend/src/api/axiosInstance.js` | Add `reauthQueue`, `resolveReauthQueue`, `rejectReauthQueue` |
| `frontend/src/App.jsx` | Mount `ReauthModal` and `ConfirmReauthDialog` inside `AuthProvider` |

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/ReauthModal.jsx` | Full-screen overlay login form |
| `frontend/src/components/ConfirmReauthDialog.jsx` | Lightweight "login or cancel" dialog |

### Files Unchanged

- `ProtectedRoute.jsx` — `user` is never cleared during reauth, so no redirect fires
- `LoginPage.jsx` — still handles first-time login via `/login` route
- All page components — no save/restore logic needed

## Component: AuthContext

### New State

```js
const [reauthVisible, setReauthVisible] = useState(false);
const [confirmVisible, setConfirmVisible] = useState(false);
const reauthDismissedRef = useRef(false);
```

### Modified `onUnauthorized` (passed to axiosInstance)

```js
// Old: clear user + navigate to /login
// New: keep user, show appropriate UI
() => {
  setAccessToken(null);  // clear token only
  if (!reauthDismissedRef.current) {
    setReauthVisible(true);
  } else {
    setConfirmVisible(true);
  }
}
```

### New Handlers (exported via context value)

| Handler | Behaviour |
|---------|-----------|
| `onReauthSuccess(token, userData)` | Set new token and user, clear dismissed flag, hide modal, call `resolveReauthQueue(token)` |
| `onReauthCancel()` | Hide modal, set `reauthDismissedRef.current = true`, call `rejectReauthQueue()` |
| `onConfirmLogin()` | Hide confirm dialog, show modal |
| `onConfirmCancel()` | Hide confirm dialog, call `rejectReauthQueue()` |

### `setAuthHandlers` signature (unchanged)

`setAuthHandlers(getToken, onUnauthorized)` stays as-is. AuthContext calls `resolveReauthQueue` and `rejectReauthQueue` by importing them directly from axiosInstance — they are pure module-level functions with no React dependency, so no extra wiring is needed.

## Component: axiosInstance

### New Module-Level Variables

```js
let reauthQueue = [];        // Array of { config, resolve, reject }
let isWaitingReauth = false; // Guard: only call onUnauthorized once per expiry event

export function resolveReauthQueue(newToken) {
  isWaitingReauth = false;
  reauthQueue.forEach(({ config, resolve }) => {
    config.headers.Authorization = `Bearer ${newToken}`;
    resolve(axiosInstance(config));
  });
  reauthQueue = [];
}

export function rejectReauthQueue() {
  isWaitingReauth = false;
  reauthQueue.forEach(({ reject }) => reject(new Error('REAUTH_CANCELLED')));
  reauthQueue = [];
}
```

### Modified 401 Interceptor Logic

```
Receive 401
  ├─ URL includes /v1/auth/ → reject immediately (don't intercept auth endpoints)
  ├─ _retry already set → reject immediately (prevent infinite loop)
  └─ Attempt refresh (POST /v1/auth/refresh)
        ├─ Success → update token, replay original request (existing behaviour)
        └─ Failure → add original request to reauthQueue as a pending Promise
                     if (!isWaitingReauth) { isWaitingReauth = true; onUnauthorized(); }
                     return Promise that resolves/rejects via reauthQueue
```

### Error Handling for Callers

Callers receive a rejected Promise with `error.message === 'REAUTH_CANCELLED'` when the user dismisses the reauth flow. Pages should silently ignore this error (no toast, no error state update). A shared utility `isReauthCancelled(err)` can be exported from axiosInstance for convenience.

## Component: ReauthModal

Full-screen semi-transparent overlay with a centred login card.

```
┌────────────────────────────────────┐
│  (semi-transparent overlay)        │
│                                    │
│  ┌──────────────────────────────┐  │
│  │  Session Expired             │  │
│  │  Please log in to continue   │  │
│  │                              │  │
│  │  Username [______________]   │  │
│  │  Password [______________]   │  │
│  │                              │  │
│  │  [error message if any]      │  │
│  │                              │  │
│  │       [Cancel]   [Log in]    │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

**Behaviour:**
- Reads `reauthVisible` from `useAuth()`
- Calls `authApi.login(username, password)` on submit
- On success: calls `onReauthSuccess(token, userData)`
- On cancel: calls `onReauthCancel()`
- Displays the same error codes as `LoginPage` (`ACCOUNT_DISABLED`, `ACCOUNT_EXPIRED`, `RATE_LIMITED`, invalid credentials)
- `z-index` set high enough to cover all page content and existing modals
- Does not navigate; does not touch the router

## Component: ConfirmReauthDialog

Small centred dialog, appears when `confirmVisible` is true in AuthContext.

```
┌──────────────────────────────────────────┐
│  Your session has expired.               │
│  Log in to continue this action.         │
│                                          │
│                  [Cancel]   [Log in]     │
└──────────────────────────────────────────┘
```

**Behaviour:**
- [Log in] → calls `onConfirmLogin()` (closes dialog, opens ReauthModal)
- [Cancel] → calls `onConfirmCancel()` (closes dialog, triggering request is rejected silently)

## Mounting in App.jsx

```jsx
<AuthProvider>
  <BrowserRouter>
    <Routes>...</Routes>
  </BrowserRouter>
  <ReauthModal />
  <ConfirmReauthDialog />
</AuthProvider>
```

Both components are mounted outside `<Routes>` so they are never affected by route changes.

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Login fails in Modal (wrong password) | Show inline error in Modal, stay open |
| Account disabled/expired | Show specific error message in Modal |
| Rate limited | Show "Too many attempts" in Modal |
| User cancels → page component receives rejected Promise | Component catches `REAUTH_CANCELLED`, silently ignores (no UI change) |
| Multiple concurrent API calls expire at once | All queued in `reauthQueue`; all replayed or rejected together |

## Testing

- **AuthContext unit tests:** verify `onUnauthorized` sets `reauthVisible` (not clear user), verify `onReauthSuccess` sets new token and calls `resolveReauthQueue`, verify `onReauthCancel` sets dismissed flag and calls `rejectReauthQueue`
- **axiosInstance unit tests:** verify 401 + refresh failure queues request and calls `onUnauthorized` only once for concurrent failures; verify `resolveReauthQueue` replays requests with new token; verify `rejectReauthQueue` rejects with `REAUTH_CANCELLED`
- **ReauthModal unit tests:** renders when `reauthVisible = true`; calls `onReauthSuccess` on successful login; calls `onReauthCancel` on cancel click; shows error messages on failed login
- **ConfirmReauthDialog unit tests:** renders when `confirmVisible = true`; Log in button calls `onConfirmLogin`; Cancel button calls `onConfirmCancel`
- **Integration:** simulate token expiry mid-session, verify page component stays mounted with state intact, verify queue replay after re-login
