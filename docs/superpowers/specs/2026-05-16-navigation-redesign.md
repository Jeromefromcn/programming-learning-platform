# Navigation Redesign

**Date:** 2026-05-16
**Status:** Approved

## Overview

Replace the current navigation (per-tab sidebar with action buttons + "+" picker) with a global left sidebar menu + top tab bar. Menu visibility is configurable per role by SUPER_ADMIN, stored in the database.

## Requirements

1. Left sidebar is a menu bar, not an action-button panel.
2. Sidebar is global (one instance at AppShell level), not per-tab.
3. Only top-level sections appear in the sidebar — no sub-items, no CRUD action buttons.
4. Clicking a menu item opens a new tab or switches to the existing tab for that section.
5. The "+" picker button in TabBar is removed; tab opening happens only via the sidebar.
6. CRUD operations are handled within each page, not in the sidebar.
7. Menu visibility is configurable per role by SUPER_ADMIN via the Settings page.
8. Configuration is stored in `global_settings` (key: `menu_config`) and loaded at login.

## Layout

```
┌─────────────────────────────────────────────────────┐
│ TopBar: logo · username · role · logout · collapse  │
├─────────────────────────────────────────────────────┤
│ TabBar: [練習] [課程 ✕]                              │  ← no "+" button
├──────────┬──────────────────────────────────────────┤
│ Sidebar  │ Page content (active tab)                │
│ 160px    │                                          │
│ (global) │  All CRUD happens here                   │
│          │                                          │
│ 📋 練習  │                                          │
│ 📚 課程  │                                          │
│ 🏷️ 分類  │                                          │
│ 📥 提交  │                                          │
└──────────┴──────────────────────────────────────────┘
```

### Sidebar item states

| State | Visual | Meaning |
|---|---|---|
| Active | Blue background + left blue border | Section of the currently active tab |
| Open (inactive) | Light blue text + faint left border | Section has an open tab but is not active |
| Closed | Grey text | Clicking opens a new tab |

The sidebar can collapse to icon-only mode (44px) via the TopBar toggle, persisted in `localStorage`.

## Component Changes

### `AppShell.jsx`
- Move `<Sidebar>` from inside `TabPanel` to `AppShellInner`, next to the tab panels area.
- Compute `activeSection` (section key of the active tab) and `openTabSections` (Set of section keys that have an open tab) from `tabs` + `activeTabId`; pass both to `Sidebar`.
- On login, open the initial tab using `menuSections[0]` instead of the hardcoded `getDefaultSection(role)`.
- Remove `openSections` (unused sections list) and `onOpen` props from `TabBar`.

### `Sidebar.jsx`
- Reads `menuSections` from `AuthContext` (the DB-backed list for the current role).
- Maps each section key to metadata from `sectionConfig.SECTIONS`.
- Calls `openTab(section)` on click (opens or switches).
- Receives `activeSection` (string) and `openTabSections` (Set) from `AppShell` for highlighting:
  - `section === activeSection` → active style (solid blue bg + left border)
  - `openTabSections.has(section) && section !== activeSection` → open-inactive style (light blue text)
  - otherwise → closed style (grey text)
- Supports collapsed (icon-only) mode.
- No sub-items. No action buttons.

### `TabBar.jsx`
- Remove the "+" button and section picker dropdown.
- Remove `openSections` and `onOpen` props.

### `TabPanel.jsx` (inline in AppShell)
- Remove `<Sidebar>` from inside the panel.
- Keep `<MemoryRouter>` per tab for internal page routing (breadcrumbs, sub-pages still work).

### `sectionConfig.js`
- Remove `sidebarItems()` function entirely.
- Keep `SECTIONS` array (master list of all sections with key, label, icon) as reference for Sidebar rendering.
- Keep `getInitialPath()` and `getDefaultSection()`.
- The `roles` field on each section becomes a fallback default only (actual visibility comes from DB).

### `AuthContext.jsx`
- After successful login, call `GET /api/v1/settings/menu-config`.
- Store result as `menuSections: string[]` in auth state.
- Expose `menuSections` from `useAuth()`.

### `GlobalSettingsPage.jsx`
- Add a "菜單可見性配置" section with a role × section checkbox grid.
- Rows: all sections from `SECTIONS`.
- Columns: STUDENT, TUTOR, SUPER_ADMIN.
- Constraints enforced in UI:
  - `exercises` is forced checked for all roles (cannot be unchecked).
  - `users` and `settings` are disabled for STUDENT and TUTOR.
  - `settings` is always checked for SUPER_ADMIN (cannot be unchecked).
- "保存配置" calls `PUT /api/v1/settings/menu-config`.
- "重置為默認" restores the Flyway migration initial values.

## Backend Changes

### Database

New Flyway migration adds a row to `global_settings`:

```sql
INSERT INTO global_settings (`key`, `value`) VALUES (
  'menu_config',
  '{"STUDENT":["exercises","progress"],"TUTOR":["exercises","courses","categories","submissions"],"SUPER_ADMIN":["exercises","courses","categories","submissions","users","settings"]}'
);
```

### API Endpoints

#### `GET /api/v1/settings/menu-config`

- Auth: any authenticated user.
- Returns only the sections for the caller's role:

```json
{ "sections": ["exercises", "courses", "categories", "submissions"] }
```

#### `PUT /api/v1/settings/menu-config`

- Auth: SUPER_ADMIN only.
- Request body: full map for all roles:

```json
{
  "STUDENT": ["exercises", "progress"],
  "TUTOR": ["exercises", "courses", "categories", "submissions"],
  "SUPER_ADMIN": ["exercises", "courses", "categories", "submissions", "users", "settings"]
}
```

- Validation: `exercises` must be present for every role; `users` and `settings` must not appear in STUDENT or TUTOR lists.
- Persists as JSON string to `global_settings.value` where `key = 'menu_config'`.

### Service / Controller

- `SettingsService` gains `getMenuConfig(role)` and `updateMenuConfig(map)`.
- `SettingsController` gains the two endpoints above.
- No new entity or repository needed — reuses existing `GlobalSettings` entity and `SettingsRepository`.

## What Does NOT Change

- `MemoryRouter` per tab — internal page routing (breadcrumbs, sub-pages) is unaffected.
- `TopBar` — collapse toggle, logout, username display.
- All page components (`ExerciseManagementPage`, `CourseManagementPage`, etc.) — they keep their internal routing and CRUD UI.
- Auth flow, JWT, refresh token logic.
- Rate limiting, security constraints.

## Error Handling

- If `GET /api/v1/settings/menu-config` fails at login, fall back to the hardcoded defaults from `sectionConfig.js` (SECTIONS filtered by role).
- If the active tab's section is removed from the user's menu config after a config update, the tab remains open for the current session; menu just won't highlight it.

## Testing

- **Frontend unit:** `Sidebar` renders correct items from `menuSections`; click calls `openTab`; active/open/closed states render correctly.
- **Frontend unit:** `TabBar` no longer renders "+" button.
- **Frontend unit:** `AuthContext` populates `menuSections` on login; falls back on API error.
- **Frontend unit:** Admin checkbox grid enforces constraints (exercises always checked, users/settings disabled for non-admin).
- **Backend unit:** `SettingsService.getMenuConfig` returns correct subset for role.
- **Backend unit:** `updateMenuConfig` rejects configs missing `exercises` for any role.
- **Backend integration:** `PUT /menu-config` returns 403 for non-SUPER_ADMIN.
