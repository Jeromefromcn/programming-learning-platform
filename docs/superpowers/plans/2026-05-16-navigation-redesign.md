# Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-tab sidebar + "+" picker with a global left sidebar menu driven by DB-backed per-role configuration, editable by SUPER_ADMIN.

**Architecture:** A single `Sidebar` component sits at the `AppShellInner` level (outside `TabPanel`), reads `menuSections` from `AuthContext`, and calls `openTab(section)` on click. `AuthContext` fetches the section list from `GET /v1/settings/menu-config` on login. Admin edits the config via a new checkbox grid in `GlobalSettingsPage`, persisted as JSON in `global_settings` under key `menu_config`.

**Tech Stack:** React 18 · Vitest · Spring Boot 3.5.0 · JPA · Jackson · Flyway 9 · H2 (tests)

---

## File Map

**New:**
- `backend/src/main/resources/db/migration/V3__add_menu_config.sql`

**Modified:**
- `backend/src/main/java/com/platform/exercise/settings/SettingsService.java`
- `backend/src/main/java/com/platform/exercise/settings/SettingsController.java`
- `backend/src/test/java/com/platform/exercise/settings/SettingsControllerTest.java`
- `frontend/src/api/settingsApi.js`
- `frontend/src/contexts/AuthContext.jsx`
- `frontend/src/contexts/AuthContext.test.jsx`
- `frontend/src/components/sectionConfig.js`
- `frontend/src/components/sectionConfig.test.js`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/Sidebar.test.jsx`
- `frontend/src/components/TabBar.jsx`
- `frontend/src/components/TabBar.test.jsx`
- `frontend/src/components/AppShell.jsx`
- `frontend/src/components/AppShell.test.jsx`
- `frontend/src/pages/admin/GlobalSettingsPage.jsx`

---

## Task 1: DB Migration — seed `menu_config`

**Files:**
- Create: `backend/src/main/resources/db/migration/V3__add_menu_config.sql`

- [ ] **Step 1: Write the migration**

```sql
-- V3__add_menu_config.sql
INSERT INTO global_settings (setting_key, setting_value, updated_at) VALUES (
  'menu_config',
  '{"STUDENT":["exercises","progress"],"TUTOR":["exercises","courses","categories","submissions"],"SUPER_ADMIN":["exercises","courses","categories","submissions","users","settings"]}',
  NOW()
);
```

- [ ] **Step 2: Verify Flyway picks it up**

```bash
cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=test 2>&1 | grep -E "Flyway|V3|menu"
```

Expected: `Successfully applied 1 migration to schema` (or similar — no errors).

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V3__add_menu_config.sql
git commit -m "chore(db): add menu_config seed to global_settings"
```

---

## Task 2: Backend — `SettingsService` menu-config methods

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/settings/SettingsService.java`

- [ ] **Step 1: Write failing tests** (add to `SettingsControllerTest.java` — we'll use the integration test to drive the service)

Skip to Task 3 for the test; the service will be verified through controller tests. Write the service implementation now.

- [ ] **Step 2: Implement the three new methods in `SettingsService.java`**

Replace the full file with:

```java
package com.platform.exercise.settings;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.GlobalSetting;
import com.platform.exercise.repository.GlobalSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SettingsService {

    private static final String KEY_COURSE_FILTER = "course_filter_enabled";
    private static final String KEY_MENU_CONFIG = "menu_config";

    private static final Map<String, List<String>> DEFAULT_MENU_CONFIG = Map.of(
        "STUDENT",     List.of("exercises", "progress"),
        "TUTOR",       List.of("exercises", "courses", "categories", "submissions"),
        "SUPER_ADMIN", List.of("exercises", "courses", "categories", "submissions", "users", "settings")
    );

    private final GlobalSettingRepository settingRepository;
    private final ObjectMapper objectMapper;

    @Cacheable("settings")
    @Transactional(readOnly = true)
    public SettingsResponse getSettings() {
        boolean enabled = readBool(KEY_COURSE_FILTER);
        return new SettingsResponse(enabled);
    }

    @Transactional(readOnly = true)
    public ImpactResponse getCourseFilterImpact() {
        boolean current = readBool(KEY_COURSE_FILTER);
        return new ImpactResponse(current, 0, List.of());
    }

    @CacheEvict(value = "settings", allEntries = true)
    @Transactional
    public SettingsResponse updateCourseFilter(boolean enabled) {
        GlobalSetting setting = settingRepository.findById(KEY_COURSE_FILTER)
            .orElseGet(() -> { GlobalSetting s = new GlobalSetting(); s.setKey(KEY_COURSE_FILTER); return s; });
        setting.setValue(String.valueOf(enabled));
        settingRepository.save(setting);
        return new SettingsResponse(enabled);
    }

    @Transactional(readOnly = true)
    public List<String> getMenuConfig(String role) {
        return settingRepository.findById(KEY_MENU_CONFIG)
            .map(s -> parseMenuConfig(s.getValue()).getOrDefault(role, defaultFor(role)))
            .orElse(defaultFor(role));
    }

    @Transactional(readOnly = true)
    public Map<String, List<String>> getAllMenuConfig() {
        return settingRepository.findById(KEY_MENU_CONFIG)
            .map(s -> parseMenuConfig(s.getValue()))
            .orElse(new HashMap<>(DEFAULT_MENU_CONFIG));
    }

    @Transactional
    public void updateMenuConfig(Map<String, List<String>> config) {
        validateMenuConfig(config);
        String json;
        try {
            json = objectMapper.writeValueAsString(config);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize menu config");
        }
        GlobalSetting setting = settingRepository.findById(KEY_MENU_CONFIG)
            .orElseGet(() -> { GlobalSetting s = new GlobalSetting(); s.setKey(KEY_MENU_CONFIG); return s; });
        setting.setValue(json);
        settingRepository.save(setting);
    }

    private Map<String, List<String>> parseMenuConfig(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, List<String>>>() {});
        } catch (JsonProcessingException e) {
            return new HashMap<>(DEFAULT_MENU_CONFIG);
        }
    }

    private List<String> defaultFor(String role) {
        return DEFAULT_MENU_CONFIG.getOrDefault(role, List.of());
    }

    private void validateMenuConfig(Map<String, List<String>> config) {
        for (Map.Entry<String, List<String>> entry : config.entrySet()) {
            String role = entry.getKey();
            List<String> sections = entry.getValue();
            if (!sections.contains("exercises")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "exercises must be present for role: " + role);
            }
            if (!role.equals("SUPER_ADMIN") &&
                    (sections.contains("users") || sections.contains("settings"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "users and settings are only allowed for SUPER_ADMIN");
            }
        }
    }

    private boolean readBool(String key) {
        return settingRepository.findById(key)
            .map(s -> Boolean.parseBoolean(s.getValue()))
            .orElse(false);
    }
}
```

- [ ] **Step 3: Compile check**

```bash
cd backend && mvn compile -q
```

Expected: `BUILD SUCCESS`

---

## Task 3: Backend — `SettingsController` new endpoints + tests

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/settings/SettingsController.java`
- Modify: `backend/src/test/java/com/platform/exercise/settings/SettingsControllerTest.java`

- [ ] **Step 1: Add failing tests to `SettingsControllerTest.java`**

Add these tests after the existing ones:

```java
@Test
@WithMockUser(username = "student1", roles = "STUDENT")
void getMenuConfig_asStudent_returnsSections() throws Exception {
    mockMvc.perform(get("/v1/settings/menu-config"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.sections").isArray())
        .andExpect(jsonPath("$.sections[0]").value("exercises"));
}

@Test
@WithMockUser(username = "admin", roles = "SUPER_ADMIN")
void getMenuConfigAll_asAdmin_returnsAllRoles() throws Exception {
    mockMvc.perform(get("/v1/settings/menu-config/all"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.STUDENT").isArray())
        .andExpect(jsonPath("$.TUTOR").isArray())
        .andExpect(jsonPath("$.SUPER_ADMIN").isArray());
}

@Test
@WithMockUser(username = "tutor1", roles = "TUTOR")
void getMenuConfigAll_asTutor_returns403() throws Exception {
    mockMvc.perform(get("/v1/settings/menu-config/all"))
        .andExpect(status().isForbidden());
}

@Test
@WithMockUser(username = "admin", roles = "SUPER_ADMIN")
void putMenuConfig_asAdmin_returns204() throws Exception {
    String body = "{\"STUDENT\":[\"exercises\",\"progress\"]," +
        "\"TUTOR\":[\"exercises\",\"courses\",\"categories\",\"submissions\"]," +
        "\"SUPER_ADMIN\":[\"exercises\",\"courses\",\"categories\",\"submissions\",\"users\",\"settings\"]}";
    mockMvc.perform(put("/v1/settings/menu-config")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isNoContent());
}

@Test
@WithMockUser(username = "tutor1", roles = "TUTOR")
void putMenuConfig_asTutor_returns403() throws Exception {
    mockMvc.perform(put("/v1/settings/menu-config")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"TUTOR\":[\"exercises\"]}"))
        .andExpect(status().isForbidden());
}

@Test
@WithMockUser(username = "admin", roles = "SUPER_ADMIN")
void putMenuConfig_missingExercises_returns400() throws Exception {
    String body = "{\"STUDENT\":[\"progress\"]," +
        "\"TUTOR\":[\"exercises\",\"courses\"]," +
        "\"SUPER_ADMIN\":[\"exercises\",\"users\",\"settings\"]}";
    mockMvc.perform(put("/v1/settings/menu-config")
            .contentType(MediaType.APPLICATION_JSON)
            .content(body))
        .andExpect(status().isBadRequest());
}
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && mvn test -pl . -Dtest=SettingsControllerTest -q 2>&1 | tail -20
```

Expected: failures on the new test methods (404 or similar).

- [ ] **Step 3: Add the three endpoints to `SettingsController.java`**

Replace the full file with:

```java
package com.platform.exercise.settings;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;

    @GetMapping
    public ResponseEntity<SettingsResponse> getSettings() {
        return ResponseEntity.ok(settingsService.getSettings());
    }

    @GetMapping("/course-filter/impact")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ImpactResponse> getCourseFilterImpact() {
        return ResponseEntity.ok(settingsService.getCourseFilterImpact());
    }

    @PutMapping("/course-filter")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<SettingsResponse> updateCourseFilter(@RequestBody CourseFilterRequest req) {
        return ResponseEntity.ok(settingsService.updateCourseFilter(req.enabled()));
    }

    @GetMapping("/menu-config")
    public ResponseEntity<Map<String, List<String>>> getMenuConfig(Authentication authentication) {
        String role = extractRole(authentication);
        return ResponseEntity.ok(Map.of("sections", settingsService.getMenuConfig(role)));
    }

    @GetMapping("/menu-config/all")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, List<String>>> getAllMenuConfig() {
        return ResponseEntity.ok(settingsService.getAllMenuConfig());
    }

    @PutMapping("/menu-config")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Void> updateMenuConfig(
            @RequestBody Map<String, List<String>> config) {
        settingsService.updateMenuConfig(config);
        return ResponseEntity.noContent().build();
    }

    private String extractRole(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .findFirst()
                .map(a -> a.getAuthority().replace("ROLE_", ""))
                .orElse("STUDENT");
    }
}
```

- [ ] **Step 4: Run all settings tests — confirm they pass**

```bash
cd backend && mvn test -Dtest=SettingsControllerTest -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS`, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/settings/SettingsService.java \
        backend/src/main/java/com/platform/exercise/settings/SettingsController.java \
        backend/src/test/java/com/platform/exercise/settings/SettingsControllerTest.java
git commit -m "feat(settings): add menu-config GET/GET-all/PUT endpoints"
```

---

## Task 4: Frontend — `settingsApi.js` new methods

**Files:**
- Modify: `frontend/src/api/settingsApi.js`

- [ ] **Step 1: Add three new methods**

Replace the full file with:

```js
import axiosInstance from './axiosInstance';

export const settingsApi = {
  get: () =>
    axiosInstance.get('/v1/settings').then(r => r.data),
  getImpact: () =>
    axiosInstance.get('/v1/settings/course-filter/impact').then(r => r.data),
  updateCourseFilter: (enabled) =>
    axiosInstance.put('/v1/settings/course-filter', { enabled }).then(r => r.data),
  getMenuConfig: () =>
    axiosInstance.get('/v1/settings/menu-config').then(r => r.data),
  getFullMenuConfig: () =>
    axiosInstance.get('/v1/settings/menu-config/all').then(r => r.data),
  updateMenuConfig: (config) =>
    axiosInstance.put('/v1/settings/menu-config', config).then(r => r.data),
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/settingsApi.js
git commit -m "feat(api): add getMenuConfig, getFullMenuConfig, updateMenuConfig to settingsApi"
```

---

## Task 5: Frontend — `AuthContext.jsx` add `menuSections`

**Files:**
- Modify: `frontend/src/contexts/AuthContext.jsx`
- Modify: `frontend/src/contexts/AuthContext.test.jsx`

- [ ] **Step 1: Write failing tests**

Replace `frontend/src/contexts/AuthContext.test.jsx` with:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

const mockGet = vi.fn();

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

function ShowAuth() {
  const { user, accessToken, menuSections, login } = useAuth();
  return (
    <>
      <span data-testid="user">{user?.username ?? 'none'}</span>
      <span data-testid="token">{accessToken ?? 'none'}</span>
      <span data-testid="sections">{menuSections.join(',')}</span>
      <button onClick={() => login('tok', { username: 'alice', role: 'STUDENT' })}>Login</button>
    </>
  );
}

beforeEach(() => {
  mockGet.mockResolvedValue({ data: { sections: ['exercises', 'progress'] } });
});

test('initial state: user null, token null, menuSections empty', () => {
  render(<AuthProvider><ShowAuth /></AuthProvider>);
  expect(screen.getByTestId('user')).toHaveTextContent('none');
  expect(screen.getByTestId('token')).toHaveTextContent('none');
  expect(screen.getByTestId('sections')).toHaveTextContent('');
});

test('login sets menuSections from API', async () => {
  render(<AuthProvider><ShowAuth /></AuthProvider>);
  await userEvent.click(screen.getByText('Login'));
  await waitFor(() =>
    expect(screen.getByTestId('sections')).toHaveTextContent('exercises,progress')
  );
});

test('login falls back to sectionConfig defaults when API fails', async () => {
  mockGet.mockRejectedValueOnce(new Error('network error'));
  render(<AuthProvider><ShowAuth /></AuthProvider>);
  await userEvent.click(screen.getByText('Login'));
  await waitFor(() =>
    expect(screen.getByTestId('sections')).toHaveTextContent('exercises,progress')
  );
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd frontend && npm test -- AuthContext --run 2>&1 | tail -20
```

Expected: failures because `menuSections` doesn't exist yet.

- [ ] **Step 3: Implement `menuSections` in `AuthContext.jsx`**

Replace the full file with:

```jsx
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance, { setAuthHandlers } from '../api/axiosInstance';
import { settingsApi } from '../api/settingsApi';
import { SECTIONS } from '../components/sectionConfig';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [menuSections, setMenuSections] = useState([]);
  const tokenRef = useRef(null);

  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

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
      () => { setAccessToken(null); setUser(null); setMenuSections([]); }
    );
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, menuSections, login, logout }}>
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

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd frontend && npm test -- AuthContext --run 2>&1 | tail -10
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/AuthContext.jsx frontend/src/contexts/AuthContext.test.jsx
git commit -m "feat(auth): add menuSections fetched from API on login"
```

---

## Task 6: Frontend — `sectionConfig.js` remove `sidebarItems` and `getDefaultSection`

**Files:**
- Modify: `frontend/src/components/sectionConfig.js`
- Modify: `frontend/src/components/sectionConfig.test.js`

- [ ] **Step 1: Update the tests first — remove tests for deleted functions**

Replace `frontend/src/components/sectionConfig.test.js` with:

```js
import { describe, test, expect } from 'vitest';
import {
  sectionsForRole,
  getInitialPath,
  SECTIONS,
} from './sectionConfig';

describe('SECTIONS', () => {
  test('contains all 7 expected section keys', () => {
    const keys = SECTIONS.map(s => s.key);
    expect(keys).toEqual([
      'exercises', 'progress', 'courses', 'categories', 'submissions', 'users', 'settings',
    ]);
  });
});

describe('sectionsForRole', () => {
  test('STUDENT gets exercises and progress only', () => {
    const keys = sectionsForRole('STUDENT').map(s => s.key);
    expect(keys).toEqual(['exercises', 'progress']);
  });

  test('TUTOR gets exercises, courses, categories, submissions', () => {
    const keys = sectionsForRole('TUTOR').map(s => s.key);
    expect(keys).toEqual(['exercises', 'courses', 'categories', 'submissions']);
  });

  test('SUPER_ADMIN gets all sections except progress', () => {
    const keys = sectionsForRole('SUPER_ADMIN').map(s => s.key);
    expect(keys).toEqual([
      'exercises', 'courses', 'categories', 'submissions', 'users', 'settings',
    ]);
  });
});

describe('getInitialPath', () => {
  test('exercises for STUDENT starts at /student/exercises', () => {
    expect(getInitialPath('exercises', 'STUDENT')).toBe('/student/exercises');
  });

  test('exercises for TUTOR starts at /tutor/exercises', () => {
    expect(getInitialPath('exercises', 'TUTOR')).toBe('/tutor/exercises');
  });

  test('users starts at /admin/users', () => {
    expect(getInitialPath('users', 'SUPER_ADMIN')).toBe('/admin/users');
  });

  test('unknown section returns /', () => {
    expect(getInitialPath('nonexistent', 'TUTOR')).toBe('/');
  });
});
```

- [ ] **Step 2: Run tests — confirm old sidebarItems/getDefaultSection tests are gone and remaining pass**

```bash
cd frontend && npm test -- sectionConfig --run 2>&1 | tail -10
```

Expected: tests pass (they reference functions that still exist).

- [ ] **Step 3: Remove `sidebarItems` and `getDefaultSection` from `sectionConfig.js`**

Replace the full file with:

```js
export const SECTIONS = [
  { key: 'exercises',   label: 'Exercises',   icon: '📋', roles: ['STUDENT', 'TUTOR', 'SUPER_ADMIN'] },
  { key: 'progress',    label: 'My Progress', icon: '📊', roles: ['STUDENT'] },
  { key: 'courses',     label: 'Courses',     icon: '📚', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'categories',  label: 'Categories',  icon: '🏷️', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'submissions', label: 'Submissions', icon: '📥', roles: ['TUTOR', 'SUPER_ADMIN'] },
  { key: 'users',       label: 'Users',       icon: '👥', roles: ['SUPER_ADMIN'] },
  { key: 'settings',    label: 'Settings',    icon: '⚙️', roles: ['SUPER_ADMIN'] },
];

export function sectionsForRole(role) {
  return SECTIONS.filter(s => s.roles.includes(role));
}

export function getInitialPath(section, role) {
  const isStudent = role === 'STUDENT';
  switch (section) {
    case 'exercises':   return isStudent ? '/student/exercises' : '/tutor/exercises';
    case 'progress':    return '/student/progress';
    case 'courses':     return '/tutor/courses';
    case 'categories':  return '/tutor/categories';
    case 'submissions': return '/tutor/submissions';
    case 'users':       return '/admin/users';
    case 'settings':    return '/admin/settings';
    default:            return '/';
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd frontend && npm test -- sectionConfig --run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/sectionConfig.js frontend/src/components/sectionConfig.test.js
git commit -m "refactor(nav): remove sidebarItems and getDefaultSection from sectionConfig"
```

---

## Task 7: Frontend — `Sidebar.jsx` complete rewrite

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/components/Sidebar.test.jsx`

The new Sidebar receives props directly (no Router dependency) and renders the global menu.

- [ ] **Step 1: Write failing tests**

Replace `frontend/src/components/Sidebar.test.jsx` with:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import Sidebar from './Sidebar';

const defaultProps = {
  menuSections: ['exercises', 'courses', 'categories'],
  activeSection: 'exercises',
  openTabSections: new Set(['exercises', 'courses']),
  collapsed: false,
  onOpen: vi.fn(),
};

test('renders all menu section labels', () => {
  render(<Sidebar {...defaultProps} />);
  expect(screen.getByText('Exercises')).toBeInTheDocument();
  expect(screen.getByText('Courses')).toBeInTheDocument();
  expect(screen.getByText('Categories')).toBeInTheDocument();
});

test('clicking a section calls onOpen with section key', async () => {
  const onOpen = vi.fn();
  render(<Sidebar {...defaultProps} onOpen={onOpen} />);
  await userEvent.click(screen.getByText('Categories'));
  expect(onOpen).toHaveBeenCalledWith('categories');
});

test('clicking active section calls onOpen (switch to existing tab)', async () => {
  const onOpen = vi.fn();
  render(<Sidebar {...defaultProps} onOpen={onOpen} />);
  await userEvent.click(screen.getByText('Exercises'));
  expect(onOpen).toHaveBeenCalledWith('exercises');
});

test('active section has aria-current=page', () => {
  render(<Sidebar {...defaultProps} />);
  const btn = screen.getByRole('button', { name: /Exercises/i });
  expect(btn).toHaveAttribute('aria-current', 'page');
});

test('non-active sections do not have aria-current', () => {
  render(<Sidebar {...defaultProps} />);
  const btn = screen.getByRole('button', { name: /Courses/i });
  expect(btn).not.toHaveAttribute('aria-current');
});

test('does not render text labels when collapsed', () => {
  render(<Sidebar {...defaultProps} collapsed={true} />);
  expect(screen.queryByText('Exercises')).not.toBeInTheDocument();
  expect(screen.queryByText('Courses')).not.toBeInTheDocument();
});

test('renders icon buttons when collapsed', () => {
  render(<Sidebar {...defaultProps} collapsed={true} />);
  expect(screen.getAllByRole('button').length).toBe(3);
});

test('unknown section key is skipped gracefully', () => {
  render(<Sidebar {...defaultProps} menuSections={['exercises', 'unknown_key']} />);
  expect(screen.getByText('Exercises')).toBeInTheDocument();
  expect(screen.queryByText('unknown_key')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd frontend && npm test -- Sidebar.test --run 2>&1 | tail -20
```

Expected: multiple failures because the current Sidebar has a different interface.

- [ ] **Step 3: Rewrite `Sidebar.jsx`**

Replace the full file with:

```jsx
import { SECTIONS } from './sectionConfig';

const SECTION_MAP = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

export default function Sidebar({ menuSections, activeSection, openTabSections, collapsed, onOpen }) {
  const items = menuSections
    .map(key => SECTION_MAP[key])
    .filter(Boolean);

  if (collapsed) {
    return (
      <div style={{
        width: 44, background: '#263238', flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 0', gap: 4,
      }}>
        {items.map(item => {
          const isActive = item.key === activeSection;
          const isOpen = openTabSections.has(item.key);
          return (
            <button
              key={item.key}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onOpen(item.key)}
              style={{
                width: 34, height: 34, display: 'flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: 6, cursor: 'pointer',
                background: isActive ? 'rgba(25,118,210,.45)' : 'transparent',
                color: isActive ? '#fff' : isOpen ? '#90caf9' : 'rgba(255,255,255,.6)',
                fontSize: 16, border: 'none',
              }}
            >
              {item.icon ?? '•'}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{
      width: 196, background: '#263238', flexShrink: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      {items.map(item => {
        const isActive = item.key === activeSection;
        const isOpen = openTabSections.has(item.key);
        return (
          <button
            key={item.key}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onOpen(item.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              color: isActive ? '#fff' : isOpen ? '#90caf9' : 'rgba(255,255,255,.7)',
              background: isActive ? 'rgba(25,118,210,.35)' : 'transparent',
              borderLeft: isActive
                ? '3px solid #42a5f5'
                : isOpen ? '3px solid rgba(25,118,210,.35)' : '3px solid transparent',
              fontSize: 13, padding: '10px 13px',
              border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
            }}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd frontend && npm test -- Sidebar.test --run 2>&1 | tail -10
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/components/Sidebar.test.jsx
git commit -m "feat(nav): rewrite Sidebar as global menu — no sub-items, no action buttons"
```

---

## Task 8: Frontend — `TabBar.jsx` remove "+" button

**Files:**
- Modify: `frontend/src/components/TabBar.jsx`
- Modify: `frontend/src/components/TabBar.test.jsx`

- [ ] **Step 1: Update tests — remove "+" tests, update props**

Replace `frontend/src/components/TabBar.test.jsx` with:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import TabBar from './TabBar';

const tabs = [
  { id: 'a', section: 'exercises' },
  { id: 'b', section: 'courses' },
];

test('renders all tab labels', () => {
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByText(/Exercises/i)).toBeInTheDocument();
  expect(screen.getByText(/Courses/i)).toBeInTheDocument();
});

test('active tab has aria-selected=true', () => {
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole('tab', { name: /Exercises/i })).toHaveAttribute('aria-selected', 'true');
});

test('inactive tab has aria-selected=false', () => {
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole('tab', { name: /Courses/i })).toHaveAttribute('aria-selected', 'false');
});

test('close button calls onClose with tab id', async () => {
  const onClose = vi.fn();
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={onClose} />);
  const closeBtns = screen.getAllByRole('button', { name: /close/i });
  await userEvent.click(closeBtns[0]);
  expect(onClose).toHaveBeenCalledWith('a');
});

test('add button is not rendered', () => {
  render(<TabBar tabs={tabs} activeTabId="a" onSwitch={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /add tab/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — confirm "add button" test passes but props test may fail**

```bash
cd frontend && npm test -- TabBar.test --run 2>&1 | tail -20
```

Expected: "add button is not rendered" fails (currently the button renders when `openSections` is non-empty). Other tests may fail due to prop changes.

- [ ] **Step 3: Rewrite `TabBar.jsx` — remove "+" picker entirely**

Replace the full file with:

```jsx
import { SECTIONS } from './sectionConfig';

const SECTION_MAP = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

export default function TabBar({ tabs, activeTabId, onSwitch, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', background: '#1976d2',
      padding: '0 16px', gap: 2, flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const meta = SECTION_MAP[tab.section] ?? { label: tab.section, icon: '📄' };
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-label={meta.label}
            onClick={() => onSwitch(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 12px', borderRadius: '6px 6px 0 0',
              border: 'none', cursor: 'pointer', fontSize: 12,
              background: isActive ? '#fff' : 'rgba(0,0,0,.15)',
              color: isActive ? '#1565c0' : 'rgba(255,255,255,.8)',
              fontWeight: isActive ? 600 : 400,
            }}
          >
            <span aria-hidden="true">{meta.icon}</span>
            <span>{meta.label}</span>
            <span
              role="button"
              aria-label={`Close ${meta.label}`}
              onClick={e => { e.stopPropagation(); onClose(tab.id); }}
              style={{ opacity: .55, fontSize: 10, lineHeight: 1 }}
            >
              ✕
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd frontend && npm test -- TabBar.test --run 2>&1 | tail -10
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TabBar.jsx frontend/src/components/TabBar.test.jsx
git commit -m "feat(nav): remove + picker from TabBar — tabs open via sidebar only"
```

---

## Task 9: Frontend — `AppShell.jsx` restructure

**Files:**
- Modify: `frontend/src/components/AppShell.jsx`
- Modify: `frontend/src/components/AppShell.test.jsx`

- [ ] **Step 1: Update tests**

Replace `frontend/src/components/AppShell.test.jsx` with:

```jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

vi.mock('../api/axiosInstance', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
  setAuthHandlers: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: vi.fn(),
}));

vi.mock('./SectionRouter', () => ({
  default: ({ section }) => <div data-testid="section-router" data-section={section} />,
}));

vi.mock('./TopBar', () => ({
  default: ({ onLogout, onToggleSidebar, username }) => (
    <div>
      <span data-testid="username">{username}</span>
      <button onClick={onLogout}>Logout</button>
      <button onClick={onToggleSidebar}>Toggle</button>
    </div>
  ),
}));

vi.mock('./TabBar', () => ({
  default: ({ tabs }) => (
    <div>
      {tabs.map(t => <span key={t.id} data-testid="tab">{t.section}</span>)}
    </div>
  ),
}));

vi.mock('./Sidebar', () => ({
  default: ({ menuSections, onOpen }) => (
    <div data-testid="sidebar">
      {(menuSections ?? []).map(s => (
        <button key={s} onClick={() => onOpen(s)}>{s}</button>
      ))}
    </div>
  ),
}));

import { useAuth } from '../contexts/AuthContext';
import AppShell from './AppShell';

function setup(role, menuSections) {
  useAuth.mockReturnValue({
    user: { username: 'alice', role },
    menuSections,
    logout: vi.fn(),
    accessToken: 'tok',
  });
  return render(<AppShell />);
}

test('opens first section in menuSections as default tab', async () => {
  setup('TUTOR', ['exercises', 'courses']);
  expect(await screen.findByText('exercises')).toBeInTheDocument();
});

test('SUPER_ADMIN default tab is first in their menuSections', async () => {
  setup('SUPER_ADMIN', ['exercises', 'courses', 'users', 'settings']);
  expect(await screen.findByText('exercises')).toBeInTheDocument();
});

test('clicking sidebar section opens tab', async () => {
  setup('TUTOR', ['exercises', 'courses']);
  await screen.findByText('exercises');
  await userEvent.click(screen.getByText('courses'));
  expect(screen.getByText('courses')).toBeInTheDocument();
});

test('renders username from auth context', async () => {
  setup('TUTOR', ['exercises']);
  expect(await screen.findByTestId('username')).toHaveTextContent('alice');
});

test('sidebar is rendered at AppShell level (not per tab)', async () => {
  setup('TUTOR', ['exercises', 'courses']);
  await screen.findByText('exercises');
  expect(screen.getByTestId('sidebar')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd frontend && npm test -- AppShell.test --run 2>&1 | tail -20
```

Expected: failures because AppShell still uses old interface.

- [ ] **Step 3: Rewrite `AppShell.jsx`**

Replace the full file with:

```jsx
import { useState, useEffect, useRef, Component } from 'react';
import { MemoryRouter, UNSAFE_LocationContext } from 'react-router-dom';
import { TabProvider, useTab } from '../contexts/TabContext';
import { useAuth } from '../contexts/AuthContext';
import { getInitialPath } from './sectionConfig';
import TopBar from './TopBar';
import TabBar from './TabBar';
import Sidebar from './Sidebar';
import SectionRouter from './SectionRouter';

class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', color: '#c62828' }}>
          <strong>Tab render error:</strong>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 }}>
            {String(this.state.error)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function TabPanel({ tab, isActive, role }) {
  const initialPath = getInitialPath(tab.section, role);
  return (
    <div style={{ display: isActive ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
      <UNSAFE_LocationContext.Provider value={null}>
        <MemoryRouter initialEntries={[initialPath]}>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <TabErrorBoundary>
              <SectionRouter section={tab.section} role={role} />
            </TabErrorBoundary>
          </div>
        </MemoryRouter>
      </UNSAFE_LocationContext.Provider>
    </div>
  );
}

function AppShellInner() {
  const { user, logout, menuSections } = useAuth();
  const { tabs, activeTabId, openTab, closeTab, switchTab } = useTab();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );
  const initializedRef = useRef(false);

  useEffect(() => {
    if (user && !initializedRef.current && menuSections.length > 0) {
      initializedRef.current = true;
      openTab(menuSections[0]);
    }
  }, [user, menuSections]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggle() {
    setCollapsed(v => {
      localStorage.setItem('sidebar_collapsed', String(!v));
      return !v;
    });
  }

  async function handleLogout() {
    await logout();
    window.location.replace('/login');
  }

  if (!user) return null;

  const activeSection = tabs.find(t => t.id === activeTabId)?.section ?? null;
  const openTabSections = new Set(tabs.map(t => t.section));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar
        username={user.username}
        role={user.role}
        collapsed={collapsed}
        onToggleSidebar={handleToggle}
        onLogout={handleLogout}
      />
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSwitch={switchTab}
        onClose={closeTab}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar
          menuSections={menuSections}
          activeSection={activeSection}
          openTabSections={openTabSections}
          collapsed={collapsed}
          onOpen={openTab}
        />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {tabs.map(tab => (
            <TabPanel
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              role={user.role}
            />
          ))}
          {tabs.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
              Select a section from the menu
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  return (
    <TabProvider>
      <AppShellInner />
    </TabProvider>
  );
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd frontend && npm test -- AppShell.test --run 2>&1 | tail -10
```

Expected: all 5 tests pass.

- [ ] **Step 5: Run the full frontend test suite**

```bash
cd frontend && npm test --run 2>&1 | tail -20
```

Expected: `BUILD SUCCESS` — no regressions. Fix any failures before continuing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AppShell.jsx frontend/src/components/AppShell.test.jsx
git commit -m "feat(nav): hoist Sidebar to AppShell level, open default tab from menuSections[0]"
```

---

## Task 10: Frontend — `GlobalSettingsPage.jsx` menu config UI

**Files:**
- Modify: `frontend/src/pages/admin/GlobalSettingsPage.jsx`

No separate test file is added for this page (the API interaction is covered by backend tests; the component is a straightforward controlled form).

- [ ] **Step 1: Rewrite `GlobalSettingsPage.jsx`**

Replace the full file with:

```jsx
import { useEffect, useState } from 'react';
import { settingsApi } from '../../api/settingsApi';
import { SECTIONS } from '../../components/sectionConfig';

const ROLES = ['STUDENT', 'TUTOR', 'SUPER_ADMIN'];

const FORCED_ON = {
  exercises: ['STUDENT', 'TUTOR', 'SUPER_ADMIN'],
  settings: ['SUPER_ADMIN'],
};
const DISABLED_FOR = {
  users: ['STUDENT', 'TUTOR'],
  settings: ['STUDENT', 'TUTOR'],
};

function isForced(sectionKey, role) {
  return (FORCED_ON[sectionKey] ?? []).includes(role);
}

function isDisabled(sectionKey, role) {
  return isForced(sectionKey, role) || (DISABLED_FOR[sectionKey] ?? []).includes(role);
}

export default function GlobalSettingsPage() {
  const [courseFilterEnabled, setCourseFilterEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [fullConfig, setFullConfig] = useState(null);
  const [editConfig, setEditConfig] = useState(null);
  const [menuSaving, setMenuSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      settingsApi.get(),
      settingsApi.getFullMenuConfig(),
    ]).then(([settings, config]) => {
      setCourseFilterEnabled(settings.courseFilterEnabled);
      setFullConfig(config);
      setEditConfig(JSON.parse(JSON.stringify(config)));
    }).finally(() => setLoading(false));
  }, []);

  async function handleToggle() {
    const newValue = !courseFilterEnabled;
    if (newValue) {
      const impact = await settingsApi.getImpact();
      const count = impact.unenrolledStudentCount;
      const msg = count === 0
        ? 'No students are currently unenrolled. Enable the course filter?'
        : `${count} student(s) have no course enrollment and will see no exercises. Enable the filter anyway?`;
      if (!confirm(msg)) return;
    }
    setSaving(true);
    try {
      const res = await settingsApi.updateCourseFilter(newValue);
      setCourseFilterEnabled(res.courseFilterEnabled);
      setToast(res.message ?? (newValue ? 'Course filter enabled' : 'Course filter disabled'));
      setTimeout(() => setToast(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  function toggleSection(role, sectionKey) {
    if (isDisabled(sectionKey, role)) return;
    setEditConfig(prev => {
      const current = prev[role] ?? [];
      const next = current.includes(sectionKey)
        ? current.filter(s => s !== sectionKey)
        : [...current, sectionKey];
      return { ...prev, [role]: next };
    });
  }

  function isChecked(role, sectionKey) {
    return (editConfig?.[role] ?? []).includes(sectionKey);
  }

  async function handleMenuSave() {
    setMenuSaving(true);
    try {
      await settingsApi.updateMenuConfig(editConfig);
      setFullConfig(JSON.parse(JSON.stringify(editConfig)));
      setToast('Menu configuration saved');
      setTimeout(() => setToast(''), 4000);
    } finally {
      setMenuSaving(false);
    }
  }

  function handleMenuReset() {
    setEditConfig(JSON.parse(JSON.stringify(fullConfig)));
  }

  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <div style={{ padding: 32 }}>
      <h1>Global Settings</h1>

      {toast && (
        <div role="status" style={{ marginBottom: 16, padding: 12, background: '#e8f5e9', borderRadius: 4, color: '#2e7d32' }}>
          {toast}
        </div>
      )}

      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>Course Filter</span>
        <button
          onClick={handleToggle}
          disabled={saving}
          style={{
            width: 56, height: 28, borderRadius: 14, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: courseFilterEnabled ? '#388e3c' : '#ccc', position: 'relative', transition: 'background 0.2s',
          }}>
          <span style={{
            position: 'absolute', top: 3, left: courseFilterEnabled ? 30 : 4,
            width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
        <span style={{ color: courseFilterEnabled ? '#388e3c' : '#757575' }}>
          {courseFilterEnabled ? 'ON — Students see only enrolled-course exercises' : 'OFF — Students see all published exercises'}
        </span>
      </div>

      {editConfig && (
        <div style={{ marginTop: 48 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Menu Visibility</h2>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
            Choose which sections each role sees in the left menu. Changes take effect on next login.
          </p>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#e3f2fd' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', border: '1px solid #bbdefb', minWidth: 180 }}>Section</th>
                {ROLES.map(r => (
                  <th key={r} style={{ padding: '10px 16px', textAlign: 'center', border: '1px solid #bbdefb', width: 110 }}>{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section, i) => (
                <tr key={section.key} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 16px', border: '1px solid #e0e0e0' }}>
                    {section.icon} {section.label}
                  </td>
                  {ROLES.map(role => (
                    <td key={role} style={{ padding: '10px 16px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isChecked(role, section.key)}
                        disabled={isDisabled(section.key, role)}
                        onChange={() => toggleSection(role, section.key)}
                        style={{ width: 15, height: 15, cursor: isDisabled(section.key, role) ? 'not-allowed' : 'pointer' }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={handleMenuSave}
              disabled={menuSaving}
              style={{ background: '#1976d2', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 4, fontSize: 13, cursor: menuSaving ? 'not-allowed' : 'pointer' }}
            >
              {menuSaving ? 'Saving…' : 'Save Configuration'}
            </button>
            <button
              onClick={handleMenuReset}
              disabled={menuSaving}
              style={{ background: '#fff', color: '#555', border: '1px solid #ccc', padding: '8px 20px', borderRadius: 4, fontSize: 13, cursor: 'pointer' }}
            >
              Discard Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the full frontend test suite**

```bash
cd frontend && npm test --run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Run backend tests**

```bash
cd backend && mvn test -q 2>&1 | tail -10
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/admin/GlobalSettingsPage.jsx
git commit -m "feat(admin): add menu visibility config UI to GlobalSettingsPage"
```

---

## Final Verification

- [ ] **Start the full stack and smoke-test**

```bash
docker compose up -d
```

Verify:
1. Login as STUDENT — left sidebar shows Exercises + My Progress only; clicking opens tabs; no "+" button
2. Login as TUTOR — sidebar shows Exercises, Courses, Categories, Submissions; clicking each opens a tab; clicking an already-open tab switches to it
3. Login as SUPER_ADMIN — sidebar shows all sections; go to Settings → Menu Visibility; uncheck Courses for TUTOR; save; re-login as TUTOR → Courses is gone
4. Re-login as SUPER_ADMIN → re-enable Courses for TUTOR

- [ ] **Final commit tag** (optional)

```bash
git tag nav-redesign-complete
```
