# Design: Student Practice Page — Back Button

**Date:** 2026-05-25

## Problem

Students who open an exercise practice page have no way to return to the exercise list without using the browser's back button. Both `BlocklyPracticePage` and `PythonPracticePage` lack any navigation back to `/student/exercises`.

## Approach

Add `useNavigate` to each practice page and render a `← Back to exercises` button at the top of the page content area, above the exercise `<h1>` title.

This is done in each page directly (not in `ExercisePracticeRouter`) so the button sits naturally inside the existing `maxWidth: 900, margin: 0 auto` container.

## Visual Placement

```
┌──────────────────────────────────────────┐
│ ← Back to exercises                      │
│                                          │
│ Exercise Title                           │
│ Description…                             │
│ [Blockly workspace / Monaco editor]      │
│ [Run] [Hint] [Export →]                  │
└──────────────────────────────────────────┘
```

## Styling

Plain text-style button (no background, no border) with a left arrow prefix. Matches the neutral style of existing secondary buttons. Small font, muted colour (`#555`) with a hover underline.

```jsx
<button
  onClick={() => navigate('/student/exercises')}
  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: 0, marginBottom: 16, fontSize: 14 }}
>
  ← Back to exercises
</button>
```

## Files Changed

- `frontend/src/pages/student/BlocklyPracticePage.jsx` — add `useNavigate`, add back button above `<h1>`
- `frontend/src/pages/student/PythonPracticePage.jsx` — same

## Testing

- Click back button from Blockly practice page → lands on `/student/exercises`
- Click back button from Python practice page → lands on `/student/exercises`
- Existing page functionality (Run, Hint, Export) unaffected
