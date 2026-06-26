# Design: Last Login Timestamp + User Name Filter

**Date:** 2026-06-26
**Scope:** User management — add `last_login_at` tracking and a name search filter

---

## Problem

The admin user management page has no record of when users last logged in, and no way to search for users by name. Admins must scroll/page through the full list to find a specific user.

---

## Solution Overview

1. Add `last_login_at` column to `users` table, stamped on every successful password-based login.
2. Expose `last_login_at` in the user list API response.
3. Add a `name` query parameter to the user list API that searches both `username` and `display_name` (case-insensitive LIKE).
4. Update the frontend user management page to show a Last Login column and a name search input alongside the existing role/status filters.

---

## Database

**Migration: V7__add_last_login_at.sql**

```sql
ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL;
CREATE INDEX idx_users_last_login_at ON users (last_login_at);
```

- Nullable — existing users have no recorded login history.
- Indexed for potential future reporting queries.

---

## Backend

### `User.java`

Add field:

```java
@Column(name = "last_login_at")
private LocalDateTime lastLoginAt;
```

### `AuthService.login()`

After password verification passes and before generating tokens, stamp the timestamp:

```java
user.setLastLoginAt(LocalDateTime.now());
userRepository.save(user);
```

Only updated on password-based login, not on token refresh (refresh is a background operation).

### `UserDto`

Add `lastLoginAt` to the record and populate it in `from(User)`.

### `UserController.listUsers`

Add optional query parameter:

```java
@RequestParam(required = false) String name
```

Pass to `UserService.listUsers`.

### `UserService.listUsers`

Add OR predicate when `name` is non-blank:

```java
if (name != null && !name.isBlank()) {
    String pattern = "%" + name.toLowerCase() + "%";
    predicates.add(cb.or(
        cb.like(cb.lower(root.get("username")), pattern),
        cb.like(cb.lower(root.get("displayName")), pattern)
    ));
}
```

Case-insensitive substring match on both `username` and `display_name`.

---

## Frontend

### `UserManagementPage.jsx`

**Filter bar additions:**
- `nameFilter` state (string, default `""`)
- Text input: placeholder "Search by username or name", resets page to 0 on change
- Pass `...(nameFilter && { name: nameFilter })` to `userApi.list()`
- Add `nameFilter` to the `useEffect` dependency array

**Table additions:**
- New **Last Login** column header
- New column cell: formatted date+time (`yyyy-MM-dd HH:mm`), or `—` if `lastLoginAt` is null

**Helper function:**

```js
function fmtDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
```

---

## Error Handling

- `name` filter: no new error codes. An empty/whitespace `name` is treated as no filter (existing behaviour for role/status).
- `last_login_at` null on display: rendered as `—`.

---

## Testing

- Backend unit test: `listUsers` with `name` param matches on username substring, display name substring, and both simultaneously.
- Backend unit test: `AuthService.login()` sets `lastLoginAt` on the saved user.
- Frontend: existing `UserManagementPage.test.jsx` — add cases for name filter input and Last Login column rendering.

---

## Out of Scope

- Searching by last login date range (not requested).
- Tracking login history (audit log) — only the most recent login is stored.
- Updating `last_login_at` on token refresh.
