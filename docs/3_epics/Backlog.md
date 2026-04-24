# Development Backlog
# Multi-Type Programming Exercise Platform

**Version:** 1.0
**Date:** 2026-04-24
**Based on:** PRD v2.0 · Architecture v1.0
**Ordering:** Backend-first, then frontend per epic
**Priority tags:** `[P0]` MVP required · `[P1]` Phase 2

---

## Table of Contents

- [E1 — Infrastructure & DevOps](#e1--infrastructure--devops)
- [E2 — Authentication & User Management](#e2--authentication--user-management)
- [E3 — Category & Course Management](#e3--category--course-management)
- [E4 — Exercise Management](#e4--exercise-management)
- [E5 — Student Practice](#e5--student-practice)
- [E6 — Submission & Grading](#e6--submission--grading)
- [E7 — Student Progress](#e7--student-progress)
- [E8 — Admin & Global Settings](#e8--admin--global-settings)
- [E9 — Monitoring & Operations](#e9--monitoring--operations)
- [E10 — P1 Features](#e10--p1-features)

---

## E1 — Infrastructure & DevOps

**Goal:** Establish the foundational build, container, and database environment that all subsequent development depends on.

---

### S1.1 — Project Scaffolding & Docker Compose `[P0]`

#### T1.1.1 — Backend project skeleton `[P0]`

**Description:** Initialise a Spring Boot 3.2.5 Maven project with all required dependencies declared. No business logic — just a runnable application with health endpoint.

**Acceptance Criteria:**
- Given the repository is cloned
  When `mvn spring-boot:run` is executed
  Then the application starts on port 8080 and `GET /actuator/health` returns `{"status":"UP"}`
- Given the project POM
  When reviewed
  Then it declares: Spring Boot Starter Web, Security, Data JPA, Actuator, Validation; JJWT 0.12.6; Flyway; Lombok; Logback Logstash Encoder; H2 (test scope); MySQL Connector; Micrometer Prometheus; Apache Commons CSV; Rhino 1.7.x

**Technical constraints:**
- Java 17 (Eclipse Temurin), Maven 3.9.x
- Package root: `com.platform.exercise`
- `application.yml` for config (not `.properties`)
- Lombok annotation processing must be configured

**Dependencies:** None

---

#### T1.1.2 — Python sandbox service `[P0]`

**Description:** Create the Python 3.12 sandbox Docker image with nsjail and a minimal Flask HTTP API that accepts code + test cases and returns execution results.

**Acceptance Criteria:**
- Given the sandbox container is running
  When `POST /execute` is called with `{"code": "print(1+1)", "tests": [{"input": "", "expected": "2"}], "timeLimitSeconds": 5}`
  Then it returns `{"results": [{"passed": true, "actual": "2", "error": null}]}`
- Given code that exceeds the time limit
  When `POST /execute` is called
  Then the test case result contains `{"passed": false, "error": "TIME_LIMIT_EXCEEDED"}`
- Given code with a runtime error
  When `POST /execute` is called
  Then the result contains `{"passed": false, "error": "<exception message>"}` and remaining test cases continue
- Given network syscalls in submitted code
  When executed
  Then nsjail blocks the attempt and the result returns an error

**Technical constraints:**
- Base image: `python:3.12-alpine`
- nsjail 3.4 compiled from source or via package
- nsjail config: network disabled, filesystem read-only, `/tmp` writable (10 MB), memory 128 MB, PID limit 32
- Flask serves on port 5000, internal network only
- Time limit enforced per test case, not per entire request

**Dependencies:** None

---

#### T1.1.3 — Docker Compose orchestration `[P0]`

**Description:** Write `docker-compose.yml` wiring all six services (nginx, spring-boot, sandbox, mysql, prometheus, grafana) on a custom bridge network with correct port mappings and volume mounts.

**Acceptance Criteria:**
- Given `docker compose up -d` is executed on a clean machine
  When all containers start
  Then `nginx` is reachable on port 80, `prometheus` on 9090, `grafana` on 3001; spring-boot and sandbox are internal-only
- Given the MySQL container restarts
  When spring-boot reconnects
  Then it re-establishes the connection without manual intervention (health-check + `depends_on` condition)
- Given the `/data/uploads` host directory
  When the spring-boot container starts
  Then it is mounted as a writable volume for temporary file handling

**Technical constraints:**
- Network name: `exercise-platform-net`
- MySQL data persisted to named volume `mysql-data`
- Spring Boot waits for MySQL health check before starting (`condition: service_healthy`)
- No external ports for mysql (3306), spring-boot (8080), sandbox (5000)

**Dependencies:** T1.1.1, T1.1.2

---

#### T1.1.4 — Frontend project skeleton `[P0]`

**Description:** Initialise a React 18 + Vite 5 project with React Router 6, Axios, and placeholder routes for the three role home pages.

**Acceptance Criteria:**
- Given `npm run dev` is executed
  When the browser opens `http://localhost:5173`
  Then a login page placeholder renders without console errors
- Given the build command `npm run build`
  When executed
  Then a `dist/` folder is produced that can be served by Nginx

**Technical constraints:**
- React 18.3.1, Vite 5.x, React Router 6.x
- Axios for HTTP; no other HTTP libraries
- Folder structure: `src/pages/`, `src/components/`, `src/api/`, `src/hooks/`, `src/workers/`
- Blockly, Pyodide, Monaco declared as dependencies but not yet integrated

**Dependencies:** None (parallel to backend)

---

#### T1.1.5 — Nginx reverse proxy config `[P0]`

**Description:** Configure Nginx to serve the React build as static files and proxy all `/api/*` requests to the Spring Boot container.

**Acceptance Criteria:**
- Given a request to `GET /api/v1/actuator/health`
  When routed through Nginx on port 80
  Then it proxies to `spring-boot:8080` and returns the health response
- Given a request to `GET /some-frontend-route`
  When the path does not match `/api/*`
  Then Nginx serves `index.html` (SPA fallback)
- Given a large file upload to `/api/v1/submissions/import`
  When the file is up to 50 MB
  Then Nginx does not reject it (`client_max_body_size 50m`)

**Technical constraints:**
- `nginx:1.25-alpine` base image
- Gzip compression enabled for JS/CSS assets
- Proxy headers: `X-Real-IP`, `X-Forwarded-For`

**Dependencies:** T1.1.3, T1.1.4

---

### S1.2 — Database Migrations `[P0]`

#### T1.2.1 — Flyway baseline migration (V1) `[P0]`

**Description:** Write the initial Flyway migration `V1__create_schema.sql` creating all 11 tables from the architecture DDL, including all indexes and foreign keys.

**Acceptance Criteria:**
- Given a clean MySQL 8.0 database
  When the Spring Boot application starts
  Then Flyway applies V1 and all 11 tables exist: `users`, `refresh_tokens`, `courses`, `course_students`, `exercises`, `exercise_versions`, `course_exercises`, `submissions`, `categories`, `exercise_likes`, `global_settings`
- Given the migration runs a second time
  When the application restarts
  Then Flyway detects the checksum and skips (no error)
- Given H2 in-memory test profile
  When tests run
  Then the same migration applies successfully (H2 compatibility)

**Technical constraints:**
- File: `src/main/resources/db/migration/V1__create_schema.sql`
- Must include seed data: `INSERT INTO global_settings (setting_key, setting_value) VALUES ('course_filter_enabled', 'false')`
- All FKs must specify `ON DELETE` behaviour as per architecture doc
- Index names must match architecture doc exactly for query plan predictability

**Dependencies:** T1.1.1

---

#### T1.2.2 — Automated daily backup container `[P0]`

**Description:** Add a `db-backup` service to Docker Compose that runs `mysqldump` on a cron schedule, writes compressed `.sql.gz` files to a host-mounted directory, and retains 30 days of snapshots.

**Acceptance Criteria:**
- Given the backup container is running
  When the scheduled time arrives
  Then a compressed dump file appears in the backup directory with the naming pattern `backup_YYYY-MM-DD_HH-MM.sql.gz`
- Given 31 days of backup files exist
  When the next backup runs
  Then files older than 30 days are deleted automatically
- Given the dump file
  When manually restored to a test MySQL instance
  Then all tables and data are recoverable

**Technical constraints:**
- Image: `mysql:8.0` (reuse for `mysqldump` availability)
- Cron via Alpine `crond`; schedule configurable via environment variable (default: daily 02:00)
- Host directory: `/var/backups/exercise-platform` mounted as volume

**Dependencies:** T1.1.3, T1.2.1

---

## E2 — Authentication & User Management

**Goal:** Secure JWT-based login/logout with role enforcement, token refresh, and super-admin user management.

---

### S2.1 — Auth Backend `[P0]`

#### T2.1.1 — User entity, repository, and password hashing `[P0]`

**Description:** Implement the `User` JPA entity mapped to the `users` table, the `UserRepository`, and BCrypt password hashing configuration.

**Acceptance Criteria:**
- Given a `User` entity is saved with a plain-text password via the service layer
  When retrieved from the database
  Then `passwordHash` is a BCrypt hash (starts with `$2a$`)
- Given a `UserRepository.findByUsername()` call
  When the username exists
  Then it returns the user in under 5 ms (indexed lookup)

**Technical constraints:**
- BCrypt strength factor: 12
- Lombok `@Data` / `@Builder` for entity
- `role` field mapped to `VARCHAR(20)` via `@Enumerated(EnumType.STRING)`
- `status` field: `ACTIVE` / `DISABLED` enum

**Dependencies:** T1.2.1

---

#### T2.1.2 — JWT generation, validation, and refresh token logic `[P0]`

**Description:** Implement JWT access token generation (15-minute expiry), refresh token generation (7-day expiry stored in `refresh_tokens` table), and validation/parsing utilities.

**Acceptance Criteria:**
- Given a valid username/password
  When `AuthService.login()` is called
  Then an access token (15 min) and a refresh token (7 days) are returned; the refresh token is persisted to `refresh_tokens`
- Given an expired access token
  When `JwtFilter` validates it
  Then a 401 `TOKEN_EXPIRED` error is returned
- Given a refresh token that is valid and not expired
  When `POST /api/v1/auth/refresh` is called
  Then a new access token is issued; the refresh token row is updated (rotation)
- Given a user's account is disabled
  When any authenticated request is made
  Then the per-request status check on `users` table returns 403 `ACCOUNT_DISABLED`

**Technical constraints:**
- JJWT 0.12.6; algorithm: HS256; secret from environment variable
- Refresh token stored as `SHA-256(token)` hash in DB, raw token sent in `HttpOnly; Secure; SameSite=Strict` cookie
- Per-request DB status check as per ADR-3 (no Redis)
- `refresh_tokens` cleanup: scheduled job deletes expired rows daily

**Dependencies:** T2.1.1

---

#### T2.1.3 — Login, logout, and refresh endpoints `[P0]`

**Description:** Implement `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, and `POST /api/v1/auth/refresh` with Spring Security filter chain.

**Acceptance Criteria:**
- Given valid credentials
  When `POST /api/v1/auth/login`
  Then 200 with `accessToken` + user info in body; `refreshToken` in `Set-Cookie` header
- Given wrong credentials
  When `POST /api/v1/auth/login`
  Then 401 `INVALID_CREDENTIALS` (same message regardless of whether username or password is wrong)
- Given a disabled account
  When `POST /api/v1/auth/login`
  Then 403 `ACCOUNT_DISABLED`
- Given a valid refresh cookie
  When `POST /api/v1/auth/refresh`
  Then 200 with new access token
- Given `POST /api/v1/auth/logout`
  When called with a valid session
  Then the refresh token row is deleted; subsequent refresh attempts return 401

**Technical constraints:**
- Spring Security: disable CSRF (JWT-based), stateless session
- JWT filter applied before `UsernamePasswordAuthenticationFilter`
- Login endpoint must not pass through JWT filter (permit all)
- Rate limit: 10 login attempts per IP per minute (Spring's `@RateLimiter` or Bucket4j)

**Dependencies:** T2.1.2

---

#### T2.1.4 — Role-based access control middleware `[P0]`

**Description:** Implement `@PreAuthorize` / `@Secured` role checks so that STUDENT, TUTOR, and SUPER_ADMIN roles enforce correct access across all future endpoints.

**Acceptance Criteria:**
- Given a STUDENT token
  When calling a TUTOR-only endpoint
  Then 403 `ACCESS_DENIED` is returned
- Given a SUPER_ADMIN token
  When calling a STUDENT or TUTOR endpoint
  Then access is granted (role hierarchy: SUPER_ADMIN > TUTOR > STUDENT)
- Given a missing or malformed Authorization header
  When calling any protected endpoint
  Then 401 is returned

**Technical constraints:**
- Use Spring Security method security (`@EnableMethodSecurity`)
- Define a `RoleHierarchy` bean for inheritance
- Custom `AccessDeniedHandler` and `AuthenticationEntryPoint` returning standard error JSON format

**Dependencies:** T2.1.3

---

### S2.2 — User Management Backend `[P0]`

#### T2.2.1 — User CRUD API (SUPER_ADMIN) `[P0]`

**Description:** Implement `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/{id}/role`, `PATCH /api/v1/users/{id}/disable`.

**Acceptance Criteria:**
- Given `POST /api/v1/users` with username, displayName, password, role
  When the username is unique
  Then 201 with created user (no `passwordHash` in response)
- Given `POST /api/v1/users` with a duplicate username
  When submitted
  Then 409 `USERNAME_TAKEN`
- Given `PATCH /api/v1/users/{id}/disable`
  When called
  Then `users.status = 'DISABLED'` and all rows in `refresh_tokens` for that user are deleted atomically in one transaction
- Given `PATCH /api/v1/users/{id}/role` changing a user's role
  When the user next authenticates
  Then the new role is reflected in their JWT claims

**Technical constraints:**
- Password set by admin at creation; student/tutor cannot change via this endpoint (profile endpoint for self-change, T10.1.2)
- Response must never include `password_hash`
- `GET /api/v1/users` supports pagination (`page`, `size`) and filter by `role`

**Dependencies:** T2.1.4, T1.2.1

---

### S2.3 — Auth Frontend `[P0]`

#### T2.3.1 — Login page and auth context `[P0]`

**Description:** Build the login page UI, implement the Axios auth API client, and create a React auth context that stores the access token and user info, handles silent token refresh, and redirects on expiry.

**Acceptance Criteria:**
- Given valid credentials are entered
  When the form is submitted
  Then the user is redirected to their role-appropriate home page (STUDENT → exercise list, TUTOR → exercise management, SUPER_ADMIN → admin dashboard)
- Given wrong credentials
  When the form is submitted
  Then an inline error message is shown; the password field is cleared
- Given an access token that expires while the user is active
  When the next API call is made
  Then the token is silently refreshed via the refresh cookie without the user seeing a logout
- Given the user clicks Logout
  When confirmed
  Then the auth context is cleared and the login page is shown

**Technical constraints:**
- Access token stored in memory only (not `localStorage` — XSS protection)
- Axios request interceptor: attach `Authorization: Bearer` header
- Axios response interceptor: on 401, attempt one silent refresh; on failure, redirect to login
- React Router `<ProtectedRoute>` component checks auth and role before rendering

**Dependencies:** T2.1.3, T1.1.4

---

#### T2.3.2 — User management UI (SUPER_ADMIN) `[P0]`

**Description:** Build the user management page: paginated user table with create user modal, change role, and disable user actions.

**Acceptance Criteria:**
- Given SUPER_ADMIN opens the user management page
  When the page loads
  Then all users are listed with username, display name, role badge, and status
- Given the admin clicks "Create User"
  When the modal form is submitted with valid data
  Then the new user appears in the table without a full page reload
- Given the admin clicks "Disable" on a user
  When confirmed in the dialog
  Then the row updates to show "Disabled" status immediately
- Given the admin attempts to disable themselves
  When the action is triggered
  Then it is blocked with an inline error message

**Technical constraints:**
- "Disable" and "Change Role" buttons disabled/hidden for the currently logged-in admin's own row
- Form validation: username required, 3–64 chars, alphanumeric + underscore only
- Display confirmation dialog before destructive actions

**Dependencies:** T2.2.1, T2.3.1

---

## E3 — Category & Course Management

**Goal:** Enable tutors to manage knowledge categories and organise exercises into courses with student enrolment.

---

### S3.1 — Category Backend `[P0]`

#### T3.1.1 — Category CRUD API `[P0]`

**Description:** Implement `GET /api/v1/categories`, `POST /api/v1/categories`, `DELETE /api/v1/categories/{id}`.

**Acceptance Criteria:**
- Given `GET /api/v1/categories`
  When called by any authenticated user
  Then all categories are returned with `exerciseCount` for each
- Given `POST /api/v1/categories` with a unique name
  When submitted by TUTOR+
  Then 201 with the created category
- Given `POST /api/v1/categories` with a duplicate name
  When submitted
  Then 409 `CATEGORY_DUPLICATE`
- Given `DELETE /api/v1/categories/{id}` where the category has linked exercises
  When submitted
  Then 409 `CATEGORY_HAS_EXERCISES`
- Given `DELETE /api/v1/categories/{id}` where no exercises are linked
  When submitted
  Then 204

**Technical constraints:**
- `exerciseCount` computed via `COUNT` on `exercises` where `category_id = id` and `is_deleted = false`
- Endpoint accessible to TUTOR and SUPER_ADMIN; read-only `GET` accessible to all authenticated roles

**Dependencies:** T2.1.4, T1.2.1

---

### S3.2 — Course Backend `[P0]`

#### T3.2.1 — Course CRUD API `[P0]`

**Description:** Implement `GET /api/v1/courses`, `POST /api/v1/courses`, `PUT /api/v1/courses/{id}`, `DELETE /api/v1/courses/{id}`.

**Acceptance Criteria:**
- Given `POST /api/v1/courses` with name and description
  When submitted by TUTOR+
  Then 201 with created course; `created_by` is set to the requesting user's ID
- Given `DELETE /api/v1/courses/{id}`
  When confirmed
  Then `is_deleted = true`; linked exercises and submissions are unaffected
- Given `GET /api/v1/courses`
  When called by a TUTOR
  Then only courses created by that tutor are returned (SUPER_ADMIN sees all)

**Technical constraints:**
- Soft delete via `is_deleted` flag
- Cascade: deleting a course removes `course_students` and `course_exercises` rows (FK `ON DELETE CASCADE`)

**Dependencies:** T2.1.4, T1.2.1

---

#### T3.2.2 — Course–exercise association API `[P0]`

**Description:** Implement `POST /api/v1/courses/{id}/exercises`, `DELETE /api/v1/courses/{id}/exercises/{exerciseId}`, `GET /api/v1/courses/{id}/exercises`.

**Acceptance Criteria:**
- Given `POST /api/v1/courses/{id}/exercises` with an `exerciseId`
  When the exercise is published and not deleted
  Then it is linked; the same exercise can be linked to multiple courses
- Given `DELETE /api/v1/courses/{id}/exercises/{exerciseId}`
  When called
  Then the link is removed; the exercise and any submissions remain untouched
- Given an exercise already linked to the same course
  When linked again
  Then 409 or idempotent 200 (no duplicate row)

**Technical constraints:**
- `course_exercises` unique constraint: `(course_id, exercise_id)`
- Only PUBLISHED exercises can be linked; attempting to link a DRAFT returns 400

**Dependencies:** T3.2.1

---

#### T3.2.3 — Student–course enrolment API `[P0]`

**Description:** Implement `POST /api/v1/courses/{id}/students` (batch enrol), `DELETE /api/v1/courses/{id}/students/{userId}`, `GET /api/v1/courses/{id}/students`.

**Acceptance Criteria:**
- Given `POST /api/v1/courses/{id}/students` with an array of user IDs
  When submitted
  Then all valid STUDENT-role users are enrolled; non-existent or non-student IDs return per-item errors
- Given `DELETE /api/v1/courses/{id}/students/{userId}`
  When the student is removed
  Then they can no longer see that course's exercises (when filter is enabled); historical submissions retained
- Given `GET /api/v1/courses/{id}/students`
  When called by TUTOR+
  Then the enrolled student list is returned with `id`, `username`, `displayName`

**Technical constraints:**
- Batch enrol accepts up to 200 user IDs per request
- Enroling an already-enrolled student is idempotent (no error)

**Dependencies:** T3.2.1, T2.2.1

---

### S3.3 — Category & Course Frontend `[P0]`

#### T3.3.1 — Category management UI `[P0]`

**Description:** Build the category management page (SUPER_ADMIN / TUTOR access) with an add form and delete button per row.

**Acceptance Criteria:**
- Given the user opens category management
  When the page loads
  Then all categories are listed with their exercise count
- Given the user adds a new category
  When submitted
  Then it appears in the list and is immediately available in the exercise authoring dropdown
- Given the user attempts to delete a category with exercises
  When the delete button is clicked
  Then an error message explains that exercises must be reassigned first

**Technical constraints:**
- Inline add form (no modal needed — simple single-field form)
- Delete button disabled for categories with `exerciseCount > 0` (server validation is authoritative)

**Dependencies:** T3.1.1, T2.3.1

---

#### T3.3.2 — Course management UI `[P0]`

**Description:** Build the tutor course management page: course list, create/edit course, add/remove exercises from course, and manage student enrolment per course.

**Acceptance Criteria:**
- Given the tutor opens course management
  When the page loads
  Then their courses are listed with exercise count and student count
- Given the tutor opens a course detail
  When on the Exercises tab
  Then linked exercises are shown; unlinked published exercises can be added via search-and-select
- Given the tutor opens the Students tab
  When adding students
  Then a search-by-username input allows bulk selection and enrolment

**Technical constraints:**
- Separate tabs within the course detail page: Overview / Exercises / Students
- Exercise search in "add exercise" modal filters by title (debounced 300 ms)
- Student search filters STUDENT-role users not yet enrolled

**Dependencies:** T3.2.1, T3.2.2, T3.2.3, T2.3.1

---

## E4 — Exercise Management

**Goal:** Full exercise authoring lifecycle — create, edit (with immutable versioning), publish/unpublish, rollback, and delete — for both Blockly and Python types.

---

### S4.1 — Exercise Backend `[P0]`

#### T4.1.1 — Exercise and ExerciseVersion entities & repositories `[P0]`

**Description:** Implement `Exercise` and `ExerciseVersion` JPA entities with repositories. Exercise holds metadata; ExerciseVersion holds the immutable config blob (stored as JSON column).

**Acceptance Criteria:**
- Given an `Exercise` is saved
  When retrieved
  Then it has a `currentVersionId` foreign key pointing to its latest `ExerciseVersion`
- Given an `ExerciseVersion` is saved
  When retrieved
  Then its `config` JSON column is deserialised correctly into the appropriate config DTO (BlocklyConfig or PythonConfig) based on the exercise type

**Technical constraints:**
- `config` stored as `JSON` MySQL column; mapped to `String` in JPA, deserialised in service layer via Jackson
- `ExerciseVersion` is immutable: no update operations permitted, only insert
- Soft delete on `Exercise` via `is_deleted` flag; versions are never deleted

**Dependencies:** T1.2.1

---

#### T4.1.2 — Exercise CRUD and versioning API `[P0]`

**Description:** Implement `POST /api/v1/exercises`, `PUT /api/v1/exercises/{id}`, `GET /api/v1/exercises`, `GET /api/v1/exercises/{id}`, `DELETE /api/v1/exercises/{id}`.

**Acceptance Criteria:**
- Given `POST /api/v1/exercises` with valid Blockly or Python config
  When submitted
  Then 201 with exercise at `status: DRAFT`, `versionNumber: 1`
- Given `PUT /api/v1/exercises/{id}` with updated config
  When submitted
  Then a new `ExerciseVersion` row is created (version N+1); the old version rows remain; `exercise.current_version_id` is updated
- Given `DELETE /api/v1/exercises/{id}`
  When called
  Then `is_deleted = true`; all linked submissions and grades are retained
- Given `GET /api/v1/exercises` by a TUTOR
  When called
  Then paginated list includes DRAFT and PUBLISHED exercises (not deleted); supports filters: `type`, `status`, `categoryId`, `difficulty`

**Technical constraints:**
- Config validation: Blockly config must have `allowedBlocks` (non-empty array); Python config must have at least one test case
- `PUT` creates a new version even if the config is identical (no diff-check)
- Deleted exercises return 404 on `GET /api/v1/exercises/{id}`

**Dependencies:** T4.1.1, T2.1.4, T3.1.1

---

#### T4.1.3 — Exercise version history and rollback API `[P0]`

**Description:** Implement `GET /api/v1/exercises/{id}/versions`, `GET /api/v1/exercises/{id}/versions/{versionId}`, `POST /api/v1/exercises/{id}/rollback`.

**Acceptance Criteria:**
- Given `GET /api/v1/exercises/{id}/versions`
  When called
  Then all version rows are returned in descending order with `isCurrent` flag on the latest
- Given `POST /api/v1/exercises/{id}/rollback` with a valid `versionId`
  When called
  Then `exercise.current_version_id` is updated to point to the target version; the version history is unchanged (no rows deleted)
- Given a rollback to a version that belongs to a different exercise
  When submitted
  Then 400 `VALIDATION_ERROR`

**Technical constraints:**
- Rollback is a pointer update only — no new version row is created
- After rollback, the exercise status remains unchanged (DRAFT/PUBLISHED)

**Dependencies:** T4.1.2

---

#### T4.1.4 — Exercise publish/unpublish API `[P0]`

**Description:** Implement `PATCH /api/v1/exercises/{id}/publish` and `PATCH /api/v1/exercises/{id}/unpublish`.

**Acceptance Criteria:**
- Given `PATCH /api/v1/exercises/{id}/publish` on a DRAFT exercise
  When called by TUTOR+
  Then `status = PUBLISHED`; the exercise becomes visible to students
- Given `PATCH /api/v1/exercises/{id}/unpublish` on a PUBLISHED exercise
  When called
  Then `status = DRAFT`; it disappears from the student exercise browser immediately
- Given publish on an already-published exercise
  When called
  Then idempotent 200 (no error)

**Technical constraints:**
- Unpublish does not affect existing submissions
- Status change must be reflected in student exercise list within one request (no caching layer)

**Dependencies:** T4.1.2

---

### S4.2 — Exercise Authoring Frontend `[P0]`

#### T4.2.1 — Exercise list and management dashboard (Tutor) `[P0]`

**Description:** Build the tutor exercise management page: paginated table with filter controls (type, status, category, difficulty), status badges, and action buttons (Edit, Publish/Unpublish, Delete).

**Acceptance Criteria:**
- Given the tutor opens exercise management
  When the page loads
  Then all their exercises are listed with title, type, difficulty, status, version number, like count
- Given the tutor changes the status filter
  When applied
  Then the table updates to show only matching exercises
- Given the tutor clicks "Delete"
  When confirmed in the dialog
  Then the row is removed from the list; a toast confirms success
- Given the tutor clicks "Publish"
  When the exercise is in DRAFT
  Then the status badge updates to PUBLISHED inline

**Technical constraints:**
- Pagination: 20 per page
- Filter controls: dropdowns for type (ALL / BLOCKLY / PYTHON), status (ALL / DRAFT / PUBLISHED), category (dynamic from API), difficulty (ALL / EASY / MEDIUM / HARD)
- Debounced title search field (300 ms)

**Dependencies:** T4.1.2, T4.1.4, T2.3.1

---

#### T4.2.2 — Blockly exercise authoring form `[P0]`

**Description:** Build the Blockly exercise creation/edit form. Includes metadata fields, a Blockly workspace for setting the initial state and configuring the block palette, and grading rule toggles.

**Acceptance Criteria:**
- Given the tutor opens "New Exercise" and selects Blockly
  When the form renders
  Then a live Blockly workspace is shown where the tutor can drag blocks to set `initialWorkspaceXml`
- Given the tutor configures `allowedBlocks`
  When they select block types from a checklist
  Then the Blockly workspace toolbar updates to show only those blocks
- Given the tutor toggles "Show Python Code View"
  When enabled
  Then a preview shows the generated Python equivalent of the current workspace
- Given the tutor submits the form
  When validation passes
  Then the exercise is saved as DRAFT and they are redirected to the exercise list

**Technical constraints:**
- Blockly 12.5.0 loaded as a module
- `initialWorkspaceXml` captured via `Blockly.Xml.workspaceToDom()` then serialised to string
- Grading rule toggles: Output Match (with expected output field), Required Blocks (multi-select), Forbidden Blocks (multi-select), Block Count Limit (number input)
- All fields validated client-side before submission; server validation is authoritative

**Dependencies:** T4.1.2, T4.2.1

---

#### T4.2.3 — Python exercise authoring form `[P0]`

**Description:** Build the Python exercise creation/edit form with a Monaco editor for starter code and a structured test case editor (add/remove rows, visible/hidden toggle, run-against-sample action).

**Acceptance Criteria:**
- Given the tutor opens "New Exercise" and selects Python
  When the form renders
  Then a Monaco editor is shown for starter code with Python syntax highlighting
- Given the tutor adds test cases
  When they enter input and expected output pairs
  Then each row has a visible/hidden toggle
- Given the tutor clicks "Verify Test Cases"
  When the sample solution is run against all test cases via the server
  Then each test case shows a pass/fail result inline
- Given the tutor submits
  When at least one test case is defined
  Then the exercise is saved as DRAFT

**Technical constraints:**
- Monaco Editor 0.50.x loaded dynamically (code-split to avoid bloating initial bundle)
- Test case "Verify" calls `POST /api/v1/exercises/{id}/verify` (or a dedicated preview endpoint) — runs through the Python sandbox
- Time limit input: integer, 1–30 seconds, default 5

**Dependencies:** T4.1.2, T4.2.1

---

#### T4.2.4 — Exercise version history UI `[P0]`

**Description:** Add a version history panel to the exercise detail/edit page showing all versions with timestamps and a rollback button.

**Acceptance Criteria:**
- Given the tutor opens an exercise with multiple versions
  When the Versions tab is opened
  Then all versions are listed newest-first with creation timestamp and "Current" badge on the active version
- Given the tutor clicks "Preview" on an old version
  When the preview loads
  Then the exercise config for that version is shown in read-only mode
- Given the tutor clicks "Rollback" and confirms
  When the operation completes
  Then the current version badge moves to the selected version and a toast confirms

**Technical constraints:**
- Rollback confirmation dialog must warn: "This will change the exercise students see. Existing submissions were graded against a different version."

**Dependencies:** T4.1.3, T4.2.2, T4.2.3

---

## E5 — Student Practice

**Goal:** Students can browse exercises, practice using Blockly or Python editors, run code locally in-browser, and export their answer as a JSON file.

---

### S5.1 — Student Practice Backend `[P0]`

#### T5.1.1 — Student exercise browse and detail API `[P0]`

**Description:** Implement `GET /api/v1/student/exercises` and `GET /api/v1/student/exercises/{id}` with course filter enforcement and student-safe data stripping.

**Acceptance Criteria:**
- Given the global `course_filter_enabled = false`
  When a student calls `GET /api/v1/student/exercises`
  Then all PUBLISHED non-deleted exercises are returned
- Given `course_filter_enabled = true` and the student is enrolled in Course A
  When they browse exercises
  Then only exercises linked to Course A are returned
- Given `course_filter_enabled = true` and the student is not enrolled in any course
  When they browse
  Then an empty list is returned
- Given `GET /api/v1/student/exercises/{id}`
  When called
  Then hidden test cases (`visible: false`) and grading rules are stripped from the response
- Given filters `type`, `categoryId`, `difficulty` are applied
  When called
  Then only matching exercises are returned

**Technical constraints:**
- `global_settings` row is read per request (cached in Spring `@Bean` with 30-second TTL acceptable)
- Response for Python exercises must include only `visibleTestCases` (hidden ones excluded entirely)
- Response for Blockly exercises must not include `gradingRules`

**Dependencies:** T4.1.2, T3.2.2, T3.2.3, T2.1.4

---

### S5.2 — In-Browser Execution (Frontend) `[P0]`

#### T5.2.1 — Blockly JS execution Web Worker `[P0]`

**Description:** Implement a Web Worker that receives Blockly-generated JavaScript code, executes it with a 3-second timeout, captures `print()` output, and returns the result to the main thread.

**Acceptance Criteria:**
- Given valid Blockly JS code with `print("Hello")`
  When the worker executes it
  Then `{ output: "Hello\n", error: null, timedOut: false }` is returned to the main thread
- Given code that runs an infinite loop
  When execution exceeds 3 seconds
  Then the worker is terminated and `{ timedOut: true }` is returned; a new worker is spawned for the next run
- Given code that throws a runtime error
  When executed
  Then `{ output: null, error: "ReferenceError: x is not defined" }` is returned (no stack trace exposed)

**Technical constraints:**
- Worker file: `src/workers/blocklyRunner.worker.js`
- No `importScripts` from external domains
- `print()` overridden to accumulate to a string buffer
- Worker timeout implemented via `setTimeout` + `worker.terminate()` from main thread

**Dependencies:** T1.1.4

---

#### T5.2.2 — Pyodide Python execution Web Worker `[P0]`

**Description:** Implement a Web Worker that loads Pyodide 0.26.x, runs student Python code with configurable timeout, captures stdout/stderr, and returns results.

**Acceptance Criteria:**
- Given valid Python code `print(1 + 1)`
  When the worker executes it
  Then `{ output: "2\n", error: null, timedOut: false }` is returned
- Given code exceeding the configured time limit
  When the worker is terminated from the main thread
  Then `{ timedOut: true }` is returned; a fresh worker is created for the next execution
- Given a Python `SyntaxError`
  When the worker executes
  Then `{ output: null, error: "SyntaxError: invalid syntax (line 1)" }` is returned — no raw traceback exposed to student

**Technical constraints:**
- Worker file: `src/workers/pyodideRunner.worker.js`
- Pyodide loaded from CDN (`https://cdn.jsdelivr.net/pyodide/`) on first use; subsequent runs reuse the loaded instance
- `sys.stdout` redirected to capture output
- Timeout: main thread kills worker after `timeLimitSeconds * 1000 + 500 ms` grace

**Dependencies:** T1.1.4

---

#### T5.2.3 — Student Blockly practice page `[P0]`

**Description:** Build the student-facing Blockly exercise page: read-only problem description, interactive Blockly workspace (constrained to allowed blocks), Run button, output panel, hint system, and Export button.

**Acceptance Criteria:**
- Given the student opens a Blockly exercise
  When the page loads
  Then the Blockly workspace is pre-loaded with `initialWorkspaceXml` and the toolbar shows only `allowedBlocks`
- Given the student clicks "Run"
  When code executes in the Web Worker
  Then the output panel shows the result within 1 second for typical programs; a spinner is shown during execution
- Given the exercise has `showCodeView: true`
  When enabled
  Then a read-only panel below the workspace shows the equivalent Python code (generated by Blockly's Python generator), updating live as blocks change
- Given the student clicks "Hint"
  When hints are available
  Then hints are revealed one at a time (progressive disclosure); the button is disabled after all hints are shown
- Given the student clicks "Export"
  When a name is entered
  Then a JSON file is downloaded in the format: `{ exerciseId, exerciseType, exerciseVersionId, versionNumber, studentName, answer: { workspaceXml }, exportedAt }`

**Technical constraints:**
- Export triggers a `<a download>` programmatic click — no server round-trip
- Output panel: monospace font, max height 200 px with scroll; "Time Limit Exceeded" shown as a styled warning (not raw error)
- Hint button shows "Hint (1/3)" style counter

**Dependencies:** T5.1.1, T5.2.1

---

#### T5.2.4 — Student Python practice page `[P0]`

**Description:** Build the student-facing Python exercise page: problem description, Monaco editor with starter code, visible test case panel, Run button, result panel, hints, and Export button.

**Acceptance Criteria:**
- Given the student opens a Python exercise
  When the page loads
  Then the Monaco editor is pre-filled with `starterCode` and the visible test cases are listed below the description
- Given the student clicks "Run"
  When code runs in the Pyodide worker
  Then each visible test case shows ✅ / ❌ with actual output; hidden test case count is mentioned ("+ N hidden tests will run on submission")
- Given a test case fails
  When results are displayed
  Then the actual output vs expected output is shown in a diff-like format; raw Python tracebacks are replaced with human-readable messages
- Given the student clicks "Export"
  When a name is entered
  Then a JSON file is downloaded: `{ exerciseId, exerciseType, exerciseVersionId, versionNumber, studentName, answer: { code }, exportedAt }`

**Technical constraints:**
- Monaco loaded via dynamic `import()` to avoid blocking initial render
- "Export" and "Run" are visually distinct — different button styles, different placement
- Error message mapping: `IndentationError` → "Check your indentation", `NameError` → "Variable not defined", etc. (at minimum 5 common errors mapped)

**Dependencies:** T5.1.1, T5.2.2

---

## E6 — Submission & Grading

**Goal:** Tutors can import student JSON/ZIP answer files, trigger auto-grading (Blockly via Rhino, Python via sandbox), review results, apply manual scores, and export a grade CSV.

---

### S6.1 — Auto-Grading Engine `[P0]`

#### T6.1.1 — Blockly auto-grading (Rhino) `[P0]`

**Description:** Implement the Blockly grading service using Mozilla Rhino to execute Blockly-generated JS in a sandboxed context and evaluate grading rules (output match, required blocks, forbidden blocks, block count).

**Acceptance Criteria:**
- Given a Blockly submission with `outputMatch` rule enabled and correct output
  When graded
  Then the output match aspect passes (score contribution proportional to weight)
- Given a Blockly submission where `requiredBlocks` rule is enabled and a required block is absent from the workspace XML
  When graded
  Then the required blocks aspect fails
- Given a Blockly submission where code runs longer than 3 seconds in Rhino
  When the instruction count limit is hit
  Then the output match aspect fails with `error: "TIME_LIMIT_EXCEEDED"`; other rule aspects (block checks) still evaluate
- Given all aspects pass
  When score is calculated
  Then `autoScore = 100.0`; partial passes produce proportional scores

**Technical constraints:**
- Rhino 1.7.x; Java class access disabled via `Context.setClassShaper()`
- Instruction count limit set to approximate 3-second equivalent (determined empirically, configurable)
- Block analysis performed on workspace XML via DOM parsing (no Blockly library needed server-side)
- Score formula: `(passedAspects / totalAspects) * 100`, rounded to 2 decimal places

**Dependencies:** T4.1.1, T1.2.1

---

#### T6.1.2 — Python auto-grading (sandbox HTTP client) `[P0]`

**Description:** Implement the Python grading service that sends code and all test cases (visible + hidden) to the Python sandbox container and processes the results.

**Acceptance Criteria:**
- Given a Python submission
  When graded
  Then all test cases (visible + hidden) are sent to `POST sandbox:5000/execute`
- Given the sandbox returns results
  When processed
  Then `autoScore = (passedCount / totalCount) * 100`; each test case result (input, expected, actual, passed, error) is stored in `submissions.auto_grade_details` JSON
- Given the sandbox container is unavailable
  When grading is attempted
  Then the submission is saved with `autoScore = null` and `error: "SANDBOX_UNAVAILABLE"`; import does not fail wholesale
- Given a test case times out
  When results are returned
  Then that case is marked `passed: false`, `error: "TIME_LIMIT_EXCEEDED"`; remaining cases continue

**Technical constraints:**
- HTTP client: Spring's `RestTemplate` or `WebClient` (blocking acceptable at this scale)
- Sandbox timeout: `timeLimitSeconds + 2s` network buffer per request
- `auto_grade_details` stored as JSON in `submissions` table column

**Dependencies:** T6.1.1, T1.1.2

---

### S6.2 — Import Pipeline `[P0]`

#### T6.2.1 — Submission import API `[P0]`

**Description:** Implement `POST /api/v1/submissions/import` accepting multipart JSON files and a single ZIP. Validates, deduplicates, grades, and persists each submission, returning a per-file result.

**Acceptance Criteria:**
- Given a valid student JSON file
  When imported
  Then the file is parsed, the exercise is looked up, auto-grading is triggered, and the submission is saved; result `status: "IMPORTED"`
- Given a file referencing a deleted or non-existent exercise
  When imported
  Then result `status: "FAILED"`, `message: "Exercise not found or has been deleted."`
- Given a duplicate file (same studentName + exerciseId + exportTimestamp as an existing submission)
  When imported
  Then result `status: "DUPLICATE"`; no new DB row is created
- Given a ZIP file upload
  When imported
  Then ZIP is extracted, each contained JSON is processed individually; ZIP path traversal returns 400 `ZIP_PATH_TRAVERSAL`
- Given a batch with mixed valid, duplicate, and failed files
  When imported
  Then `summary.total`, `summary.imported`, `summary.duplicates`, `summary.failed` are all accurate

**Technical constraints:**
- Max ZIP decompressed size: 100 MB (configurable); exceeded → 400 `ZIP_TOO_LARGE`
- JSON schema validation: required fields `exerciseId`, `exerciseType`, `studentName`, `answer`, `exportedAt`
- Processing is synchronous per file (acceptable for batch sizes expected in a single university context)
- `batchId` (UUID) generated per import request for use by force-import duplicate endpoint

**Dependencies:** T6.1.1, T6.1.2, T4.1.2

---

#### T6.2.2 — Force-import duplicate and submission detail API `[P0]`

**Description:** Implement `POST /api/v1/submissions/import-duplicate`, `GET /api/v1/submissions`, `GET /api/v1/submissions/{id}`, `PUT /api/v1/submissions/{id}/grade`.

**Acceptance Criteria:**
- Given `POST /api/v1/submissions/import-duplicate` with a valid `batchId` and `filename`
  When called within the same session
  Then the duplicate is force-imported and graded; returns single-file result with `status: "IMPORTED"`
- Given `GET /api/v1/submissions/{id}`
  When called by TUTOR+
  Then it returns all grading details including per-test-case breakdown for Python and per-rule breakdown for Blockly; `versionMismatch: true` if student's version ≠ current version
- Given `PUT /api/v1/submissions/{id}/grade` with `tutorScore` and `tutorComment`
  When saved
  Then `tutor_score` and `tutor_comment` are persisted; tutor score takes priority over auto score in all displays

**Technical constraints:**
- `batchId` stored in server-side session or short-lived cache (5-minute TTL) to prevent replay attacks on the duplicate endpoint
- `versionMismatch` computed at query time: compare `submissions.exercise_version_id` with `exercises.current_version_id`

**Dependencies:** T6.2.1

---

#### T6.2.3 — Grade CSV export API `[P0]`

**Description:** Implement `GET /api/v1/submissions/export-csv` streaming a CSV file with optional `exerciseId` filter.

**Acceptance Criteria:**
- Given `GET /api/v1/submissions/export-csv` with no filters
  When called
  Then a CSV is streamed with columns: Student Name, Exercise Title, Exercise Type, Auto Score, Tutor Score, Tutor Comment, Submitted At
- Given `?exerciseId=5` filter
  When called
  Then only submissions for exercise 5 are included
- Given the tutor score is null
  When the row is written
  Then the Tutor Score cell is empty (not "null")

**Technical constraints:**
- Apache Commons CSV 1.11.x
- `Content-Type: text/csv; charset=UTF-8`; `Content-Disposition: attachment; filename="grades_YYYY-MM-DD.csv"`
- Stream directly to `HttpServletResponse`; do not buffer entire result set in memory

**Dependencies:** T6.2.2

---

### S6.3 — Grading Frontend `[P0]`

#### T6.3.1 — Submission import UI `[P0]`

**Description:** Build the tutor submission import page: drag-and-drop file upload (JSON or ZIP), per-file result table, duplicate handling prompt, and progress indicator.

**Acceptance Criteria:**
- Given the tutor drags JSON or ZIP files onto the drop zone
  When files are dropped
  Then a "Importing…" spinner is shown; on completion, a results table appears with one row per file
- Given a file comes back as DUPLICATE
  When shown in the results table
  Then a "Force Import" button is available on that row
- Given the tutor clicks "Force Import"
  When confirmed
  Then the duplicate is re-imported and the row status updates to IMPORTED
- Given a file comes back as FAILED
  When shown in the results table
  Then the error message is displayed in a tooltip or expanded row

**Technical constraints:**
- Drop zone accepts `.json` and `.zip` only (MIME type + extension validation)
- No page reload on import completion
- Summary bar at top: "X imported, Y duplicates, Z failed"

**Dependencies:** T6.2.1, T6.2.2, T2.3.1

---

#### T6.3.2 — Submission list and detail UI `[P0]`

**Description:** Build the submission list page (filterable by exercise, student name, type) and the submission detail page showing read-only workspace/code, grading breakdown, and manual grading form.

**Acceptance Criteria:**
- Given the tutor opens the submission list
  When filtered by exercise
  Then only submissions for that exercise are shown; each row shows student name, auto score, tutor score (if set), submission date
- Given the tutor opens a Blockly submission detail
  When the page loads
  Then a read-only Blockly workspace renders the student's `workspaceXml`; the grading breakdown shows each rule result
- Given the tutor opens a Python submission detail
  When the page loads
  Then the student's code is shown in a read-only Monaco editor; each test case shows input, expected, actual, pass/fail
- Given a `versionMismatch` flag is true
  When the detail page loads
  Then a warning banner reads: "This submission was answered against version N. The exercise has since been updated to version M."
- Given the tutor enters a score and comment and clicks Save
  When saved
  Then a success toast appears; the tutor score is shown in the submission list

**Technical constraints:**
- Read-only Blockly workspace: inject workspace XML and disable all editing interactions
- Read-only Monaco: `readOnly: true` option
- Tutor score: number input, 0–100, decimal allowed; comment: textarea, max 500 chars

**Dependencies:** T6.2.2, T6.3.1

---

#### T6.3.3 — Grade export UI `[P0]`

**Description:** Add an "Export CSV" button to the submission list page with an optional exercise filter.

**Acceptance Criteria:**
- Given the tutor is on the submission list
  When they click "Export CSV"
  Then the browser downloads a CSV file with today's date in the filename
- Given the list is filtered by a specific exercise
  When "Export CSV" is clicked
  Then the CSV contains only submissions for that exercise

**Technical constraints:**
- Triggered via `<a href="/api/v1/submissions/export-csv?exerciseId=X" download>` — no JS fetch needed
- Auth header must be passed; use a short-lived download token or cookie-based approach since `<a download>` cannot set headers

**Dependencies:** T6.2.3, T6.3.2

---

## E7 — Student Progress

**Goal:** Students can view their practice history, grades, and a summary of overall performance.

---

### S7.1 — Progress Backend `[P0]`

#### T7.1.1 — Student progress API `[P0]`

**Description:** Implement `GET /api/v1/student/progress` returning a per-exercise status breakdown and summary statistics.

**Acceptance Criteria:**
- Given the student has submitted exercise A (imported by tutor) with tutor score 80
  When `GET /api/v1/student/progress` is called
  Then exercise A shows `status: "GRADED"`, `score: 80`, `scoreSource: "TUTOR"`
- Given the student has exported exercise B but it has not been imported by the tutor
  When progress is called
  Then exercise B shows `status: "ATTEMPTED"` (determined by whether a submission exists in DB)
- Given exercise C has no submission
  When progress is called
  Then exercise C shows `status: "NOT_ATTEMPTED"`
- Given the student has multiple submissions for the same exercise
  When progress is called
  Then the highest score is shown
- Given the summary
  When computed
  Then `passRate` counts exercises with score ≥ 60 as a percentage of graded exercises

**Technical constraints:**
- "Attempted" status = submission exists in DB for that student (identified by `studentName` matching `users.display_name`)
- Exercises returned respect `course_filter_enabled` (same logic as browse endpoint)
- Query must not perform N+1 selects; use JPA fetch join or native query

**Dependencies:** T5.1.1, T6.2.2

---

### S7.2 — Progress Frontend `[P0]`

#### T7.2.1 — Student progress page `[P0]`

**Description:** Build the student "My Progress" page showing summary stats and per-exercise status list.

**Acceptance Criteria:**
- Given the student opens "My Progress"
  When the page loads
  Then the top section shows: Total Exercises, Attempted, Graded, Average Score, Pass Rate — all as styled stat cards
- Given the per-exercise list
  When rendered
  Then each row shows: exercise title, type icon, difficulty badge, status chip (NOT ATTEMPTED / ATTEMPTED / GRADED), and score if graded
- Given the student has a graded exercise with tutor score
  When the score is shown
  Then it is labelled "Tutor Score" to distinguish from auto score

**Technical constraints:**
- Status chip colours: grey (not attempted), amber (attempted), green (graded, score ≥ 60), red (graded, score < 60)
- Pass rate calculation displayed as percentage with one decimal place

**Dependencies:** T7.1.1, T2.3.1

---

## E8 — Admin & Global Settings

**Goal:** Super admin can toggle the global course filter with impact preview, and access all admin functions from a dashboard.

---

### S8.1 — Global Settings Backend `[P0]`

#### T8.1.1 — Global settings and course filter API `[P0]`

**Description:** Implement `GET /api/v1/settings`, `PUT /api/v1/settings/course-filter`, and `GET /api/v1/settings/course-filter/impact`.

**Acceptance Criteria:**
- Given `GET /api/v1/settings`
  When called by SUPER_ADMIN
  Then `{ "courseFilterEnabled": false }` (or `true`) is returned reflecting the DB value
- Given `GET /api/v1/settings/course-filter/impact`
  When called
  Then it returns the count and list of students not enrolled in any course
- Given `PUT /api/v1/settings/course-filter` with `{ "enabled": true }`
  When called
  Then the `global_settings` row is updated; the response includes the impact assessment (unenrolled students)
- Given a subsequent `GET /api/v1/student/exercises` by an unenrolled student
  When the filter is enabled
  Then an empty list is returned

**Technical constraints:**
- `global_settings` read is cached with a 30-second Spring cache TTL; write invalidates the cache
- Only SUPER_ADMIN can call `PUT`; `GET` is accessible to all authenticated roles (needed by exercise browse service)

**Dependencies:** T3.2.3, T2.1.4

---

### S8.2 — Global Settings Frontend `[P0]`

#### T8.2.1 — Admin dashboard and global settings UI `[P0]`

**Description:** Build the SUPER_ADMIN dashboard with navigation cards and the global settings page featuring the course filter toggle with impact warning dialog.

**Acceptance Criteria:**
- Given SUPER_ADMIN logs in
  When redirected to the dashboard
  Then three navigation cards are shown: User Management, Global Settings, Category Management
- Given the admin opens Global Settings
  When the page loads
  Then the current filter status (ON/OFF) is shown with a toggle button
- Given the admin clicks the toggle to enable the filter
  When the impact endpoint shows N > 0 unenrolled students
  Then a confirmation dialog appears listing the unenrolled students before the change is committed
- Given the admin confirms
  When the API call completes
  Then the toggle updates and a toast confirms the change

**Technical constraints:**
- The impact warning dialog must show student usernames and display names (not just a count)
- Toggle must be disabled while the API call is in-flight to prevent double-submit

**Dependencies:** T8.1.1, T2.3.1

---

## E9 — Monitoring & Operations

**Goal:** Prometheus metrics, Grafana dashboards, and structured logging are in place before go-live.

---

### S9.1 — Observability `[P0]`

#### T9.1.1 — Prometheus metrics and Grafana dashboard `[P0]`

**Description:** Configure Micrometer to expose JVM, HTTP, and custom metrics to Prometheus; set up a Grafana dashboard with key panels.

**Acceptance Criteria:**
- Given the application is running
  When Prometheus scrapes `GET /actuator/prometheus`
  Then JVM memory, GC pause, HTTP request rate, HTTP error rate, and active DB connections are present
- Given the Grafana dashboard is opened
  When viewed
  Then it shows: request rate (req/s), p95 latency, error rate (5xx), JVM heap used, active DB connections
- Given the sandbox container is slow to respond
  When the grading service calls it
  Then a `sandbox.grading.duration` histogram metric is visible in Prometheus

**Technical constraints:**
- Micrometer 1.12.x with `management.endpoints.web.exposure.include=prometheus,health`
- Grafana data source auto-provisioned via `provisioning/datasources/prometheus.yml`
- Dashboard provisioned via JSON file in `provisioning/dashboards/`

**Dependencies:** T1.1.3

---

#### T9.1.2 — Structured JSON logging `[P0]`

**Description:** Configure Logback with the Logstash encoder to output structured JSON logs including `traceId`, `userId`, `role`, and `requestPath` on every log line.

**Acceptance Criteria:**
- Given any HTTP request is processed
  When the log line is written
  Then it contains JSON fields: `timestamp`, `level`, `message`, `traceId`, `userId`, `role`, `method`, `path`, `statusCode`, `durationMs`
- Given an import operation processes 10 files
  When the batch completes
  Then each file's outcome is logged at INFO with `batchId`, `filename`, `status`, `autoScore`

**Technical constraints:**
- Logback + Logstash Encoder 7.4.x
- MDC populated in JWT filter: `userId`, `role`
- `traceId` generated per request (UUID); added to MDC and `X-Trace-ID` response header

**Dependencies:** T2.1.3

---

## E10 — P1 Features

**Goal:** Post-MVP enhancements that improve student engagement and account self-management.

---

### S10.1 — Exercise Likes `[P1]`

#### T10.1.1 — Like toggle API `[P1]`

**Description:** Implement `POST /api/v1/exercises/{id}/like` as a toggle endpoint supporting both authenticated and anonymous likes with deduplication.

**Acceptance Criteria:**
- Given an authenticated student calls `POST /api/v1/exercises/{id}/like`
  When the student has not yet liked the exercise
  Then a like row is created with `user_id`; `likeCount` increments; response `{ "liked": true, "likeCount": N }`
- Given the same student likes again
  When called
  Then the like row is deleted; `likeCount` decrements; response `{ "liked": false, "likeCount": N-1 }`
- Given an unauthenticated request with a `browserId` header
  When the exercise is liked
  Then a like row is created with `browser_id` and null `user_id`; deduplication uses `uk_like_browser`
- Given `GET /api/v1/student/exercises/{id}`
  When called by an authenticated student who has liked the exercise
  Then `"liked": true` is included in the response

**Technical constraints:**
- `browserId`: client-generated UUID stored in `localStorage`; max 128 chars
- `exercise_likes` unique constraints enforce deduplication at DB level
- `likeCount` on `exercises` table updated via `UPDATE exercises SET like_count = like_count ± 1` (not recounted each time)

**Dependencies:** T4.1.2, T2.1.4

---

#### T10.1.2 — Like button UI `[P1]`

**Description:** Add a like button to the student exercise list cards and the exercise detail page.

**Acceptance Criteria:**
- Given the student views the exercise list
  When the page loads
  Then each card shows a ♥ icon with the like count
- Given the student clicks the like button on an exercise they have not liked
  When clicked
  Then the icon fills, the count increments optimistically; the API call confirms
- Given the API call fails
  When the optimistic update is rolled back
  Then the icon reverts and a subtle error toast is shown

**Technical constraints:**
- Optimistic UI update before API response
- `browserId` generated once and stored in `localStorage` for anonymous use
- Like button accessible without login (anonymous like flow)

**Dependencies:** T10.1.1, T5.2.3, T5.2.4

---

### S10.2 — PythonTutor Integration `[P1]`

#### T10.2.1 — PythonTutor visualisation embed `[P1]`

**Description:** Add a "Visualize Execution" button to the Python practice page that opens an embedded PythonTutor visualisation in a modal.

**Acceptance Criteria:**
- Given the student is on a Python exercise page
  When they click "Visualize Execution"
  Then a modal opens with an iframe embedding `https://pythontutor.com/iframe-embed.html` pre-populated with the current editor code
- Given the iframe loads
  When the student steps through execution
  Then variable state and call stack are shown step by step without leaving the platform
- Given the code is empty
  When the button is clicked
  Then the button is disabled with a tooltip "Enter some code first"

**Technical constraints:**
- PythonTutor URL parameters: `code=<urlencoded>`, `mode=display`, `origin=opt-frontend.appspot.com`
- Modal must be closable; iframe should be destroyed on close to free memory
- No backend changes required — pure frontend integration

**Dependencies:** T5.2.4

---

### S10.3 — Profile Management `[P1]`

#### T10.3.1 — Profile API `[P1]`

**Description:** Implement `GET /api/v1/profile`, `PUT /api/v1/profile` (display name), `PUT /api/v1/profile/password`.

**Acceptance Criteria:**
- Given `PUT /api/v1/profile` with a new `displayName`
  When saved
  Then the `users.display_name` is updated; subsequent API responses reflect the new name immediately
- Given `PUT /api/v1/profile/password` with correct `currentPassword` and a new `newPassword`
  When submitted
  Then the password hash is updated and all `refresh_tokens` rows for that user except the current session are deleted
- Given `PUT /api/v1/profile/password` with incorrect `currentPassword`
  When submitted
  Then 400 `INVALID_CREDENTIALS`
- Given `newPassword` is fewer than 8 characters
  When submitted
  Then 400 `VALIDATION_ERROR`

**Technical constraints:**
- `newPassword` validation: min 8 chars, at least one letter and one digit
- Current session refresh token is NOT deleted on password change (to avoid forcing re-login mid-session)
- Display name change is immediately reflected (no caching issue since it is fetched from DB)

**Dependencies:** T2.1.4, T2.1.2

---

#### T10.3.2 — Profile page UI `[P1]`

**Description:** Build the user profile page accessible from the top navigation, with a display name edit form and a password change form.

**Acceptance Criteria:**
- Given any logged-in user clicks their name in the top nav
  When the profile page opens
  Then their current display name and username (read-only) are shown
- Given the user edits their display name and saves
  When saved
  Then the name in the top navigation bar updates immediately without a page reload
- Given the user submits the password change form
  When the current password is correct
  Then a success toast appears; they remain logged in

**Technical constraints:**
- Two separate form sections on the page (not a single form)
- Password fields: current password, new password, confirm new password — confirm validated client-side only
- Username field is display-only (no input)

**Dependencies:** T10.3.1, T2.3.1

---

## Dependency Map Summary

```
T1.1.1 ──► T1.2.1 ──► T2.1.1 ──► T2.1.2 ──► T2.1.3 ──► T2.1.4
                                                              │
T1.1.2 ──► T1.1.3 ──► T1.1.5                                 │
T1.1.4 ──► T1.1.5                                             │
T1.2.1 ──► T1.2.2                                             │
                                                              ▼
T2.1.4 ──► T2.2.1                                   T3.1.1, T3.2.1
T2.1.4 ──► T3.1.1 ──► T4.1.2 ──► T4.1.3            T4.1.1, T5.1.1
T2.1.4 ──► T3.2.1 ──► T3.2.2 ──► T5.1.1            T6.2.1, T7.1.1
                   └── T3.2.3 ──► T5.1.1
T4.1.2 ──► T4.1.3
T4.1.2 ──► T4.1.4
T4.1.1 ──► T6.1.1 ──► T6.1.2 ──► T6.2.1 ──► T6.2.2 ──► T6.2.3
T1.1.2 ──► T6.1.2
T1.1.4 ──► T5.2.1 ──► T5.2.3
T1.1.4 ──► T5.2.2 ──► T5.2.4
T5.1.1 ──► T7.1.1
T6.2.2 ──► T7.1.1
T3.2.3 ──► T8.1.1
T8.1.1 ──► T8.2.1
T1.1.3 ──► T9.1.1
T2.1.3 ──► T9.1.2

P1 (after all P0 complete):
T4.1.2 ──► T10.1.1 ──► T10.1.2
T5.2.4 ──► T10.2.1
T2.1.2 ──► T10.3.1 ──► T10.3.2
```

---

## Task Count Summary

| Epic | P0 Tasks | P1 Tasks | Total |
|---|---|---|---|
| E1 Infrastructure | 5 | 0 | 5 |
| E2 Auth & Users | 5 | 0 | 5 |
| E3 Category & Course | 5 | 0 | 5 |
| E4 Exercise Management | 7 | 0 | 7 |
| E5 Student Practice | 4 | 0 | 4 |
| E6 Submission & Grading | 6 | 0 | 6 |
| E7 Student Progress | 2 | 0 | 2 |
| E8 Admin & Settings | 2 | 0 | 2 |
| E9 Monitoring | 2 | 0 | 2 |
| E10 P1 Features | 0 | 6 | 6 |
| **Total** | **38** | **6** | **44** |