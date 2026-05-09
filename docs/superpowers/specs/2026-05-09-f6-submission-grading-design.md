# F-6 Submission & Grading — Design Spec

**Date:** 2026-05-09
**Feature:** F-6 — Submission & Grading
**Status:** Approved

---

## Context

Tutors collect student JSON answer files from OLE and import them into the platform (individual JSON files or a single ZIP). The platform validates each file, auto-grades it, and returns a per-file result. Tutors review submissions, optionally apply a manual score and comment, and export grades as CSV.

Key decisions made during brainstorming:
- **Blockly export format changed**: student exports generated JavaScript (not workspace XML). The `answer` field in the exported JSON holds the JS code produced by `javascriptGenerator.workspaceToCode()`. Block analysis rules (requiredBlocks, forbiddenBlocks, blockCountLimit) are dropped from server-side grading — only `outputMatch` is evaluated via Rhino.
- **CSV export is unauthenticated**: the endpoint requires no Bearer token, enabling direct `<a href>` download from the browser.

---

## Architecture & Data Flow

### Import Pipeline

```
Tutor UI (drop zone)
    │  multipart/form-data (.json or .zip)
    ▼
POST /api/v1/submissions/import
    │
    ├─ FileImportService
    │   ├─ ZIP: extract entries, reject path traversal (../), check decompressed size
    │   ├─ JSON schema validation (required fields)
    │   ├─ Duplicate check: (student_name, exercise_id, export_timestamp)
    │   ├─ Exercise lookup (deleted or missing → FAILED)
    │   └─ For each valid file → GradingService dispatch
    │
    ├─ BlocklyGrader  (exerciseType = BLOCKLY)
    │   └─ Rhino executes student JS, captures output, compares to outputMatch expected
    │
    ├─ PythonGrader   (exerciseType = PYTHON)
    │   └─ RestTemplate → POST sandbox:5000/execute (all test cases, visible + hidden)
    │
    └─ SubmissionRepository.save() → ImportResponseDto (batchId + per-file results)
```

### Batch ID / Force-Import

- A UUID `batchId` is generated per import request.
- For each `DUPLICATE` file, the raw bytes are stored in an `ImportBatchCache` bean (Caffeine-backed, TTL 5 min), keyed by `batchId + ":" + filename`.
- `POST /api/v1/submissions/import-duplicate` retrieves from cache and re-runs the full pipeline, skipping the duplicate check.
- If the cache entry is expired (>5 min), return 404 with message: "Batch expired — please re-import the file."

---

## Backend Components

### New Domain Entity

**`Submission`** (`domain` package) — maps to the existing `submissions` table:

| Field | Type | Notes |
|---|---|---|
| id | Long | PK |
| exerciseId | Long | FK to exercises |
| gradedVersionId | Long | FK to exercise_versions (current at import time) |
| studentName | String | From exported JSON, not FK to users |
| exerciseType | String | BLOCKLY or PYTHON |
| answerData | String | JS code (Blockly) or Python code |
| exportTimestamp | LocalDateTime | From exported JSON |
| versionMismatch | boolean | student version ≠ grading version |
| studentVersionNumber | Integer | Version number from exported JSON |
| autoScore | BigDecimal | 0.00–100.00, null if grading failed |
| autoGradeDetails | String | JSON column — per-aspect or per-test breakdown |
| tutorScore | BigDecimal | Manual override, null if not set |
| tutorComment | String | Max 500 chars |
| importBatchId | String | UUID grouping one import operation |
| createdAt | LocalDateTime | |

### New Classes

| Class | Package | Responsibility |
|---|---|---|
| `Submission` | `domain` | JPA entity |
| `SubmissionRepository` | `repository` | JPA queries: list with filters, duplicate check |
| `SubmissionController` | `submission` | REST endpoints |
| `SubmissionService` | `submission` | Orchestrates import, list, detail, grade, CSV |
| `FileImportService` | `submission` | ZIP/JSON parsing, validation, duplicate logic |
| `ImportBatchCache` | `submission` | Caffeine bean: stores duplicate file bytes, 5-min TTL |
| `BlocklyGrader` | `grading` | Rhino executor, outputMatch scoring |
| `PythonGrader` | `grading` | RestTemplate → sandbox, score aggregation |

### DTOs

- **`ImportResultDto`**: filename, status (IMPORTED/DUPLICATE/FAILED), submissionId, studentName, exerciseTitle, exerciseType, autoScore, versionMismatch, message
- **`ImportResponseDto`**: batchId, results (List\<ImportResultDto\>), summary (total, imported, duplicates, failed)
- **`SubmissionListItemDto`**: id, studentName, exerciseTitle, exerciseType, autoScore, tutorScore, versionMismatch, createdAt
- **`SubmissionDetailDto`**: all list fields + answerData, autoGradeDetails, tutorScore, tutorComment, studentVersionNumber, gradedVersionNumber
- **`GradeRequest`**: tutorScore (0–100, decimal allowed), tutorComment (max 500 chars)

### Grading Result Format (`auto_grade_details` JSON)

**Blockly:**
```json
{
  "type": "BLOCKLY",
  "rule": "outputMatch",
  "passed": true,
  "expected": "Hello World",
  "actual": "Hello World",
  "error": null
}
```

If `outputMatch` is not enabled on the exercise:
```json
{ "type": "BLOCKLY", "rule": "none", "passed": null, "error": "No grading rules configured" }
```

**Python:**
```json
{
  "type": "PYTHON",
  "results": [
    { "index": 0, "passed": true, "actual": "Fizz", "error": null, "executionTimeMs": 42 },
    { "index": 1, "passed": false, "actual": "3", "error": null, "executionTimeMs": 38 }
  ],
  "passedCount": 1,
  "totalCount": 2
}
```

### Scoring

- **Blockly**: outputMatch passes → 100.0; fails → 0.0; no rule configured → null
- **Python**: `(passedCount / totalCount) * 100`, rounded to 2 decimal places
- **Sandbox unavailable**: `autoScore = null`, error stored in `autoGradeDetails`
- **Rhino error/TLE**: `autoScore = null`, error stored in `autoGradeDetails`

### Rate Limiting

`POST /api/v1/submissions/import`: 5 req/min per user (added to `RateLimitFilter` alongside existing limits).

---

## Frontend Components

### Pages

**`SubmissionImportPage.jsx`** — route: `/tutor/submissions/import`
- Drop zone: `.json` and `.zip` only (MIME type + extension validation)
- "Import" button → multipart POST, shows spinner during upload
- Results panel (no page reload):
  - Summary bar: "X imported, Y duplicates, Z failed"
  - Per-file rows: filename, status badge, student name, exercise title, auto score
  - DUPLICATE rows show "Force Import" button → calls force-import endpoint, updates row in place

**`SubmissionListPage.jsx`** — route: `/tutor/submissions`
- Paginated table (20/page): Student Name, Exercise Title, Type, Auto Score, Tutor Score, Version Mismatch badge, Date
- Filters: exercise (dropdown from exercise list) + student name (debounced text, 300ms)
- "Export CSV" → `<a href="/api/v1/submissions/export-csv?exerciseId=X">` (unauthenticated endpoint, direct link)
- Row click → navigate to detail

**`SubmissionDetailPage.jsx`** — route: `/tutor/submissions/:id`
- Version mismatch banner (amber): "This submission was answered against version N. The exercise has since been updated to version M."
- Answer panel: read-only Monaco editor showing student code (JS for Blockly, Python for Python)
- Auto-grade panel:
  - Blockly: outputMatch pass/fail, expected vs actual output
  - Python: per-test-case table (index, passed/failed, actual output, time)
- Manual grade form: number input 0–100 + textarea (max 500 chars) + "Save Grade" button
- Tutor score shown as a green badge when set; overrides auto score label

### API Client

New `src/api/submissionApi.js`:
- `importFiles(formData)` → `POST /api/v1/submissions/import`
- `forceImport(batchId, filename)` → `POST /api/v1/submissions/import-duplicate`
- `listSubmissions(params)` → `GET /api/v1/submissions`
- `getSubmission(id)` → `GET /api/v1/submissions/:id`
- `gradeSubmission(id, payload)` → `PUT /api/v1/submissions/:id/grade`

### Routing Changes

Add to tutor route tree:
```
/tutor/submissions            → SubmissionListPage
/tutor/submissions/import     → SubmissionImportPage
/tutor/submissions/:id        → SubmissionDetailPage
```

Add navigation link in tutor sidebar/nav to "Submissions".

---

## API Contract

```
POST /api/v1/submissions/import
Content-Type: multipart/form-data
Field: files (File[] — one or more .json, or a single .zip)
Response 200: {
  "batchId": "a1b2c3d4-...",
  "results": [
    { "filename": "Alex_Hello.json", "status": "IMPORTED", "submissionId": 101,
      "studentName": "Alex Chen", "exerciseTitle": "Hello World", "exerciseType": "BLOCKLY",
      "autoScore": 100.0, "versionMismatch": false, "message": null },
    { "filename": "Carol_Hello.json", "status": "DUPLICATE", "submissionId": null,
      "studentName": "Carol", "exerciseTitle": "Hello World", "exerciseType": "BLOCKLY",
      "autoScore": null, "versionMismatch": false, "message": "Duplicate submission detected." },
    { "filename": "Unknown.json", "status": "FAILED", "submissionId": null,
      "studentName": null, "exerciseTitle": null, "exerciseType": null,
      "autoScore": null, "versionMismatch": false, "message": "Exercise not found or has been deleted." }
  ],
  "summary": { "total": 3, "imported": 1, "duplicates": 1, "failed": 1 }
}
Errors: 400 ZIP_PATH_TRAVERSAL, 400 ZIP_TOO_LARGE

POST /api/v1/submissions/import-duplicate
Request:  { "batchId": "a1b2c3d4-...", "filename": "Carol_Hello.json" }
Response 200: Single ImportResultDto with status: "IMPORTED"
Error: 404 if batch expired

GET /api/v1/submissions?exerciseId=1&studentName=Alex&page=0&size=20
Response 200: PageResponse<SubmissionListItemDto>

GET /api/v1/submissions/{id}
Response 200: SubmissionDetailDto

PUT /api/v1/submissions/{id}/grade
Request:  { "tutorScore": 80.0, "tutorComment": "Good effort!" }
Response 200: SubmissionDetailDto

GET /api/v1/submissions/export-csv?exerciseId=5
Response 200: text/csv stream (no auth required)
Columns: Student Name, Exercise Title, Exercise Type, Auto Score, Tutor Score, Tutor Comment, Submitted At
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| ZIP with `../` in entry path | 400 `ZIP_PATH_TRAVERSAL` before any extraction |
| ZIP decompressed > 100MB or > 500 files | 400 `ZIP_TOO_LARGE` |
| JSON missing required fields | Per-file `FAILED`, message lists missing fields |
| Exercise deleted or not found | Per-file `FAILED` |
| Duplicate (same name + exerciseId + exportedAt) | Per-file `DUPLICATE`; bytes cached for force-import |
| Rhino execution error / TLE | `autoScore = null`, error in `autoGradeDetails` |
| Sandbox unavailable | `autoScore = null`, `SANDBOX_UNAVAILABLE` in `autoGradeDetails`; import continues |
| Student version ≠ current version | `versionMismatch = true`, both version numbers stored |
| Force-import after cache expiry | 404 "Batch expired — please re-import the file" |
| Tutor score out of range (< 0 or > 100) | 400 `VALIDATION_ERROR` |

---

## Blockly Export Change

The existing `BlocklyPracticePage.jsx` exports workspace XML as `answer`. This must be changed to export generated JavaScript:

**Before:**
```js
answer: Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspaceRef.current))
```

**After:**
```js
answer: javascriptGenerator.workspaceToCode(workspaceRef.current)
```

This is a breaking change for any previously exported files — but since grading is new, no existing submissions exist to migrate.

---

## Testing Strategy

### Backend Unit Tests

**`FileImportServiceTest`**
- Valid JSON → parsed correctly, grading triggered
- Missing required fields → FAILED with descriptive message
- Duplicate (same name/exerciseId/timestamp) → DUPLICATE, bytes cached
- ZIP with `../` path → ZIP_PATH_TRAVERSAL thrown before extraction
- ZIP decompressed size > 100MB → ZIP_TOO_LARGE

**`BlocklyGraderTest`**
- outputMatch pass → autoScore 100.0
- outputMatch fail → autoScore 0.0
- Rhino TLE (instruction limit) → autoScore null, error recorded
- outputMatch not configured → autoScore null, "No grading rules configured"

**`PythonGraderTest`**
- All test cases pass → autoScore 100.0
- Partial pass (2/4) → autoScore 50.0
- Sandbox unavailable (mock RestTemplate throws) → autoScore null, SANDBOX_UNAVAILABLE
- One case TLE → that case failed, others scored normally

### Backend Integration Tests (H2)

**`SubmissionControllerTest`**
- Import single valid JSON → 200, status IMPORTED, submission in DB
- Import ZIP with valid + duplicate files → correct summary counts
- Force-import duplicate → status IMPORTED, new submission in DB
- List submissions with exerciseId filter → only matching rows
- Grade submission → tutorScore persisted, returned in detail
- CSV export → 200 text/csv, correct columns, tutor score empty (not "null") when absent

---

## File / Class Locations

```
backend/src/main/java/com/platform/exercise/
  domain/Submission.java
  repository/SubmissionRepository.java
  submission/
    SubmissionController.java
    SubmissionService.java
    FileImportService.java
    ImportBatchCache.java
    ImportResultDto.java
    ImportResponseDto.java
    SubmissionListItemDto.java
    SubmissionDetailDto.java
    GradeRequest.java
    ForceImportRequest.java
  grading/
    BlocklyGrader.java
    PythonGrader.java

frontend/src/
  api/submissionApi.js
  pages/tutor/
    SubmissionImportPage.jsx
    SubmissionListPage.jsx
    SubmissionDetailPage.jsx
```

---

## Dependencies

- F-4 (Exercise Management) — exercises must exist; grading rules from exercise config
- F-1 (Infrastructure) — Python sandbox container
- F-2.1 (Login/Logout) — RBAC (TUTOR+ for all submission endpoints except CSV export)
