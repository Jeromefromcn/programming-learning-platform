# Expiration Date Validation — Design Spec

## Problem

Admin can set a user's expiration date to any date, including past dates. Setting a past date immediately locks the account with no warning, which is almost certainly a mistake.

## Constraint

Expiration date must be `null` (never expires) or **today or later**. Past dates are rejected.

## Scope

All three flows that accept `expirationDate`:

| Flow | File | Change |
|------|------|--------|
| Create single user | `UserService.createUser()` | Add `toLocalDate().isBefore(today)` check |
| Bulk import users | `UserService.importUsers()` | Add same check in validation loop |
| Update expiration | `UserService.updateExpiration()` | Add same check |

Plus frontend `min` attribute on date inputs and import-time validation.

## Backend

Use existing `ErrorCode.VALIDATION_ERROR` (HTTP 400). Comparison uses `LocalDate.now()` against `expirationDate.toLocalDate()`.

### `createUser()` — before L60
```java
if (req.expirationDate() != null && req.expirationDate().toLocalDate().isBefore(LocalDate.now())) {
    throw new PlatformException(ErrorCode.VALIDATION_ERROR,
        "Expiration date must be today or in the future");
}
```

### `importUsers()` — in validation loop after role check (~L99)
```java
if (r.expirationDate() != null && r.expirationDate().toLocalDate().isBefore(LocalDate.now())) {
    errors.add(new ImportRowError(rowNum, "expirationDate", "must be today or in the future"));
}
```

### `updateExpiration()` — before L170
```java
if (req.expirationDate() != null && req.expirationDate().toLocalDate().isBefore(LocalDate.now())) {
    throw new PlatformException(ErrorCode.VALIDATION_ERROR,
        "Expiration date must be today or in the future");
}
```

## Frontend

### `CreateUserModal.jsx` — L54
```jsx
const today = new Date().toISOString().split('T')[0];
// ...
<input type="date" min={today} ... />
```

### `UserManagementPage.jsx` — L165
```jsx
const today = new Date().toISOString().split('T')[0];
// ...
<input type="date" min={today} ... />
```

### `ImportUsersModal.jsx` — after row parsing (~L48)
Check each row's `expirationDate` against today; reject past dates with inline error display.

## Tests

- `createUser_pastExpirationDate_returns400`
- `patchExpiration_pastDate_returns400`
- `importUsers_pastExpirationDate_returns400`

## Not in scope

- Changing how `isExpired()` works on the entity
- Session/JWT/refresh token expiry
