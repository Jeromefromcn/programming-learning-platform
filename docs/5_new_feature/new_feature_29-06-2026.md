# Changelog — Weekly Code Changes (22–29 Jun 2026)

**Generated:** 29 Jun 2026  
**Period:** 2026-06-22 – 2026-06-29  
**Total commits:** ~110  
**Author:** Jeromefromcn

---

## Authentication & Session Management

### Re-authentication Modal (25 Jun)
- **ReauthQueue** in axiosInstance — queues failed 401 requests, replays after re-auth (`frontend/src/api/axiosInstance.js`)
- **ReauthModal** overlay component with password form (`frontend/src/components/ReauthModal.jsx`)
- **ConfirmReauthDialog** for post-dismissal authenticated actions (`frontend/src/components/ConfirmReauthDialog.jsx`)
- Mounted in App root; handlers in AuthContext; reauth queue drain on logout
- 13 page catch blocks updated to silently absorb `REAUTH_CANCELLED`

### Rate Limiting
- Student submit endpoint: 20/min per user (`RateLimitFilter.java`)
- Login page handles `RATE_LIMITED` error display

### Last Login Tracking
- `last_login_at` column on users table (V7 migration)
- Stamped on successful password-based login in `AuthService`
- Exposed in User entity + UserDto + admin management page

---

## Blockly Engine

### Missing Blocks + Interactive Input (25 Jun)
- 25 additional blocks added to `AVAILABLE_BLOCKS` (48 total) — covers math, text, loops, colour, lists
- Worker refactored to **init-message architecture** with **generator-based interactive input queue** — replaces SharedArrayBuffer/Atomics approach
- Fallback to predefined-inputs textarea when SharedArrayBuffer is unavailable
- Nginx COOP/COEP headers added for SharedArrayBuffer support
- Keyboard input support added to both student practice page and tutor authoring workspace
- UTF-8 truncation fix at 1020-byte boundary (walk back continuation bytes)
- Export disabled during execution
- Permafreeze fixed on setup error; execution freeze fixed on Ask for Input block

### Submission Viewer (25 Jun)
- `workspace_xml` column added to submissions table (V6 migration)
- `BlocklySubmissionViewer` — read-only Blockly workspace component for tutor review
- Workspace XML included in student export payload
- Displayed in submission detail page
- Updated to use generator-based interactive input (post-refactor)

### View Answer Feature (28 Jun)
- `show_answer` toggle on exercise form (tutor)
- Authoring workspace saved as answer XML
- Answer XML stripped from student API response unless `show_answer` is enabled
- Read-only answer modal for students on Blockly practice page

---

## Student Draft & Submit (26 Jun)

### Database
- `exercise_drafts` table with FK to users + exercises (V8 migration)
- `source` (enum: IMPORT/STUDENT) and `user_id` columns on submissions table

### Backend
- `ExerciseDraft` entity + repository with upsert logic
- `StudentDraftService` — save/load draft with overwrite-in-place
- `StudentSubmissionService` — grade + persist with `showResult` gating
- Endpoints: `POST /draft`, `POST /submit`, `GET /history`
- `SubmissionRepository` — source-based filter + student history queries
- Submission list defaults to source = IMPORT for tutor view

### Frontend
- API client methods for draft/submit/history (`studentApi.js`)
- Save Draft + Submit buttons on both Blockly and Python practice pages
- Auto-save draft on submit; auto-populate export name from logged-in user
- `show_result` toggle on exercise form controls result visibility to students

---

## Admin — Submission Purge (27 Jun)

- `SubmissionPurgeService` — soft delete (SET `is_deleted`) and hard delete modes
- `SubmissionPurgeController` — preview + execute endpoints, SUPER_ADMIN guard
- Bulk purge query methods in `SubmissionRepository` (by source/date range/exercise)
- `DataManagementPage` — date range picker, source filter, preview table, confirm dialog
- V9 migration for data section in menu config
- Purge audit logging; renamed ONLINE → STUDENT in purge filter

---

## Multi-Dimensional Grading & Batch Management (28–29 Jun)

### Database (V10)
- `import_batches` table — batch grouping for ZIP imports
- `graded`, `tutor_grade_details` (JSON), `tutor_comment` columns on submissions

### Backend
- **Grade dimensions**: weighted rubric scoring with `DimensionScoreDto`
- **Import**: atomic two-phase import with username validation, ImportBatch creation, reject ZIPs spanning multiple exercises
- **Batch listing**: `GET /import-batches` with CSV export (one row per submission, dynamic dimension columns)
- **Batch delete**: `DELETE /import-batches/{id}` — hard-deletes all submissions in batch
- **Submission list filter**: `batchId` query param
- `graded`/`tutorGradeDetails` exposed in `SubmissionListItemDto` + `SubmissionDetailDto`
- `exerciseId` added to `SubmissionDetailDto`; batch export secured by `@PreAuthorize`

### Frontend
- **RubricEditor** — dimension management UI for manual-grading exercises
- **GroupSubmissionPage** — batch listing, graded column, delete button with confirmation dialog
- **SubmissionDetailPage** — dimension scoring UI with graded chip; dimension description display
- Import page relocated
- Export CSV button removed from submission list (moved to batch-level export)
- Instant result toggle relocated under "Grading Configuration" heading
- Dimension description field in RubricEditor

---

## Search Filters — Deferred Load (26–27 Jun)

- User management, exercise management, and submission list pages: **live filter → Search button** pattern
- Filters only fetch on explicit Search click, not on mount/filter change
- User name filter escapes LIKE wildcards
- Student exercise list: filter fetch deferred until Search clicked
- Source filter on submission list deferred until Search clicked

### Fixes
- Explicit `filters` arg in load calls; no redundant `setPage(0)`
- Search button bail-out prevented when filters unchanged

---

## My Progress — Rebuild (28 Jun)

- **Backend**: `StudentProgressService` now returns submission list by `user_id` (not by query param)
- **Frontend**: `ProgressPage` rebuilt — submission history list with read-only code viewer (Blockly/Pyodide)
- Dead `blockly-runner.js` worker removed; Pyodide worker error handler added

---

## Cleanup & Quality

- Chinese characters removed from source files
- Injected `ObjectMapper` in grade() calls
- Stale imports/comments cleaned
- `@PreAuthorize` added to batch export
- Python rubric validation relaxed

---

## Key Stats

| Metric | Value |
|--------|-------|
| Commits | ~110 |
| Files changed | ~200+ |
| Lines added | ~12,000+ |
| Lines removed | ~1,200+ |
| DB migrations | V6 (workspace_xml), V7 (last_login_at), V8 (drafts + source), V9 (data menu), V10 (batches + grading) |
| Major features | 6 (reauth modal, blockly input/viewer/answer, draft/submit, purge, grading+batches, search-defer) |
