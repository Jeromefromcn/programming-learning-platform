# Technical Architecture Document
# Multi-Type Programming Exercise Platform

**Version:** 1.0
**Date:** 2026-04-14
**Based on:** PRD v2.0 (2026-04-12)

---

## Table of Contents

1. [Technology Stack & Decisions](#1-technology-stack--decisions)
2. [System Module Diagram & Data Flow](#2-system-module-diagram--data-flow)
3. [Database Schema Design](#3-database-schema-design)
4. [Core API Specification](#4-core-api-specification)
5. [Cross-Cutting Concerns](#5-cross-cutting-concerns)

---

## 1. Technology Stack & Decisions

### 1.1 Stack Overview

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend** | React | 18.3.1 | SPA framework |
| | React Router | 6.x | Client-side routing |
| | Vite | 5.x | Build tool, HMR |
| | Blockly | 12.5.0 | Visual block editor |
| | Pyodide | 0.26.x | In-browser Python (WASM) |
| | Monaco Editor | 0.50.x | Python code editor (syntax highlight, autocomplete) |
| | Nginx | 1.25 (Alpine) | Static serving + reverse proxy |
| **Backend** | Java | 17 (Eclipse Temurin) | Runtime |
| | Spring Boot | 3.2.5 | Application framework |
| | Maven | 3.9.x | Build & dependency management |
| | Spring Security + JWT | JJWT 0.12.6 | Authentication & authorization |
| | Spring Data JPA | 3.2.x | ORM / data access |
| | Flyway | 9.x | Database migration |
| | Rhino | 1.7.x | Server-side JS execution (Blockly grading) |
| | Apache Commons CSV | 1.11.x | CSV export |
| | Lombok | 1.18.x | Boilerplate reduction |
| | Logback + Logstash Encoder | 7.4.x | Structured JSON logging |
| **Python Sandbox** | Python | 3.12 (Alpine) | Server-side Python auto-grading |
| | nsjail | 3.4 | Process-level sandboxing |
| **Database** | MySQL | 8.0 | Primary data store |
| | H2 | 2.2.x | In-memory test DB |
| **Monitoring** | Prometheus | 2.51.x | Metrics collection |
| | Micrometer | 1.12.x | JVM metrics bridge |
| | Grafana | 10.x | Dashboards & alerting |
| | Spring Boot Actuator | 3.2.x | Health checks, metrics endpoint |
| **Infrastructure** | Docker | 24.x | Containerization |
| | Docker Compose | 2.x | Orchestration (single-server) |

### 1.2 Key Architectural Decisions

#### ADR-1: Client-Side Code Execution Strategy

**Blockly (Student "Run" button):**
Blockly generates JavaScript code via its built-in code generator. Client-side execution runs this JS inside a Web Worker with a timeout. The Web Worker provides natural browser sandboxing — no filesystem, no network, isolated memory.

**Python (Student "Run" button):**
Pyodide (CPython compiled to WebAssembly) runs inside a Web Worker. This gives students a real Python runtime in-browser without any server round-trip. The Web Worker enforces the time limit; if execution exceeds the configured limit, the worker is terminated and a "Time Limit Exceeded" message is shown.

**Why not server-side for the "Run" button?**
- Zero latency for student practice — no network round-trip
- No server load from hundreds of students running code simultaneously during lab sessions
- Browser naturally sandboxes execution (no filesystem/network escape)

##### ADR-1a: Infinite Loop Defense (Client-Side)

Student code (especially from beginners) frequently produces infinite loops. Since the browser's main thread must remain responsive at all times, the platform uses a two-layer defense:

**Layer 1 — Blockly Loop Trap (proactive, catches 99% of cases):**

Blockly provides a native `INFINITE_LOOP_TRAP` API. Before code generation, the platform sets:

```javascript
// Injected before every loop iteration in generated JS
Blockly.JavaScript.INFINITE_LOOP_TRAP =
  'if (--__loopCounter <= 0) throw new Error("INFINITE_LOOP");\n';
```

The generated code for any loop block (repeat, while, for-each) will include a decrement-and-check at the top of every iteration body. The platform prepends a counter initialization to the generated code before sending it to the Web Worker:

```javascript
// Prepended to generated code before execution
const executableCode = `var __loopCounter = 10000;\n` + generatedCode;
```

When the counter hits zero, a JS exception is thrown immediately — the loop never gets to "hang." The Web Worker catches the error and posts a structured message back to the main thread:

```javascript
// Inside Web Worker
try {
  eval(executableCode);
  self.postMessage({ type: 'success', output: capturedOutput });
} catch (e) {
  if (e.message === 'INFINITE_LOOP') {
    self.postMessage({ type: 'error', errorType: 'INFINITE_LOOP',
      message: 'Your code has an infinite loop. Check your loop conditions.' });
  } else {
    self.postMessage({ type: 'error', errorType: 'RUNTIME_ERROR', message: e.message });
  }
}
```

This provides an immediate, user-friendly error message without any delay.

**Layer 2 — Web Worker hard kill (fallback safety net):**

If the loop trap is somehow bypassed (e.g., a recursive call without loop blocks, or a non-loop construct causing a hang), the main thread enforces a hard timeout:

```javascript
// Main thread — Worker lifecycle manager
class CodeRunner {
  constructor(timeoutMs = 5000) {
    this.timeoutMs = timeoutMs;
    this.worker = null;
  }

  execute(code) {
    return new Promise((resolve, reject) => {
      // Always create a fresh worker (cheap, avoids stale state)
      this.worker = new Worker('/workers/blockly-runner.js');

      const timer = setTimeout(() => {
        this.worker.terminate();   // Hard kill — cannot be blocked by JS
        this.worker = null;
        reject({
          errorType: 'TIMEOUT',
          message: 'Code execution exceeded the time limit.'
        });
      }, this.timeoutMs);

      this.worker.onmessage = (e) => {
        clearTimeout(timer);
        this.worker.terminate();
        this.worker = null;
        if (e.data.type === 'success') resolve(e.data);
        else reject(e.data);
      };

      this.worker.onerror = (e) => {
        clearTimeout(timer);
        this.worker.terminate();
        this.worker = null;
        reject({ errorType: 'WORKER_ERROR', message: e.message });
      };

      this.worker.postMessage({ code });
    });
  }
}
```

Key design points:
- `worker.terminate()` is called from the main thread and is **non-blockable** — even an infinite loop inside the Worker cannot prevent termination.
- A fresh Worker is created for every execution. This avoids the complexity of "resetting" a Worker's state and ensures no leaked variables between runs.
- The UI disables the "Run" button during execution and re-enables it on completion/timeout, preventing rapid re-clicks from spawning multiple Workers.

**Layer interaction:**

| Scenario | Layer 1 (Loop Trap) | Layer 2 (Worker Kill) | User Experience |
|---|---|---|---|
| `while(true)` loop | Catches at 10,000 iterations (~instant) | Not triggered | Immediate error: "Infinite loop detected" |
| Extremely slow valid loop (>5s) | Not triggered (under 10K iterations) | Kills at timeout | Error: "Time limit exceeded" |
| Infinite recursion (no loop blocks) | Not applicable (no loop trap injected) | Kills at timeout | Error: "Time limit exceeded" |
| Stack overflow from recursion | Not applicable | JS engine throws `RangeError` naturally | Error: "Maximum call stack size exceeded" |

**Python (Pyodide) infinite loop defense:**

Pyodide runs in a Web Worker and has the same Layer 2 (hard kill) protection. Python does not have an equivalent of Blockly's loop trap injection, but `worker.terminate()` reliably kills WASM execution. For Python exercises, the timeout is the sole defense, which is acceptable because:
- Python exercises are for more advanced students who are expected to handle loop logic
- The Pyodide Web Worker is fully isolated — an infinite loop freezes only the Worker, never the main thread
- The timeout message guides the student: "Your code exceeded the time limit. Check for infinite loops."

#### ADR-2: Server-Side Grading Sandbox

**Blockly grading:**
Rhino JS engine runs Blockly-generated JavaScript in a sandboxed context. Rhino allows fine-grained control: disable Java class access, set instruction count limits, restrict available APIs to `print()` only.

Infinite loop defense on the server side uses Rhino's `Context.setInstructionObserverThreshold()`:

```java
// RhinoSandbox.java — server-side Blockly execution
public class RhinoSandbox {
    private static final int MAX_INSTRUCTIONS = 500_000;

    public ExecutionResult execute(String jsCode) {
        Context cx = Context.enter();
        try {
            // Instruction observer fires every N instructions
            cx.setInstructionObserverThreshold(10_000);
            cx.setOptimizationLevel(-1); // Interpreter mode (required for observer)

            // Custom observer that counts total instructions
            final int[] count = {0};
            cx.setGenerateObserverCount(true);

            Scriptable scope = cx.initSafeStandardObjects();

            // Inject only console.print, block everything else
            scope.put("print", scope, new PrintFunction(outputBuffer));

            // Wrap execution with instruction limit
            cx.executeScript(jsCode, scope, new ContextFactory() {
                @Override
                protected void observeInstructionCount(Context cx, int instructionCount) {
                    count[0] += instructionCount;
                    if (count[0] > MAX_INSTRUCTIONS) {
                        throw new Error("INFINITE_LOOP: Instruction limit exceeded");
                    }
                }
            });

            return ExecutionResult.success(outputBuffer.toString());
        } catch (Error e) {
            if (e.getMessage().contains("INFINITE_LOOP")) {
                return ExecutionResult.infiniteLoop();
            }
            return ExecutionResult.runtimeError(e.getMessage());
        } finally {
            Context.exit();
        }
    }
}
```

This approach is deterministic and precise — it counts actual bytecode instructions rather than wall-clock time, making it immune to CPU load variance. The 500K instruction limit maps roughly to a 3-second equivalent on typical hardware. Combined with `initSafeStandardObjects()` (no Java class access), this fully contains student code on the JVM side.

**Python grading:**
A dedicated `sandbox` Docker container runs Python 3.12 inside nsjail. The Spring Boot backend communicates with this container over an internal HTTP API. nsjail provides:
- Network disabled (no egress)
- Filesystem read-only (only `/tmp` writable, size-limited)
- Memory limit: 128 MB per execution
- Time limit: configurable per exercise (default 5s)
- PID limit: 32 (prevents fork bombs)
- No `import os`, `import subprocess`, `import socket` — blocked via a restricted import hook

**Architecture:**

```
Spring Boot ──HTTP POST──▶ Sandbox Container (Python + nsjail)
                            │
                            ├─ Receives: student code + test cases + time limit
                            ├─ Spawns nsjail process per submission
                            ├─ Runs each test case sequentially
                            └─ Returns: per-test results (pass/fail/timeout/error)
```

#### ADR-3: Authentication — JWT with DB-Backed Status Check

**Strategy:** Access token (30 min) + Refresh token (7 days).

- Access token: short-lived JWT containing `userId`, `role`, `jti`. Stored in memory (frontend).
- Refresh token: long-lived, stored in `refresh_tokens` DB table + sent as HttpOnly cookie.
- **Every authenticated request** checks `users.status = 'ACTIVE'` from DB. With a small user base (hundreds), this per-request DB hit is negligible and eliminates the need for a Redis-based blacklist.
- **User disable flow:** Set `users.status = 'DISABLED'` → delete all rows in `refresh_tokens` for that user → next request with any existing access token fails the status check.

**Why not Redis?**
The platform serves a single university with hundreds of users, not millions. A per-request DB check on an indexed `users` table is sub-millisecond. Adding Redis increases operational complexity without meaningful benefit at this scale.

#### ADR-4: File Storage — Local Filesystem

Student answer files (JSON) are transient: uploaded by tutors, parsed, and stored as structured data in the database. The original files are not retained long-term. Exported CSVs are generated on-the-fly and streamed to the client.

No object storage (MinIO/S3) is needed. The `/data/uploads` directory on the host is mounted into the backend container for temporary file handling during import.

#### ADR-5: Single-Server Docker Compose Deployment

The platform targets a single university. All services run on one server via Docker Compose with a custom bridge network. This simplifies operations for the IT team (Persona 3) who are not DevOps specialists.

Port mapping:
| Service | Internal Port | External Port |
|---|---|---|
| Nginx (frontend + proxy) | 80 | **80** |
| Spring Boot API | 8080 | — (internal only) |
| Python Sandbox | 5000 | — (internal only) |
| MySQL | 3306 | — (internal only) |
| Prometheus | 9090 | **9090** |
| Grafana | 3000 | **3001** |

---

## 2. System Module Diagram & Data Flow

### 2.1 Container Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Docker Compose — Custom Bridge Network: exercise-platform-net      │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   Nginx      │    │  Spring Boot     │    │  Python Sandbox  │  │
│  │   :80        │───▶│  API Server      │───▶│  (nsjail)        │  │
│  │              │    │  :8080           │    │  :5000           │  │
│  │  - Static    │    │                  │    │                  │  │
│  │    files     │    │  - Auth          │    │  - Receives code │  │
│  │  - Reverse   │    │  - REST API      │    │  - Runs in jail  │  │
│  │    proxy     │    │  - Rhino (JS)    │    │  - Returns result│  │
│  │    /api/*    │    │  - File import   │    │                  │  │
│  └──────────────┘    │  - Auto-grading  │    └──────────────────┘  │
│                      │                  │                          │
│                      └────────┬─────────┘                          │
│                               │                                    │
│                      ┌────────▼─────────┐                          │
│                      │   MySQL 8.0      │                          │
│                      │   :3306          │                          │
│                      │                  │                          │
│                      │  - exercise-db   │                          │
│                      └──────────────────┘                          │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐                          │
│  │  Prometheus  │───▶│  Grafana         │                          │
│  │  :9090       │    │  :3000 → ext:3001│                          │
│  └──────────────┘    └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Application Module Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React SPA)              │
│                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐ │
│  │  Auth   │ │Exercise │ │ Course  │ │ Student  │ │
│  │  Module │ │ Mgmt    │ │ Mgmt    │ │ Practice │ │
│  └────┬────┘ └────┬────┘ └────┬────┘ └─────┬────┘ │
│  ┌────┴────┐ ┌────┴────┐ ┌────┴────┐ ┌─────┴────┐ │
│  │ Admin   │ │Grading  │ │Progress │ │ Category │ │
│  │ Panel   │ │ Module  │ │ Module  │ │ Mgmt     │ │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘ │
│                                                     │
│  Shared: Blockly Workspace | Monaco Editor          │
│          Pyodide Worker    | JS Exec Worker         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP (JSON)
                       ▼
┌─────────────────────────────────────────────────────┐
│                Backend (Spring Boot)                 │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │          Security Filter Chain               │   │
│  │  JWT Filter → Role Check → Rate Limiter      │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │                           │
│  ┌──────────┐ ┌────────┴───┐ ┌──────────────────┐  │
│  │ Auth     │ │ Exercise   │ │ Course           │  │
│  │ Controller│ │ Controller │ │ Controller       │  │
│  └────┬─────┘ └─────┬──────┘ └───────┬──────────┘  │
│  ┌────┴─────┐ ┌─────┴──────┐ ┌───────┴──────────┐  │
│  │ User     │ │ Submission │ │ Category         │  │
│  │Controller│ │ Controller │ │ Controller       │  │
│  └────┬─────┘ └─────┬──────┘ └───────┬──────────┘  │
│  ┌────┴─────┐ ┌─────┴──────┐ ┌───────┴──────────┐  │
│  │ Settings │ │ Progress   │ │ Global Error     │  │
│  │Controller│ │ Controller │ │ Handler          │  │
│  └──────────┘ └────────────┘ └──────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │              Service Layer                   │   │
│  │                                              │   │
│  │  AuthService    ExerciseService              │   │
│  │  UserService    SubmissionService            │   │
│  │  CourseService  GradingService               │   │
│  │  CategoryService ProgressService             │   │
│  │  SettingsService FileImportService           │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │                           │
│  ┌──────────────────────┴───────────────────────┐   │
│  │           Grading Engine                     │   │
│  │                                              │   │
│  │  BlocklyGrader (Rhino)  PythonGrader (HTTP)  │   │
│  │  └─ Output matching     └─ Calls sandbox     │   │
│  │  └─ Block analysis        container          │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │         Repository Layer (Spring Data JPA)   │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │                           │
└─────────────────────────┼───────────────────────────┘
                          ▼
                    ┌───────────┐
                    │  MySQL    │
                    └───────────┘
```

### 2.3 Core Data Flows

#### Flow 1: Student Practices an Exercise (Client-Side Execution)

```
Student Browser
    │
    ├─ 1. GET /api/exercises/{id} → Load exercise definition
    │
    ├─ 2. Student writes code in Blockly workspace or Monaco editor
    │
    ├─ 3. Click "Run"
    │     ├─ Blockly: generate JS → post to Web Worker → execute → capture console.log
    │     └─ Python: post code to Pyodide Web Worker → execute → capture stdout
    │
    ├─ 4. Display output / test case results in UI
    │
    └─ 5. Click "Export"
          └─ Generate JSON locally → browser download
              {
                exerciseId, exerciseVersion, exerciseType,
                studentName, answer (blockly XML or python code),
                exportedAt (ISO timestamp)
              }
```

#### Flow 2: Tutor Imports & Grades Submissions

```
Tutor Browser                        Spring Boot                    Sandbox
    │                                     │                            │
    ├─ 1. POST /api/submissions/import    │                            │
    │      (multipart: JSON/ZIP files)    │                            │
    │                                     │                            │
    │      ┌──────────────────────────────┤                            │
    │      │ 2. Validate & parse files    │                            │
    │      │    - ZIP: check path traversal, extract                   │
    │      │    - JSON: validate schema                                │
    │      │    - Check exercise exists                                │
    │      │    - Check duplicates                                     │
    │      │    - Detect version mismatch                              │
    │      └──────────────────────────────┤                            │
    │                                     │                            │
    │      ┌──────────────────────────────┤                            │
    │      │ 3. Auto-grade each file      │                            │
    │      │    ├─ Blockly → Rhino engine  │                            │
    │      │    └─ Python ─────────────────┼── 4. POST /execute ──────▶│
    │      │                              │       { code, tests,       │
    │      │                              │         timeLimit }        │
    │      │                              │◀── 5. Response ────────────│
    │      │                              │       { results[] }        │
    │      └──────────────────────────────┤                            │
    │                                     │                            │
    ├─ 6. Response: import results        │                            │
    │      (per-file status, scores,      │                            │
    │       errors, warnings)             │                            │
    │                                     │                            │
    ├─ 7. GET /api/submissions?exerciseId=│                            │
    │      Review list                    │                            │
    │                                     │                            │
    ├─ 8. PUT /api/submissions/{id}/grade │                            │
    │      { tutorScore, comment }        │                            │
    │                                     │                            │
    └─ 9. GET /api/submissions/export-csv │                            │
           → Download CSV                │                            │
```

#### Flow 3: Authentication & Session Lifecycle

```
Client                              Spring Boot                    MySQL
  │                                     │                            │
  ├─ POST /api/auth/login               │                            │
  │   { username, password }            │                            │
  │                                     ├── Check credentials ──────▶│
  │                                     │◀── User record ───────────│
  │                                     │                            │
  │                                     ├── Generate access token    │
  │                                     ├── Generate refresh token   │
  │                                     ├── Store refresh token ────▶│
  │                                     │                            │
  │◀── { accessToken, user }            │                            │
  │    + Set-Cookie: refreshToken       │                            │
  │                                     │                            │
  ├─ GET /api/* (with Authorization)    │                            │
  │                                     ├── Validate JWT             │
  │                                     ├── Check user.status ──────▶│
  │                                     │◀── ACTIVE / DISABLED ─────│
  │                                     │                            │
  │                                     ├── If DISABLED → 401        │
  │                                     ├── If ACTIVE → proceed      │
  │                                     │                            │
  ├─ POST /api/auth/refresh             │                            │
  │   (Cookie: refreshToken)            │                            │
  │                                     ├── Validate refresh token ─▶│
  │                                     ├── Issue new access token   │
  │                                     │                            │
  └─ POST /api/auth/logout              │                            │
       → Delete refresh token ──────────┼──────────────────────────▶│
```

---

## 3. Database Schema Design

### 3.1 Entity Relationship Overview

```
users ─────────┬──── refresh_tokens
               │
               ├──── course_students ────── courses
               │                             │
               │                             ├──── course_exercises ──── exercises
               │                                                          │
               │                                                          ├──── exercise_versions
               │                                                          │
               │                                                          ├──── exercise_likes (P1)
               │                                                          │
               └──── submissions (linked by student_name) ────────────────┘
                                                                          │
                                                              categories ─┘
               global_settings (standalone)
```

### 3.2 DDL — Flyway Migration Scripts

Migration naming convention: `V{version}__{description}.sql`

```sql
-- ============================================================
-- V1__create_schema.sql
-- ============================================================

-- -----------------------------------------------------------
-- 1. users
-- -----------------------------------------------------------
CREATE TABLE users (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(64)     NOT NULL,
    display_name    VARCHAR(128)    NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    role            VARCHAR(20)     NOT NULL COMMENT 'STUDENT | TUTOR | SUPER_ADMIN',
    status          VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE | DISABLED',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_username (username),
    INDEX idx_role (role),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 2. refresh_tokens
-- -----------------------------------------------------------
CREATE TABLE refresh_tokens (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT          NOT NULL,
    token_hash      VARCHAR(255)    NOT NULL COMMENT 'SHA-256 hash of refresh token',
    expires_at      DATETIME        NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at),
    CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 3. categories
-- -----------------------------------------------------------
CREATE TABLE categories (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100)    NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_category_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 4. courses
-- -----------------------------------------------------------
CREATE TABLE courses (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(200)    NOT NULL,
    description     TEXT,
    is_deleted      BOOLEAN         NOT NULL DEFAULT FALSE,
    created_by      BIGINT          NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_is_deleted (is_deleted),
    CONSTRAINT fk_course_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 5. exercises
-- -----------------------------------------------------------
CREATE TABLE exercises (
    id                  BIGINT          AUTO_INCREMENT PRIMARY KEY,
    title               VARCHAR(255)    NOT NULL,
    description         TEXT            NOT NULL,
    type                VARCHAR(20)     NOT NULL COMMENT 'BLOCKLY | PYTHON',
    difficulty          VARCHAR(20)     NOT NULL COMMENT 'EASY | MEDIUM | HARD',
    category_id         BIGINT,
    status              VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT | PUBLISHED',
    current_version_id  BIGINT          COMMENT 'FK to exercise_versions.id — set after first version created',
    is_deleted          BOOLEAN         NOT NULL DEFAULT FALSE,
    like_count          INT             NOT NULL DEFAULT 0 COMMENT 'Denormalized counter for display',
    created_by          BIGINT          NOT NULL,
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_status (status),
    INDEX idx_type (type),
    INDEX idx_is_deleted (is_deleted),
    INDEX idx_category_id (category_id),
    CONSTRAINT fk_ex_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_ex_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 6. exercise_versions
-- -----------------------------------------------------------
CREATE TABLE exercise_versions (
    id                  BIGINT          AUTO_INCREMENT PRIMARY KEY,
    exercise_id         BIGINT          NOT NULL,
    version_number      INT             NOT NULL COMMENT 'Monotonically increasing per exercise',
    title               VARCHAR(255)    NOT NULL,
    description         TEXT            NOT NULL,
    difficulty          VARCHAR(20)     NOT NULL,
    hints               JSON            COMMENT '["hint1", "hint2", ...]',
    config              JSON            NOT NULL COMMENT 'Type-specific config — see below',
    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_exercise_version (exercise_id, version_number),
    CONSTRAINT fk_ev_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- config JSON schema for BLOCKLY:
-- {
--   "allowedBlocks": ["print", "text", "math_number"],
--   "initialWorkspaceXml": "<xml>...</xml>",
--   "showCodeView": true,
--   "gradingRules": {
--     "outputMatch": { "enabled": true, "expectedOutput": "Hello World" },
--     "requiredBlocks": { "enabled": false, "blocks": [] },
--     "forbiddenBlocks": { "enabled": false, "blocks": [] },
--     "blockCountLimit": { "enabled": false, "max": null }
--   }
-- }
--
-- config JSON schema for PYTHON:
-- {
--   "starterCode": "def fizzbuzz(n):\n    pass",
--   "timeLimitSeconds": 5,
--   "testCases": [
--     { "input": "fizzbuzz(3)", "expectedOutput": "\"Fizz\"", "visible": true },
--     { "input": "fizzbuzz(15)", "expectedOutput": "\"FizzBuzz\"", "visible": false }
--   ]
-- }

-- Now add the FK from exercises.current_version_id
ALTER TABLE exercises
    ADD CONSTRAINT fk_ex_current_version
    FOREIGN KEY (current_version_id) REFERENCES exercise_versions(id) ON DELETE SET NULL;

-- -----------------------------------------------------------
-- 7. course_exercises (many-to-many)
-- -----------------------------------------------------------
CREATE TABLE course_exercises (
    course_id       BIGINT          NOT NULL,
    exercise_id     BIGINT          NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (course_id, exercise_id),
    CONSTRAINT fk_ce_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_ce_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 8. course_students (many-to-many)
-- -----------------------------------------------------------
CREATE TABLE course_students (
    course_id       BIGINT          NOT NULL,
    user_id         BIGINT          NOT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (course_id, user_id),
    CONSTRAINT fk_cs_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT fk_cs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 9. submissions
-- -----------------------------------------------------------
CREATE TABLE submissions (
    id                      BIGINT          AUTO_INCREMENT PRIMARY KEY,
    exercise_id             BIGINT          NOT NULL,
    graded_version_id       BIGINT          NOT NULL COMMENT 'Version used for grading (current at import time)',
    student_name            VARCHAR(128)    NOT NULL COMMENT 'From exported JSON — not FK to users',
    exercise_type           VARCHAR(20)     NOT NULL COMMENT 'BLOCKLY | PYTHON — denormalized for query efficiency',
    answer_data             MEDIUMTEXT      NOT NULL COMMENT 'Blockly XML or Python code',
    export_timestamp        DATETIME        NOT NULL COMMENT 'Timestamp from exported JSON file',
    version_mismatch        BOOLEAN         NOT NULL DEFAULT FALSE COMMENT 'True if student version != grading version',
    student_version_number  INT             COMMENT 'Version number from the exported file, if available',
    auto_score              DECIMAL(5,2)    COMMENT '0.00–100.00, NULL if grading failed',
    auto_grade_details      JSON            COMMENT 'Per-aspect or per-test-case breakdown',
    tutor_score             DECIMAL(5,2)    COMMENT '0.00–100.00, NULL if not manually graded',
    tutor_comment           TEXT,
    import_batch_id         VARCHAR(36)     COMMENT 'UUID grouping files from one import operation',
    created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_exercise_id (exercise_id),
    INDEX idx_student_name (student_name),
    INDEX idx_import_batch (import_batch_id),
    INDEX idx_duplicate_check (student_name, exercise_id, export_timestamp),
    CONSTRAINT fk_sub_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
    CONSTRAINT fk_sub_version FOREIGN KEY (graded_version_id) REFERENCES exercise_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- auto_grade_details JSON examples:
--
-- Blockly:
-- {
--   "aspects": [
--     { "type": "OUTPUT_MATCH", "passed": true, "expected": "Hello World", "actual": "Hello World" },
--     { "type": "REQUIRED_BLOCKS", "passed": true, "requiredBlocks": ["print"], "foundBlocks": ["print", "text"] }
--   ],
--   "passedCount": 2,
--   "totalCount": 2
-- }
--
-- Python:
-- {
--   "testCases": [
--     { "index": 0, "input": "fizzbuzz(3)", "expected": "Fizz", "actual": "Fizz", "passed": true, "visible": true },
--     { "index": 1, "input": "fizzbuzz(15)", "expected": "FizzBuzz", "actual": "Fizz", "passed": false, "visible": false, "error": null },
--     { "index": 2, "input": "...", "expected": "...", "actual": null, "passed": false, "visible": false, "error": "TimeoutError" }
--   ],
--   "passedCount": 1,
--   "totalCount": 3
-- }

-- -----------------------------------------------------------
-- 10. exercise_likes (P1)
-- -----------------------------------------------------------
CREATE TABLE exercise_likes (
    id              BIGINT          AUTO_INCREMENT PRIMARY KEY,
    exercise_id     BIGINT          NOT NULL,
    user_id         BIGINT          COMMENT 'NULL if anonymous (not logged in)',
    browser_id      VARCHAR(128)    COMMENT 'Browser fingerprint for anonymous dedup',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE INDEX uk_like_user (exercise_id, user_id),
    UNIQUE INDEX uk_like_browser (exercise_id, browser_id),
    CONSTRAINT fk_el_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
    CONSTRAINT fk_el_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 11. global_settings
-- -----------------------------------------------------------
CREATE TABLE global_settings (
    setting_key     VARCHAR(100)    PRIMARY KEY,
    setting_value   VARCHAR(1000)   NOT NULL,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data
INSERT INTO global_settings (setting_key, setting_value) VALUES
    ('course_filter_enabled', 'false');
```

### 3.3 Indexing Strategy Notes

| Query Pattern | Index Used | PRD Reference |
|---|---|---|
| Login by username | `uk_username` on `users` | §5.1.1 |
| Per-request status check | `uk_username` → PK lookup | ADR-3 |
| Duplicate submission check | `idx_duplicate_check (student_name, exercise_id, export_timestamp)` | §7.2 |
| Student exercise browser | `idx_status`, `idx_is_deleted`, `idx_type`, `idx_category_id` on `exercises` | §5.4.1 |
| Submissions by exercise | `idx_exercise_id` on `submissions` | §5.5.4 |
| Submissions by student | `idx_student_name` on `submissions` | §5.6.1 |
| Refresh token cleanup | `idx_expires_at` on `refresh_tokens` | Scheduled job |

### 3.4 Backup Strategy

- **Automated daily backup:** `mysqldump` via a cron-scheduled Docker container, writing compressed SQL to a mounted host directory.
- **Retention:** 30 days of daily snapshots.
- **Validation:** Weekly restore-test against the H2 test profile (schema compatibility check).
- **Critical rationale:** The PRD's primary pain point is data corruption. The "zero data corruption" success metric means backup/recovery must be a first-class concern.

---

## 4. Core API Specification

### 4.1 General Conventions

**Base URL:** `/api/v1`

**Authentication:** All endpoints except `/api/v1/auth/**` require `Authorization: Bearer <accessToken>` header.

**Role enforcement:** Documented per endpoint as `@Role(STUDENT)`, `@Role(TUTOR)`, or `@Role(SUPER_ADMIN)`. Higher roles inherit lower role permissions (SUPER_ADMIN > TUTOR > STUDENT).

**Standard error response:**

```json
{
  "error": {
    "code": "EXERCISE_NOT_FOUND",
    "message": "Exercise with ID 42 not found or has been deleted.",
    "timestamp": "2026-04-14T10:30:00Z"
  }
}
```

**Error code catalog:**

| Code | HTTP Status | Description |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Wrong username or password |
| `ACCOUNT_DISABLED` | 403 | Account has been disabled |
| `TOKEN_EXPIRED` | 401 | Access/refresh token expired |
| `ACCESS_DENIED` | 403 | Insufficient role permissions |
| `VALIDATION_ERROR` | 400 | Request body validation failure |
| `USER_NOT_FOUND` | 404 | User ID does not exist |
| `USERNAME_TAKEN` | 409 | Username already in use |
| `EXERCISE_NOT_FOUND` | 404 | Exercise ID not found or soft-deleted |
| `COURSE_NOT_FOUND` | 404 | Course ID not found or soft-deleted |
| `CATEGORY_NOT_FOUND` | 404 | Category ID not found |
| `CATEGORY_DUPLICATE` | 409 | Category name already exists |
| `CATEGORY_HAS_EXERCISES` | 409 | Cannot delete category with linked exercises |
| `IMPORT_FILE_INVALID` | 400 | Uploaded file is malformed or unreadable |
| `IMPORT_EXERCISE_MISSING` | 400 | Referenced exercise not found |
| `IMPORT_DUPLICATE` | 409 | Duplicate submission detected |
| `ZIP_PATH_TRAVERSAL` | 400 | ZIP contains malicious path |
| `ZIP_TOO_LARGE` | 400 | ZIP exceeds max decompressed size |
| `RATE_LIMITED` | 429 | Too many requests |

**Pagination (list endpoints):**

Query params: `page` (0-based, default 0), `size` (default 20, max 100)

Response wrapper:

```json
{
  "content": [ ... ],
  "page": 0,
  "size": 20,
  "totalElements": 156,
  "totalPages": 8
}
```

---

### 4.2 Auth Module

#### POST `/api/v1/auth/login`

Login and receive tokens.

**Request:**
```json
{
  "username": "student",
  "password": "student"
}
```

**Response 200:**
```json
{
  "accessToken": "eyJhbG...",
  "user": {
    "id": 1,
    "username": "student",
    "displayName": "Alex Chen",
    "role": "STUDENT"
  }
}
```
Plus `Set-Cookie: refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800`

**Error responses:** 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_DISABLED`

---

#### POST `/api/v1/auth/refresh`

Refresh access token using the refresh token cookie.

**Request:** No body. Refresh token read from cookie.

**Response 200:**
```json
{
  "accessToken": "eyJhbG..."
}
```

**Error:** 401 `TOKEN_EXPIRED`

---

#### POST `/api/v1/auth/logout`

Invalidate the current refresh token.

**Request:** No body.

**Response 204:** No content. Clears the refresh token cookie.

---

### 4.3 User Management Module — `@Role(SUPER_ADMIN)`

#### GET `/api/v1/users`

List all users with optional role/status filters.

**Query params:** `role` (optional), `status` (optional), `page`, `size`

**Response 200:**
```json
{
  "content": [
    {
      "id": 1,
      "username": "alex01",
      "displayName": "Alex Chen",
      "role": "STUDENT",
      "status": "ACTIVE",
      "createdAt": "2026-03-01T00:00:00Z"
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 7,
  "totalPages": 1
}
```

---

#### POST `/api/v1/users`

Create a new user.

**Request:**
```json
{
  "username": "newstudent01",
  "displayName": "New Student",
  "password": "initialPass123",
  "role": "STUDENT"
}
```

**Response 201:**
```json
{
  "id": 8,
  "username": "newstudent01",
  "displayName": "New Student",
  "role": "STUDENT",
  "status": "ACTIVE"
}
```

**Errors:** 409 `USERNAME_TAKEN`, 400 `VALIDATION_ERROR`

---

#### PATCH `/api/v1/users/{id}/role`

Change a user's role.

**Request:**
```json
{
  "role": "TUTOR"
}
```

**Response 200:**
```json
{
  "id": 1,
  "username": "alex01",
  "role": "TUTOR",
  "message": "Role updated. Takes effect on next login."
}
```

---

#### PATCH `/api/v1/users/{id}/status`

Enable or disable a user. Disabling deletes all refresh tokens for that user.

**Request:**
```json
{
  "status": "DISABLED"
}
```

**Response 200:**
```json
{
  "id": 1,
  "username": "alex01",
  "status": "DISABLED",
  "message": "User disabled. All active sessions have been invalidated."
}
```

---

### 4.4 Course Management Module — `@Role(TUTOR)`

#### GET `/api/v1/courses`

List courses (non-deleted).

**Response 200:** Paginated list of courses with `exerciseCount` and `studentCount`.

```json
{
  "content": [
    {
      "id": 1,
      "name": "CS101 — Intro to Programming",
      "description": "Spring 2026 introductory course",
      "exerciseCount": 3,
      "studentCount": 4,
      "createdAt": "2026-02-15T00:00:00Z"
    }
  ],
  "totalElements": 2
}
```

---

#### POST `/api/v1/courses`

Create a course.

**Request:**
```json
{
  "name": "CS301 — Algorithms",
  "description": "Advanced algorithms course"
}
```

**Response 201:** Created course object.

---

#### PUT `/api/v1/courses/{id}`

Update course name/description.

**Request:**
```json
{
  "name": "CS101 — Intro to Programming (Updated)",
  "description": "Updated description"
}
```

**Response 200:** Updated course object.

---

#### DELETE `/api/v1/courses/{id}`

Soft-delete a course. Linked exercises, submissions, and grades are retained.

**Response 204:** No content.

---

#### POST `/api/v1/courses/{courseId}/exercises`

Link exercises to a course.

**Request:**
```json
{
  "exerciseIds": [1, 2, 3]
}
```

**Response 200:**
```json
{
  "linked": 3,
  "message": "Exercises linked to course."
}
```

---

#### DELETE `/api/v1/courses/{courseId}/exercises/{exerciseId}`

Unlink an exercise from a course. Exercise and submissions are unaffected.

**Response 204:** No content.

---

#### GET `/api/v1/courses/{courseId}/exercises`

List exercises linked to a course.

**Response 200:** List of exercise summary objects.

---

#### POST `/api/v1/courses/{courseId}/students`

Batch-enroll students.

**Request:**
```json
{
  "userIds": [1, 2, 3, 4]
}
```

**Response 200:**
```json
{
  "enrolled": 4,
  "message": "Students enrolled."
}
```

---

#### DELETE `/api/v1/courses/{courseId}/students/{userId}`

Remove a student from a course. Historical data retained.

**Response 204:** No content.

---

#### GET `/api/v1/courses/{courseId}/students`

List enrolled students.

**Response 200:** List of user summary objects (id, username, displayName).

---

### 4.5 Category Management Module — `@Role(TUTOR)`

#### GET `/api/v1/categories`

List all categories with exercise count.

**Response 200:**
```json
[
  { "id": 1, "name": "Loops", "exerciseCount": 3 },
  { "id": 2, "name": "Variables", "exerciseCount": 2 },
  { "id": 3, "name": "Functions", "exerciseCount": 0 }
]
```

---

#### POST `/api/v1/categories`

Create a category.

**Request:**
```json
{
  "name": "Recursion"
}
```

**Response 201:** Created category object.

**Errors:** 409 `CATEGORY_DUPLICATE`

---

#### DELETE `/api/v1/categories/{id}`

Delete a category. Fails if it has linked exercises.

**Response 204:** No content.

**Errors:** 409 `CATEGORY_HAS_EXERCISES`

---

### 4.6 Exercise Management Module — `@Role(TUTOR)`

#### GET `/api/v1/exercises`

List exercises for tutor management (includes drafts, excludes deleted).

**Query params:** `type`, `status`, `categoryId`, `difficulty`, `page`, `size`

**Response 200:** Paginated list with version info.

```json
{
  "content": [
    {
      "id": 1,
      "title": "Print Hello World",
      "type": "BLOCKLY",
      "difficulty": "EASY",
      "category": { "id": 2, "name": "Variables" },
      "currentVersionNumber": 3,
      "status": "PUBLISHED",
      "likeCount": 12,
      "createdAt": "2026-03-28T00:00:00Z"
    }
  ]
}
```

---

#### POST `/api/v1/exercises`

Create a new exercise (saved as DRAFT, version 1).

**Request (Blockly example):**
```json
{
  "title": "Print Hello World",
  "description": "Use the print block to display \"Hello World\".",
  "type": "BLOCKLY",
  "difficulty": "EASY",
  "categoryId": 2,
  "hints": ["Look for the print block", "Connect text to print"],
  "config": {
    "allowedBlocks": ["print", "text"],
    "initialWorkspaceXml": "<xml>...</xml>",
    "showCodeView": true,
    "gradingRules": {
      "outputMatch": { "enabled": true, "expectedOutput": "Hello World" },
      "requiredBlocks": { "enabled": false, "blocks": [] },
      "forbiddenBlocks": { "enabled": false, "blocks": [] },
      "blockCountLimit": { "enabled": false, "max": null }
    }
  }
}
```

**Request (Python example):**
```json
{
  "title": "FizzBuzz",
  "description": "Write a function fizzbuzz(n)...",
  "type": "PYTHON",
  "difficulty": "MEDIUM",
  "categoryId": 1,
  "hints": ["Use the modulo operator %"],
  "config": {
    "starterCode": "def fizzbuzz(n):\n    pass",
    "timeLimitSeconds": 5,
    "testCases": [
      { "input": "fizzbuzz(3)", "expectedOutput": "\"Fizz\"", "visible": true },
      { "input": "fizzbuzz(5)", "expectedOutput": "\"Buzz\"", "visible": true },
      { "input": "fizzbuzz(15)", "expectedOutput": "\"FizzBuzz\"", "visible": false }
    ]
  }
}
```

**Response 201:** Exercise object with `versionNumber: 1`, `status: "DRAFT"`.

---

#### PUT `/api/v1/exercises/{id}`

Edit an exercise. Creates a new immutable version.

**Request:** Same structure as POST (full replacement of all fields).

**Response 200:** Updated exercise object with incremented `versionNumber`.

---

#### GET `/api/v1/exercises/{id}`

Get exercise detail including current version config.

**Response 200:**
```json
{
  "id": 1,
  "title": "Print Hello World",
  "type": "BLOCKLY",
  "difficulty": "EASY",
  "category": { "id": 2, "name": "Variables" },
  "status": "PUBLISHED",
  "likeCount": 12,
  "currentVersion": {
    "id": 10,
    "versionNumber": 3,
    "title": "Print Hello World",
    "description": "Use the print block...",
    "hints": ["Look for the print block", "Connect text to print"],
    "config": { ... },
    "createdAt": "2026-04-10T00:00:00Z"
  }
}
```

---

#### GET `/api/v1/exercises/{id}/versions`

List all versions of an exercise.

**Response 200:**
```json
[
  { "id": 10, "versionNumber": 3, "createdAt": "2026-04-10T00:00:00Z", "isCurrent": true },
  { "id": 7, "versionNumber": 2, "createdAt": "2026-04-05T00:00:00Z", "isCurrent": false },
  { "id": 3, "versionNumber": 1, "createdAt": "2026-03-28T00:00:00Z", "isCurrent": false }
]
```

---

#### GET `/api/v1/exercises/{id}/versions/{versionId}`

Get full detail of a specific version (for preview).

**Response 200:** Full version object with config.

---

#### POST `/api/v1/exercises/{id}/rollback`

Rollback to a specific version.

**Request:**
```json
{
  "versionId": 7
}
```

**Response 200:**
```json
{
  "message": "Exercise rolled back to version 2.",
  "currentVersionNumber": 2
}
```

---

#### PATCH `/api/v1/exercises/{id}/publish`

Publish an exercise (DRAFT → PUBLISHED).

**Response 200:**
```json
{
  "id": 1,
  "status": "PUBLISHED"
}
```

---

#### PATCH `/api/v1/exercises/{id}/unpublish`

Unpublish an exercise (PUBLISHED → DRAFT).

**Response 200:**
```json
{
  "id": 1,
  "status": "DRAFT"
}
```

---

#### DELETE `/api/v1/exercises/{id}`

Soft-delete an exercise. Submissions and grades retained.

**Response 204:** No content.

---

### 4.7 Student Practice Module — `@Role(STUDENT)`

#### GET `/api/v1/student/exercises`

Browse published exercises visible to the current student.

Respects the global course filter toggle: if enabled, only shows exercises from enrolled courses.

**Query params:** `courseId`, `type`, `categoryId`, `difficulty`, `page`, `size`

**Response 200:** Paginated list. Same structure as tutor list but filtered to `PUBLISHED` + non-deleted only. Includes `likeCount`. Excludes hidden test cases and grading rules.

---

#### GET `/api/v1/student/exercises/{id}`

Get exercise for practice. Returns only student-visible information.

**Response 200:**
```json
{
  "id": 1,
  "title": "FizzBuzz",
  "type": "PYTHON",
  "difficulty": "MEDIUM",
  "category": { "id": 1, "name": "Loops" },
  "version": {
    "id": 10,
    "versionNumber": 2,
    "description": "Write a function fizzbuzz(n)...",
    "hints": ["Use the modulo operator %"],
    "config": {
      "starterCode": "def fizzbuzz(n):\n    pass",
      "timeLimitSeconds": 5,
      "visibleTestCases": [
        { "input": "fizzbuzz(3)", "expectedOutput": "\"Fizz\"" },
        { "input": "fizzbuzz(5)", "expectedOutput": "\"Buzz\"" }
      ]
    }
  },
  "likeCount": 8,
  "liked": false
}
```

Note: Hidden test cases and grading rules are stripped from the response.

---

### 4.8 Submission & Grading Module — `@Role(TUTOR)`

#### POST `/api/v1/submissions/import`

Batch import student answer files.

**Request:** `Content-Type: multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `files` | File[] | One or more `.json` files, or a single `.zip` |

**Response 200:**
```json
{
  "batchId": "a1b2c3d4-...",
  "results": [
    {
      "filename": "AlexChen_PrintHelloWorld.json",
      "status": "IMPORTED",
      "submissionId": 101,
      "studentName": "Alex Chen",
      "exerciseTitle": "Print Hello World",
      "exerciseType": "BLOCKLY",
      "autoScore": 100.0,
      "versionMismatch": false,
      "message": null
    },
    {
      "filename": "CarolKim_PrintHelloWorld.json",
      "status": "DUPLICATE",
      "submissionId": null,
      "studentName": "Carol Kim",
      "exerciseTitle": "Print Hello World",
      "exerciseType": "BLOCKLY",
      "autoScore": null,
      "versionMismatch": false,
      "message": "Duplicate submission detected (same student + exercise + timestamp)."
    },
    {
      "filename": "Unknown_DeletedEx.json",
      "status": "FAILED",
      "submissionId": null,
      "studentName": null,
      "exerciseTitle": null,
      "exerciseType": null,
      "autoScore": null,
      "versionMismatch": false,
      "message": "Exercise not found or has been deleted."
    }
  ],
  "summary": {
    "total": 3,
    "imported": 1,
    "duplicates": 1,
    "failed": 1
  }
}
```

**Errors:** 400 `ZIP_PATH_TRAVERSAL`, 400 `ZIP_TOO_LARGE`

---

#### POST `/api/v1/submissions/import-duplicate`

Force-import a previously detected duplicate.

**Request:**
```json
{
  "filename": "CarolKim_PrintHelloWorld.json",
  "batchId": "a1b2c3d4-..."
}
```

**Response 200:** Same single-file result as above with `status: "IMPORTED"`.

---

#### GET `/api/v1/submissions`

List submissions with filters.

**Query params:** `exerciseId`, `exerciseType`, `studentName`, `page`, `size`

**Response 200:** Paginated list.

```json
{
  "content": [
    {
      "id": 101,
      "studentName": "Alex Chen",
      "exerciseId": 1,
      "exerciseTitle": "Print Hello World",
      "exerciseType": "BLOCKLY",
      "autoScore": 100.0,
      "tutorScore": null,
      "versionMismatch": false,
      "createdAt": "2026-04-11T09:00:00Z"
    }
  ]
}
```

---

#### GET `/api/v1/submissions/{id}`

Get submission detail for review.

**Response 200:**
```json
{
  "id": 102,
  "studentName": "Alex Wang",
  "exerciseId": 2,
  "exerciseTitle": "FizzBuzz",
  "exerciseType": "PYTHON",
  "answerData": "def fizzbuzz(n):\n    if n % 3 == 0:\n        return \"Fizz\"\n    ...",
  "autoScore": 75.0,
  "autoGradeDetails": {
    "testCases": [
      { "index": 0, "input": "fizzbuzz(3)", "expected": "Fizz", "actual": "Fizz", "passed": true, "visible": true },
      { "index": 1, "input": "fizzbuzz(5)", "expected": "Buzz", "actual": "Buzz", "passed": true, "visible": true },
      { "index": 2, "input": "fizzbuzz(15)", "expected": "FizzBuzz", "actual": "Fizz", "passed": false, "visible": false },
      { "index": 3, "input": "fizzbuzz(7)", "expected": "7", "actual": "7", "passed": true, "visible": false }
    ],
    "passedCount": 3,
    "totalCount": 4
  },
  "tutorScore": 80.0,
  "tutorComment": "Good effort! Check the order of conditions.",
  "versionMismatch": true,
  "studentVersionNumber": 1,
  "gradedVersionNumber": 2,
  "exportTimestamp": "2026-04-10T14:30:00Z",
  "createdAt": "2026-04-11T09:00:00Z"
}
```

---

#### PUT `/api/v1/submissions/{id}/grade`

Save tutor manual grade and comment.

**Request:**
```json
{
  "tutorScore": 80,
  "tutorComment": "Good effort! Check the order of conditions for FizzBuzz."
}
```

**Response 200:** Updated submission object.

---

#### GET `/api/v1/submissions/export-csv`

Export grades as CSV.

**Query params:** `exerciseId` (optional filter)

**Response 200:** `Content-Type: text/csv`

```
Student Name,Exercise Title,Exercise Type,Auto Score,Tutor Score,Tutor Comment,Submitted At
Alex Chen,Print Hello World,BLOCKLY,100.00,,, 2026-04-11T09:00:00Z
Alex Wang,FizzBuzz,PYTHON,75.00,80.00,Good effort!,2026-04-11T09:05:00Z
```

---

### 4.9 Student Progress Module — `@Role(STUDENT)`

#### GET `/api/v1/student/progress`

Get the current student's progress summary and per-exercise status.

**Response 200:**
```json
{
  "summary": {
    "totalExercises": 3,
    "attemptedCount": 2,
    "gradedCount": 1,
    "averageScore": 100.0,
    "passRate": 100.0
  },
  "exercises": [
    {
      "exerciseId": 1,
      "exerciseTitle": "Print Hello World",
      "exerciseType": "BLOCKLY",
      "status": "GRADED",
      "score": 100.0,
      "scoreSource": "AUTO"
    },
    {
      "exerciseId": 2,
      "exerciseTitle": "FizzBuzz",
      "exerciseType": "PYTHON",
      "status": "ATTEMPTED",
      "score": null,
      "scoreSource": null
    },
    {
      "exerciseId": 3,
      "exerciseTitle": "Sum of List",
      "exerciseType": "PYTHON",
      "status": "NOT_ATTEMPTED",
      "score": null,
      "scoreSource": null
    }
  ]
}
```

Note: `score` shows highest score across multiple submissions. `scoreSource` is `"TUTOR"` if tutor score exists, `"AUTO"` otherwise. Pass threshold = 60.

---

### 4.10 Global Settings Module — `@Role(SUPER_ADMIN)`

#### GET `/api/v1/settings`

Get all global settings.

**Response 200:**
```json
{
  "courseFilterEnabled": false
}
```

---

#### PUT `/api/v1/settings/course-filter`

Toggle course filter.

**Request:**
```json
{
  "enabled": true
}
```

**Response 200:**
```json
{
  "courseFilterEnabled": true,
  "impact": {
    "unenrolledStudentCount": 1,
    "unenrolledStudents": [
      { "id": 5, "username": "dave05", "displayName": "Dave Tanaka" }
    ]
  },
  "message": "Course filter enabled. 1 student is not enrolled in any course and will see no exercises."
}
```

Note: The impact assessment is always computed and returned, regardless of the toggle direction. The frontend uses this to show the warning dialog before confirming the toggle.

---

#### GET `/api/v1/settings/course-filter/impact`

Preview the impact of enabling course filter without toggling it.

**Response 200:**
```json
{
  "currentState": false,
  "unenrolledStudentCount": 1,
  "unenrolledStudents": [
    { "id": 5, "username": "dave05", "displayName": "Dave Tanaka" }
  ]
}
```

---

### 4.11 Profile Module (P1) — `@Role(STUDENT)`

#### GET `/api/v1/profile`

Get current user profile.

---

#### PUT `/api/v1/profile`

Update display name.

---

#### PUT `/api/v1/profile/password`

Change password (requires current password). Invalidates all other sessions.

---

### 4.12 Like Module (P1) — `@Role(STUDENT)`

#### POST `/api/v1/exercises/{id}/like`

Toggle like on an exercise.

**Response 200:**
```json
{
  "liked": true,
  "likeCount": 13
}
```

---

## 5. Cross-Cutting Concerns

### 5.1 Security

#### CORS Policy

Nginx reverse proxy handles CORS. In development, Vite dev server proxies to the backend. In production, all requests go through Nginx on port 80, so CORS is same-origin. The backend sets explicit CORS headers for development mode only:

```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Credentials: true
```

#### Content Security Policy (CSP)

Nginx adds the following header:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline';
  connect-src 'self';
  img-src 'self' data:;
```

`wasm-unsafe-eval` is required for Pyodide. `blob:` worker-src is required for Web Workers.

#### Rate Limiting

In-memory token bucket (using Bucket4j or a servlet filter), configured per endpoint category:

| Endpoint Category | Rate Limit | Scope |
|---|---|---|
| `/api/v1/auth/login` | 10 req/min | Per IP |
| `/api/v1/submissions/import` | 5 req/min | Per user |
| General API | 60 req/min | Per user |

#### File Upload Limits

| Parameter | Value |
|---|---|
| Max single file size | 5 MB |
| Max ZIP file size | 50 MB |
| Max decompressed ZIP size | 200 MB |
| Max files in one ZIP | 500 |
| Max files per import request | 500 |

### 5.2 Logging Strategy

**Framework:** Logback with Logstash Encoder, outputting structured JSON to stdout (Docker captures it).

**Log levels by concern:**

| Logger | Level | Purpose |
|---|---|---|
| `com.platform.security` | INFO | Login attempts, auth failures, role changes |
| `com.platform.grading` | INFO | Grading start/finish, sandbox errors, timeouts |
| `com.platform.import` | INFO | Import batch start/finish, per-file status |
| `com.platform.api` | DEBUG | Request/response timing (enabled in dev only) |
| `org.springframework` | WARN | Framework noise reduction |

**Structured log fields:** `timestamp`, `level`, `logger`, `message`, `userId`, `traceId`, `spanId`, `action`, `duration`

### 5.3 Monitoring Dashboards (Grafana)

Pre-configured dashboards:

1. **JVM Health:** Heap usage, GC pauses, thread count, CPU
2. **API Metrics:** Request rate, latency (p50/p95/p99), error rate by endpoint
3. **Grading:** Sandbox execution time distribution, timeout rate, queue depth
4. **Import:** Batch size distribution, success/failure rate
5. **Database:** Connection pool usage, slow queries

### 5.4 Nginx Configuration Highlights

```nginx
server {
    listen 80;

    # Frontend SPA
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # API reverse proxy
    location /api/ {
        proxy_pass http://api-server:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # File upload limits
        client_max_body_size 50m;
    }

    # Security headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
}
```

### 5.5 Docker Compose Structure

```yaml
services:
  nginx:
    image: nginx:1.25-alpine
    ports: ["80:80"]
    depends_on: [api-server]
    networks: [exercise-platform-net]

  api-server:
    build: ./backend
    environment:
      SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/exercise_db
      SANDBOX_URL: http://sandbox:5000
    depends_on: [mysql, sandbox]
    networks: [exercise-platform-net]

  sandbox:
    build: ./sandbox
    security_opt: ["no-new-privileges:true"]
    cap_drop: [ALL]
    cap_add: [SYS_ADMIN]  # Required for nsjail namespaces
    tmpfs: ["/tmp:size=256m"]
    networks: [exercise-platform-net]

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: exercise_db
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
    volumes:
      - mysql-data:/var/lib/mysql
      - ./backup:/backup
    networks: [exercise-platform-net]

  prometheus:
    image: prom/prometheus:v2.51.0
    ports: ["9090:9090"]
    volumes: ["./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml"]
    networks: [exercise-platform-net]

  grafana:
    image: grafana/grafana:10.4.0
    ports: ["3001:3000"]
    depends_on: [prometheus]
    networks: [exercise-platform-net]

volumes:
  mysql-data:

networks:
  exercise-platform-net:
    driver: bridge
```

### 5.6 Sandbox Container Internal Architecture

The Python sandbox container exposes a single HTTP endpoint:

#### POST `/execute`

**Request:**
```json
{
  "code": "def fizzbuzz(n):\n    ...",
  "testCases": [
    { "input": "print(fizzbuzz(3))", "expectedOutput": "Fizz" }
  ],
  "timeLimitSeconds": 5,
  "memoryLimitMb": 128
}
```

**Response:**
```json
{
  "results": [
    { "index": 0, "passed": true, "actual": "Fizz", "error": null, "executionTimeMs": 42 },
    { "index": 1, "passed": false, "actual": "Fizz", "error": null, "executionTimeMs": 38 },
    { "index": 2, "passed": false, "actual": null, "error": "TimeoutError", "executionTimeMs": 5000 }
  ]
}
```

**Internal execution flow:**
1. Receive request via Flask/FastAPI (lightweight HTTP server).
2. For each test case, spawn a nsjail subprocess with:
   - `--time_limit {timeLimitSeconds}`
   - `--rlimit_as {memoryLimitMb}`
   - `--disable_clone_newnet` (network isolation)
   - Read-only root filesystem, writable `/tmp` only
3. Write student code + test case wrapper to a temp file.
4. Execute `python3 temp_file.py` inside nsjail.
5. Capture stdout, compare with expected output.
6. Collect results and return.

**Restricted imports:** A custom import hook blocks `os`, `sys`, `subprocess`, `socket`, `shutil`, `ctypes`, `importlib`, and file I/O modules.

### 5.7 Exported Answer File Format (JSON Schema)

This is the contract between the student export and the tutor import:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["platformVersion", "exerciseId", "exerciseType", "exerciseVersion", "studentName", "answer", "exportedAt"],
  "properties": {
    "platformVersion": { "type": "string", "const": "1.0" },
    "exerciseId": { "type": "integer" },
    "exerciseTitle": { "type": "string" },
    "exerciseType": { "type": "string", "enum": ["BLOCKLY", "PYTHON"] },
    "exerciseVersion": { "type": "integer", "description": "Version number at time of export" },
    "studentName": { "type": "string", "minLength": 1 },
    "answer": {
      "oneOf": [
        { "type": "string", "description": "Blockly: workspace XML" },
        { "type": "string", "description": "Python: source code" }
      ]
    },
    "exportedAt": { "type": "string", "format": "date-time" }
  }
}
```

---

*End of Technical Architecture Document*