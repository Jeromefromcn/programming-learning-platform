# Design: F-3.1 to F-7 Implementation
**Date:** 2026-04-25
**Features:** F-3.1 Category, F-3.2 Course, F-4 Exercise, F-5 Student Practice, F-6 Submission & Grading, F-7 Student Progress
**Approach:** Vertical slice, sequential by dependency order

---

## Implementation Order

Strict dependency chain — each feature is fully implemented (backend TDD + frontend + smoke test) before the next begins:

1. **F-3.1** Category Management
2. **F-3.2** Course Management
3. **F-4** Exercise Management
4. **F-5** Student Practice
5. **F-6** Submission & Grading
6. **F-7** Student Progress

Each slice follows: JPA Entity → Repository → Service (TDD) → Controller (TDD) → Frontend page → curl smoke test.

---

## Blockly & Monaco Strategy

**Tutor authoring (F-4) — simplified:**
- Blockly: `allowedBlocks` configured via checkbox list; `initialWorkspaceXml` entered as raw XML in a textarea. No live toolbar filtering. No Python preview panel.
- Monaco: full Python editor via `@monaco-editor/react`.

**Student practice (F-5) — full:**
- Blockly: complete workspace with toolbar filtered to `allowedBlocks` only; Run via Web Worker; Export to JSON.
- Python: Monaco editor; Run via Pyodide Web Worker; visible test case results; Export to JSON.

**New npm packages to install:**
- `blockly@12.5.0`
- `@monaco-editor/react`

Pyodide 0.26.x is loaded from CDN inside the Web Worker — not an npm package.

---

## Backend Structure

All packages follow existing convention (`auth/`, `user/`, `settings/`). New files per feature:

### F-3.1 Category
```
category/CategoryController.java
category/CategoryService.java
category/CategoryRequest.java
category/CategoryDto.java
domain/Category.java
repository/CategoryRepository.java
```

### F-3.2 Course
```
course/CourseController.java
course/CourseService.java
course/CourseRequest.java
course/CourseDto.java
domain/Course.java
repository/CourseRepository.java
```
`exerciseCount` and `studentCount` computed via JPQL `@Query` — no N+1.

### F-4 Exercise
```
exercise/ExerciseController.java
exercise/ExerciseService.java
exercise/ExerciseRequest.java
exercise/ExerciseDto.java
exercise/ExerciseVersionDto.java
domain/Exercise.java
domain/ExerciseVersion.java
repository/ExerciseRepository.java
repository/ExerciseVersionRepository.java
```
`config` column: stored as raw JSON `TEXT`. Service does not parse the JSON — frontend owns the structure.

### F-5 Student Exercise
```
student/StudentExerciseController.java
student/StudentExerciseService.java
student/StudentExerciseDto.java
```
Course filter: delegates to existing `SettingsService.isCourseFilterEnabled()`.
Hidden test cases (`visible: false`) and `gradingRules` stripped before returning to student.

### F-6 Submission & Grading
```
submission/SubmissionController.java
submission/SubmissionService.java
submission/FileImportService.java
submission/SubmissionDto.java
grading/GradingService.java
grading/BlocklyGrader.java
grading/PythonGrader.java
domain/Submission.java
repository/SubmissionRepository.java
```

### F-7 Student Progress
```
student/StudentProgressController.java
student/StudentProgressService.java
```
Single JOIN query — no N+1. `scoreSource` = `"TUTOR"` if `tutor_score IS NOT NULL`, else `"AUTO"`.

---

## Frontend Structure

Extends current inline-style + Axios pattern. No UI component library added.

### New Routes (App.jsx additions)
```
# Tutor
/tutor/categories              CategoryManagementPage
/tutor/courses                 CourseManagementPage
/tutor/courses/:id             CourseDetailPage
/tutor/exercises               ExerciseManagementPage
/tutor/exercises/new           ExerciseFormPage
/tutor/exercises/:id/edit      ExerciseFormPage
/tutor/submissions             SubmissionListPage
/tutor/submissions/import      SubmissionImportPage
/tutor/submissions/:id         SubmissionDetailPage

# Student
/student/exercises             ExerciseListPage
/student/exercises/:id         BlocklyPracticePage | PythonPracticePage (route splits on exercise.type)
/student/progress              ProgressPage
```

### New API Modules (src/api/)
```
categoryApi.js
courseApi.js
exerciseApi.js
studentApi.js
submissionApi.js
```

### Web Workers (src/workers/)
```
blocklyRunner.worker.js    # Blockly JS execution + INFINITE_LOOP_TRAP (10K iterations counter)
pyodideRunner.worker.js    # Pyodide WASM + sys.stdout redirect + main-thread timeout kill
```

### New Components
```
components/tutor/ExerciseFormBlockly.jsx   # allowedBlocks checklist + XML textarea
components/tutor/ExerciseFormPython.jsx    # Monaco + test case list
components/BlocklyWorkspace.jsx            # Full Blockly player for students
components/MonacoEditor.jsx                # Shared Monaco wrapper
```

`TutorPage` and `StudentPage` converted from stubs to layout shells with sidebar nav.

---

## Testing Strategy

### Backend (TDD — red/green/refactor per class)
- Each Controller: `@SpringBootTest` integration test with H2 + `MockMvc`
- Coverage: happy path, error codes (400/401/403/404/409), pagination, role enforcement
- `GradingService`: unit test with mocked `BlocklyGrader` / `PythonGrader`
- `FileImportService`: unit test with real ZIP/JSON byte fixtures — no Spring context needed

### Frontend
- Existing `vitest` + `@testing-library/react` pattern
- Each API module: mock axios, verify request shape and params
- Worker loop-trap logic extracted as a pure function for vitest unit testing

---

## Critical Edge Cases

| # | Edge Case | Implementation |
|---|---|---|
| 1 | ZIP path traversal (`../` entry) | `FileImportService`: check each `ZipEntry.getName()` before extraction; throw `ZIP_PATH_TRAVERSAL` immediately |
| 2 | Duplicate submission (same name+exerciseId+exportedAt) | DB unique index on `(student_name, exercise_id, export_timestamp)`; catch `DataIntegrityViolationException` → `IMPORT_DUPLICATE` |
| 3 | Version mismatch (student answered old version) | At query time: compare `submissions.graded_version_id` with `exercises.current_version_id`; set `versionMismatch = true` |
| 4 | Sandbox unavailable | `PythonGrader` catches connection exception → `autoScore = null`, `error = "SANDBOX_UNAVAILABLE"`; import continues |
| 5 | Blockly infinite loop (student) | Web Worker: insert `INFINITE_LOOP_TRAP` counter into generated JS; main thread kills worker after 5s |
| 6 | Pyodide timeout | Main thread kills worker after `timeLimitSeconds * 1000 + 500ms`; shows "Time Limit Exceeded" |
| 7 | Delete category with exercises | `CategoryService`: query `exercises` for `category_id AND is_deleted=false`; throw `CATEGORY_HAS_EXERCISES` |
| 8 | Admin disabling own account | `UserService`: compare `targetId` with `currentUser.id`; throw 400 if equal |
| 9 | ZIP too large | `FileImportService`: track decompressed bytes; throw `ZIP_TOO_LARGE` at 100MB decompressed (Nginx rejects >50MB compressed at upload) |
| 10 | Exercise publish idempotent | `ExerciseService.publish()`: if already PUBLISHED, return 200 without error |

---

## Decisions & Constraints

- `config` JSON not parsed server-side — avoids defining Blockly/Python config as Java types; frontend owns the schema
- No Redis, Kafka, or extra infrastructure added
- `batchId` for force-import: stored in a `ConcurrentHashMap` with 5-minute TTL (Caffeine cache, already a dependency)
- CSV export streams directly to `HttpServletResponse` — not buffered
- Access token cannot be sent via `<a download>` — CSV export uses cookie-based auth (refresh cookie is `Path=/api/v1/auth`, so a dedicated `/api/v1/submissions/export-csv` endpoint must accept the JWT via query param or via a short-lived token; use **query param** `?token=<accessToken>` as the pragmatic solution for this university tool)
