# Last Login Timestamp + User Name Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `last_login_at` tracking to users and a case-insensitive name search filter (searches both `username` and `display_name`) to the user management page.

**Architecture:** A V7 Flyway migration adds the column. `AuthService.login()` stamps the timestamp on every successful password-based login. The existing JPA Specification in `UserService.listUsers` gains a third predicate for the `name` param. The frontend adds a text input filter and a Last Login column.

**Tech Stack:** Java 25 · Spring Boot 3.5 · Spring Data JPA (Specification) · Flyway 9 · React 18 · Vitest · MockMvc (@SpringBootTest)

## Global Constraints

- No new dependencies
- Flyway migration filenames must follow `V{n}__{description}.sql`; next version is V7
- Backend tests use `@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test") @Transactional`
- Frontend tests use Vitest + React Testing Library; mock `../../api/userApi` and `../../contexts/AuthContext`
- `last_login_at` updated on password-based login only — not on token refresh
- Name filter: case-insensitive LIKE on both `username` and `display_name` columns
- Blank/null `name` param → no filter applied (existing behaviour for role/status)

---

### Task 1: DB Migration — add `last_login_at` column

**Files:**
- Create: `backend/src/main/resources/db/migration/V7__add_last_login_at.sql`

**Interfaces:**
- Produces: `users.last_login_at DATETIME NULL` column + index available to JPA

- [ ] **Step 1: Create the migration file**

```sql
-- V7__add_last_login_at.sql
ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL;
CREATE INDEX idx_users_last_login_at ON users (last_login_at);
```

Save to `backend/src/main/resources/db/migration/V7__add_last_login_at.sql`.

- [ ] **Step 2: Verify migration runs cleanly**

```bash
cd backend && mvn spring-boot:run -Dspring-boot.run.arguments="--spring.profiles.active=test" &
# Wait for startup, then check logs for "Successfully applied 1 migration to schema"
# Ctrl+C after confirming
```

Or simply run the test suite — Spring Boot will apply migrations against H2 on startup:

```bash
cd backend && mvn test -Dtest=UserControllerTest#listUsers_asAdmin_returns200WithPage -pl .
```

Expected: PASS (existing test still works, migration applied without error).

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V7__add_last_login_at.sql
git commit -m "feat(db): add last_login_at column to users table (V7)"
```

---

### Task 2: User entity and DTO — expose `lastLoginAt`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/domain/User.java`
- Modify: `backend/src/main/java/com/platform/exercise/user/UserDto.java`

**Interfaces:**
- Consumes: `users.last_login_at` column from Task 1
- Produces:
  - `User.getLastLoginAt()` → `LocalDateTime` (nullable)
  - `User.setLastLoginAt(LocalDateTime)` (setter from Lombok `@Data`)
  - `UserDto.lastLoginAt()` → `LocalDateTime` (nullable)
  - `UserDto.from(User)` populates `lastLoginAt` from `user.getLastLoginAt()`

- [ ] **Step 1: Add `lastLoginAt` field to `User.java`**

Open `backend/src/main/java/com/platform/exercise/domain/User.java` and add this field after the `updatedAt` field (before `@PreUpdate`):

```java
@Column(name = "last_login_at")
private LocalDateTime lastLoginAt;
```

The full updated field list (for reference — surrounding context only, do not remove existing fields):
```java
@Column(name = "created_at", nullable = false, updatable = false)
private LocalDateTime createdAt = LocalDateTime.now();

@Column(name = "updated_at", nullable = false)
private LocalDateTime updatedAt = LocalDateTime.now();

@Column(name = "last_login_at")
private LocalDateTime lastLoginAt;

@PreUpdate
protected void onUpdate() { this.updatedAt = LocalDateTime.now(); }
```

- [ ] **Step 2: Update `UserDto` to include `lastLoginAt`**

Replace the entire content of `backend/src/main/java/com/platform/exercise/user/UserDto.java`:

```java
package com.platform.exercise.user;

import com.platform.exercise.domain.User;
import java.time.LocalDateTime;

public record UserDto(
    Long id,
    String username,
    String displayName,
    String role,
    String status,
    LocalDateTime expirationDate,
    LocalDateTime createdAt,
    LocalDateTime lastLoginAt
) {
    public static UserDto from(User user) {
        return new UserDto(
            user.getId(),
            user.getUsername(),
            user.getDisplayName(),
            user.getRole().name(),
            user.getStatus().name(),
            user.getExpirationDate(),
            user.getCreatedAt(),
            user.getLastLoginAt()
        );
    }
}
```

- [ ] **Step 3: Write a failing test for `lastLoginAt` in list response**

In `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`, add this test inside the class (after the existing tests):

```java
@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void listUsers_returnsLastLoginAtField() throws Exception {
    User target = userRepository.findByUsername("student1").orElseThrow();
    target.setLastLoginAt(LocalDateTime.of(2026, 1, 15, 10, 30));
    userRepository.save(target);

    mockMvc.perform(get("/v1/users"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[?(@.username=='student1')].lastLoginAt").isNotEmpty());
}

@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void listUsers_returnsNullLastLoginAtWhenNeverLoggedIn() throws Exception {
    mockMvc.perform(get("/v1/users"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[?(@.username=='student1')].lastLoginAt[0]").doesNotExist());
}
```

- [ ] **Step 4: Run the new tests to verify they fail**

```bash
cd backend && mvn test -Dtest="UserControllerTest#listUsers_returnsLastLoginAtField+listUsers_returnsNullLastLoginAtWhenNeverLoggedIn" -pl .
```

Expected: FAIL — `lastLoginAt` not present in JSON yet (field not on DTO before this task) or compilation error if run before Step 2.

After completing Steps 1 and 2, run again:

```bash
cd backend && mvn test -Dtest="UserControllerTest#listUsers_returnsLastLoginAtField+listUsers_returnsNullLastLoginAtWhenNeverLoggedIn" -pl .
```

Expected: PASS.

- [ ] **Step 5: Run full backend test suite to confirm no regressions**

```bash
cd backend && mvn test -pl .
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/domain/User.java \
        backend/src/main/java/com/platform/exercise/user/UserDto.java \
        backend/src/test/java/com/platform/exercise/user/UserControllerTest.java
git commit -m "feat(user): expose lastLoginAt in User entity and UserDto"
```

---

### Task 3: AuthService — stamp `lastLoginAt` on successful login

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/auth/AuthService.java`
- Modify: `backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java`

**Interfaces:**
- Consumes: `User.setLastLoginAt(LocalDateTime)` from Task 2
- Produces: `last_login_at` is set to `LocalDateTime.now()` in the DB after every successful password-based login

- [ ] **Step 1: Write a failing test in `AuthControllerTest`**

Open `backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java`.

Add these imports if not already present:
```java
import com.platform.exercise.repository.UserRepository;
import static org.junit.jupiter.api.Assertions.assertNotNull;
```

Add this test inside the class:

```java
@Test
void login_validCredentials_stampsLastLoginAt() throws Exception {
    mockMvc.perform(post("/v1/auth/login")
            .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
            .content("{\"username\":\"testuser\",\"password\":\"password123\"}"))
        .andExpect(status().isOk());

    User updated = userRepository.findByUsername("testuser").orElseThrow();
    assertNotNull(updated.getLastLoginAt(), "lastLoginAt must be set after login");
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && mvn test -Dtest="AuthControllerTest#login_validCredentials_stampsLastLoginAt" -pl .
```

Expected: FAIL — `lastLoginAt` is null (not yet set in AuthService).

- [ ] **Step 3: Update `AuthService.login()` to stamp `lastLoginAt`**

In `backend/src/main/java/com/platform/exercise/auth/AuthService.java`, find the `login` method. After the status check (after `if (user.getStatus() == User.UserStatus.DISABLED)`) and before generating the access token, add:

```java
user.setLastLoginAt(LocalDateTime.now());
userRepository.save(user);
```

The relevant section should look like this after the change:

```java
if (user.getStatus() == User.UserStatus.DISABLED) {
    throw new PlatformException(ErrorCode.ACCOUNT_DISABLED,
        "Account disabled — please contact an administrator");
}

user.setLastLoginAt(LocalDateTime.now());
userRepository.save(user);

String accessToken = jwtUtil.generateToken(user.getId(), user.getRole().name());
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend && mvn test -Dtest="AuthControllerTest#login_validCredentials_stampsLastLoginAt" -pl .
```

Expected: PASS.

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && mvn test -pl .
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/auth/AuthService.java \
        backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java
git commit -m "feat(auth): stamp last_login_at on successful password-based login"
```

---

### Task 4: Backend — `name` filter on user list API

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/user/UserController.java`
- Modify: `backend/src/main/java/com/platform/exercise/user/UserService.java`
- Modify: `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`

**Interfaces:**
- Consumes: existing `listUsers(int, int, String, String)` signature
- Produces: `GET /v1/users?name=<value>` returns users where `username LIKE %value%` OR `display_name LIKE %value%` (case-insensitive)

- [ ] **Step 1: Write failing tests in `UserControllerTest`**

Add these tests to `UserControllerTest.java`:

```java
@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void listUsers_nameFilter_matchesUsername() throws Exception {
    // "student1" username contains "student"
    mockMvc.perform(get("/v1/users").param("name", "student"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[?(@.username=='student1')]").exists())
        .andExpect(jsonPath("$.content[?(@.username=='admin_test')]").doesNotExist());
}

@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void listUsers_nameFilter_matchesDisplayName() throws Exception {
    // "Admin User" displayName contains "admin" (case-insensitive)
    mockMvc.perform(get("/v1/users").param("name", "admin"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[?(@.username=='admin_test')]").exists());
}

@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void listUsers_nameFilter_noMatch_returnsEmptyContent() throws Exception {
    mockMvc.perform(get("/v1/users").param("name", "zzznomatch"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content").isEmpty());
}

@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void listUsers_nameFilter_blank_returnsAll() throws Exception {
    mockMvc.perform(get("/v1/users").param("name", "  "))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(org.hamcrest.Matchers.greaterThan(0)));
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && mvn test -Dtest="UserControllerTest#listUsers_nameFilter_matchesUsername+listUsers_nameFilter_matchesDisplayName+listUsers_nameFilter_noMatch_returnsEmptyContent+listUsers_nameFilter_blank_returnsAll" -pl .
```

Expected: FAIL (compilation error — `name` param not on controller yet, or filter not applied).

- [ ] **Step 3: Add `name` param to `UserController.listUsers`**

In `backend/src/main/java/com/platform/exercise/user/UserController.java`, update the `listUsers` method signature and call:

```java
@GetMapping
public ResponseEntity<PageResponse<UserDto>> listUsers(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size,
        @RequestParam(required = false) String role,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String name) {
    return ResponseEntity.ok(userService.listUsers(page, size, role, status, name));
}
```

- [ ] **Step 4: Add `name` filter to `UserService.listUsers`**

In `backend/src/main/java/com/platform/exercise/user/UserService.java`, update the `listUsers` method signature and add the name predicate:

```java
@Transactional(readOnly = true)
public PageResponse<UserDto> listUsers(int page, int size, String role, String status, String name) {
    Specification<User> spec = (root, query, cb) -> {
        List<Predicate> predicates = new ArrayList<>();
        if (role != null && !role.isBlank()) {
            predicates.add(cb.equal(root.get("role"), Role.valueOf(role)));
        }
        if (status != null && !status.isBlank()) {
            predicates.add(cb.equal(root.get("status"), UserStatus.valueOf(status)));
        }
        if (name != null && !name.isBlank()) {
            String pattern = "%" + name.toLowerCase() + "%";
            predicates.add(cb.or(
                cb.like(cb.lower(root.get("username")), pattern),
                cb.like(cb.lower(root.get("displayName")), pattern)
            ));
        }
        return cb.and(predicates.toArray(new Predicate[0]));
    };
    var pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
    return PageResponse.of(userRepository.findAll(spec, pageable).map(UserDto::from));
}
```

- [ ] **Step 5: Run the new tests**

```bash
cd backend && mvn test -Dtest="UserControllerTest#listUsers_nameFilter_matchesUsername+listUsers_nameFilter_matchesDisplayName+listUsers_nameFilter_noMatch_returnsEmptyContent+listUsers_nameFilter_blank_returnsAll" -pl .
```

Expected: PASS.

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && mvn test -pl .
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/user/UserController.java \
        backend/src/main/java/com/platform/exercise/user/UserService.java \
        backend/src/test/java/com/platform/exercise/user/UserControllerTest.java
git commit -m "feat(user): add name filter to user list API (username + displayName LIKE search)"
```

---

### Task 5: Frontend — name filter input + Last Login column

**Files:**
- Modify: `frontend/src/pages/admin/UserManagementPage.jsx`
- Modify: `frontend/src/pages/admin/UserManagementPage.test.jsx`

**Interfaces:**
- Consumes: `userApi.list({ page, size, role, status, name })` — `name` is already passed through since `list(params)` passes params as-is to axios
- Consumes: `lastLoginAt` field on user objects returned from API (from Task 2)
- Produces: text input that filters the list; Last Login column showing formatted datetime or `—`

- [ ] **Step 1: Write failing frontend tests**

Open `frontend/src/pages/admin/UserManagementPage.test.jsx`.

Add these imports at the top (after existing imports):
```js
import userEvent from '@testing-library/user-event';
```

Add the following tests after the existing ones:

```js
test('renders Last Login column header', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({ content: [], totalPages: 0 });
  render(<UserManagementPage />);
  await waitFor(() => {
    expect(screen.getByText('Last Login')).toBeInTheDocument();
  });
});

test('displays formatted last login time when present', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({
    content: [
      {
        id: 2,
        username: 'alice',
        displayName: 'Alice',
        role: 'STUDENT',
        status: 'ACTIVE',
        expirationDate: null,
        lastLoginAt: '2026-06-25T14:30:00',
      },
    ],
    totalPages: 1,
  });
  render(<UserManagementPage />);
  await waitFor(() => {
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
  // The formatted value should appear somewhere in the row
  // zh-CN locale formats vary by environment; just check it's not "—"
  const cells = screen.getAllByRole('cell');
  const lastLoginCell = cells.find(c => c.textContent && c.textContent !== '—' && c.textContent.includes('2026'));
  expect(lastLoginCell).toBeDefined();
});

test('displays — when lastLoginAt is null', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({
    content: [
      {
        id: 2,
        username: 'alice',
        displayName: 'Alice',
        role: 'STUDENT',
        status: 'ACTIVE',
        expirationDate: null,
        lastLoginAt: null,
      },
    ],
    totalPages: 1,
  });
  render(<UserManagementPage />);
  await waitFor(() => {
    expect(screen.getByText('alice')).toBeInTheDocument();
  });
  expect(screen.getByText('—')).toBeInTheDocument();
});

test('name filter input calls API with name param', async () => {
  const api = await getApi();
  api.list.mockResolvedValue({ content: [], totalPages: 0 });
  render(<UserManagementPage />);
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));

  const input = screen.getByPlaceholderText('Search by username or name');
  await userEvent.type(input, 'alice');

  await waitFor(() => {
    const calls = api.list.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.name).toBe('alice');
  });
});
```

- [ ] **Step 2: Run frontend tests to verify they fail**

```bash
cd frontend && npm test -- --run UserManagementPage
```

Expected: new tests FAIL (Last Login column, `—`, name input not present yet).

- [ ] **Step 3: Update `UserManagementPage.jsx`**

Replace the entire file content with the updated version below. Changes are:
1. Add `nameFilter` state
2. Add `fmtDateTime` helper
3. Pass `name` to `userApi.list`
4. Add `nameFilter` to `useEffect` dependency array
5. Add name search input to filter bar
6. Add Last Login column header and cell

```jsx
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { userApi } from '../../api/userApi';
import { isReauthCancelled } from '../../api/axiosInstance';
import CreateUserModal from '../../components/admin/CreateUserModal';
import ImportUsersModal from '../../components/admin/ImportUsersModal';
import Pagination from '../../components/Pagination';

const ROLE_BADGE = { STUDENT: '#1976d2', TUTOR: '#388e3c', SUPER_ADMIN: '#7b1fa2' };
const STATUS_BADGE = { ACTIVE: '#2e7d32', DISABLED: '#c62828' };

function fmtDate(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function fmtDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function isExpired(dt) {
  if (!dt) return false;
  return new Date(dt) < new Date();
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [resettingId, setResettingId] = useState(null);
  const [expirationInput, setExpirationInput] = useState({});
  const today = new Date().toISOString().split('T')[0];

  async function load() {
    setLoading(true);
    try {
      const data = await userApi.list({
        page, size: 20,
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(nameFilter && { name: nameFilter }),
      });
      setUsers(data.content);
      setTotalPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, roleFilter, statusFilter, nameFilter]);

  async function handleRoleChange(id, role) {
    await userApi.updateRole(id, role);
    load();
  }

  async function handleStatusToggle(u) {
    const newStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (newStatus === 'DISABLED' && !confirm(`Disable ${u.username}? All active sessions will be invalidated.`)) return;
    await userApi.updateStatus(u.id, newStatus);
    load();
  }

  async function handleSetExpiration(u) {
    const val = expirationInput[u.id];
    const dt = val ? new Date(val).toISOString() : null;
    await userApi.updateExpiration(u.id, dt);
    setExpirationInput(p => ({ ...p, [u.id]: undefined }));
    load();
  }

  async function handleClearExpiration(u) {
    await userApi.updateExpiration(u.id, null);
    load();
  }

  async function handleResetPassword(u) {
    if (!confirm(`Reset ${u.username}'s password to 12345678?`)) return;
    setResettingId(u.id);
    try {
      await userApi.resetPassword(u.id);
      setToast(`${u.username}'s password has been reset`);
      setTimeout(() => setToast(''), 4000);
    } catch (err) {
      if (isReauthCancelled(err)) return;
      setToast('Failed to reset password — please try again');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setResettingId(null);
    }
  }

  return (
    <div style={{ padding: 32 }}>
      {toast && (
        <div role="status" style={{ marginBottom: 16, padding: 12, background: '#e8f5e9', borderRadius: 4, color: '#2e7d32' }}>
          {toast}
        </div>
      )}
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

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by username or name"
          value={nameFilter}
          onChange={e => { setNameFilter(e.target.value); setPage(0); }}
          style={{ padding: 8, minWidth: 220 }}
        />
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0); }}
          style={{ padding: 8 }}>
          <option value="">All Roles</option>
          {['STUDENT', 'TUTOR', 'SUPER_ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          style={{ padding: 8 }}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      </div>

      {loading ? <p>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Username</th>
              <th style={{ padding: 8 }}>Display Name</th>
              <th style={{ padding: 8 }}>Role</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Expiration</th>
              <th style={{ padding: 8 }}>Last Login</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{u.username}</td>
                <td style={{ padding: 8 }}>{u.displayName}</td>
                <td style={{ padding: 8 }}>
                  <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                    disabled={u.id === currentUser?.id}
                    style={{ padding: 4, color: ROLE_BADGE[u.role] }}>
                    {['STUDENT', 'TUTOR', 'SUPER_ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={{ padding: 8 }}>
                  <span style={{ color: STATUS_BADGE[u.status], fontWeight: 600 }}>{u.status}</span>
                </td>
                <td style={{ padding: 8 }}>
                  {u.expirationDate ? (
                    <span style={{ color: isExpired(u.expirationDate) ? '#c62828' : '#2e7d32', fontWeight: 600 }}>
                      {fmtDate(u.expirationDate)}{isExpired(u.expirationDate) ? ' (Expired)' : ''}
                    </span>
                  ) : (
                    <span style={{ color: '#999' }}>Never</span>
                  )}
                  {u.id !== currentUser?.id && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="date"
                        value={expirationInput[u.id] || ''}
                        onChange={e => setExpirationInput(p => ({ ...p, [u.id]: e.target.value }))}
                        min={today}
                        style={{ padding: 2, fontSize: 11, width: 110 }} />
                      <button onClick={() => handleSetExpiration(u)}
                        disabled={!expirationInput[u.id]}
                        style={{ padding: '2px 6px', cursor: 'pointer', fontSize: 11 }}>Set</button>
                      {u.expirationDate && (
                        <button onClick={() => handleClearExpiration(u)}
                          style={{ padding: '2px 6px', cursor: 'pointer', fontSize: 11, color: '#c62828' }}>Clear</button>
                      )}
                    </div>
                  )}
                </td>
                <td style={{ padding: 8, color: u.lastLoginAt ? 'inherit' : '#999' }}>
                  {fmtDateTime(u.lastLoginAt)}
                </td>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} />

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }} />
      )}
      {showImport && (
        <ImportUsersModal
          onClose={() => setShowImport(false)}
          onImported={(count) => {
            setShowImport(false);
            setToast(`${count} user${count !== 1 ? 's' : ''} imported successfully`);
            setTimeout(() => setToast(''), 4000);
            load();
          }} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run frontend tests**

```bash
cd frontend && npm test -- --run UserManagementPage
```

Expected: all tests PASS (including the 4 new ones and all pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/admin/UserManagementPage.jsx \
        frontend/src/pages/admin/UserManagementPage.test.jsx
git commit -m "feat(ui): add Last Login column and name search filter to user management page"
```

---

## Self-Review

**Spec coverage:**
- ✅ `last_login_at` column added (Task 1)
- ✅ `last_login_at` field on entity and DTO (Task 2)
- ✅ Stamped on successful password-based login, not on refresh (Task 3)
- ✅ `name` filter searches both `username` and `display_name` case-insensitively (Task 4)
- ✅ Last Login column displayed, null shown as `—` (Task 5)
- ✅ Name search input in filter bar, resets to page 0 on change (Task 5)

**Placeholder scan:** None found. All steps include complete code.

**Type consistency:**
- `User.getLastLoginAt()` defined in Task 2, consumed in Task 3 (`setLastLoginAt`) and Task 4 (`UserDto.from`)
- `UserDto.lastLoginAt()` defined in Task 2, rendered in Task 5 as `u.lastLoginAt`
- `userService.listUsers(page, size, role, status, name)` — signature updated in both controller (Task 4 Step 3) and service (Task 4 Step 4) simultaneously
