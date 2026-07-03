# Submission Source Filter Bug Fix + Default-to-All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the tutor Submissions page so the "All" source filter actually returns submissions from every source (not silently collapsing to "Imported"), and make "All" the default view.

**Architecture:** One-line backend fix (`SubmissionController`) removes a Spring `@RequestParam(defaultValue = "IMPORT")` that was silently rewriting an explicit empty-string `source` query value back to `"IMPORT"`. One small frontend change (`SubmissionListPage.jsx`) moves the "IMPORT default" decision out of the API contract and simplifies the page's own default to always start on "All".

**Tech Stack:** Spring Boot 3.5 / Spring MVC (backend), React + Vitest + Testing Library (frontend). Existing test suites: `SubmissionControllerTest` (MockMvc + H2), `SubmissionListPage.test.jsx` (Vitest + Testing Library).

## Global Constraints

- No DB schema or migration changes.
- No changes to import or direct-student-submit write paths — read-path (list/filter) only.
- Spec: `docs/superpowers/specs/2026-07-03-submission-source-filter-default-all-design.md`

---

### Task 1: Backend — stop `source` `defaultValue` from clobbering empty values

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionController.java`
- Test: `backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java:334-355` (existing test `list_defaultsToImportSource_excludesStudentSubmissions` is renamed and rewritten — its current premise, "omitting source defaults to IMPORT-only," is exactly the bug behavior being removed)

**Interfaces:**
- Consumes: `SubmissionService.list(Long exerciseId, String studentName, String source, Long batchId, Boolean graded, int page, int size)` — unchanged signature, already treats `source == null` or blank as "no filter" via `(source != null && source.isBlank()) ? null : source` (`SubmissionService.java:183`).
- Produces: `GET /v1/submissions` now returns all sources when `source` is omitted or sent as an empty string; `source=STUDENT` / `source=IMPORT` still filter exactly as before.

- [ ] **Step 1: Replace the existing test with one that pins down the exact bug and the full fixed contract**

In `backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java`, replace the test at lines 333-355:

```java
    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void list_defaultsToImportSource_excludesStudentSubmissions() throws Exception {
        // Insert a STUDENT-source submission directly
        Submission studentSub = new Submission();
        studentSub.setExerciseId(blocklyExercise.getId());
        studentSub.setGradedVersionId(blocklyVersion.getId());
        studentSub.setStudentName("Bob");
        studentSub.setExerciseType("PYTHON");
        studentSub.setAnswerData("code");
        studentSub.setExportTimestamp(LocalDateTime.now());
        studentSub.setSource("STUDENT");
        studentSub.setAutoScore(new java.math.BigDecimal("100"));
        submissionRepository.save(studentSub);

        mockMvc.perform(get("/v1/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").isEmpty());

        mockMvc.perform(get("/v1/submissions").param("source", "STUDENT"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").exists());
    }
```

with:

```java
    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void list_noOrEmptySourceParam_includesAllSources() throws Exception {
        // Insert a STUDENT-source submission directly
        Submission studentSub = new Submission();
        studentSub.setExerciseId(blocklyExercise.getId());
        studentSub.setGradedVersionId(blocklyVersion.getId());
        studentSub.setStudentName("Bob");
        studentSub.setExerciseType("PYTHON");
        studentSub.setAnswerData("code");
        studentSub.setExportTimestamp(LocalDateTime.now());
        studentSub.setSource("STUDENT");
        studentSub.setAutoScore(new java.math.BigDecimal("100"));
        submissionRepository.save(studentSub);

        // No source param at all -> no filter -> STUDENT submission is visible
        mockMvc.perform(get("/v1/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").exists());

        // Explicit empty source ("All" from the tutor UI) -> same: no filter.
        // This is the exact request the frontend sends and the exact case that
        // was previously broken by @RequestParam(defaultValue = "IMPORT")
        // silently rewriting "" back to "IMPORT".
        mockMvc.perform(get("/v1/submissions").param("source", ""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").exists());

        // Explicit STUDENT source still filters correctly
        mockMvc.perform(get("/v1/submissions").param("source", "STUDENT"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").exists());

        // Explicit IMPORT source still excludes the STUDENT submission
        mockMvc.perform(get("/v1/submissions").param("source", "IMPORT"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").isEmpty());
    }
```

- [ ] **Step 2: Run the test to verify it fails on current code**

Run: `cd backend && mvn test -Dtest=SubmissionControllerTest#list_noOrEmptySourceParam_includesAllSources`

Expected: FAIL — the first two `assertExists` checks (no param, empty param) fail because current code binds `source` to `"IMPORT"` in both cases (Spring's `@RequestParam(defaultValue=...)` rewrites both missing values and explicit empty-string values to the default).

- [ ] **Step 3: Fix the controller**

In `backend/src/main/java/com/platform/exercise/submission/SubmissionController.java`, change:

```java
    @GetMapping
    public ResponseEntity<PageResponse<SubmissionListItemDto>> list(
            @RequestParam(required = false) Long exerciseId,
            @RequestParam(required = false) String studentName,
            @RequestParam(defaultValue = "IMPORT") String source,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Boolean graded,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
```

to:

```java
    @GetMapping
    public ResponseEntity<PageResponse<SubmissionListItemDto>> list(
            @RequestParam(required = false) Long exerciseId,
            @RequestParam(required = false) String studentName,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Boolean graded,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=SubmissionControllerTest#list_noOrEmptySourceParam_includesAllSources`

Expected: PASS (all four `mockMvc.perform` assertions pass)

- [ ] **Step 5: Run the full SubmissionControllerTest class to check for regressions**

Run: `cd backend && mvn test -Dtest=SubmissionControllerTest`

Expected: PASS — all tests green, including unrelated tests like `listSubmissions_noFilter_returnsAll`, `listSubmissions_filterByBatchId_returnsOnlyMatchingSubmissions`, `listSubmissions_filterByGraded_returnsOnlyMatchingGradedState`.

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git add backend/src/main/java/com/platform/exercise/submission/SubmissionController.java backend/src/test/java/com/platform/exercise/submission/SubmissionControllerTest.java
git commit -m "fix(submission): stop source=IMPORT default from clobbering empty source filter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Frontend — default the Submissions page to "All", simplify batchId special-case

**Files:**
- Modify: `frontend/src/pages/tutor/SubmissionListPage.jsx:23-24`
- Test: `frontend/src/pages/tutor/SubmissionListPage.test.jsx:93-98`

**Interfaces:**
- Consumes: `submissionApi.list(params)` from `frontend/src/api/submissionApi.js` — unchanged signature; `params.source` is now `''` by default instead of `'IMPORT'`.
- Produces: n/a (leaf page component)

- [ ] **Step 1: Update the failing test to expect the new default**

In `frontend/src/pages/tutor/SubmissionListPage.test.jsx`, replace lines 93-98:

```javascript
it('calls submissionApi.list with IMPORT source by default on mount', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledWith(
    expect.objectContaining({ source: 'IMPORT' })
  ));
});
```

with:

```javascript
it('calls submissionApi.list with empty source (All) by default on mount', async () => {
  renderPage();
  await waitFor(() => expect(submissionApi.list).toHaveBeenCalledWith(
    expect.objectContaining({ source: '' })
  ));
});
```

- [ ] **Step 2: Run the test to verify it fails on current code**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx -t "calls submissionApi.list with empty source"`

Expected: FAIL — current code defaults `source` state to `'IMPORT'` when there's no `batchId` in the URL (which is the case for `renderPage()` with no args), so the mount call is made with `source: 'IMPORT'`, not `''`.

- [ ] **Step 3: Update the page's default state**

In `frontend/src/pages/tutor/SubmissionListPage.jsx`, change lines 23-24:

```javascript
  const [source, setSource] = useState(hasUrlBatchId ? '' : 'IMPORT');
  const [pendingSource, setPendingSource] = useState(hasUrlBatchId ? '' : 'IMPORT');
```

to:

```javascript
  const [source, setSource] = useState('');
  const [pendingSource, setPendingSource] = useState('');
```

`hasUrlBatchId` remains used elsewhere in the file (batchId prefill); only its use for `source`/`pendingSource` initialization is removed since both branches now produce the same value.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx -t "calls submissionApi.list with empty source"`

Expected: PASS

- [ ] **Step 5: Run the full SubmissionListPage test file to check for regressions**

Run: `cd frontend && npx vitest run src/pages/tutor/SubmissionListPage.test.jsx`

Expected: PASS — all tests green, including `pre-fills batchId and uses all sources when batchId is in the URL` (still expects `source: ''`, now true unconditionally) and `calls submissionApi.list with new source after clicking Search`.

- [ ] **Step 6: Commit**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
git add frontend/src/pages/tutor/SubmissionListPage.jsx frontend/src/pages/tutor/SubmissionListPage.test.jsx
git commit -m "feat(submission): default tutor Submissions page to All sources

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Manual verification

**Files:** none (manual check against the running dev/staging stack)

- [ ] **Step 1: Confirm via the browser**

Start the frontend dev server (`cd frontend && npm run dev`) against the existing backend, log in as a tutor, open the Submissions page, and confirm:
- The Source dropdown shows "All" selected by default (not "Imported").
- The list includes the active `STUDENT`-source rows (e.g. the `student`/`testtest` submissions for exercises 6 and 8 seen in the production DB during diagnosis) without changing the filter.
- Switching the dropdown to "Imported" or "Student" still filters correctly.

- [ ] **Step 2: Report back**

Confirm to the user that the fix has been verified against a running instance, noting exactly what was checked.

## Self-Review Notes

- **Spec coverage:** Section 1 (backend) → Task 1. Section 2 (frontend default + batchId simplification) → Task 2. Testing section → Steps 1-2 of both tasks (backend) and Task 2 (frontend). Out-of-scope items (no other endpoints, no schema changes, no write-path changes) — nothing in this plan touches those areas.
- **Placeholder scan:** none found — every step has full code and exact commands.
- **Type consistency:** `SubmissionController.list(...)` signature unchanged in shape (still `String source`, just without `defaultValue`); `SubmissionService.list(...)` untouched; frontend `source`/`pendingSource` remain plain JS string state, `''` sentinel for "All" matches existing dropdown's `<option value="">All</option>`.
