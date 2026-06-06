# Expiration Date Validation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent setting user expiration dates to past dates — only today and future allowed.

**Architecture:** Add `LocalDate.now()` comparison in `UserService` for all three write flows, plus `min` attribute on frontend date inputs and import-time client validation.

**Tech Stack:** Java 25 / Spring Boot 3.5, React 18, Vitest

**Methodology:** TDD — red (write failing test) → green (minimal impl) → refactor (if needed) per feature.

---

### Task 1: Backend — reject past expiration date on `createUser`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/user/UserService.java:49-62`
- Modify: `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`

- [ ] **Step 1: Write failing test**

Add to `UserControllerTest.java`:
```java
@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void createUser_pastExpirationDate_returns400() throws Exception {
    String pastDate = LocalDateTime.now().minusDays(1).toString();

    mockMvc.perform(post("/v1/users")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                    {"username":"pastuser","displayName":"Past User",\
                    "password":"securepass1","role":"STUDENT",\
                    "expirationDate":"%s"}
                    """.formatted(pastDate)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
}
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd backend && mvn test -Dtest=UserControllerTest#createUser_pastExpirationDate_returns400`
Expected: FAIL (status is 201, not 400)

- [ ] **Step 3: Implement validation in `createUser()`**

In `UserService.java`, add `import java.time.LocalDate;`. Before `user.setExpirationDate(req.expirationDate())`:
```java
if (req.expirationDate() != null && req.expirationDate().toLocalDate().isBefore(LocalDate.now())) {
    throw new PlatformException(ErrorCode.VALIDATION_ERROR,
        "Expiration date must be today or in the future");
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd backend && mvn test -Dtest=UserControllerTest#createUser_pastExpirationDate_returns400`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add backend/src/main/java/com/platform/exercise/user/UserService.java backend/src/test/java/com/platform/exercise/user/UserControllerTest.java
git commit -m "feat: reject past expiration date on user creation"
```

### Task 2: Backend — reject past expiration date on `updateExpiration`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/user/UserService.java:166-172`
- Modify: `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`

- [ ] **Step 1: Write failing test**

```java
@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void patchExpiration_pastDate_returns400() throws Exception {
    User target = userRepository.findByUsername("student1").orElseThrow();
    String pastDate = LocalDateTime.now().minusDays(1).toString();

    mockMvc.perform(patch("/v1/users/" + target.getId() + "/expiration")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"expirationDate\":\"" + pastDate + "\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
}
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd backend && mvn test -Dtest=UserControllerTest#patchExpiration_pastDate_returns400`
Expected: FAIL (status is 200, not 400)

- [ ] **Step 3: Implement validation in `updateExpiration()`**

Before `user.setExpirationDate(req.expirationDate())`:
```java
if (req.expirationDate() != null && req.expirationDate().toLocalDate().isBefore(LocalDate.now())) {
    throw new PlatformException(ErrorCode.VALIDATION_ERROR,
        "Expiration date must be today or in the future");
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd backend && mvn test -Dtest=UserControllerTest#patchExpiration_pastDate_returns400`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git commit -m "feat: reject past expiration date on updateExpiration"
```

### Task 3: Backend — reject past expiration date on `importUsers`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/user/UserService.java:65-116`
- Modify: `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`

- [ ] **Step 1: Write failing test**

```java
@Test
@WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
void importUsers_pastExpirationDate_returns400() throws Exception {
    String pastDate = LocalDateTime.now().minusDays(1).toString();

    mockMvc.perform(post("/v1/users/import")
            .contentType(MediaType.APPLICATION_JSON)
            .content("""
                    {"users":[{"username":"pastimport","displayName":"Past Import",\
                    "password":"pass1234","role":"STUDENT",\
                    "expirationDate":"%s"}]}
                    """.formatted(pastDate)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("IMPORT_VALIDATION_ERROR"))
        .andExpect(jsonPath("$.error.rows[0].field").value("expirationDate"));
}
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd backend && mvn test -Dtest=UserControllerTest#importUsers_pastExpirationDate_returns400`
Expected: FAIL (import succeeds, status 200)

- [ ] **Step 3: Implement validation in `importUsers()`**

After the role validation block in the validation loop, add:
```java
if (r.expirationDate() != null && r.expirationDate().toLocalDate().isBefore(LocalDate.now())) {
    errors.add(new ImportRowError(rowNum, "expirationDate", "must be today or in the future"));
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd backend && mvn test -Dtest=UserControllerTest#importUsers_pastExpirationDate_returns400`
Expected: PASS

- [ ] **Step 5: Run full UserControllerTest — expect all PASS**

Run: `cd backend && mvn test -Dtest=UserControllerTest`
Expected: All tests pass

- [ ] **Step 6: Commit**
```bash
git commit -m "feat: reject past expiration date on user import"
```

### Task 4: Frontend — add `min` attribute to date inputs

**Files:**
- Modify: `frontend/src/components/admin/CreateUserModal.jsx:52-57`
- Modify: `frontend/src/pages/admin/UserManagementPage.jsx:164-168`

- [ ] **Step 1: Add `today` and `min` to `CreateUserModal.jsx`**

After line 4 (`const ROLES = ...`):
```js
const today = new Date().toISOString().split('T')[0];
```

Update line 54:
```jsx
<input type="date" value={form.expirationDate}
  onChange={update('expirationDate')} min={today}
  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
```

- [ ] **Step 2: Add `today` and `min` to `UserManagementPage.jsx`**

After line 20 (`function isExpired ... { }`):
```js
const today = new Date().toISOString().split('T')[0];
```

Update line 165:
```jsx
<input type="date"
  value={expirationInput[u.id] || ''}
  onChange={e => setExpirationInput(p => ({ ...p, [u.id]: e.target.value }))}
  min={today}
  style={{ padding: 2, fontSize: 11, width: 110 }} />
```

- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/admin/CreateUserModal.jsx frontend/src/pages/admin/UserManagementPage.jsx
git commit -m "feat: add min=today on date inputs"
```

### Task 5: Frontend — validate expiration date in import

**Files:**
- Modify: `frontend/src/components/admin/ImportUsersModal.jsx:40-48`

- [ ] **Step 1: Add past-date check before API call**

After line 8 (`const [file, setFile] = useState(null);`):
```js
const today = new Date().toISOString().split('T')[0];
```

Before `const result = await userApi.importUsers(users);` (before line 49), add:
```js
const pastDateRows = users.filter(u => u.expirationDate && u.expirationDate.split('T')[0] < today);
if (pastDateRows.length > 0) {
  setErrors(pastDateRows.map(u => ({
    row: users.indexOf(u) + 2,
    field: 'expirationDate',
    message: 'must be today or in the future',
  })));
  setSaving(false);
  return;
}
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/admin/ImportUsersModal.jsx
git commit -m "feat: validate expiration date on user import"
```
