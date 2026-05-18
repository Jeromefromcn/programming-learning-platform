# Exercise Description Markdown Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render exercise descriptions as Markdown in the student practice pages and add a side-by-side Markdown editor for tutors.

**Architecture:** Two new shared components (`MarkdownRenderer`, `MarkdownEditor`) are added to `frontend/src/components/`. Three existing pages consume them: the tutor form replaces a plain textarea with `MarkdownEditor`; both student practice pages replace a plain `<p>` with `MarkdownRenderer`. No backend changes.

**Tech Stack:** `react-markdown` v9 + `remark-gfm`, Vitest + @testing-library/react for tests, inline styles (matching codebase convention).

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `frontend/src/components/MarkdownRenderer.jsx` | Stateless component: renders a Markdown string |
| Create | `frontend/src/components/MarkdownRenderer.test.jsx` | Unit tests for MarkdownRenderer |
| Create | `frontend/src/components/MarkdownEditor.jsx` | Side-by-side Markdown textarea + live preview |
| Create | `frontend/src/components/MarkdownEditor.test.jsx` | Unit tests for MarkdownEditor |
| Modify | `frontend/vite.config.js` | Add `server.deps.inline` so Vitest bundles ESM packages |
| Modify | `frontend/src/pages/tutor/ExerciseFormPage.jsx` | Replace description textarea with `<MarkdownEditor>` |
| Modify | `frontend/src/pages/student/BlocklyPracticePage.jsx` | Replace description `<p>` with `<MarkdownRenderer>` |
| Modify | `frontend/src/pages/student/PythonPracticePage.jsx` | Replace description `<p>` with `<MarkdownRenderer>` |

---

## Task 1: Install dependencies and configure Vitest for ESM

`react-markdown` v9 and its dependency chain are ESM-only. Without configuration, Vitest (which uses Node for test running) will throw `SyntaxError: Cannot use import statement` when it encounters these packages. We add them to `server.deps.inline` so Vite pre-bundles them during test runs.

**Files:**
- Modify: `frontend/package.json` (via npm install)
- Modify: `frontend/vite.config.js`

- [ ] **Step 1: Install packages**

Run from `frontend/`:
```bash
npm install react-markdown remark-gfm
```

Expected: both appear in `dependencies` in `package.json`.

- [ ] **Step 2: Update vite.config.js to inline ESM deps for Vitest**

Open `frontend/vite.config.js`. Current content:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
```

Replace with:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    server: {
      deps: {
        inline: [
          'react-markdown',
          'remark-gfm',
          /unified/,
          /remark/,
          /rehype/,
          /micromark/,
          /mdast/,
          /vfile/,
          /bail/,
          /trough/,
          /zwitch/,
          /devlop/,
          /decode-named-character-reference/,
          /character-entities/,
        ],
      },
    },
  },
})
```

- [ ] **Step 3: Verify no import errors**

Run from `frontend/`:
```bash
npm test -- --reporter=verbose 2>&1 | head -30
```

Expected: existing tests still pass, no `SyntaxError: Cannot use import statement` errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js
git commit -m "chore(deps): add react-markdown, remark-gfm; configure Vitest ESM inline"
```

---

## Task 2: MarkdownRenderer component

**Files:**
- Create: `frontend/src/components/MarkdownRenderer.jsx`
- Create: `frontend/src/components/MarkdownRenderer.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/MarkdownRenderer.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MarkdownRenderer from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders h1 from # heading', () => {
    render(<MarkdownRenderer content="# Hello" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello');
  });

  it('renders strong from **bold**', () => {
    const { container } = render(<MarkdownRenderer content="**bold**" />);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
  });

  it('renders code element from backtick inline code', () => {
    const { container } = render(<MarkdownRenderer content="`print()`" />);
    expect(container.querySelector('code')).toHaveTextContent('print()');
  });

  it('renders li from - list item', () => {
    const { container } = render(<MarkdownRenderer content="- item one" />);
    expect(container.querySelector('li')).toHaveTextContent('item one');
  });

  it('does not render a script element from raw HTML', () => {
    const { container } = render(<MarkdownRenderer content="<script>alert(1)</script>" />);
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders empty content without crashing', () => {
    const { container } = render(<MarkdownRenderer content="" />);
    expect(container).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- MarkdownRenderer.test
```

Expected: FAIL — `Cannot find module './MarkdownRenderer'`

- [ ] **Step 3: Implement MarkdownRenderer**

Create `frontend/src/components/MarkdownRenderer.jsx`:
```jsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS = {
  h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 700, margin: '12px 0 8px' }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: 17, fontWeight: 700, margin: '10px 0 6px' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 4px' }}>{children}</h3>,
  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '6px 0' }}>{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: '3px solid #ccc', paddingLeft: 12, margin: '8px 0', color: '#555' }}>
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, overflowX: 'auto', margin: '8px 0', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code
      className={className}
      style={{ fontFamily: 'monospace', fontSize: '0.9em', background: '#f0f0f0', padding: '1px 4px', borderRadius: 3 }}
    >
      {children}
    </code>
  ),
};

export default function MarkdownRenderer({ content }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {content || ''}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- MarkdownRenderer.test
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MarkdownRenderer.jsx frontend/src/components/MarkdownRenderer.test.jsx
git commit -m "feat(markdown): add MarkdownRenderer component"
```

---

## Task 3: MarkdownEditor component

**Files:**
- Create: `frontend/src/components/MarkdownEditor.jsx`
- Create: `frontend/src/components/MarkdownEditor.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/MarkdownEditor.test.jsx`:
```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import MarkdownEditor from './MarkdownEditor';

describe('MarkdownEditor', () => {
  it('renders textarea with the given value', () => {
    render(<MarkdownEditor value="# Hello" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('# Hello');
  });

  it('renders the Markdown preview panel', () => {
    render(<MarkdownEditor value="# Hello" onChange={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello');
  });

  it('shows placeholder text when value is empty', () => {
    render(<MarkdownEditor value="" onChange={() => {}} />);
    expect(screen.getByText('Nothing to preview')).toBeTruthy();
  });

  it('calls onChange with updated value when textarea changes', async () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox'), 'x');
    expect(onChange).toHaveBeenCalledWith('x');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- MarkdownEditor.test
```

Expected: FAIL — `Cannot find module './MarkdownEditor'`

- [ ] **Step 3: Implement MarkdownEditor**

Create `frontend/src/components/MarkdownEditor.jsx`:
```jsx
import MarkdownRenderer from './MarkdownRenderer';

export default function MarkdownEditor({ value, onChange, rows = 8, required = false }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Markdown
        </div>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          required={required}
          style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'monospace', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
        />
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Preview
        </div>
        <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 4, background: '#fafafa', minHeight: `${rows * 1.5}em`, overflowY: 'auto' }}>
          {value
            ? <MarkdownRenderer content={value} />
            : <span style={{ color: '#bbb', fontSize: 13 }}>Nothing to preview</span>
          }
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- MarkdownEditor.test
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MarkdownEditor.jsx frontend/src/components/MarkdownEditor.test.jsx
git commit -m "feat(markdown): add MarkdownEditor side-by-side component"
```

---

## Task 4: Wire up ExerciseFormPage

Replace the plain description `<textarea>` in the tutor exercise form with `<MarkdownEditor>`.

**Files:**
- Modify: `frontend/src/pages/tutor/ExerciseFormPage.jsx`

- [ ] **Step 1: Add import at the top of ExerciseFormPage.jsx**

In `frontend/src/pages/tutor/ExerciseFormPage.jsx`, after the existing imports (around line 8), add:
```jsx
import MarkdownEditor from '../../components/MarkdownEditor';
```

- [ ] **Step 2: Replace the description textarea**

Find this block (around line 212–216):
```jsx
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Description *</label>
            <textarea required value={description} onChange={e => setDescription(e.target.value)} rows={4}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }} />
          </div>
```

Replace with:
```jsx
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Description *</label>
            <MarkdownEditor value={description} onChange={setDescription} required />
          </div>
```

- [ ] **Step 3: Run all tests to verify no regressions**

```bash
cd frontend && npm test
```

Expected: all existing tests pass (ExerciseFormPage has no dedicated test file, but other component tests should be unaffected).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/tutor/ExerciseFormPage.jsx
git commit -m "feat(markdown): use MarkdownEditor for exercise description in tutor form"
```

---

## Task 5: Wire up student practice pages

Replace the plain description `<p>` in both student practice pages with `<MarkdownRenderer>`.

**Files:**
- Modify: `frontend/src/pages/student/BlocklyPracticePage.jsx`
- Modify: `frontend/src/pages/student/PythonPracticePage.jsx`

- [ ] **Step 1: Update BlocklyPracticePage**

In `frontend/src/pages/student/BlocklyPracticePage.jsx`, add the import after the existing imports:
```jsx
import MarkdownRenderer from '../../components/MarkdownRenderer';
```

Then find this line (around line 132):
```jsx
      <p style={{ color: '#555', marginBottom: 16 }}>{version.description}</p>
```

Replace with:
```jsx
      <div style={{ color: '#555', marginBottom: 16 }}>
        <MarkdownRenderer content={version.description} />
      </div>
```

- [ ] **Step 2: Update PythonPracticePage**

In `frontend/src/pages/student/PythonPracticePage.jsx`, add the import after the existing imports:
```jsx
import MarkdownRenderer from '../../components/MarkdownRenderer';
```

Then find this line (around line 103):
```jsx
      <p style={{ color: '#555', marginBottom: 16 }}>{version.description}</p>
```

Replace with:
```jsx
      <div style={{ color: '#555', marginBottom: 16 }}>
        <MarkdownRenderer content={version.description} />
      </div>
```

- [ ] **Step 3: Run all tests including BlocklyPracticePage tests**

```bash
cd frontend && npm test
```

Expected: all tests pass. The existing `BlocklyPracticePage.test.jsx` stubs `exercise.version.description` as a plain string — `MarkdownRenderer` handles plain strings without error (renders as a `<p>`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/student/BlocklyPracticePage.jsx frontend/src/pages/student/PythonPracticePage.jsx
git commit -m "feat(markdown): render exercise description as Markdown in student practice pages"
```
