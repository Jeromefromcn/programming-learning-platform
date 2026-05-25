# Student Practice Page Back Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "← Back to exercises" button at the top of both practice pages so students can navigate back to `/student/exercises`.

**Architecture:** Add `useNavigate` from react-router-dom to both `BlocklyPracticePage` and `PythonPracticePage`. Render a plain-text-style button above the `<h1>` inside each page's existing wrapper div. No shared component needed — the change is two lines per file.

**Tech Stack:** React 18, react-router-dom v6, Vite

---

### Task 1: Add back button to BlocklyPracticePage

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx`
- Test: `frontend/src/pages/student/BlocklyPracticePage.test.jsx`

- [ ] **Step 1: Write the failing test**

The existing test file (`frontend/src/pages/student/BlocklyPracticePage.test.jsx`) has no react-router-dom mock. Add the following two blocks:

**After the existing `vi.mock('blockly/python', ...)` block (around line 25), add:**

```jsx
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});
```

**Add `mockNavigate.mockClear()` inside the existing `beforeEach` at line 45:**

```jsx
beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockClear();
});
```

**Add a new describe block at the end of the file:**

```jsx
describe('Back button', () => {
  test('renders a back button that navigates to /student/exercises', () => {
    render(<BlocklyPracticePage exercise={makeExercise()} />);
    const backBtn = screen.getByRole('button', { name: /back to exercises/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/student/exercises');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npm test -- --run BlocklyPracticePage
```

Expected: FAIL — button not found in document.

- [ ] **Step 3: Add `useNavigate` import and back button to BlocklyPracticePage**

In `frontend/src/pages/student/BlocklyPracticePage.jsx`:

Change line 1 from:
```jsx
import { useEffect, useRef, useState } from 'react';
```
To:
```jsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
```

Add `const navigate = useNavigate();` at the top of the component body (after `const version = exercise.version;` setup lines is fine, but before the return).

Inside the `return` block, add the back button as the first child of the wrapper div, before `<h1>`:

```jsx
<button
  onClick={() => navigate('/student/exercises')}
  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, marginBottom: 16, fontSize: 14 }}
>
  ← Back to exercises
</button>
```

Full updated return opening:
```jsx
return (
  <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
    <button
      onClick={() => navigate('/student/exercises')}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, marginBottom: 16, fontSize: 14 }}
    >
      ← Back to exercises
    </button>
    <h1>{exercise.title}</h1>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npm test -- --run BlocklyPracticePage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx frontend/src/pages/student/BlocklyPracticePage.test.jsx
git commit -m "feat(student): add back button to BlocklyPracticePage"
```

---

### Task 2: Add back button to PythonPracticePage

**Files:**
- Modify: `frontend/src/pages/student/PythonPracticePage.jsx`
- Test: `frontend/src/pages/student/PythonPracticePage.test.jsx` (create if missing)

- [ ] **Step 1: Check for existing test file**

```bash
ls /home/ubuntu/jerome/programming-learning-platform/frontend/src/pages/student/Python*
```

If `PythonPracticePage.test.jsx` does not exist, create it with this minimal setup:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PythonPracticePage from './PythonPracticePage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }) => (
    <textarea data-testid="monaco-editor" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

const mockExercise = {
  id: 1,
  title: 'Test Python Exercise',
  type: 'PYTHON',
  version: {
    versionNumber: 1,
    description: 'A test exercise',
    hints: [],
    config: {
      starterCode: 'print("hello")',
      visibleTestCases: [],
      timeLimitSeconds: 5,
    },
  },
};

beforeEach(() => {
  mockNavigate.mockClear();
});

describe('PythonPracticePage', () => {
  it('renders a back button that navigates to /student/exercises', () => {
    render(<PythonPracticePage exercise={mockExercise} />);
    const backBtn = screen.getByRole('button', { name: /back to exercises/i });
    expect(backBtn).toBeInTheDocument();
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/student/exercises');
  });
});
```

If the file already exists, add the test case to the existing `describe` block (adjusting mocks to match what's already there).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npm test -- --run PythonPracticePage
```

Expected: FAIL — button not found.

- [ ] **Step 3: Add `useNavigate` import and back button to PythonPracticePage**

In `frontend/src/pages/student/PythonPracticePage.jsx`:

Change line 1 from:
```jsx
import { useRef, useState, useEffect } from 'react';
```
To:
```jsx
import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
```

Add `const navigate = useNavigate();` at the top of the component body, before any other declarations.

Inside the `return` block, add the back button as the first child of the wrapper div, before `<h1>`:

```jsx
return (
  <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
    <button
      onClick={() => navigate('/student/exercises')}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, marginBottom: 16, fontSize: 14 }}
    >
      ← Back to exercises
    </button>
    <h1>{exercise.title}</h1>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npm test -- --run PythonPracticePage
```

Expected: PASS

- [ ] **Step 5: Run all frontend tests to check for regressions**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/frontend
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/student/PythonPracticePage.jsx frontend/src/pages/student/PythonPracticePage.test.jsx
git commit -m "feat(student): add back button to PythonPracticePage"
```
