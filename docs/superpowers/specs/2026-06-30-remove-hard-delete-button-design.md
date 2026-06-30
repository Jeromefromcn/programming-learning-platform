# Remove Hard Delete Button from Data Management

## Problem
The Data Management page (admin) exposes a "Hard Delete" button alongside "Soft Delete" for purging submissions. Hard deletes contradict the project's red line ("No hard deletes — exercises, courses, submissions"). The button is being removed from the UI.

## Scope
Frontend only. The backend `PurgeMode.HARD` endpoint/service is left untouched — out of scope for this change.

## Changes
1. `frontend/src/pages/admin/DataManagementPage.jsx`
   - Remove the Hard Delete `<button>` and its "Permanent — cannot be undone" caption.
   - Simplify `handlePurge` to no longer take a `mode` parameter (it only ever runs the soft-delete path now); drop the now-unused `loading.hard` state key.
2. `frontend/src/pages/admin/DataManagementPage.test.jsx`
   - Remove the `hard delete calls purge with HARD mode and shows toast` test.
   - Adjust `purge buttons are disabled before preview` and `clicking preview fetches count and enables purge buttons` to only assert on the Soft Delete button.

## Testing
TDD: update tests first to reflect the no-hard-delete UI (red), then remove the button/code (green). Run `npm test` in `frontend/`.

## Out of scope
- Backend `PurgeMode.HARD`, `SubmissionPurgeController`, `SubmissionPurgeService` — left as-is.
- Any other admin pages.
