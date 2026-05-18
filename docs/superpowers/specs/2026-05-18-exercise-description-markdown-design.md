# Exercise Description Markdown Support

**Date:** 2026-05-18
**Scope:** Frontend only — no backend or DB changes required

## Problem

Exercise descriptions are currently stored and rendered as plain text. Tutors cannot use formatting (headings, bold, code blocks, lists) to write clearer problem statements.

## Decision

- Render `description` as Markdown everywhere it is displayed or edited.
- Use **`react-markdown` + `remark-gfm`** for parsing and rendering.
- Use a **side-by-side split pane** in the tutor editor: left textarea for raw Markdown input, right panel for live rendered preview.
- `hints` are out of scope (plain text remains).

## Components

### `MarkdownRenderer` (`frontend/src/components/MarkdownRenderer.jsx`)

- Props: `content: string`
- Renders via `react-markdown` with `remark-gfm` plugin
- Applies inline styles (consistent with codebase convention) to rendered elements: `h1`–`h3` get font-size and margin, `code` gets monospace font and light background, `ul`/`ol` get left padding, `blockquote` gets a left border
- Stateless, pure render — no side effects
- Does **not** use `rehype-raw`; raw HTML in content is silently ignored (XSS safety)

### `MarkdownEditor` (`frontend/src/components/MarkdownEditor.jsx`)

- Props: `value: string`, `onChange: (val: string) => void`, `rows?: number` (default 8)
- Layout: two equal-width columns
  - Left: `<textarea>` labelled "Markdown"
  - Right: `<MarkdownRenderer content={value} />` labelled "Preview", with a light background to distinguish it visually
- Both columns share the same height

## Consuming Sites

| File | Change |
|------|--------|
| `frontend/src/pages/tutor/ExerciseFormPage.jsx` | Replace description `<textarea>` with `<MarkdownEditor value={description} onChange={setDescription} />` |
| `frontend/src/pages/student/BlocklyPracticePage.jsx` | Replace `<p>{version.description}</p>` with `<MarkdownRenderer content={version.description} />` |
| `frontend/src/pages/student/PythonPracticePage.jsx` | Replace `<p>{version.description}</p>` with `<MarkdownRenderer content={version.description} />` |

## Data Flow

Raw Markdown string is stored in `exercise_versions.description` (TEXT column — no schema change needed). The API returns it unchanged. Parsing happens entirely client-side at render time.

## Security

`react-markdown` does not render raw HTML by default. Tags like `<script>` and event attributes are dropped silently. No additional sanitizer is required as long as `rehype-raw` is never added.

## Dependencies to Add

```
react-markdown
remark-gfm
```

## Tests

### `MarkdownRenderer`
- Given `# Hello` renders an `<h1>`
- Given `**bold**` renders a `<strong>`
- Given `` `code` `` renders a `<code>`
- Given `- item` renders a `<li>`
- Given `<script>alert(1)</script>` does **not** produce a `<script>` element

### `MarkdownEditor`
- Renders textarea with the given `value`
- Renders preview panel alongside the textarea
- Calls `onChange` with updated value when textarea changes

### Existing tests
- `BlocklyPracticePage.test.jsx` requires no changes; description prop remains a plain string in the stub.
