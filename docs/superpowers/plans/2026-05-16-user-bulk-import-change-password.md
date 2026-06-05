# User Bulk Import, Change Password, Admin Reset Password — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Excel bulk user import (SheetJS → JSON → all-or-nothing backend), self-service change password (TopBar dropdown → modal), and admin reset password (user table button) to the admin user management module.

**Architecture:** SheetJS parses `.xlsx` client-side and sends rows as JSON to `POST /v1/users/import`; backend validates all rows first then inserts in a single `@Transactional` method, throwing `ImportValidationException` if any row fails. Change password (`PATCH /v1/users/me/password`) and reset password (`POST /v1/users/{id}/reset-password`) are two new endpoints on the existing `UserController`/`UserService`. `TopBar` gains a dropdown using a `useRef`-based click-outside handler. `ImportUsersModal` and `ChangePasswordModal` follow the same fixed-overlay inline-style modal pattern as `CreateUserModal`.

**Tech Stack:** React 18 + Vitest + @testing-library/react (frontend); Spring Boot 3.5.0 + Spring Security + JUnit 5 + MockMvc (backend); `xlsx` npm package (SheetJS) for client-side Excel read/write.

---

## File Map

**Create (backend):**
- `backend/src/main/java/com/platform/exercise/user/ImportRowError.java`
- `backend/src/main/java/com/platform/exercise/user/ImportValidationException.java`
- `backend/src/main/java/com/platform/exercise/user/ImportValidationErrorResponse.java`
- `backend/src/main/java/com/platform/exercise/user/ImportUsersRequest.java`
- `backend/src/main/java/com/platform/exercise/user/ImportUsersResult.java`
- `backend/src/main/java/com/platform/exercise/user/ChangePasswordRequest.java`

**Modify (backend):**
- `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`
- `backend/src/main/java/com/platform/exercise/common/GlobalExceptionHandler.java`
- `backend/src/main/java/com/platform/exercise/user/UserService.java`
- `backend/src/main/java/com/platform/exercise/user/UserController.java`
- `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`

**Create (frontend):**
- `frontend/src/components/admin/ImportUsersModal.jsx`
- `frontend/src/components/admin/ImportUsersModal.test.jsx`
- `frontend/src/components/ChangePasswordModal.jsx`
- `frontend/src/components/ChangePasswordModal.test.jsx`

**Modify (frontend):**
- `frontend/src/api/userApi.js`
- `frontend/src/components/TopBar.jsx`
- `frontend/src/components/TopBar.test.jsx`
- `frontend/src/pages/admin/UserManagementPage.jsx`

---

## Task 1: Backend — Error codes, exception types, and import response format

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`
- Create: `backend/src/main/java/com/platform/exercise/user/ImportRowError.java`
- Create: `backend/src/main/java/com/platform/exercise/user/ImportValidationException.java`
- Create: `backend/src/main/java/com/platform/exercise/user/ImportValidationErrorResponse.java`
- Modify: `backend/src/main/java/com/platform/exercise/common/GlobalExceptionHandler.java`

- [ ] **Step 1: Add 3 new error codes to `ErrorCode.java`**

Change the last enum entry `RATE_LIMITED` from ending with `;` to `,`, then append three new entries:

```java
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS),
    IMPORT_VALIDATION_ERROR(HttpStatus.BAD_REQUEST),
    WRONG_CURRENT_PASSWORD(HttpStatus.BAD_REQUEST),
    CANNOT_MODIFY_SELF(HttpStatus.BAD_REQUEST);
```

- [ ] **Step 2: Create `ImportRowError.java`**

```java
package com.platform.exercise.user;

public record ImportRowError(int row, String field, String message) {}
```

- [ ] **Step 3: Create `ImportValidationException.java`**

```java
package com.platform.exercise.user;

import java.util.List;

public class ImportValidationException extends RuntimeException {
    private final List<ImportRowError> errors;

    public ImportValidationException(List<ImportRowError> errors) {
        super("Import validation failed");
        this.errors = errors;
    }

    public List<ImportRowError> getErrors() {
        return errors;
    }
}
```

- [ ] **Step 4: Create `ImportValidationErrorResponse.java`**

The import error response needs a `rows` field not present in the standard `ErrorResponse`, so it gets its own record:

```java
package com.platform.exercise.user;

import com.platform.exercise.common.ErrorCode;

import java.time.Instant;
import java.util.List;

public record ImportValidationErrorResponse(ImportErrorDetails error) {

    public record ImportErrorDetails(String code, String message, String timestamp, List<ImportRowError> rows) {}

    public static ImportValidationErrorResponse of(List<ImportRowError> rows) {
        return new ImportValidationErrorResponse(new ImportErrorDetails(
            ErrorCode.IMPORT_VALIDATION_ERROR.name(),
            "Import failed due to validation errors",
            Instant.now().toString(),
            rows
        ));
    }
}
```

- [ ] **Step 5: Add `ImportValidationException` handler to `GlobalExceptionHandler.java`**

Add these two imports:
```java
import com.platform.exercise.user.ImportValidationException;
import com.platform.exercise.user.ImportValidationErrorResponse;
```

Add this handler method inside the `GlobalExceptionHandler` class:
```java
@ExceptionHandler(ImportValidationException.class)
public ResponseEntity<ImportValidationErrorResponse> handleImportValidation(ImportValidationException ex) {
    return ResponseEntity
        .status(ErrorCode.IMPORT_VALIDATION_ERROR.getHttpStatus())
        .body(ImportValidationErrorResponse.of(ex.getErrors()));
}
```

- [ ] **Step 6: Run all backend tests to verify nothing broke**

```bash
cd backend && mvn test
```

Expected: `BUILD SUCCESS`, all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/common/ErrorCode.java \
        backend/src/main/java/com/platform/exercise/user/ImportRowError.java \
        backend/src/main/java/com/platform/exercise/user/ImportValidationException.java \
        backend/src/main/java/com/platform/exercise/user/ImportValidationErrorResponse.java \
        backend/src/main/java/com/platform/exercise/common/GlobalExceptionHandler.java
git commit -m "feat(user): add error codes and exception types for import, change-password, reset-password"
```

---

## Task 2: Backend — Bulk import endpoint (TDD)

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/user/ImportUsersRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/user/ImportUsersResult.java`
- Modify: `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`
- Modify: `backend/src/main/java/com/platform/exercise/user/UserService.java`
- Modify: `backend/src/main/java/com/platform/exercise/user/UserController.java`

- [ ] **Step 1: Create `ImportUsersRequest.java`**

No `@Valid` on the list — field-level validation is done manually in the service to produce row-indexed errors rather than generic Bean Validation messages.

```java
package com.platform.exercise.user;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ImportUsersRequest(
    @NotNull @Size(min = 1, max = 500) List<CreateUserRequest> users
) {}
```

- [ ] **Step 2: Create `ImportUsersResult.java`**

```java
package com.platform.exercise.user;

public record ImportUsersResult(int imported) {}
```

- [ ] **Step 3: Write 3 failing tests in `UserControllerTest.java`**

Add these two imports at the top of `UserControllerTest`:
```java
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
```

Add these three test methods to the `UserControllerTest` class. The `seed()` method already creates `student1` with username `"student1"`, which we use to trigger a duplicate error:

```java
@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void importUsers_validRequest_returns200WithCount() throws Exception {
    mockMvc.perform(post("/v1/users/import")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                    {"users":[{"username":"imported1","displayName":"Imported One",\
                    "password":"pass1234","role":"STUDENT"}]}
                    """))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.imported").value(1));
}

@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void importUsers_duplicateUsername_returns400WithRowErrors() throws Exception {
    mockMvc.perform(post("/v1/users/import")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                    {"users":[{"username":"student1","displayName":"Dup",\
                    "password":"pass1234","role":"STUDENT"}]}
                    """))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("IMPORT_VALIDATION_ERROR"))
        .andExpect(jsonPath("$.error.rows[0].row").value(2))
        .andExpect(jsonPath("$.error.rows[0].field").value("username"));
}

@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void importUsers_allOrNothing_noUsersCreatedOnError() throws Exception {
    mockMvc.perform(post("/v1/users/import")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                    {"users":[
                      {"username":"valid_new","displayName":"Valid","password":"pass1234","role":"STUDENT"},
                      {"username":"student1","displayName":"Dup","password":"pass1234","role":"STUDENT"}
                    ]}
                    """))
        .andExpect(status().isBadRequest());
    assertFalse(userRepository.existsByUsername("valid_new"));
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd backend && mvn test -Dtest=UserControllerTest
```

Expected: the 3 new tests fail with `404 Not Found` (endpoint doesn't exist yet), all prior tests still pass.

- [ ] **Step 5: Add `importUsers` to `UserService.java`**

Add these imports to `UserService.java`:
```java
import java.util.HashSet;
import java.util.Set;
```

Add this method to the `UserService` class:

```java
@Transactional
public ImportUsersResult importUsers(ImportUsersRequest req) {
    List<ImportRowError> errors = new ArrayList<>();
    Set<String> seenUsernames = new HashSet<>();
    int rowNum = 2; // Excel row 1 = header, row 2 = first data row
    for (CreateUserRequest r : req.users()) {
        if (r.username() == null || r.username().isBlank()) {
            errors.add(new ImportRowError(rowNum, "username", "must not be blank"));
        } else if (r.username().length() > 64) {
            errors.add(new ImportRowError(rowNum, "username", "max 64 characters"));
        } else if (!seenUsernames.add(r.username())) {
            errors.add(new ImportRowError(rowNum, "username", "duplicate within this file"));
        } else if (userRepository.existsByUsername(r.username())) {
            errors.add(new ImportRowError(rowNum, "username", "already taken"));
        }
        if (r.displayName() == null || r.displayName().isBlank()) {
            errors.add(new ImportRowError(rowNum, "displayName", "must not be blank"));
        } else if (r.displayName().length() > 128) {
            errors.add(new ImportRowError(rowNum, "displayName", "max 128 characters"));
        }
        if (r.password() == null || r.password().isBlank()) {
            errors.add(new ImportRowError(rowNum, "password", "must not be blank"));
        } else if (r.password().length() < 8) {
            errors.add(new ImportRowError(rowNum, "password", "min 8 characters"));
        }
        if (r.role() == null || r.role().isBlank()) {
            errors.add(new ImportRowError(rowNum, "role", "must not be blank"));
        } else {
            try {
                Role.valueOf(r.role());
            } catch (IllegalArgumentException e) {
                errors.add(new ImportRowError(rowNum, "role", "must be STUDENT, TUTOR, or SUPER_ADMIN"));
            }
        }
        rowNum++;
    }
    if (!errors.isEmpty()) {
        throw new ImportValidationException(errors);
    }
    for (CreateUserRequest r : req.users()) {
        User user = new User();
        user.setUsername(r.username());
        user.setDisplayName(r.displayName());
        user.setPasswordHash(passwordEncoder.encode(r.password()));
        user.setRole(Role.valueOf(r.role()));
        user.setStatus(UserStatus.ACTIVE);
        userRepository.save(user);
    }
    return new ImportUsersResult(req.users().size());
}
```

- [ ] **Step 6: Add import endpoint to `UserController.java`**

Add this method to `UserController`. The class-level `@PreAuthorize("hasRole('SUPER_ADMIN')")` already covers it:

```java
@PostMapping("/import")
public ResponseEntity<ImportUsersResult> importUsers(@Valid @RequestBody ImportUsersRequest req) {
    return ResponseEntity.ok(userService.importUsers(req));
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd backend && mvn test -Dtest=UserControllerTest
```

Expected: `BUILD SUCCESS`, all tests including the 3 new ones pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/user/ImportUsersRequest.java \
        backend/src/main/java/com/platform/exercise/user/ImportUsersResult.java \
        backend/src/main/java/com/platform/exercise/user/UserService.java \
        backend/src/main/java/com/platform/exercise/user/UserController.java \
        backend/src/test/java/com/platform/exercise/user/UserControllerTest.java
git commit -m "feat(user): add bulk import endpoint POST /v1/users/import"
```

---

## Task 3: Backend — Change password endpoint (TDD)

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/user/ChangePasswordRequest.java`
- Modify: `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`
- Modify: `backend/src/main/java/com/platform/exercise/user/UserService.java`
- Modify: `backend/src/main/java/com/platform/exercise/user/UserController.java`

- [ ] **Step 1: Create `ChangePasswordRequest.java`**

```java
package com.platform.exercise.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
    @NotBlank String currentPassword,
    @NotBlank @Size(min = 8) String newPassword
) {}
```

- [ ] **Step 2: Write 3 failing tests in `UserControllerTest.java`**

The seed creates `admin_test` with password `"password123"` and `student1` with password `"password123"`. Add:

```java
@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void changePassword_validRequest_returns200AndUpdatesHash() throws Exception {
    mockMvc.perform(patch("/v1/users/me/password")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                    {"currentPassword":"password123","newPassword":"newpassword99"}
                    """))
        .andExpect(status().isOk());
    User updated = userRepository.findByUsername("admin_test").orElseThrow();
    assertTrue(passwordEncoder.matches("newpassword99", updated.getPasswordHash()));
}

@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void changePassword_wrongCurrentPassword_returns400() throws Exception {
    mockMvc.perform(patch("/v1/users/me/password")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                    {"currentPassword":"wrongpassword","newPassword":"newpassword99"}
                    """))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("WRONG_CURRENT_PASSWORD"));
}

@Test
@WithMockUser(username = "student1", roles = "STUDENT")
void changePassword_asStudent_returns200() throws Exception {
    mockMvc.perform(patch("/v1/users/me/password")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                    {"currentPassword":"password123","newPassword":"newpassword99"}
                    """))
        .andExpect(status().isOk());
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend && mvn test -Dtest=UserControllerTest
```

Expected: the 3 new tests fail — `changePassword_asStudent_returns200` will get `403`, the others `404`.

- [ ] **Step 4: Add `changePassword` to `UserService.java`**

```java
@Transactional
public void changePassword(Long userId, ChangePasswordRequest req) {
    User user = userRepository.findById(userId)
        .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND));
    if (!passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
        throw new PlatformException(ErrorCode.WRONG_CURRENT_PASSWORD, "Current password is incorrect");
    }
    user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
    userRepository.save(user);
}
```

- [ ] **Step 5: Add change password endpoint to `UserController.java`**

`@PreAuthorize("isAuthenticated()")` overrides the class-level `@PreAuthorize("hasRole('SUPER_ADMIN')")`, allowing any authenticated user to call this endpoint:

```java
@PatchMapping("/me/password")
@PreAuthorize("isAuthenticated()")
public ResponseEntity<Void> changePassword(
        @Valid @RequestBody ChangePasswordRequest req,
        Authentication authentication) {
    Long currentUserId = resolveCurrentUserId(authentication);
    userService.changePassword(currentUserId, req);
    return ResponseEntity.ok().build();
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && mvn test -Dtest=UserControllerTest
```

Expected: `BUILD SUCCESS`, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/user/ChangePasswordRequest.java \
        backend/src/main/java/com/platform/exercise/user/UserService.java \
        backend/src/main/java/com/platform/exercise/user/UserController.java \
        backend/src/test/java/com/platform/exercise/user/UserControllerTest.java
git commit -m "feat(user): add change password endpoint PATCH /v1/users/me/password"
```

---

## Task 4: Backend — Admin reset password endpoint (TDD)

**Files:**
- Modify: `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`
- Modify: `backend/src/main/java/com/platform/exercise/user/UserService.java`
- Modify: `backend/src/main/java/com/platform/exercise/user/UserController.java`

- [ ] **Step 1: Write 3 failing tests in `UserControllerTest.java`**

```java
@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void resetPassword_validTarget_returns200AndSetsKnownHash() throws Exception {
    User target = userRepository.findByUsername("student1").orElseThrow();
    mockMvc.perform(post("/v1/users/" + target.getId() + "/reset-password"))
        .andExpect(status().isOk());
    User updated = userRepository.findByUsername("student1").orElseThrow();
    assertTrue(passwordEncoder.matches("12345678", updated.getPasswordHash()));
}

@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void resetPassword_self_returns400() throws Exception {
    mockMvc.perform(post("/v1/users/" + adminId + "/reset-password"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("CANNOT_MODIFY_SELF"));
}

@Test
@WithMockUser(username = "student1", roles = "STUDENT")
void resetPassword_asStudent_returns403() throws Exception {
    mockMvc.perform(post("/v1/users/1/reset-password"))
        .andExpect(status().isForbidden());
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && mvn test -Dtest=UserControllerTest
```

Expected: all 3 new tests fail with `404 Not Found` — the endpoint doesn't exist yet, so routing never resolves and method-level security never fires.

- [ ] **Step 3: Add `resetPassword` to `UserService.java`**

```java
@Transactional
public void resetPassword(Long targetId, Long requesterId) {
    if (targetId.equals(requesterId)) {
        throw new PlatformException(ErrorCode.CANNOT_MODIFY_SELF,
            "Cannot reset your own password via this endpoint");
    }
    User user = userRepository.findById(targetId)
        .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND));
    user.setPasswordHash(passwordEncoder.encode("12345678"));
    userRepository.save(user);
}
```

- [ ] **Step 4: Add reset password endpoint to `UserController.java`**

```java
@PostMapping("/{id}/reset-password")
public ResponseEntity<Void> resetPassword(
        @PathVariable Long id,
        Authentication authentication) {
    Long currentUserId = resolveCurrentUserId(authentication);
    userService.resetPassword(id, currentUserId);
    return ResponseEntity.ok().build();
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && mvn test -Dtest=UserControllerTest
```

Expected: `BUILD SUCCESS`, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/user/UserService.java \
        backend/src/main/java/com/platform/exercise/user/UserController.java \
        backend/src/test/java/com/platform/exercise/user/UserControllerTest.java
git commit -m "feat(user): add admin reset password endpoint POST /v1/users/{id}/reset-password"
```

---

## Task 5: Frontend — Install SheetJS and extend userApi

**Files:**
- Modify: `frontend/package.json` (via npm)
- Modify: `frontend/src/api/userApi.js`

- [ ] **Step 1: Install `xlsx`**

```bash
cd frontend && npm install xlsx
```

Expected: `xlsx` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Replace `frontend/src/api/userApi.js` with the extended version**

```js
import axiosInstance from './axiosInstance';

export const userApi = {
  list: (params) =>
    axiosInstance.get('/v1/users', { params }).then(r => r.data),
  create: (data) =>
    axiosInstance.post('/v1/users', data).then(r => r.data),
  updateRole: (id, role) =>
    axiosInstance.patch(`/v1/users/${id}/role`, { role }).then(r => r.data),
  updateStatus: (id, status) =>
    axiosInstance.patch(`/v1/users/${id}/status`, { status }).then(r => r.data),
  importUsers: (users) =>
    axiosInstance.post('/v1/users/import', { users }).then(r => r.data),
  changePassword: (data) =>
    axiosInstance.patch('/v1/users/me/password', data).then(r => r.data),
  resetPassword: (id) =>
    axiosInstance.post(`/v1/users/${id}/reset-password`).then(r => r.data),
};
```

- [ ] **Step 3: Run frontend tests to verify nothing broke**

```bash
cd frontend && npm test
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/api/userApi.js
git commit -m "feat(user): install xlsx, add importUsers/changePassword/resetPassword to userApi"
```

---

## Task 6: Frontend — ImportUsersModal

**Files:**
- Create: `frontend/src/components/admin/ImportUsersModal.jsx`
- Create: `frontend/src/components/admin/ImportUsersModal.test.jsx`
- Modify: `frontend/src/pages/admin/UserManagementPage.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/admin/ImportUsersModal.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ImportUsersModal from './ImportUsersModal';

vi.mock('xlsx', () => ({
  read: vi.fn(() => ({ SheetNames: ['Users'], Sheets: { Users: {} } })),
  utils: {
    sheet_to_json: vi.fn(() => [
      ['username*', 'displayName*', 'password*', 'role*'],
      ['newuser1', 'New User', 'pass1234', 'STUDENT'],
    ]),
    aoa_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

vi.mock('../../api/userApi', () => ({
  userApi: { importUsers: vi.fn() },
}));

async function getApi() {
  const { userApi } = await import('../../api/userApi');
  return userApi;
}

test('renders download template button', () => {
  render(<ImportUsersModal onClose={vi.fn()} onImported={vi.fn()} />);
  expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument();
});

test('import button is disabled when no file selected', () => {
  render(<ImportUsersModal onClose={vi.fn()} onImported={vi.fn()} />);
  expect(screen.getByRole('button', { name: /^import$/i })).toBeDisabled();
});

test('shows row errors returned by backend', async () => {
  const api = await getApi();
  api.importUsers.mockRejectedValue({
    response: {
      data: {
        error: {
          code: 'IMPORT_VALIDATION_ERROR',
          rows: [{ row: 2, field: 'username', message: 'already taken' }],
        },
      },
    },
  });
  render(<ImportUsersModal onClose={vi.fn()} onImported={vi.fn()} />);
  const file = new File(['mock'], 'users.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await userEvent.upload(screen.getByLabelText('Select Excel File *'), file);
  await userEvent.click(screen.getByRole('button', { name: /^import$/i }));
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('Row 2');
    expect(screen.getByRole('alert')).toHaveTextContent('already taken');
  });
});

test('calls onImported with count on success', async () => {
  const api = await getApi();
  api.importUsers.mockResolvedValue({ imported: 1 });
  const onImported = vi.fn();
  render(<ImportUsersModal onClose={vi.fn()} onImported={onImported} />);
  const file = new File(['mock'], 'users.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  await userEvent.upload(screen.getByLabelText('Select Excel File *'), file);
  await userEvent.click(screen.getByRole('button', { name: /^import$/i }));
  await waitFor(() => expect(onImported).toHaveBeenCalledWith(1));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- ImportUsersModal
```

Expected: 4 failures — component file doesn't exist.

- [ ] **Step 3: Create `frontend/src/components/admin/ImportUsersModal.jsx`**

```jsx
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { userApi } from '../../api/userApi';

export default function ImportUsersModal({ onClose, onImported }) {
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState(null);

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const usersSheet = XLSX.utils.aoa_to_sheet([
      ['username*', 'displayName*', 'password*', 'role*'],
      ['alice', 'Alice Wang', 'pass1234', 'STUDENT'],
    ]);
    XLSX.utils.book_append_sheet(wb, usersSheet, 'Users');
    const instrSheet = XLSX.utils.aoa_to_sheet([
      ['Field', 'Required', 'Rules', 'Valid Values'],
      ['username', 'Yes', 'Unique, max 64 characters', ''],
      ['displayName', 'Yes', 'Max 128 characters', ''],
      ['password', 'Yes', 'Min 8 characters', ''],
      ['role', 'Yes', 'One of the valid values', 'STUDENT / TUTOR / SUPER_ADMIN'],
      ['', '', 'Max 500 rows per import', ''],
    ]);
    XLSX.utils.book_append_sheet(wb, instrSheet, 'Instructions');
    XLSX.writeFile(wb, 'user-import-template.xlsx');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setErrors([]);
    setSaving(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const users = rows.slice(1)
        .filter(row => row.some(cell => cell != null && cell !== ''))
        .map(row => ({
          username: String(row[0] ?? '').trim(),
          displayName: String(row[1] ?? '').trim(),
          password: String(row[2] ?? '').trim(),
          role: String(row[3] ?? '').trim(),
        }));
      const result = await userApi.importUsers(users);
      onImported(result.imported);
    } catch (err) {
      const rows = err.response?.data?.error?.rows;
      if (rows) {
        setErrors(rows);
      } else {
        setErrors([{ row: 0, field: '', message: 'Import failed. Please check your file and try again.' }]);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onSubmit={handleSubmit} style={{ background: '#fff', borderRadius: 8, padding: 32, width: 480 }}>
        <h3 style={{ marginBottom: 16 }}>Import Users</h3>
        <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 4, padding: '10px 14px', marginBottom: 16 }}>
          <button type="button" onClick={downloadTemplate}
            style={{ background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 14 }}>
            Download Template (.xlsx)
          </button>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>Includes headers, example row, and instructions</span>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="import-file" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Select Excel File *
          </label>
          <input id="import-file" type="file" accept=".xlsx"
            onChange={e => setFile(e.target.files[0])} required />
          <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>Only .xlsx format, max 500 rows</div>
        </div>
        {errors.length > 0 && (
          <div role="alert" style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#c62828' }}>
            <strong>Import failed. Please fix the following errors and retry:</strong>
            <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
              {errors.map((e, i) => (
                <li key={i}>{e.row > 0 ? `Row ${e.row}: ` : ''}{e.field ? `${e.field} — ` : ''}{e.message}</li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving || !file}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
            {saving ? 'Importing…' : 'Import'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- ImportUsersModal
```

Expected: 4 tests pass.

- [ ] **Step 5: Wire `ImportUsersModal` into `UserManagementPage.jsx`**

Add import at the top of `UserManagementPage.jsx`:
```jsx
import ImportUsersModal from '../../components/admin/ImportUsersModal';
```

Add state (alongside the existing `showCreate` state):
```jsx
const [showImport, setShowImport] = useState(false);
```

Replace the header `<div>` (the one with `<h1>User Management</h1>` and the `+ New User` button) with:
```jsx
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
  <h1>User Management</h1>
  <div style={{ display: 'flex', gap: 8 }}>
    <button onClick={() => setShowImport(true)}
      style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
      Import Users
    </button>
    <button onClick={() => setShowCreate(true)}
      style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
      + New User
    </button>
  </div>
</div>
```

Add `ImportUsersModal` at the bottom of the `return` statement, after `CreateUserModal`:
```jsx
{showImport && (
  <ImportUsersModal
    onClose={() => setShowImport(false)}
    onImported={() => { setShowImport(false); load(); }} />
)}
```

- [ ] **Step 6: Run all frontend tests**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/admin/ImportUsersModal.jsx \
        frontend/src/components/admin/ImportUsersModal.test.jsx \
        frontend/src/pages/admin/UserManagementPage.jsx
git commit -m "feat(user): add ImportUsersModal and Import Users button to UserManagementPage"
```

---

## Task 7: Frontend — ChangePasswordModal + TopBar dropdown

**Files:**
- Create: `frontend/src/components/ChangePasswordModal.jsx`
- Create: `frontend/src/components/ChangePasswordModal.test.jsx`
- Modify: `frontend/src/components/TopBar.jsx`
- Modify: `frontend/src/components/TopBar.test.jsx`

- [ ] **Step 1: Write failing tests for `ChangePasswordModal`**

Create `frontend/src/components/ChangePasswordModal.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ChangePasswordModal from './ChangePasswordModal';

vi.mock('../api/userApi', () => ({
  userApi: { changePassword: vi.fn() },
}));

async function getApi() {
  const { userApi } = await import('../api/userApi');
  return userApi;
}

test('shows error when new passwords do not match', async () => {
  render(<ChangePasswordModal onClose={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Current Password'), 'oldpass123');
  await userEvent.type(screen.getByLabelText('New Password'), 'newpass123');
  await userEvent.type(screen.getByLabelText('Confirm New Password'), 'different');
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  expect(screen.getByRole('alert')).toHaveTextContent('do not match');
});

test('shows error on WRONG_CURRENT_PASSWORD', async () => {
  const api = await getApi();
  api.changePassword.mockRejectedValue({
    response: { data: { error: { code: 'WRONG_CURRENT_PASSWORD' } } },
  });
  render(<ChangePasswordModal onClose={vi.fn()} />);
  await userEvent.type(screen.getByLabelText('Current Password'), 'wrongpass');
  await userEvent.type(screen.getByLabelText('New Password'), 'newpass123');
  await userEvent.type(screen.getByLabelText('Confirm New Password'), 'newpass123');
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('incorrect'));
});

test('calls onClose on success', async () => {
  const api = await getApi();
  api.changePassword.mockResolvedValue({});
  const onClose = vi.fn();
  render(<ChangePasswordModal onClose={onClose} />);
  await userEvent.type(screen.getByLabelText('Current Password'), 'correctpass');
  await userEvent.type(screen.getByLabelText('New Password'), 'newpass123');
  await userEvent.type(screen.getByLabelText('Confirm New Password'), 'newpass123');
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- ChangePasswordModal
```

Expected: 3 failures — component file doesn't exist.

- [ ] **Step 3: Create `frontend/src/components/ChangePasswordModal.jsx`**

```jsx
import { useState } from 'react';
import { userApi } from '../api/userApi';

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await userApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      onClose();
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setError(code === 'WRONG_CURRENT_PASSWORD' ? 'Current password is incorrect' : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onSubmit={submit} style={{ background: '#fff', borderRadius: 8, padding: 32, width: 400 }}>
        <h3 style={{ marginBottom: 16 }}>Change Password</h3>
        {error && <div role="alert" style={{ marginBottom: 12, color: '#c62828' }}>{error}</div>}
        {[
          ['currentPassword', 'Current Password', 'current-password'],
          ['newPassword', 'New Password', 'new-password'],
          ['confirmPassword', 'Confirm New Password', 'confirm-password'],
        ].map(([k, label, id]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label htmlFor={id}>{label}</label>
            <input id={id} type="password" value={form[k]} onChange={update(k)} required
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run `ChangePasswordModal` tests to verify they pass**

```bash
cd frontend && npm test -- ChangePasswordModal
```

Expected: 3 tests pass.

- [ ] **Step 5: Replace `frontend/src/components/TopBar.jsx`**

```jsx
import { useState, useRef, useEffect } from 'react';
import ChangePasswordModal from './ChangePasswordModal';

export default function TopBar({ username, role, collapsed, onToggleSidebar, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', background: '#1565c0',
        padding: '0 16px', height: 46, gap: 12, flexShrink: 0,
      }}>
        <button
          aria-label="Toggle sidebar"
          onClick={onToggleSidebar}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.85)', fontSize: 20, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, lineHeight: 1 }}
        >
          ☰
        </button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>🎓 Platform</span>
        <div style={{ flex: 1 }} />
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="User menu"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
              padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
            }}
          >
            <span>{username}</span>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: 3, fontSize: 11 }}>{role}</span>
            <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', top: 36, right: 0, background: '#fff', color: '#333',
              borderRadius: 4, boxShadow: '0 3px 12px rgba(0,0,0,0.2)', minWidth: 170,
              fontSize: 13, zIndex: 200,
            }}>
              <button
                onClick={() => { setMenuOpen(false); setShowChangePassword(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', textAlign: 'left' }}
              >
                Change Password
              </button>
              <button
                onClick={onLogout}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', color: '#c62828', textAlign: 'left' }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 6: Replace `frontend/src/components/TopBar.test.jsx`**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import TopBar from './TopBar';

vi.mock('./ChangePasswordModal', () => ({
  default: () => <div role="dialog" aria-label="change password modal" />,
}));

function setup(props = {}) {
  const defaults = {
    username: 'alice',
    role: 'TUTOR',
    collapsed: false,
    onToggleSidebar: vi.fn(),
    onLogout: vi.fn(),
    ...props,
  };
  render(<TopBar {...defaults} />);
  return defaults;
}

test('renders username', () => {
  setup();
  expect(screen.getByText('alice')).toBeInTheDocument();
});

test('renders role badge', () => {
  setup();
  expect(screen.getByText('TUTOR')).toBeInTheDocument();
});

test('toggle button calls onToggleSidebar', async () => {
  const { onToggleSidebar } = setup();
  await userEvent.click(screen.getByRole('button', { name: /toggle sidebar/i }));
  expect(onToggleSidebar).toHaveBeenCalledOnce();
});

test('clicking user menu opens dropdown with Change Password and Logout', async () => {
  setup();
  expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /user menu/i }));
  expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
});

test('logout calls onLogout', async () => {
  const { onLogout } = setup();
  await userEvent.click(screen.getByRole('button', { name: /user menu/i }));
  await userEvent.click(screen.getByRole('button', { name: /logout/i }));
  expect(onLogout).toHaveBeenCalledOnce();
});

test('change password opens modal', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: /user menu/i }));
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  expect(screen.getByRole('dialog', { name: /change password modal/i })).toBeInTheDocument();
});
```

- [ ] **Step 7: Run all frontend tests**

```bash
cd frontend && npm test
```

Expected: all tests pass including the new TopBar and ChangePasswordModal tests.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ChangePasswordModal.jsx \
        frontend/src/components/ChangePasswordModal.test.jsx \
        frontend/src/components/TopBar.jsx \
        frontend/src/components/TopBar.test.jsx
git commit -m "feat(user): add ChangePasswordModal and TopBar user dropdown"
```

---

## Task 8: Frontend — Admin reset password button

**Files:**
- Modify: `frontend/src/pages/admin/UserManagementPage.jsx`

- [ ] **Step 1: Add reset password state, handler, and button to `UserManagementPage.jsx`**

Add state (alongside the existing state declarations):
```jsx
const [resettingId, setResettingId] = useState(null);
```

Add handler (after `handleStatusToggle`):
```jsx
async function handleResetPassword(u) {
  if (!confirm(`Reset ${u.username}'s password to 12345678?`)) return;
  setResettingId(u.id);
  try {
    await userApi.resetPassword(u.id);
  } finally {
    setResettingId(null);
  }
}
```

Replace the Actions `<td>` (currently containing only the Disable/Enable button) with:
```jsx
<td style={{ padding: 8 }}>
  {u.id !== currentUser?.id && (
    <>
      <button onClick={() => handleStatusToggle(u)}
        style={{ padding: '4px 10px', cursor: 'pointer' }}>
        {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
      </button>
      <button onClick={() => handleResetPassword(u)}
        disabled={resettingId === u.id}
        style={{ marginLeft: 8, padding: '4px 10px', cursor: 'pointer', background: '#ef6c00', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12 }}>
        {resettingId === u.id ? 'Resetting…' : 'Reset Password'}
      </button>
    </>
  )}
</td>
```

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/admin/UserManagementPage.jsx
git commit -m "feat(user): add Reset Password button to UserManagementPage"
```
