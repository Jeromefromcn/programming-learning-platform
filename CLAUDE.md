# CLAUDE.md — Multi-Type Programming Exercise Platform

## Project Overview

Standalone web platform replacing a fragile OLE-based exercise system. Supports Blockly (visual) and Python (text) exercises with a decoupled export/import grading workflow. Single-server Docker Compose deployment for a university. **Target launch: before July 2026.**

## Mandatory Workflow (Superpowers)

Every task follows: **Brainstorm → Plan → Implement (TDD)**.
Never skip brainstorming. Never write code without a plan. Never write implementation before a failing test. Red-green-refactor on every feature.

## Architecture

```
Browser ──:80──▶ Nginx ──/api/*──▶ Spring Boot API ──POST /execute──▶ Python Sandbox (nsjail)
                  │                       │ JDBC
                  │ static files          ▼
                  │                    MySQL 8.0
                  ├── Prometheus :9090
                  └── Grafana :3001
```

**Frontend:** React 18.3.1 · Vite 5 · Blockly 12.5.0 · Monaco Editor · Pyodide (WASM) · Nginx 1.25
**Backend:** Java 17 · Spring Boot 3.2.5 · Spring Security + JWT (JJWT 0.12.6) · Spring Data JPA · Flyway 9 · Rhino 1.7 · Maven 3.9
**Sandbox:** Python 3.12 + nsjail 3.4 (network disabled, memory 128MB, PID limit 32)
**DB:** MySQL 8.0 (prod) · H2 (test) | **Monitoring:** Prometheus · Grafana · Actuator

Ports: Nginx **:80** | Prometheus **:9090** | Grafana **:3001** | API :8080 (internal) | Sandbox :5000 (internal) | MySQL :3306 (internal)

Full details: `docs/architecture.md`

## Project Structure (Key Paths)

```
frontend/src/
  pages/{login,student,tutor,admin}/    # Route-based page modules
  components/BlocklyWorkspace.tsx        # Blockly editor wrapper
  components/MonacoEditor.tsx            # Python editor wrapper
  workers/blockly-runner.js              # Web Worker: JS exec + loop trap
  workers/pyodide-runner.js              # Web Worker: Python exec
  api/                                   # Axios instance, interceptors
  auth/                                  # Auth context, JWT refresh logic

backend/src/main/java/com/platform/
  auth/          # AuthController, AuthService, JwtTokenProvider, JwtAuthFilter
  user/          # UserController, UserService, UserRepository
  exercise/      # ExerciseController, ExerciseService, ExerciseVersionRepository
  course/        # CourseController, CourseService
  category/      # CategoryController, CategoryService
  submission/    # SubmissionController, SubmissionService, FileImportService
  grading/       # GradingService, BlocklyGrader (Rhino), PythonGrader (HTTP), RhinoSandbox
  progress/      # ProgressController, ProgressService
  settings/      # SettingsController, SettingsService
  common/        # ErrorCode enum, GlobalExceptionHandler, PageResponse
  entity/        # JPA entities (1:1 with DB tables)

sandbox/
  app.py           # Flask — POST /execute endpoint
  executor.py      # nsjail subprocess spawner
  restricted_imports.py

db/migration/      # Flyway: V{n}__{description}.sql
```

## Roles

**SUPER_ADMIN > TUTOR > STUDENT.** Higher roles inherit lower role permissions.
- STUDENT: browse/practice published exercises, export answers, view own progress
- TUTOR: + create/edit/publish exercises, manage courses & categories, import/grade submissions, export CSV
- SUPER_ADMIN: + manage user accounts, global settings

## API Conventions

Base: `/api/v1` | Auth: `Bearer <accessToken>` | Pagination: `?page=0&size=20`
Error format: `{ error: { code, message, timestamp } }`
Error codes: `INVALID_CREDENTIALS` · `ACCOUNT_DISABLED` · `TOKEN_EXPIRED` · `ACCESS_DENIED` · `VALIDATION_ERROR` · `USER_NOT_FOUND` · `USERNAME_TAKEN` · `EXERCISE_NOT_FOUND` · `COURSE_NOT_FOUND` · `CATEGORY_NOT_FOUND` · `CATEGORY_DUPLICATE` · `CATEGORY_HAS_EXERCISES` · `IMPORT_FILE_INVALID` · `IMPORT_EXERCISE_MISSING` · `IMPORT_DUPLICATE` · `ZIP_PATH_TRAVERSAL` · `ZIP_TOO_LARGE` · `RATE_LIMITED`

## Database Key Rules

11 tables: `users` · `refresh_tokens` · `categories` · `courses` · `exercises` · `exercise_versions` · `course_exercises` · `course_students` · `submissions` · `exercise_likes` (P1) · `global_settings`

- **Immutable versions:** Every exercise edit creates a new `exercise_versions` row. Rollback = repoint FK.
- **Soft deletes only:** `is_deleted` flag on exercises and courses. Never hard-delete.
- **Submissions keyed by name string**, not FK to users (students may not have accounts).
- **Duplicate detection:** composite index on `(student_name, exercise_id, export_timestamp)`.
- JSON columns: `exercise_versions.config`, `submissions.auto_grade_details`.

## Code Execution Rules

**Client-side ("Run" button) — always in Web Workers, never on main thread:**
- Blockly: `INFINITE_LOOP_TRAP` (10K iteration counter) + Worker hard kill (5s timeout)
- Python: Pyodide in Web Worker + hard kill timeout

**Server-side (auto-grading on import):**
- Blockly → Rhino JS engine: instruction count limit 500K, `initSafeStandardObjects()`
- Python → `POST http://sandbox:5000/execute` via nsjail: no network, RO filesystem, blocked imports (os, sys, subprocess, socket)

## Auth Model

- Access token: JWT 30min, in-memory (frontend). Refresh token: 7 days, HttpOnly cookie, hash stored in DB.
- Every request checks `users.status = 'ACTIVE'` from DB (no Redis at this scale).
- Disable user: set `DISABLED` + delete all `refresh_tokens` → immediate invalidation.

## Security Constraints

- Rate limits: login 10/min per IP · import 5/min per user · general 60/min per user
- File upload: single file ≤5MB · ZIP ≤50MB · decompressed ≤200MB · max 500 files
- ZIP: reject any entry with `../` before extraction
- CSP: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:;`
- Passwords: bcrypt, never logged, never in API responses

## Edge Cases to Always Handle

1. **Version mismatch:** Student exported v1, grading runs against v3 → flag `version_mismatch = true`
2. **Duplicate import:** Same (name, exerciseId, timestamp) → `IMPORT_DUPLICATE`, offer force-import
3. **ZIP path traversal:** Reject `../` entries immediately
4. **Infinite loops:** Client: loop trap + Worker kill. Server: instruction limit + nsjail timeout
5. **User disabled mid-session:** Per-request DB status check catches it
6. **Course filter toggle:** Always show impacted student count before confirming
7. **Category with exercises:** Block deletion, require removing associations first

## Dev Commands

```bash
docker compose up -d                    # Full stack
cd frontend && npm run dev              # Dev server :5173
cd backend && mvn spring-boot:run       # API :8080
cd backend && mvn test                  # Backend tests
cd frontend && npm test                 # Frontend tests
```

## Git

Branch: `feature/{module}-{desc}` · `fix/{module}-{desc}` · `chore/{desc}`
Commits: Conventional Commits — `feat(exercise): add version rollback endpoint`

## What NOT to Do

- **No localStorage for tokens.** Access token in JS memory; refresh token HttpOnly cookie only.
- **No student code on main thread.** Always Web Workers.
- **No hard deletes** on exercises, courses, or submissions.
- **No hidden test cases in student API responses.**
- **No skipping ZIP validation.** Path traversal + size check before extraction.
- **No adding Redis, Kafka, or extra infra.** Single-server university tool.
- **No skipping the Superpowers workflow.** Brainstorm → Plan → Implement. No exceptions.