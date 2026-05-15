# Navigation Overhaul Design

**Date:** 2026-05-15
**Status:** Approved

## Problem Statement

The current UI has four navigation deficiencies:

1. **No logout** — `logout()` exists in `AuthContext` but is never wired to any UI element.
2. **No back button** — Tutor and Admin sub-pages (e.g. Category Management, Course Detail) render with no navigation; users are stranded without using the browser back button.
3. **Can't jump between sections** — Tutor sub-pages are flat routes with no layout wrapper, so there is no persistent nav to jump from Exercises → Submissions → Courses without returning to the dashboard.
4. **Can't open multiple sections simultaneously** — Every navigation replaces the full page with no quick-switch mechanism.

## Approved Design

### Layout — 3 layers

```
┌─────────────────────────────────────────────────┐
│  ☰  🎓 Platform          tutor@uni.edu  [Logout] │  ← Top bar (always visible)
├─────────────────────────────────────────────────┤
│  📋 Exercises ✕ │ 📚 Courses ✕ │ 📥 Submissions ✕ │ ＋ │  ← Tab bar
├──────────┬──────────────────────────────────────┤
│ Courses  │  Courses › Algorithm Basics           │
│ ──────── │  [← Back]                             │  ← Content area
│ All      │                                       │
│ > Algo…  │  Course Detail — Algorithm Basics     │
│ Data St… │  …                                    │
│ + New    │                                       │
└──────────┴──────────────────────────────────────┘
  ↑ Sidebar (collapsible)
```

### Top Bar

- Always visible across all roles (Student, Tutor, Super Admin).
- Contains: ☰ toggle button · brand logo · spacer · username + role badge · Logout button.
- Logout calls `AuthContext.logout()`, clears in-memory token, invalidates refresh token via `POST /api/v1/auth/logout`, redirects to `/login`.

### Tab Bar

- Sits directly below the top bar.
- Each tab represents one **section** (a major navigation area, e.g. Exercises, Courses, Submissions).
- Sections available per role:
  - **Student:** Exercises · My Progress
  - **Tutor:** Exercises · Courses · Categories · Submissions
  - **Super Admin:** Exercises · Courses · Categories · Submissions · Users · Settings
- Tab behaviour:
  - Switching tabs never unmounts the tab's component tree — inactive tabs are hidden via CSS (`display: none`). This preserves in-tab navigation state (scroll position, form input, selected items).
  - Each tab has its own internal navigation stack (using a per-tab router or location state).
  - ✕ button closes the tab and discards its state; focus moves to the nearest remaining tab.
  - ＋ button opens a dropdown/picker to open a new section tab (sections not yet open are listed).
  - A section can only be open in one tab at a time — clicking ＋ on an already-open section focuses that tab instead.
  - On first login, the default first tab is the role's primary section (Student → Exercises; Tutor → Exercises; Admin → Users).
  - Tab state (which sections are open, which is active) lives in component state only — lost on page refresh. This is acceptable because a page refresh logs the user out anyway (JWT is in-memory).

### Sidebar

- Renders inside the active tab's content area, on the left.
- Shows the sub-pages for the active section (e.g. within Courses: "All Courses", individual course entries, "+ New Course").
- Highlights the currently active sub-page.
- **Collapsible:**
  - Expanded state: 196px wide, shows icons + labels, active item highlighted with left border accent.
  - Collapsed state: 44px wide, shows icons only, hovering shows a tooltip with the label.
  - Toggle: ☰ button in the top bar toggles collapsed/expanded.
  - Preference persisted in `localStorage` key `sidebar_collapsed` (boolean).
- Each role's sidebar items per section:
  - **Student / Exercises:** Exercise List
  - **Student / My Progress:** Progress Overview
  - **Tutor / Exercises:** All Exercises · + New Exercise
  - **Tutor / Courses:** All Courses · + New Course  *(Course Detail is reached by clicking a row in the list, not a separate sidebar entry)*
  - **Tutor / Categories:** Category Management
  - **Tutor / Submissions:** Submission List · Import Submissions
  - **Admin / Users:** User Management
  - **Admin / Settings:** Global Settings

### Back Button & Breadcrumb

- Every sub-page (detail, form, edit) renders:
  - A breadcrumb row: `Section › Page Title` (links are clickable to navigate up).
  - A `← Back` button that calls `navigate(-1)` within the tab's navigation context.
- List pages (top level of a section) show no back button — the sidebar link is sufficient.

## Architecture

### New Components

| Component | Purpose |
|---|---|
| `AppShell` | Root layout: renders TopBar + TabBar + active tab content |
| `TopBar` | Brand, toggle button, user info, logout button |
| `TabBar` | Tab list, ＋ button, tab switching logic |
| `TabContext` | React context: open tabs list, active tab, open/close/switch actions |
| `SidebarLayout` | Layout wrapper used inside each section: sidebar + content slot |
| `Sidebar` | Role-aware nav item list, collapsed/expanded state |
| `Breadcrumb` | Reusable breadcrumb row component |

### Routing Changes

Current flat routes for Tutor and Admin become nested under `AppShell`. Student routes already use a layout (`StudentPage`) — that is replaced by `SidebarLayout` inside the Exercises/Progress tabs.

`App.jsx` change: wrap all protected routes in `<AppShell>` rather than individual role layout pages. `TutorPage` and `AdminDashboardPage` (the old dashboard-with-links pages) are removed.

### Tab State Implementation

`TabContext` maintains:

```js
{
  tabs: [{ id, section, label, icon }],  // open tabs
  activeTabId: string,
}
```

Each tab renders its section's route tree inside a `<div style={{ display: activeTabId === id ? 'block' : 'none' }}>`. React Router's `<Routes>` inside each tab operates on a `MemoryRouter` scoped to that tab, so navigation within one tab does not affect another.

### Sidebar Collapse State

```js
// Initial value from localStorage
const [collapsed, setCollapsed] = useState(
  () => localStorage.getItem('sidebar_collapsed') === 'true'
);

// On toggle
const toggle = () => {
  setCollapsed(v => {
    localStorage.setItem('sidebar_collapsed', String(!v));
    return !v;
  });
};
```

## Problems Solved

| Problem | Solution |
|---|---|
| No logout | Logout button always visible in TopBar |
| No back button | `← Back` button + breadcrumb on every detail/form page |
| Can't jump between sections | Tab bar always visible; click any tab to switch instantly |
| Can't open multiple sections | Section-level tabs; each tab preserves its own navigation state |

## Out of Scope

- Page-level tabs (opening two exercise edit forms simultaneously) — not requested.
- Tab persistence across page refresh — lost on refresh is acceptable (refresh logs user out).
- Browser-tab multi-session support — JWT in-memory design intentionally prevents this.
- Mobile responsive layout — university desktop-first tool, not a current requirement.
