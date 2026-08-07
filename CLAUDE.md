# CLAUDE.md — Multi-Type Programming Exercise Platform

## Overview
Standalone web platform replacing a fragile OLE-based system. Blockly (visual) + Python (text) exercises, decoupled export/import grading. Single-server Docker Compose for a university. **Launch: before July 2026.**

## Mandatory Workflow (Superpowers)
Every task: **Brainstorm → Plan → Implement (TDD)**. No skipping brainstorm. No code without a plan. No implementation before a failing test. Red-green-refactor on every feature. **No exceptions.**

## Architecture
```
Browser ──:80──▶ Nginx ──/api/*──▶ Spring Boot API ──POST /execute──▶ Python Sandbox (nsjail)
                  │                       │ JDBC
                  │ static files          ▼
                  │                    MySQL 8.0
                  ├── Prometheus :9090
                  └── Grafana :3001
```
**Frontend:** React 18.3.1 · Vite 5 · Blockly 12.5.0 · Monaco · Pyodide (WASM) · Nginx 1.25
**Backend:** Java 25 · Spring Boot 3.5.0 · Spring Security + JWT (JJWT 0.12.6) · Spring Data JPA · Flyway 9 · Rhino 1.7 · Maven 3.9
**Sandbox:** Python 3.12 + nsjail 3.4 (no network, mem 128MB, PID limit 32)
**DB:** MySQL 8.0 (prod) · H2 (test) | **Monitoring:** Prometheus · Grafana · Actuator
**Ports:** Nginx **:8080** · Prometheus **:9090** · Grafana **:3001** · API :8080 · Sandbox :5000 · MySQL :3306 (last three internal). Details: `docs/architecture.md`

## Project Structure
```
frontend/src/
  pages/{login,student,tutor,admin}/   # route-based pages
  components/BlocklyWorkspace.tsx       # Blockly editor
  components/MonacoEditor.tsx           # Python editor
  workers/blockly-runner.js             # Web Worker: JS exec + loop trap
  workers/pyodide-runner.js             # Web Worker: Python exec
  api/                                  # Axios instance + interceptors
  auth/                                 # auth context, JWT refresh

backend/src/main/java/com/platform/
  auth/        # AuthController, AuthService, JwtTokenProvider, JwtAuthFilter
  user/        # UserController, UserService, UserRepository
  exercise/    # ExerciseController, ExerciseService, ExerciseVersionRepository
  course/      # CourseController, CourseService
  category/    # CategoryController, CategoryService
  submission/  # SubmissionController, SubmissionService, FileImportService
  grading/     # GradingService, BlocklyGrader (Rhino), PythonGrader (HTTP), RhinoSandbox
  progress/    # ProgressController, ProgressService
  settings/    # SettingsController, SettingsService
  common/      # ErrorCode enum, GlobalExceptionHandler, PageResponse
  entity/      # JPA entities (1:1 with tables)

sandbox/       # app.py (Flask POST /execute), executor.py (nsjail spawner), restricted_imports.py
db/migration/  # Flyway: V{n}__{description}.sql
```

## Roles
**SUPER_ADMIN > TUTOR > STUDENT** (higher inherits lower).
- STUDENT: browse/practice published exercises, export answers, view own progress
- TUTOR: + create/edit/publish exercises, manage courses & categories, import/grade, export CSV
- SUPER_ADMIN: + manage user accounts, global settings

## API Conventions
Base `/api/v1` | Auth `Bearer <accessToken>` | Pagination `?page=0&size=20`
Error: `{ error: { code, message, timestamp } }`
Codes: `INVALID_CREDENTIALS` · `ACCOUNT_DISABLED` · `TOKEN_EXPIRED` · `ACCESS_DENIED` · `VALIDATION_ERROR` · `USER_NOT_FOUND` · `USERNAME_TAKEN` · `EXERCISE_NOT_FOUND` · `COURSE_NOT_FOUND` · `CATEGORY_NOT_FOUND` · `CATEGORY_DUPLICATE` · `CATEGORY_HAS_EXERCISES` · `IMPORT_FILE_INVALID` · `IMPORT_EXERCISE_MISSING` · `IMPORT_DUPLICATE` · `ZIP_PATH_TRAVERSAL` · `ZIP_TOO_LARGE` · `RATE_LIMITED`

## Database
11 tables: `users` · `refresh_tokens` · `categories` · `courses` · `exercises` · `exercise_versions` · `course_exercises` · `course_students` · `submissions` · `exercise_likes` (P1) · `global_settings`
- **Immutable versions:** every edit → new `exercise_versions` row; rollback = repoint FK.
- **Soft deletes only:** `is_deleted` on exercises & courses. Never hard-delete.
- **Submissions keyed by name string** (students may lack accounts), not user FK.
- **Duplicate detection:** composite index on `(student_name, exercise_id, export_timestamp)`.
- JSON columns: `exercise_versions.config`, `submissions.auto_grade_details`.

## Code Execution
**Client ("Run") — always Web Workers, never main thread:**
- Blockly: `INFINITE_LOOP_TRAP` (10K counter) + Worker hard kill (5s)
- Python: Pyodide in Worker + hard-kill timeout

**Server (auto-grading on import):**
- Blockly → Rhino: 5M bytecode-op limit (≈50K source iterations), `initSafeStandardObjects()`
- Python → `POST http://sandbox:5000/execute` via nsjail: no network, RO FS, blocked imports (os, sys, subprocess, socket)

## Auth Model
- Access: JWT 30min, in-memory (frontend). Refresh: 7 days, HttpOnly cookie, hash in DB.
- Every request checks `users.status = 'ACTIVE'` from DB (no Redis).
- Disable user: set `DISABLED` + delete all `refresh_tokens` → immediate invalidation.

## Security
- Rate limits: login 10/min/IP · import 5/min/user · general 60/min/user
- Upload: file ≤5MB · ZIP ≤50MB · decompressed ≤200MB · ≤500 files
- ZIP: reject any `../` entry before extraction
- CSP: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:;`
- Passwords: bcrypt; never logged, never in responses

## Edge Cases
1. **Version mismatch:** student exported v1, graded against v3 → flag `version_mismatch = true`
2. **Duplicate import:** same (name, exerciseId, timestamp) → `IMPORT_DUPLICATE`, offer force-import
3. **ZIP path traversal:** reject `../` entries immediately
4. **Infinite loops:** see Code Execution (client trap + Worker kill; server instruction limit + nsjail timeout)
5. **User disabled mid-session:** caught by per-request DB status check
6. **Course filter toggle:** show impacted student count before confirming
7. **Category with exercises:** block deletion; require removing associations first

## Date Format
All **user-facing** dates: `dd/MM/yyyy` (`+ HH:mm` when time needed), frontend + backend. Machine-to-machine (JSON API, CSV filenames) stays ISO-8601.
- Frontend: `formatDate(dt)` / `formatDateTime(dt)` from `frontend/src/utils/dateFormat.js`
- Backend: error messages + CSV use `dd/MM/yyyy`

## Dev Commands
```bash
docker compose up -d                 # full stack
cd frontend && npm run dev           # dev server :5173
cd backend && mvn spring-boot:run    # API :8080
cd backend && mvn test               # backend tests
cd frontend && npm test              # frontend tests
cd scripts/perf && python3 run.py    # performance measurements, see scripts/perf/README.md
```

## Git
Branches: `feature/{module}-{desc}` · `fix/{module}-{desc}` · `chore/{desc}`
Commits: Conventional Commits — `feat(exercise): add version rollback endpoint`

## Red Lines (Do NOT)
- No localStorage for tokens (access = JS memory; refresh = HttpOnly cookie)
- No student code on main thread — always Web Workers
- No hard deletes (exercises, courses, submissions)
- No hidden test cases in student API responses
- No skipping ZIP validation (path traversal + size before extraction)
- No extra infra (Redis, Kafka, etc.) — single-server tool
- No skipping Superpowers (Brainstorm → Plan → Implement)