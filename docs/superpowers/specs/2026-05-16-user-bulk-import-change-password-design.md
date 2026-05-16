# Design: User Bulk Import, Change Password, Admin Reset Password

**Date:** 2026-05-16
**Status:** Approved

## Overview

Three related user management features:

1. **Excel bulk import** — admin uploads an `.xlsx` file to create multiple users at once
2. **Change password** — any logged-in user can change their own password from the top bar
3. **Admin reset password** — SUPER_ADMIN can reset any user's password to `12345678`

---

## Feature 1: Excel Bulk Import

### User flow

1. Admin clicks **"Import Users"** button in the `UserManagementPage` header (next to "Create User").
2. `ImportUsersModal` opens with:
   - A **"Download Template (.xlsx)"** link — generates and downloads the template client-side using SheetJS.
   - A file input (`.xlsx` only).
3. Admin selects file. Frontend parses it with SheetJS and sends parsed rows as JSON.
4. If the backend returns errors, display a row-level error list in the modal. No rows are inserted.
5. If all rows pass, all users are created atomically and the modal closes with a success toast.

### Excel template

Generated client-side. Contains two sheets:

**Sheet 1: Users** (data entry)

| username* | displayName* | password* | role* |
|-----------|-------------|-----------|-------|
| alice | Alice Wang | pass1234 | STUDENT |

**Sheet 2: Instructions**

- `username`: Required. Unique. Max 64 characters.
- `displayName`: Required. Max 128 characters.
- `password`: Required. Min 8 characters.
- `role`: Required. One of: `STUDENT`, `TUTOR`, `SUPER_ADMIN`.
- Column headers marked with `*` are required.
- Max 500 rows per import.

### Import behavior

- **All-or-nothing:** If any row fails validation, the entire import is rejected. No partial inserts.
- Validation mirrors the existing single-user create rules (unique username, min password length, valid role enum).
- On error: backend returns row numbers and field-level messages.

### API

```
POST /api/v1/users/import
Authorization: Bearer <token>  (SUPER_ADMIN only)
Content-Type: application/json

{
  "users": [
    { "username": "alice", "displayName": "Alice Wang", "password": "pass1234", "role": "STUDENT" },
    ...
  ]
}

// Success
200 OK
{ "imported": 47 }

// Validation failure
400 Bad Request
{
  "error": {
    "code": "IMPORT_VALIDATION_ERROR",
    "message": "Import failed due to validation errors",
    "rows": [
      { "row": 3, "field": "username", "message": "already taken" },
      { "row": 7, "field": "role", "message": "must be STUDENT, TUTOR, or SUPER_ADMIN" }
    ]
  }
}
```

### Frontend files changed / created

| File | Change |
|------|--------|
| `frontend/src/pages/admin/UserManagementPage.jsx` | Add "Import Users" button; wire up `ImportUsersModal` |
| `frontend/src/components/admin/ImportUsersModal.jsx` | New modal: template download link, file input, SheetJS parse, submit, error display |
| `frontend/src/api/userApi.js` | Add `importUsers(users)` method |
| `package.json` | Add `xlsx` (SheetJS) dependency |

### Backend files changed / created

| File | Change |
|------|--------|
| `UserController.java` | Add `POST /v1/users/import` endpoint |
| `UserService.java` | Add `importUsers(List<CreateUserRequest>)` — validates all rows, inserts in single `@Transactional` |
| `ImportUsersRequest.java` | New DTO: `{ List<CreateUserRequest> users }` with max-500 constraint |
| `ImportValidationError.java` | New DTO: `{ int row, String field, String message }` |
| `ErrorCode.java` | Add `IMPORT_VALIDATION_ERROR` |
| `GlobalExceptionHandler.java` | Handle new `ImportValidationException` → 400 with row errors |

---

## Feature 2: Change Own Password

### User flow

1. Any logged-in user clicks their **username** in the top bar.
2. A small dropdown appears with **"Change Password"** and **"Logout"**.
3. Clicking "Change Password" opens `ChangePasswordModal`.
4. User fills in: Current Password, New Password (min 8), Confirm New Password.
5. Frontend validates new password === confirm before submitting.
6. On success: modal closes, success toast shown.
7. On wrong current password: inline error "Current password is incorrect".

### API

```
PATCH /api/v1/users/me/password
Authorization: Bearer <token>  (any authenticated user)
Content-Type: application/json

{ "currentPassword": "oldpass", "newPassword": "newpass123" }

// Success
200 OK

// Wrong current password
400 Bad Request
{ "error": { "code": "WRONG_CURRENT_PASSWORD", "message": "Current password is incorrect" } }
```

### Frontend files changed / created

| File | Change |
|------|--------|
| `frontend/src/components/TopBar.jsx` | Replace logout button with username dropdown (Change Password + Logout) |
| `frontend/src/components/ChangePasswordModal.jsx` | New modal: current password, new password, confirm; client-side match validation |
| `frontend/src/api/userApi.js` | Add `changePassword({ currentPassword, newPassword })` method |

### Backend files changed / created

| File | Change |
|------|--------|
| `UserController.java` | Add `PATCH /v1/users/me/password` endpoint (authenticated, no role restriction) |
| `UserService.java` | Add `changePassword(userId, currentPassword, newPassword)` — bcrypt verify + encode + save |
| `ChangePasswordRequest.java` | New DTO: `{ currentPassword, newPassword }` |
| `ErrorCode.java` | Add `WRONG_CURRENT_PASSWORD` |

---

## Feature 3: Admin Reset Password

### User flow

1. SUPER_ADMIN sees a **"Reset Password"** button in the Actions column of the user table.
2. Clicking it shows a confirmation: "Reset [username]'s password to 12345678?"
3. On confirm: calls the API; success toast on completion.
4. Admin cannot reset their own password via this button (same guard as the disable-self rule).

### API

```
POST /api/v1/users/{id}/reset-password
Authorization: Bearer <token>  (SUPER_ADMIN only)

// Success
200 OK

// Self-reset attempt
400 Bad Request
{ "error": { "code": "CANNOT_MODIFY_SELF", "message": "Cannot reset your own password via this endpoint" } }
```

### Frontend files changed / created

| File | Change |
|------|--------|
| `frontend/src/pages/admin/UserManagementPage.jsx` | Add "Reset Password" button per row (disabled for current user); inline confirmation |
| `frontend/src/api/userApi.js` | Add `resetPassword(id)` method |

### Backend files changed / created

| File | Change |
|------|--------|
| `UserController.java` | Add `POST /v1/users/{id}/reset-password` endpoint |
| `UserService.java` | Add `resetPassword(targetId, requesterId)` — encode `12345678`, save; reject if `targetId == requesterId` |

---

## Error Codes Added

| Code | HTTP | When |
|------|------|------|
| `IMPORT_VALIDATION_ERROR` | 400 | Any row in bulk import fails validation |
| `WRONG_CURRENT_PASSWORD` | 400 | Current password does not match on change-password |
| `CANNOT_MODIFY_SELF` | 400 | Admin tries to reset their own password via admin endpoint |

---

## Testing

- **Backend unit tests:** `UserServiceTest` — import all-or-nothing rollback on row failure; wrong current password rejection; self-reset guard.
- **Frontend component tests:** `ImportUsersModal` — SheetJS parse, error display, template download trigger; `ChangePasswordModal` — mismatch validation, error mapping; `TopBar` — dropdown open/close, modal trigger.
