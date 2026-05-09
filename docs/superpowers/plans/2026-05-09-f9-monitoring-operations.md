# F-9 Monitoring & Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire structured JSON logging (with traceId/userId/role per request), a sandbox timing metric, and import batch logging so Prometheus, Grafana, and logs all meet the F-9 acceptance criteria.

**Architecture:** A new `TraceFilter` (servlet filter, `@Order(0)`) generates a UUID `traceId` per request, seeds MDC, sets `X-Trace-ID` response header, and logs one completion line after the request. `JwtFilter` adds `userId` and `role` to MDC once auth succeeds. `logback-spring.xml` uses Logstash JSON encoder so every log line is structured JSON with all MDC fields. The Grafana dashboard, Prometheus config, and Docker Compose wiring are already in place.

**Tech Stack:** Spring Boot 3.2.5 · SLF4J 2.x / Logback · Logstash Logback Encoder 7.4 · Micrometer 1.12 · MDC · JUnit 5 · Mockito

---

## File Map

| Action | File |
|--------|------|
| Create | `backend/src/main/resources/logback-spring.xml` |
| Create | `backend/src/main/java/com/platform/exercise/security/TraceFilter.java` |
| Create | `backend/src/test/java/com/platform/exercise/security/TraceFilterTest.java` |
| Modify | `backend/src/main/java/com/platform/exercise/security/JwtFilter.java` |
| Create | `backend/src/test/java/com/platform/exercise/security/JwtFilterMdcTest.java` |
| Modify | `backend/src/main/java/com/platform/exercise/grading/PythonGrader.java` |
| Modify | `backend/src/test/java/com/platform/exercise/grading/PythonGraderTest.java` |
| Modify | `backend/src/main/java/com/platform/exercise/submission/FileImportService.java` |

---

## Task 1: logback-spring.xml — Structured JSON logging configuration

**Files:**
- Create: `backend/src/main/resources/logback-spring.xml`

No test needed — this is pure config. LogstashEncoder outputs every log line as JSON including all MDC keys automatically.

- [ ] **Step 1: Create `logback-spring.xml`**

Create `backend/src/main/resources/logback-spring.xml` with the following content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>

  <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
  </appender>

  <!-- Per-package log levels as specified in F-9 -->
  <logger name="com.platform.exercise.security"   level="INFO"  additivity="false"><appender-ref ref="STDOUT"/></logger>
  <logger name="com.platform.exercise.grading"    level="INFO"  additivity="false"><appender-ref ref="STDOUT"/></logger>
  <logger name="com.platform.exercise.submission" level="INFO"  additivity="false"><appender-ref ref="STDOUT"/></logger>
  <logger name="org.springframework"              level="WARN"  additivity="false"><appender-ref ref="STDOUT"/></logger>
  <logger name="org.hibernate"                    level="WARN"  additivity="false"><appender-ref ref="STDOUT"/></logger>

  <!-- Dev profile: full DEBUG for application code -->
  <springProfile name="dev">
    <logger name="com.platform.exercise" level="DEBUG" additivity="false"><appender-ref ref="STDOUT"/></logger>
  </springProfile>

  <root level="INFO">
    <appender-ref ref="STDOUT"/>
  </root>

</configuration>
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/resources/logback-spring.xml
git commit -m "feat(f9): add logback-spring.xml with Logstash JSON encoder"
```

---

## Task 2: TraceFilter — Per-request traceId, MDC, request completion log

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/security/TraceFilter.java`
- Create: `backend/src/test/java/com/platform/exercise/security/TraceFilterTest.java`

`RateLimitFilter` already uses `@Order(1)`; `TraceFilter` gets `@Order(0)` so it wraps everything including rate-limiting. MDC is cleared in `finally` so it is always clean after the request.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/security/TraceFilterTest.java`:

```java
package com.platform.exercise.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class TraceFilterTest {

    private final TraceFilter filter = new TraceFilter();

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void setsXTraceIdResponseHeader() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/exercises");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilterInternal(req, res, new MockFilterChain());

        assertThat(res.getHeader("X-Trace-ID")).isNotBlank();
    }

    @Test
    void traceIdIsUuidFormat() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/exercises");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilterInternal(req, res, new MockFilterChain());

        String traceId = res.getHeader("X-Trace-ID");
        assertThat(traceId).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    }

    @Test
    void mdcClearedAfterRequest() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/exercises");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilterInternal(req, res, new MockFilterChain());

        assertThat(MDC.getCopyOfContextMap()).isNullOrEmpty();
    }

    @Test
    void mdcContainsTraceIdDuringRequest() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/v1/exercises");
        MockHttpServletResponse res = new MockHttpServletResponse();

        String[] capturedTraceId = new String[1];
        filter.doFilterInternal(req, res, (request, response) -> {
            capturedTraceId[0] = MDC.get("traceId");
        });

        assertThat(capturedTraceId[0]).isNotBlank();
        assertThat(capturedTraceId[0]).matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    }

    @Test
    void mdcContainsMethodAndPathDuringRequest() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/submissions/import");
        MockHttpServletResponse res = new MockHttpServletResponse();

        String[] method = new String[1];
        String[] path = new String[1];
        filter.doFilterInternal(req, res, (request, response) -> {
            method[0] = MDC.get("method");
            path[0] = MDC.get("path");
        });

        assertThat(method[0]).isEqualTo("POST");
        assertThat(path[0]).isEqualTo("/api/v1/submissions/import");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=TraceFilterTest -q 2>&1 | tail -20
```

Expected: FAIL — `TraceFilter` class does not exist yet.

- [ ] **Step 3: Create `TraceFilter`**

Create `backend/src/main/java/com/platform/exercise/security/TraceFilter.java`:

```java
package com.platform.exercise.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
@Order(0)
public class TraceFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(TraceFilter.class);

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        String traceId = UUID.randomUUID().toString();
        long startTime = System.currentTimeMillis();

        MDC.put("traceId", traceId);
        MDC.put("method", request.getMethod());
        MDC.put("path", request.getRequestURI());
        response.setHeader("X-Trace-ID", traceId);

        try {
            chain.doFilter(request, response);
        } finally {
            long durationMs = System.currentTimeMillis() - startTime;
            MDC.put("statusCode", String.valueOf(response.getStatus()));
            MDC.put("durationMs", String.valueOf(durationMs));
            log.info("{} {} {} {}ms", request.getMethod(), request.getRequestURI(),
                    response.getStatus(), durationMs);
            MDC.clear();
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=TraceFilterTest -q 2>&1 | tail -20
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -q 2>&1 | tail -20
```

Expected: BUILD SUCCESS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/security/TraceFilter.java \
        backend/src/test/java/com/platform/exercise/security/TraceFilterTest.java
git commit -m "feat(f9): add TraceFilter for per-request traceId and MDC population"
```

---

## Task 3: JwtFilter — Populate userId and role in MDC

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/security/JwtFilter.java`
- Create: `backend/src/test/java/com/platform/exercise/security/JwtFilterMdcTest.java`

`TraceFilter` clears MDC in its `finally` block, so these MDC keys are automatically cleaned up at request end.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/security/JwtFilterMdcTest.java`:

```java
package com.platform.exercise.security;

import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtFilterMdcTest {

    @Mock JwtUtil jwtUtil;
    @Mock UserRepository userRepository;

    JwtFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtFilter(jwtUtil, userRepository);
    }

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void populatesUserIdAndRoleInMdcOnValidToken() throws Exception {
        Claims claims = mock(Claims.class);
        when(claims.getSubject()).thenReturn("42");
        when(claims.get("role", String.class)).thenReturn("TUTOR");
        when(jwtUtil.parseToken("valid-token")).thenReturn(claims);

        User user = new User();
        user.setId(42L);
        user.setStatus(User.UserStatus.ACTIVE);
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer valid-token");
        MockHttpServletResponse res = new MockHttpServletResponse();

        String[] capturedUserId = new String[1];
        String[] capturedRole = new String[1];

        filter.doFilterInternal(req, res, (request, response) -> {
            capturedUserId[0] = MDC.get("userId");
            capturedRole[0] = MDC.get("role");
        });

        assertThat(capturedUserId[0]).isEqualTo("42");
        assertThat(capturedRole[0]).isEqualTo("TUTOR");
    }

    @Test
    void doesNotSetMdcWhenNoAuthHeader() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        String[] capturedUserId = new String[1];
        filter.doFilterInternal(req, res, (request, response) -> {
            capturedUserId[0] = MDC.get("userId");
        });

        assertThat(capturedUserId[0]).isNull();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=JwtFilterMdcTest -q 2>&1 | tail -20
```

Expected: `populatesUserIdAndRoleInMdcOnValidToken` FAILS — MDC fields not set yet.

- [ ] **Step 3: Update `JwtFilter` to populate MDC**

Replace the `userRepository.findById(userId).ifPresent(...)` block in `JwtFilter.java` so it also sets MDC keys. The final `doFilterInternal` method:

```java
@Override
protected void doFilterInternal(@NonNull HttpServletRequest request,
                                @NonNull HttpServletResponse response,
                                @NonNull FilterChain chain)
        throws ServletException, IOException {
    String header = request.getHeader("Authorization");
    if (header != null && header.startsWith("Bearer ")
            && SecurityContextHolder.getContext().getAuthentication() == null) {
        String token = header.substring(7);
        try {
            Claims claims = jwtUtil.parseToken(token);
            Long userId = Long.parseLong(claims.getSubject());
            String role = claims.get("role", String.class);
            userRepository.findById(userId).ifPresent(user -> {
                if (user.getStatus() == User.UserStatus.ACTIVE) {
                    var auth = new UsernamePasswordAuthenticationToken(
                        user, null,
                        List.of(new SimpleGrantedAuthority("ROLE_" + role))
                    );
                    auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                    MDC.put("userId", String.valueOf(userId));
                    MDC.put("role", role);
                }
            });
        } catch (JwtException | IllegalArgumentException ignored) {
            // Invalid token — proceed unauthenticated
        }
    }
    chain.doFilter(request, response);
}
```

Also add the import at the top of the file:
```java
import org.slf4j.MDC;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=JwtFilterMdcTest -q 2>&1 | tail -20
```

Expected: both tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -q 2>&1 | tail -20
```

Expected: BUILD SUCCESS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/security/JwtFilter.java \
        backend/src/test/java/com/platform/exercise/security/JwtFilterMdcTest.java
git commit -m "feat(f9): populate userId and role MDC keys in JwtFilter"
```

---

## Task 4: PythonGrader — sandbox.grading.duration histogram metric

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/grading/PythonGrader.java`
- Modify: `backend/src/test/java/com/platform/exercise/grading/PythonGraderTest.java`

The timer wraps only the sandbox HTTP call (inside the `try` block). `Timer.Sample` is stopped in `finally` so it records even when the sandbox is unavailable.

- [ ] **Step 1: Update test to assert timer is recorded**

Open `backend/src/test/java/com/platform/exercise/grading/PythonGraderTest.java`.

Add these imports at the top:

```java
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
```

Change the `@BeforeEach` and field declaration:

```java
// Replace this field:
//   private PythonGrader grader;
// With:
private PythonGrader grader;
private SimpleMeterRegistry meterRegistry;

// Replace setUp():
@BeforeEach
void setUp() {
    meterRegistry = new SimpleMeterRegistry();
    grader = new PythonGrader(sandboxClient, mapper, meterRegistry);
}
```

Add one new test at the bottom of the class:

```java
@Test
void grade_recordsSandboxTimerMetric() {
    when(sandboxClient.execute(any(), any(), anyInt())).thenReturn(makeResults(true, true));
    grader.grade("def f(n): return n", PYTHON_CONFIG);

    Timer timer = meterRegistry.find("sandbox.grading.duration").timer();
    assertThat(timer).isNotNull();
    assertThat(timer.count()).isEqualTo(1);
}

@Test
void grade_sandboxUnavailable_stillRecordsTimer() {
    when(sandboxClient.execute(any(), any(), anyInt()))
        .thenThrow(new SandboxClient.SandboxUnavailableException("down"));
    grader.grade("def f(n): return n", PYTHON_CONFIG);

    Timer timer = meterRegistry.find("sandbox.grading.duration").timer();
    assertThat(timer).isNotNull();
    assertThat(timer.count()).isEqualTo(1);
}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=PythonGraderTest -q 2>&1 | tail -20
```

Expected: compilation error (constructor mismatch) or test failures.

- [ ] **Step 3: Update `PythonGrader` to inject `MeterRegistry` and record timing**

Replace the contents of `backend/src/main/java/com/platform/exercise/grading/PythonGrader.java` with:

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.exercise.VerifyRequest;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class PythonGrader {

    private final SandboxClient sandboxClient;
    private final ObjectMapper objectMapper;
    private final MeterRegistry meterRegistry;

    public record Result(BigDecimal autoScore, String autoGradeDetailsJson) {}

    public Result grade(String studentCode, String configJson) {
        try {
            JsonNode config = objectMapper.readTree(configJson);
            int timeLimitSeconds = config.path("timeLimitSeconds").asInt(5);

            List<VerifyRequest.TestCaseItem> testCases = new ArrayList<>();
            for (JsonNode tc : config.path("testCases")) {
                testCases.add(new VerifyRequest.TestCaseItem(
                    tc.path("input").asText(""),
                    tc.path("expectedOutput").asText("")
                ));
            }

            Timer.Sample sample = Timer.start(meterRegistry);
            JsonNode sandboxResponse;
            try {
                sandboxResponse = sandboxClient.execute(studentCode, testCases, timeLimitSeconds);
            } finally {
                sample.stop(meterRegistry.timer("sandbox.grading.duration"));
            }

            JsonNode results = sandboxResponse.path("results");

            int total = 0, passed = 0;
            for (JsonNode r : results) {
                total++;
                if (r.path("passed").asBoolean(false)) passed++;
            }

            BigDecimal score = total == 0 ? null
                    : new BigDecimal(passed)
                        .multiply(new BigDecimal("100"))
                        .divide(new BigDecimal(total), 2, RoundingMode.HALF_UP);

            String details = String.format(
                "{\"type\":\"PYTHON\",\"results\":%s,\"passedCount\":%d,\"totalCount\":%d}",
                results.toString(), passed, total);

            return new Result(score, details);

        } catch (SandboxClient.SandboxUnavailableException e) {
            return new Result(null, "{\"type\":\"PYTHON\",\"error\":\"SANDBOX_UNAVAILABLE\"}");
        } catch (Exception e) {
            return new Result(null,
                "{\"type\":\"PYTHON\",\"error\":\"" + e.getMessage() + "\"}");
        }
    }
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -pl . -Dtest=PythonGraderTest -q 2>&1 | tail -20
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -q 2>&1 | tail -20
```

Expected: BUILD SUCCESS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/grading/PythonGrader.java \
        backend/src/test/java/com/platform/exercise/grading/PythonGraderTest.java
git commit -m "feat(f9): add sandbox.grading.duration histogram metric to PythonGrader"
```

---

## Task 5: FileImportService — Per-file import outcome logging

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/FileImportService.java`

Each file result is logged at INFO after processing with `batchId`, `filename`, `status`, `autoScore` as structured MDC keys so Logstash captures them as first-class JSON fields.

- [ ] **Step 1: Add import logger and per-file log call to `FileImportService`**

In `FileImportService.java`, add a static logger field after the class declaration:

```java
// Add after: public class FileImportService {
private static final Logger log = LoggerFactory.getLogger(FileImportService.class);
```

Add to the imports at the top:

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
```

At the end of `processSingleFile`, just before the final `return` statements in the success path (before `return ImportResultDto.imported(...)`) and at each existing `return` that produces a result, add a helper call. The cleanest approach is a private log helper called at the end:

Replace the entire `processSingleFile` method's return section by adding a log call **after** the try/catch block returns. To do this cleanly without changing all return points, extract a helper that logs and returns:

Add this private method to the class:

```java
private ImportResultDto logAndReturn(String batchId, ImportResultDto result) {
    MDC.put("importBatchId", batchId);
    MDC.put("importFilename", result.getFilename());
    MDC.put("importStatus", result.getStatus() != null ? result.getStatus().name() : "UNKNOWN");
    MDC.put("importAutoScore", result.getAutoScore() != null ? result.getAutoScore().toPlainString() : "");
    try {
        log.info("Import file processed");
    } finally {
        MDC.remove("importBatchId");
        MDC.remove("importFilename");
        MDC.remove("importStatus");
        MDC.remove("importAutoScore");
    }
    return result;
}
```

In `processSingleFile`, wrap each `return` that produces an `ImportResultDto` with `logAndReturn(batchId, ...)`. Specifically, replace:

```java
// Line ~108: duplicate check return
return ImportResultDto.duplicate(filename, studentName, null);
```
→
```java
return logAndReturn(batchId, ImportResultDto.duplicate(filename, studentName, null));
```

```java
// Line ~112: exercise not found return
return ImportResultDto.failed(filename, "Exercise not found or has been deleted.");
```
→
```java
return logAndReturn(batchId, ImportResultDto.failed(filename, "Exercise not found or has been deleted."));
```

```java
// Line ~118: version not found return
return ImportResultDto.failed(filename, "Exercise configuration not found.");
```
→
```java
return logAndReturn(batchId, ImportResultDto.failed(filename, "Exercise configuration not found."));
```

```java
// Line ~136: unknown type return
return ImportResultDto.failed(filename, "Unknown exercise type: " + exerciseType);
```
→
```java
return logAndReturn(batchId, ImportResultDto.failed(filename, "Unknown exercise type: " + exerciseType));
```

```java
// Line ~153: success return
return ImportResultDto.imported(filename, saved.getId(), studentName,
    exercise.getTitle(), exerciseType, autoScore, versionMismatch);
```
→
```java
return logAndReturn(batchId, ImportResultDto.imported(filename, saved.getId(), studentName,
    exercise.getTitle(), exerciseType, autoScore, versionMismatch));
```

And in the `catch` block at the bottom:
```java
return ImportResultDto.failed(filename, "Parse error: " + e.getMessage());
```
→
```java
return logAndReturn(batchId, ImportResultDto.failed(filename, "Parse error: " + e.getMessage()));
```

**Note:** `ImportResultDto` must expose `getFilename()`, `getStatus()`, and `getAutoScore()`. Check what methods exist:

```bash
grep -n "getFilename\|getStatus\|getAutoScore\|filename\|status\|autoScore" \
  backend/src/main/java/com/platform/exercise/submission/ImportResultDto.java | head -20
```

If `ImportResultDto` is a record, use `.filename()`, `.status()`, `.autoScore()`. If it's a class, adjust the accessor names accordingly.

- [ ] **Step 2: Run full test suite**

```bash
cd /home/ubuntu/jerome/programming-learning-platform/backend
mvn test -q 2>&1 | tail -20
```

Expected: BUILD SUCCESS. (Existing FileImportServiceTest should still pass — only logging was added.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/FileImportService.java
git commit -m "feat(f9): log per-file import outcome with batchId, filename, status, autoScore"
```

---

## Task 6: Mark F-9 complete and rebuild all services

**Files:**
- Modify: `docs/4_feature_specs/p0.md`

- [ ] **Step 1: Mark F-9 complete in p0.md**

In `docs/4_feature_specs/p0.md`, change:

```
| F-9 Monitoring & Operations | [ ] |
```

to:

```
| F-9 Monitoring & Operations | [x] |
```

- [ ] **Step 2: Commit p0.md update**

```bash
git add docs/4_feature_specs/p0.md
git commit -m "chore: mark F-9 Monitoring & Operations as complete in p0.md"
```

- [ ] **Step 3: Rebuild and redeploy all services**

```bash
cd /home/ubuntu/jerome/programming-learning-platform
docker compose down
docker compose build --no-cache
docker compose up -d
```

- [ ] **Step 4: Verify all containers are healthy**

```bash
docker compose ps
```

Expected: all services `Up` (or `healthy` for those with health checks).

- [ ] **Step 5: Verify Prometheus scrapes the API**

```bash
curl -s http://localhost:9090/api/v1/query?query=http_server_requests_seconds_count | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('OK' if d['status']=='success' else 'FAIL')"
```

Expected: `OK`

- [ ] **Step 6: Verify actuator/prometheus endpoint**

```bash
curl -s http://localhost/actuator/prometheus | grep -c "^#"
```

Expected: a number > 0 (metric lines present).

- [ ] **Step 7: Verify X-Trace-ID header in responses**

```bash
curl -sI http://localhost/api/v1/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"x","password":"x"}' | grep -i x-trace-id
```

Expected: `X-Trace-ID: <uuid>` header present.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Prometheus scrapes JVM memory, GC, HTTP request rate, HTTP error rate, active DB connections → Spring Boot Actuator + Micrometer auto-configures these; exposed via `management.endpoints.web.exposure.include=prometheus` (already in application.yml)
- ✅ Grafana dashboard shows request rate, p95 latency, error rate, JVM heap, active DB connections → `platform.json` already has all 5 panels
- ✅ `sandbox.grading.duration` histogram → Task 4
- ✅ Log lines with `timestamp`, `level`, `message`, `traceId`, `userId`, `role`, `method`, `path`, `statusCode`, `durationMs` → Tasks 1+2+3 together achieve this (Logstash encoder emits all MDC keys automatically)
- ✅ Import batch logging with `batchId`, `filename`, `status`, `autoScore` → Task 5

**Placeholder scan:** None found.

**Type consistency:**
- `PythonGrader` constructor in Task 4 adds `MeterRegistry meterRegistry` as third arg; test in same task uses `new PythonGrader(sandboxClient, mapper, meterRegistry)` ✅
- `TraceFilter` has no constructor args; test uses `new TraceFilter()` ✅
- `ImportResultDto` accessor names noted as conditional in Task 5 with an explicit check command ✅
