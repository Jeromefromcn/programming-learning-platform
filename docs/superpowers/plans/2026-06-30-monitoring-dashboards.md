# Monitoring Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend metrics instrumentation for grading-pipeline health, security/abuse signals, and business/usage activity, plus three new Grafana dashboards to visualize them.

**Architecture:** Three domain-scoped components (`GradingMetrics`, `SecurityMetrics`, `BusinessMetrics`) in a new `com.platform.exercise.metrics` package wrap `MeterRegistry`. Existing services (`BlocklyGrader`, `PythonGrader`, `RateLimitFilter`, `AuthService`, `SubmissionService`, `FileImportService`) get these injected and call named methods instead of touching Micrometer directly. One scheduled job (`BusinessMetricsScheduler`) refreshes the one gauge too expensive to compute on every Prometheus scrape.

**Tech Stack:** Spring Boot 3.5.0, Micrometer (`io.micrometer.core.instrument`), JUnit 5 + Mockito + AssertJ, Grafana file-based dashboard provisioning.

## Global Constraints

- No new infrastructure — no Alertmanager, no MySQL exporter, no Redis (per `CLAUDE.md` "Red Lines").
- No hard deletes, no changes to existing soft-delete/versioning behavior.
- TDD mandatory: write failing test before implementation code, every task.
- Metric names in Java code use dot notation (matches the existing `sandbox.grading.duration` convention) — Micrometer's Prometheus exporter converts dots to underscores and appends `_total` to counters at scrape time. Dashboard JSON queries use the underscore form (the actual exported name).
- Existing dashboard `monitoring/grafana/provisioning/dashboards/platform.json` is not modified.
- Existing metric `sandbox.grading.duration` is renamed to `grading.python.duration` — confirmed safe, it is not referenced by any dashboard JSON in the repo.

---

### Task 1: `GradingMetrics` component

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/metrics/GradingMetrics.java`
- Test: `backend/src/test/java/com/platform/exercise/metrics/GradingMetricsTest.java`

**Interfaces:**
- Produces: `GradingMetrics(MeterRegistry meterRegistry)` constructor; `void recordBlocklyResult(String outcome)`; `void recordPythonResult(String outcome)`; `Timer.Sample startBlocklyTimer()`; `void stopBlocklyTimer(Timer.Sample sample)`; `Timer.Sample startPythonTimer()`; `void stopPythonTimer(Timer.Sample sample)`.

- [ ] **Step 1: Write the failing test**

```java
package com.platform.exercise.metrics;

import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GradingMetricsTest {

    private SimpleMeterRegistry meterRegistry;
    private GradingMetrics gradingMetrics;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        gradingMetrics = new GradingMetrics(meterRegistry);
    }

    @Test
    void recordBlocklyResult_incrementsCounterWithOutcomeTag() {
        gradingMetrics.recordBlocklyResult("passed");
        gradingMetrics.recordBlocklyResult("passed");
        gradingMetrics.recordBlocklyResult("time_limit_exceeded");

        assertThat(meterRegistry.find("grading.blockly.result").tag("outcome", "passed").counter().count())
            .isEqualTo(2.0);
        assertThat(meterRegistry.find("grading.blockly.result").tag("outcome", "time_limit_exceeded").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void recordPythonResult_incrementsCounterWithOutcomeTag() {
        gradingMetrics.recordPythonResult("completed");
        gradingMetrics.recordPythonResult("sandbox_unavailable");

        assertThat(meterRegistry.find("grading.python.result").tag("outcome", "completed").counter().count())
            .isEqualTo(1.0);
        assertThat(meterRegistry.find("grading.python.result").tag("outcome", "sandbox_unavailable").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void blocklyTimer_recordsDuration() throws InterruptedException {
        Timer.Sample sample = gradingMetrics.startBlocklyTimer();
        Thread.sleep(5);
        gradingMetrics.stopBlocklyTimer(sample);

        Timer timer = meterRegistry.find("grading.blockly.duration").timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void pythonTimer_recordsDuration() throws InterruptedException {
        Timer.Sample sample = gradingMetrics.startPythonTimer();
        Thread.sleep(5);
        gradingMetrics.stopPythonTimer(sample);

        Timer timer = meterRegistry.find("grading.python.duration").timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=GradingMetricsTest`
Expected: FAIL — compilation error, `GradingMetrics` does not exist.

- [ ] **Step 3: Write the implementation**

```java
package com.platform.exercise.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

@Component
public class GradingMetrics {

    private final MeterRegistry meterRegistry;
    private final Timer blocklyDurationTimer;
    private final Timer pythonDurationTimer;

    public GradingMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.blocklyDurationTimer = Timer.builder("grading.blockly.duration")
            .publishPercentileHistogram()
            .register(meterRegistry);
        this.pythonDurationTimer = Timer.builder("grading.python.duration")
            .publishPercentileHistogram()
            .register(meterRegistry);
    }

    public void recordBlocklyResult(String outcome) {
        Counter.builder("grading.blockly.result")
            .tag("outcome", outcome)
            .register(meterRegistry)
            .increment();
    }

    public void recordPythonResult(String outcome) {
        Counter.builder("grading.python.result")
            .tag("outcome", outcome)
            .register(meterRegistry)
            .increment();
    }

    public Timer.Sample startBlocklyTimer() {
        return Timer.start(meterRegistry);
    }

    public void stopBlocklyTimer(Timer.Sample sample) {
        sample.stop(blocklyDurationTimer);
    }

    public Timer.Sample startPythonTimer() {
        return Timer.start(meterRegistry);
    }

    public void stopPythonTimer(Timer.Sample sample) {
        sample.stop(pythonDurationTimer);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=GradingMetricsTest`
Expected: PASS, 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/metrics/GradingMetrics.java backend/src/test/java/com/platform/exercise/metrics/GradingMetricsTest.java
git commit -m "feat(metrics): add GradingMetrics component"
```

---

### Task 2: Wire `GradingMetrics` into `BlocklyGrader`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/grading/BlocklyGrader.java`
- Modify: `backend/src/test/java/com/platform/exercise/grading/BlocklyGraderTest.java`

**Interfaces:**
- Consumes: `GradingMetrics` from Task 1 (`recordBlocklyResult`, `startBlocklyTimer`, `stopBlocklyTimer`).

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `backend/src/test/java/com/platform/exercise/grading/BlocklyGraderTest.java`:

```java
package com.platform.exercise.grading;

import com.platform.exercise.metrics.GradingMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class BlocklyGraderTest {

    private SimpleMeterRegistry meterRegistry;
    private BlocklyGrader grader;

    private static final String CONFIG_MATCH_ON =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello World\"}}}";
    private static final String CONFIG_MATCH_OFF =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":false}}}";

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        grader = new BlocklyGrader(new RhinoSandbox(), new GradingMetrics(meterRegistry));
    }

    @Test
    void grade_correctOutput_returns100() {
        BlocklyGrader.Result result = grader.grade("print('Hello World');", CONFIG_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void grade_wrongOutput_returns0() {
        BlocklyGrader.Result result = grader.grade("print('Wrong');", CONFIG_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.autoGradeDetailsJson()).contains("\"passed\":false");
    }

    @Test
    void grade_infiniteLoop_returnsInstructionLimitExceeded() {
        long start = System.currentTimeMillis();
        BlocklyGrader.Result result = grader.grade("while(true){}", CONFIG_MATCH_ON);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("INSTRUCTION_LIMIT_EXCEEDED");
        assertThat(System.currentTimeMillis() - start)
                .as("must complete well before 3-second fallback timeout")
                .isLessThan(2000);
    }

    @Test
    void grade_outputMatchDisabled_returnsNullScoreWithNoRuleMessage() {
        BlocklyGrader.Result result = grader.grade("print('Hello World');", CONFIG_MATCH_OFF);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("No grading rules");
    }

    @Test
    void grade_blocklyGeneratedCode_windowAlertMapped_returns100() {
        BlocklyGrader.Result result = grader.grade("window.alert('Hello World');", CONFIG_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void grade_blocklyGeneratedCode_windowPromptReturnsEmpty() {
        String config = "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"ok\"}}}";
        String code = "var x = window.prompt('Enter value'); print(x === '' ? 'ok' : 'fail');";
        BlocklyGrader.Result result = grader.grade(code, config);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void grade_correctOutput_recordsPassedOutcome() {
        grader.grade("print('Hello World');", CONFIG_MATCH_ON);
        assertThat(meterRegistry.find("grading.blockly.result").tag("outcome", "passed").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void grade_wrongOutput_recordsFailedOutcome() {
        grader.grade("print('Wrong');", CONFIG_MATCH_ON);
        assertThat(meterRegistry.find("grading.blockly.result").tag("outcome", "failed").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void grade_infiniteLoop_recordsInstructionLimitExceededOutcome() {
        grader.grade("while(true){}", CONFIG_MATCH_ON);
        assertThat(meterRegistry.find("grading.blockly.result")
            .tag("outcome", "instruction_limit_exceeded").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void grade_outputMatchDisabled_recordsNoRulesConfiguredOutcome() {
        grader.grade("print('Hello World');", CONFIG_MATCH_OFF);
        assertThat(meterRegistry.find("grading.blockly.result")
            .tag("outcome", "no_rules_configured").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void grade_correctOutput_recordsDuration() {
        grader.grade("print('Hello World');", CONFIG_MATCH_ON);
        assertThat(meterRegistry.find("grading.blockly.duration").timer().count()).isEqualTo(1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=BlocklyGraderTest`
Expected: FAIL — compilation error, `BlocklyGrader(RhinoSandbox, GradingMetrics)` constructor does not exist.

- [ ] **Step 3: Write the implementation**

Modify `backend/src/main/java/com/platform/exercise/grading/BlocklyGrader.java`. Add imports, change the constructor, and instrument `grade()`:

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.metrics.GradingMetrics;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.concurrent.*;

@Component
public class BlocklyGrader {

    private static final int TIMEOUT_SECONDS = 3;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final ObjectMapper mapper = new ObjectMapper();
    private final RhinoSandbox rhinoSandbox;
    private final GradingMetrics gradingMetrics;

    public BlocklyGrader(RhinoSandbox rhinoSandbox, GradingMetrics gradingMetrics) {
        this.rhinoSandbox = rhinoSandbox;
        this.gradingMetrics = gradingMetrics;
    }

    public record Result(BigDecimal autoScore, String autoGradeDetailsJson) {}

    public Result grade(String studentCode, String configJson) {
        try {
            JsonNode config = mapper.readTree(configJson);
            JsonNode outputMatch = config.path("gradingRules").path("outputMatch");

            if (!outputMatch.path("enabled").asBoolean(false)) {
                gradingMetrics.recordBlocklyResult("no_rules_configured");
                return new Result(null,
                    "{\"type\":\"BLOCKLY\",\"rule\":\"none\",\"passed\":null," +
                    "\"error\":\"No grading rules configured\"}");
            }

            String expected = outputMatch.path("expectedOutput").asText("").trim();
            Timer.Sample sample = gradingMetrics.startBlocklyTimer();
            Future<String> future = executor.submit(() -> rhinoSandbox.execute(studentCode));

            String actual = null;
            String error = null;
            try {
                actual = future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                future.cancel(true);
                error = "TIME_LIMIT_EXCEEDED";
            } catch (ExecutionException e) {
                Throwable cause = e.getCause();
                if (cause instanceof InstructionLimitExceededException) {
                    error = "INSTRUCTION_LIMIT_EXCEEDED";
                } else {
                    error = cause != null ? cause.getMessage() : "EXECUTION_ERROR";
                }
            } finally {
                gradingMetrics.stopBlocklyTimer(sample);
            }

            boolean passed = error == null && expected.equals(actual);
            BigDecimal score = error != null ? null
                    : (passed ? new BigDecimal("100.00")
                              : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));

            gradingMetrics.recordBlocklyResult(blocklyOutcome(error, passed));

            String details = String.format(
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":%s," +
                "\"expected\":%s,\"actual\":%s,\"error\":%s}",
                error != null ? "null" : passed,
                mapper.writeValueAsString(expected),
                mapper.writeValueAsString(actual),
                mapper.writeValueAsString(error));

            return new Result(score, details);
        } catch (Exception e) {
            gradingMetrics.recordBlocklyResult("execution_error");
            String errorJson;
            try {
                errorJson = mapper.writeValueAsString(e.getMessage() != null ? e.getMessage() : "EXECUTION_ERROR");
            } catch (Exception ignored) {
                errorJson = "\"EXECUTION_ERROR\"";
            }
            return new Result(null,
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":false," +
                "\"error\":" + errorJson + "}");
        }
    }

    private String blocklyOutcome(String error, boolean passed) {
        if (error == null) {
            return passed ? "passed" : "failed";
        }
        return switch (error) {
            case "TIME_LIMIT_EXCEEDED" -> "time_limit_exceeded";
            case "INSTRUCTION_LIMIT_EXCEEDED" -> "instruction_limit_exceeded";
            default -> "execution_error";
        };
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=BlocklyGraderTest`
Expected: PASS, 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/grading/BlocklyGrader.java backend/src/test/java/com/platform/exercise/grading/BlocklyGraderTest.java
git commit -m "feat(metrics): instrument BlocklyGrader with grading outcome and duration metrics"
```

---

### Task 3: Wire `GradingMetrics` into `PythonGrader`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/grading/PythonGrader.java`
- Modify: `backend/src/test/java/com/platform/exercise/grading/PythonGraderTest.java`

**Interfaces:**
- Consumes: `GradingMetrics` from Task 1.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `backend/src/test/java/com/platform/exercise/grading/PythonGraderTest.java`:

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.metrics.GradingMetrics;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PythonGraderTest {

    @Mock
    private SandboxClient sandboxClient;

    private PythonGrader grader;
    private SimpleMeterRegistry meterRegistry;
    private final ObjectMapper mapper = new ObjectMapper();

    private static final String PYTHON_CONFIG = """
            {
              "timeLimitSeconds": 5,
              "testCases": [
                {"input": "f(1)", "expectedOutput": "1", "visible": true},
                {"input": "f(2)", "expectedOutput": "2", "visible": false}
              ]
            }
            """;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        grader = new PythonGrader(sandboxClient, mapper, new GradingMetrics(meterRegistry));
    }

    private ObjectNode makeResults(boolean... passes) {
        ObjectNode root = mapper.createObjectNode();
        ArrayNode results = root.putArray("results");
        for (int i = 0; i < passes.length; i++) {
            ObjectNode r = results.addObject();
            r.put("index", i);
            r.put("passed", passes[i]);
            r.put("actual", passes[i] ? String.valueOf(i + 1) : "wrong");
            r.putNull("error");
            r.put("executionTimeMs", 10);
        }
        return root;
    }

    @Test
    void grade_allPass_returns100() {
        when(sandboxClient.execute(any(), any(), anyInt())).thenReturn(makeResults(true, true));
        PythonGrader.Result result = grader.grade("def f(n): return n", PYTHON_CONFIG);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void grade_halfPass_returns50() {
        when(sandboxClient.execute(any(), any(), anyInt())).thenReturn(makeResults(true, false));
        PythonGrader.Result result = grader.grade("def f(n): return n", PYTHON_CONFIG);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("50.00"));
    }

    @Test
    void grade_sandboxUnavailable_returnsNullScoreWithError() {
        when(sandboxClient.execute(any(), any(), anyInt()))
            .thenThrow(new SandboxClient.SandboxUnavailableException("down"));
        PythonGrader.Result result = grader.grade("def f(n): return n", PYTHON_CONFIG);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("SANDBOX_UNAVAILABLE");
    }

    @Test
    void grade_allFail_returns0() {
        when(sandboxClient.execute(any(), any(), anyInt())).thenReturn(makeResults(false, false));
        PythonGrader.Result result = grader.grade("def f(n): return n", PYTHON_CONFIG);
        assertThat(result.autoScore()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void grade_recordsSandboxTimerMetric() {
        when(sandboxClient.execute(any(), any(), anyInt())).thenReturn(makeResults(true, true));
        grader.grade("def f(n): return n", PYTHON_CONFIG);

        Timer timer = meterRegistry.find("grading.python.duration").timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void grade_sandboxUnavailable_stillRecordsTimer() {
        when(sandboxClient.execute(any(), any(), anyInt()))
            .thenThrow(new SandboxClient.SandboxUnavailableException("down"));
        grader.grade("def f(n): return n", PYTHON_CONFIG);

        Timer timer = meterRegistry.find("grading.python.duration").timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void grade_allPass_recordsCompletedOutcome() {
        when(sandboxClient.execute(any(), any(), anyInt())).thenReturn(makeResults(true, true));
        grader.grade("def f(n): return n", PYTHON_CONFIG);

        assertThat(meterRegistry.find("grading.python.result").tag("outcome", "completed").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void grade_sandboxUnavailable_recordsSandboxUnavailableOutcome() {
        when(sandboxClient.execute(any(), any(), anyInt()))
            .thenThrow(new SandboxClient.SandboxUnavailableException("down"));
        grader.grade("def f(n): return n", PYTHON_CONFIG);

        assertThat(meterRegistry.find("grading.python.result").tag("outcome", "sandbox_unavailable").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void grade_unexpectedException_recordsErrorOutcome() {
        when(sandboxClient.execute(any(), any(), anyInt())).thenThrow(new RuntimeException("boom"));
        grader.grade("def f(n): return n", PYTHON_CONFIG);

        assertThat(meterRegistry.find("grading.python.result").tag("outcome", "error").counter().count())
            .isEqualTo(1.0);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=PythonGraderTest`
Expected: FAIL — `PythonGrader(SandboxClient, ObjectMapper, GradingMetrics)` constructor does not exist; `meterRegistry.find("grading.python.duration")` returns null.

- [ ] **Step 3: Write the implementation**

Replace the full contents of `backend/src/main/java/com/platform/exercise/grading/PythonGrader.java`:

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.exercise.VerifyRequest;
import com.platform.exercise.metrics.GradingMetrics;
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
    private final GradingMetrics gradingMetrics;

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

            Timer.Sample sample = gradingMetrics.startPythonTimer();
            JsonNode sandboxResponse;
            try {
                sandboxResponse = sandboxClient.execute(studentCode, testCases, timeLimitSeconds);
            } finally {
                gradingMetrics.stopPythonTimer(sample);
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

            gradingMetrics.recordPythonResult("completed");
            return new Result(score, details);

        } catch (SandboxClient.SandboxUnavailableException e) {
            gradingMetrics.recordPythonResult("sandbox_unavailable");
            return new Result(null, "{\"type\":\"PYTHON\",\"error\":\"SANDBOX_UNAVAILABLE\"}");
        } catch (Exception e) {
            gradingMetrics.recordPythonResult("error");
            return new Result(null,
                "{\"type\":\"PYTHON\",\"error\":\"" + e.getMessage() + "\"}");
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=PythonGraderTest`
Expected: PASS, 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/grading/PythonGrader.java backend/src/test/java/com/platform/exercise/grading/PythonGraderTest.java
git commit -m "feat(metrics): instrument PythonGrader with grading outcome metrics, rename duration timer"
```

---

### Task 4: "Grading Pipeline" Grafana dashboard

**Files:**
- Create: `monitoring/grafana/provisioning/dashboards/grading-pipeline.json`

**Interfaces:**
- Consumes: `grading_blockly_result_total{outcome}`, `grading_python_result_total{outcome}`, `grading_blockly_duration_seconds_bucket`, `grading_python_duration_seconds_bucket` (exported names from Tasks 1-3).

- [ ] **Step 1: Create the dashboard JSON**

```json
{
  "annotations": { "list": [] },
  "description": "Grading Pipeline — Blockly (Rhino) and Python (nsjail) grading throughput, failures, and latency",
  "editable": false,
  "graphTooltip": 1,
  "id": null,
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "ops" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "id": 1,
      "targets": [
        { "expr": "sum(rate(grading_blockly_result_total[1m]))", "legendFormat": "Blockly/s" },
        { "expr": "sum(rate(grading_python_result_total[1m]))", "legendFormat": "Python/s" }
      ],
      "title": "Grading Throughput",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "ops" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "id": 2,
      "targets": [
        {
          "expr": "sum(rate(grading_blockly_result_total{outcome!~\"passed|failed\"}[1m])) by (outcome)",
          "legendFormat": "blockly: {{outcome}}"
        },
        {
          "expr": "sum(rate(grading_python_result_total{outcome!=\"completed\"}[1m])) by (outcome)",
          "legendFormat": "python: {{outcome}}"
        }
      ],
      "title": "Failure Breakdown",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "s" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "id": 3,
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(grading_blockly_duration_seconds_bucket[5m])) by (le))",
          "legendFormat": "Blockly p95"
        },
        {
          "expr": "histogram_quantile(0.95, sum(rate(grading_python_duration_seconds_bucket[5m])) by (le))",
          "legendFormat": "Python p95"
        }
      ],
      "title": "p95 Grading Duration",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 6, "x": 12, "y": 8 },
      "id": 4,
      "targets": [
        { "expr": "sum(increase(grading_python_result_total{outcome=\"sandbox_unavailable\"}[5m]))" }
      ],
      "title": "Sandbox Unavailable (5m)",
      "type": "stat"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "percentunit", "max": 1, "min": 0 }, "overrides": [] },
      "gridPos": { "h": 8, "w": 6, "x": 18, "y": 8 },
      "id": 5,
      "targets": [
        {
          "expr": "sum(rate(grading_blockly_result_total{outcome=\"passed\"}[15m])) / sum(rate(grading_blockly_result_total{outcome=~\"passed|failed\"}[15m]))"
        }
      ],
      "title": "Blockly Pass Rate",
      "type": "stat"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 39,
  "tags": ["exercise-platform", "grading"],
  "title": "Grading Pipeline",
  "uid": "exercise-platform-grading",
  "version": 1
}
```

- [ ] **Step 2: Restart Grafana and verify provisioning**

Run: `docker compose up -d grafana` (or `docker compose restart grafana` if already running)
Expected: Grafana logs show the dashboard provisioned without error: `docker compose logs grafana | grep -i grading-pipeline` shows no error lines.

- [ ] **Step 3: Commit**

```bash
git add monitoring/grafana/provisioning/dashboards/grading-pipeline.json
git commit -m "feat(monitoring): add Grading Pipeline Grafana dashboard"
```

---

### Task 5: `SecurityMetrics` component

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/metrics/SecurityMetrics.java`
- Test: `backend/src/test/java/com/platform/exercise/metrics/SecurityMetricsTest.java`

**Interfaces:**
- Produces: `SecurityMetrics(MeterRegistry meterRegistry)`; `void recordRateLimitExceeded(String endpoint)`; `void recordAuthFailure(String reason)`; `void recordImportRejected(String reason)`.

- [ ] **Step 1: Write the failing test**

```java
package com.platform.exercise.metrics;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityMetricsTest {

    private SimpleMeterRegistry meterRegistry;
    private SecurityMetrics securityMetrics;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        securityMetrics = new SecurityMetrics(meterRegistry);
    }

    @Test
    void recordRateLimitExceeded_incrementsCounterWithEndpointTag() {
        securityMetrics.recordRateLimitExceeded("login");
        securityMetrics.recordRateLimitExceeded("login");
        securityMetrics.recordRateLimitExceeded("import");

        assertThat(meterRegistry.find("security.rate_limit.exceeded").tag("endpoint", "login").counter().count())
            .isEqualTo(2.0);
        assertThat(meterRegistry.find("security.rate_limit.exceeded").tag("endpoint", "import").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void recordAuthFailure_incrementsCounterWithReasonTag() {
        securityMetrics.recordAuthFailure("bad_credentials");
        securityMetrics.recordAuthFailure("account_disabled");
        securityMetrics.recordAuthFailure("account_expired");

        assertThat(meterRegistry.find("security.auth.failure").tag("reason", "bad_credentials").counter().count())
            .isEqualTo(1.0);
        assertThat(meterRegistry.find("security.auth.failure").tag("reason", "account_disabled").counter().count())
            .isEqualTo(1.0);
        assertThat(meterRegistry.find("security.auth.failure").tag("reason", "account_expired").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void recordImportRejected_incrementsCounterWithReasonTag() {
        securityMetrics.recordImportRejected("path_traversal");
        securityMetrics.recordImportRejected("duplicate");
        securityMetrics.recordImportRejected("duplicate");

        assertThat(meterRegistry.find("security.import.rejected").tag("reason", "path_traversal").counter().count())
            .isEqualTo(1.0);
        assertThat(meterRegistry.find("security.import.rejected").tag("reason", "duplicate").counter().count())
            .isEqualTo(2.0);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=SecurityMetricsTest`
Expected: FAIL — compilation error, `SecurityMetrics` does not exist.

- [ ] **Step 3: Write the implementation**

```java
package com.platform.exercise.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

@Component
public class SecurityMetrics {

    private final MeterRegistry meterRegistry;

    public SecurityMetrics(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void recordRateLimitExceeded(String endpoint) {
        Counter.builder("security.rate_limit.exceeded")
            .tag("endpoint", endpoint)
            .register(meterRegistry)
            .increment();
    }

    public void recordAuthFailure(String reason) {
        Counter.builder("security.auth.failure")
            .tag("reason", reason)
            .register(meterRegistry)
            .increment();
    }

    public void recordImportRejected(String reason) {
        Counter.builder("security.import.rejected")
            .tag("reason", reason)
            .register(meterRegistry)
            .increment();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=SecurityMetricsTest`
Expected: PASS, 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/metrics/SecurityMetrics.java backend/src/test/java/com/platform/exercise/metrics/SecurityMetricsTest.java
git commit -m "feat(metrics): add SecurityMetrics component"
```

---

### Task 6: Wire `SecurityMetrics` into `RateLimitFilter`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java`
- Modify: `backend/src/test/java/com/platform/exercise/security/RateLimitFilterTest.java`

**Interfaces:**
- Consumes: `SecurityMetrics` from Task 5 (`recordRateLimitExceeded`). Spring autowires it automatically via the filter's `@RequiredArgsConstructor`.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/platform/exercise/security/RateLimitFilterTest.java` — add these imports:

```java
import com.platform.exercise.metrics.SecurityMetrics;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;

import static org.assertj.core.api.Assertions.assertThat;
```

Add this field next to the existing `@Autowired` fields:

```java
    @Autowired
    private MeterRegistry meterRegistry;
```

Add this test method:

```java
    @Test
    void loginRateLimitExceeded_recordsSecurityMetric() throws Exception {
        String body = "{\"username\":\"x\",\"password\":\"y\"}";
        for (int i = 0; i < 10; i++) {
            mockMvc.perform(post("/v1/auth/login")
                    .header("X-Forwarded-For", "10.0.0.77")
                    .contentType("application/json")
                    .content(body))
                .andExpect(status().is4xxClientError());
        }
        mockMvc.perform(post("/v1/auth/login")
                .header("X-Forwarded-For", "10.0.0.77")
                .contentType("application/json")
                .content(body))
            .andExpect(status().isTooManyRequests());

        Counter counter = meterRegistry.find("security.rate_limit.exceeded").tag("endpoint", "login").counter();
        assertThat(counter).isNotNull();
        assertThat(counter.count()).isGreaterThanOrEqualTo(1.0);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=RateLimitFilterTest`
Expected: FAIL — `counter` is null (no metric is recorded yet).

- [ ] **Step 3: Write the implementation**

Modify `backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java`:

Add import:
```java
import com.platform.exercise.metrics.SecurityMetrics;
```

Add field (next to `jwtUtil`):
```java
    private final SecurityMetrics securityMetrics;
```

Change the three call sites:
```java
        if ("POST".equals(method) && isLoginEndpoint) {
            String ip = resolveIp(request);
            Bucket bucket = buckets.get(ip, k -> newBucket(10, 1));
            if (!bucket.tryConsume(1)) {
                writeRateLimitResponse(response, "Too many login attempts. Try again in 1 minute.", "login");
                return;
            }
        }
```
```java
        if ("POST".equals(method) && isImportEndpoint) {
            String userId = extractUserIdFromToken(request);
            if (userId != null) {
                Bucket bucket = buckets.get("import:" + userId, k -> newBucket(5, 1));
                if (!bucket.tryConsume(1)) {
                    writeRateLimitResponse(response, "Import rate limit exceeded. Try again in 1 minute.", "import");
                    return;
                }
            }
        }
```
```java
        if ("POST".equals(method) && isSubmitEndpoint) {
            String userId = extractUserIdFromToken(request);
            if (userId != null) {
                Bucket bucket = buckets.get("submit:" + userId, k -> newBucket(20, 1));
                if (!bucket.tryConsume(1)) {
                    writeRateLimitResponse(response, "Submit rate limit exceeded. Try again in 1 minute.", "submit");
                    return;
                }
            }
        }
```

Change `writeRateLimitResponse` to record the metric:
```java
    private void writeRateLimitResponse(HttpServletResponse response, String message, String endpoint) throws IOException {
        securityMetrics.recordRateLimitExceeded(endpoint);
        response.setStatus(429);
        response.setContentType("application/json");
        response.getWriter().write(
            "{\"error\":{\"code\":\"RATE_LIMITED\",\"message\":\"" + message + "\"," +
            "\"timestamp\":\"" + Instant.now() + "\"}}");
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=RateLimitFilterTest`
Expected: PASS, 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java backend/src/test/java/com/platform/exercise/security/RateLimitFilterTest.java
git commit -m "feat(metrics): record rate-limit-exceeded security metric"
```

---

### Task 7: Wire `SecurityMetrics` into `AuthService`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/auth/AuthService.java`
- Modify: `backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java`

**Interfaces:**
- Consumes: `SecurityMetrics` from Task 5 (`recordAuthFailure`).
- Note: tags used are `bad_credentials` (unknown username or wrong password — both map to `ErrorCode.INVALID_CREDENTIALS` to avoid leaking which one), `account_disabled`, `account_expired`. The `account_expired` reason was discovered while reading `AuthService.login()` — it throws `ErrorCode.ACCOUNT_EXPIRED` in addition to the two reasons in the original spec, so it is included for completeness.

- [ ] **Step 1: Write the failing tests**

Read `backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java` first to find its existing `@BeforeEach` user-seeding helper before adding tests, then add these imports:

```java
import com.platform.exercise.repository.UserRepository;
```
(only if not already imported — `AuthControllerTest` already imports `UserRepository`)

Add:
```java
import io.micrometer.core.instrument.MeterRegistry;
```

Add field:
```java
    @Autowired private MeterRegistry meterRegistry;
```

Add these test methods (using the same MockMvc login pattern already present in the file — adjust the JSON body field names and login endpoint path to match what the existing tests in this file already use):

```java
    @Test
    void login_wrongPassword_recordsBadCredentialsMetric() throws Exception {
        double before = countAuthFailures("bad_credentials");

        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"nonexistent-metrics-test-user\",\"password\":\"wrong\"}"))
            .andExpect(status().is4xxClientError());

        assertThat(countAuthFailures("bad_credentials")).isEqualTo(before + 1);
    }

    private double countAuthFailures(String reason) {
        var counter = meterRegistry.find("security.auth.failure").tag("reason", reason).counter();
        return counter == null ? 0.0 : counter.count();
    }
```

Add the AssertJ import if not already present:
```java
import static org.assertj.core.api.Assertions.assertThat;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=AuthControllerTest`
Expected: FAIL — `countAuthFailures("bad_credentials")` stays at `before` (no metric recorded yet).

- [ ] **Step 3: Write the implementation**

Modify `backend/src/main/java/com/platform/exercise/auth/AuthService.java`:

Add import:
```java
import com.platform.exercise.metrics.SecurityMetrics;
```

Add field (next to `passwordEncoder`):
```java
    private final SecurityMetrics securityMetrics;
```

Update `login()`:
```java
    @Transactional
    public AuthResponse login(LoginRequest request, HttpServletResponse response) {
        User user = userRepository.findByUsername(request.username())
            .orElseThrow(() -> {
                securityMetrics.recordAuthFailure("bad_credentials");
                return new PlatformException(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials");
            });

        if (user.isExpired()) {
            securityMetrics.recordAuthFailure("account_expired");
            throw new PlatformException(ErrorCode.ACCOUNT_EXPIRED,
                "Account has expired — please contact an administrator");
        }

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            securityMetrics.recordAuthFailure("bad_credentials");
            throw new PlatformException(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials");
        }

        if (user.getStatus() == User.UserStatus.DISABLED) {
            securityMetrics.recordAuthFailure("account_disabled");
            throw new PlatformException(ErrorCode.ACCOUNT_DISABLED,
                "Account disabled — please contact an administrator");
        }

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        String accessToken = jwtUtil.generateToken(user.getId(), user.getRole().name());

        String rawToken = UUID.randomUUID().toString();
        RefreshToken rt = new RefreshToken();
        rt.setUserId(user.getId());
        rt.setTokenHash(sha256(rawToken));
        rt.setExpiresAt(LocalDateTime.now().plusDays(7));
        refreshTokenRepository.save(rt);

        addRefreshCookie(response, rawToken, 7 * 24 * 60 * 60);
        return new AuthResponse(accessToken, UserDto.from(user));
    }
```

(`refresh()` and `logout()` are unchanged — the scope here is login, the actual brute-force-relevant security signal, consistent with `RateLimitFilter`'s login-specific rate limiting.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=AuthControllerTest`
Expected: PASS, all tests green including the new one.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/auth/AuthService.java backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java
git commit -m "feat(metrics): record auth-failure security metric on login"
```

---

### Task 8: Wire `SecurityMetrics` into `SubmissionService` ZIP validation

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java`
- Modify: `backend/src/test/java/com/platform/exercise/submission/SubmissionImportRestrictionTest.java`

**Interfaces:**
- Consumes: `SecurityMetrics` from Task 5 (`recordImportRejected`).
- Produces: `SubmissionService` constructor gains an 8th parameter, `SecurityMetrics securityMetrics`, appended after `objectMapper`.

- [ ] **Step 1: Write the failing test**

Modify `backend/src/test/java/com/platform/exercise/submission/SubmissionImportRestrictionTest.java`:

Add imports:
```java
import com.platform.exercise.metrics.SecurityMetrics;
import java.io.ByteArrayOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.mockito.Mockito.verify;
```

Add mock field:
```java
    @Mock SecurityMetrics securityMetrics;
```

Update `setUp()`:
```java
    @BeforeEach
    void setUp() {
        submissionService = new SubmissionService(
            submissionRepository, exerciseRepository, versionRepository,
            fileImportService, batchCache, importBatchRepository, objectMapper,
            securityMetrics);
    }
```

Add this test method:
```java
    @Test
    void importFiles_zipWithPathTraversalEntry_recordsSecurityMetricAndThrows() throws IOException {
        byte[] maliciousZip = zipWithEntry("../../etc/passwd", "x".getBytes(StandardCharsets.UTF_8));
        MockMultipartFile zipFile = new MockMultipartFile("files", "evil.zip", "application/zip", maliciousZip);

        org.junit.jupiter.api.Assertions.assertThrows(
            com.platform.exercise.common.PlatformException.class,
            () -> submissionService.importFiles(List.of(zipFile), null));

        verify(securityMetrics).recordImportRejected("path_traversal");
    }

    private static byte[] zipWithEntry(String entryName, byte[] content) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            zos.putNextEntry(new ZipEntry(entryName));
            zos.write(content);
            zos.closeEntry();
        }
        return baos.toByteArray();
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=SubmissionImportRestrictionTest`
Expected: FAIL — compilation error, `SubmissionService` has no 8-arg constructor.

- [ ] **Step 3: Write the implementation**

Modify `backend/src/main/java/com/platform/exercise/submission/SubmissionService.java`:

Add import:
```java
import com.platform.exercise.metrics.SecurityMetrics;
```

Add field (after `objectMapper`):
```java
    private final SecurityMetrics securityMetrics;
```

Update the ZIP-expansion block inside `importFiles()`:
```java
            if (originalName.toLowerCase().endsWith(".zip")) {
                // Expand ZIP and validate each entry
                try (ZipInputStream zis =
                         new ZipInputStream(new ByteArrayInputStream(fileBytes))) {
                    ZipEntry entry;
                    long totalBytes = 0;
                    int fileCount = 0;
                    while ((entry = zis.getNextEntry()) != null) {
                        if (entry.isDirectory()) { zis.closeEntry(); continue; }
                        String entryName = entry.getName();
                        if (entryName.contains("..")) {
                            securityMetrics.recordImportRejected("path_traversal");
                            throw new PlatformException(
                                ErrorCode.ZIP_PATH_TRAVERSAL,
                                "Path traversal detected: " + entryName);
                        }
                        if (++fileCount > 500) {
                            securityMetrics.recordImportRejected("too_large");
                            throw new PlatformException(
                                ErrorCode.ZIP_TOO_LARGE,
                                "ZIP contains more than 500 files.");
                        }
                        byte[] content = zis.readAllBytes();
                        totalBytes += content.length;
                        if (totalBytes > 100L * 1024 * 1024) {
                            securityMetrics.recordImportRejected("too_large");
                            throw new PlatformException(
                                ErrorCode.ZIP_TOO_LARGE,
                                "Decompressed ZIP exceeds 100 MB.");
                        }
                        String filename = new java.io.File(entryName).getName();
                        if (filename.toLowerCase().endsWith(".json")) {
                            entries.add(new FileEntry(filename, content));
                        }
                        zis.closeEntry();
                    }
                }
            } else if (originalName.toLowerCase().endsWith(".json")) {
                entries.add(new FileEntry(originalName, fileBytes));
            } else {
                problems.add(new ImportProblemDto(originalName, "Unsupported file type."));
            }
```

Update the post-phase-1 validation check:
```java
        if (!problems.isEmpty()) {
            securityMetrics.recordImportRejected("invalid");
            return ImportResponseDto.validationFailed(problems);
        }
```

Update the exercise-mismatch check:
```java
        if (distinctIds.size() > 1) {
            long expected = distinctIds.iterator().next();
            List<ImportProblemDto> mismatchProblems = fileExerciseIds.entrySet().stream()
                .filter(entry -> entry.getValue() != expected)
                .map(entry -> new ImportProblemDto(entry.getKey(),
                    "Exercise mismatch: this file belongs to exercise #" + entry.getValue()
                    + ", but the batch expects exercise #" + expected))
                .toList();
            securityMetrics.recordImportRejected("invalid");
            return ImportResponseDto.validationFailed(mismatchProblems);
        }
```

Update `forceImport()`:
```java
    @Transactional
    public ImportResultDto forceImport(ForceImportRequest req) throws IOException {
        byte[] bytes = batchCache.get(req.batchId(), req.filename())
            .orElseThrow(() -> {
                securityMetrics.recordImportRejected("invalid");
                return new PlatformException(ErrorCode.IMPORT_FILE_INVALID,
                    "Batch expired — please re-import the file.");
            });
        return fileImportService.processSingleFile(req.filename(), bytes, req.batchId(), true);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=SubmissionImportRestrictionTest`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/SubmissionService.java backend/src/test/java/com/platform/exercise/submission/SubmissionImportRestrictionTest.java
git commit -m "feat(metrics): record import-rejected security metric for ZIP validation failures"
```

---

### Task 9: "Security & Abuse" Grafana dashboard

**Files:**
- Create: `monitoring/grafana/provisioning/dashboards/security-abuse.json`

**Interfaces:**
- Consumes: `security_rate_limit_exceeded_total{endpoint}`, `security_auth_failure_total{reason}`, `security_import_rejected_total{reason}` (from Tasks 5-8).

- [ ] **Step 1: Create the dashboard JSON**

```json
{
  "annotations": { "list": [] },
  "description": "Security & Abuse — rate limiting, auth failures, and malicious import attempts",
  "editable": false,
  "graphTooltip": 1,
  "id": null,
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "ops" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "id": 1,
      "targets": [
        { "expr": "sum(rate(security_rate_limit_exceeded_total[1m])) by (endpoint)", "legendFormat": "{{endpoint}}" }
      ],
      "title": "Rate-Limit Hits/min by Endpoint",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "ops" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "id": 2,
      "targets": [
        { "expr": "sum(rate(security_auth_failure_total[1m])) by (reason)", "legendFormat": "{{reason}}" }
      ],
      "title": "Auth Failures/min by Reason",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "ops" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 8 },
      "id": 3,
      "targets": [
        { "expr": "sum(rate(security_import_rejected_total[1m])) by (reason)", "legendFormat": "{{reason}}" }
      ],
      "title": "Import Rejections/min by Reason",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 8 },
      "id": 4,
      "targets": [
        { "expr": "sum(increase(security_import_rejected_total{reason=\"path_traversal\"}[1h]))" }
      ],
      "title": "Path-Traversal Attempts (1h)",
      "type": "stat"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 39,
  "tags": ["exercise-platform", "security"],
  "title": "Security & Abuse",
  "uid": "exercise-platform-security",
  "version": 1
}
```

- [ ] **Step 2: Restart Grafana and verify provisioning**

Run: `docker compose restart grafana`
Expected: `docker compose logs grafana | grep -i security-abuse` shows no error lines.

- [ ] **Step 3: Commit**

```bash
git add monitoring/grafana/provisioning/dashboards/security-abuse.json
git commit -m "feat(monitoring): add Security & Abuse Grafana dashboard"
```

---

### Task 10: Repository count queries + `BusinessMetrics` component

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java`
- Modify: `backend/src/main/java/com/platform/exercise/repository/CourseRepository.java`
- Create: `backend/src/main/java/com/platform/exercise/metrics/BusinessMetrics.java`
- Test: `backend/src/test/java/com/platform/exercise/metrics/BusinessMetricsTest.java`

**Interfaces:**
- Produces: `ExerciseRepository.countByDeletedFalseAndStatus(Exercise.Status status): long`; `CourseRepository.countByDeletedFalse(): long`; `BusinessMetrics(MeterRegistry, ExerciseRepository, CourseRepository)`; `void recordSubmissionCreated(String exerciseType)`; `void setActiveStudents30d(long count)` (consumed by Task 11's scheduler).

- [ ] **Step 1: Write the failing test**

```java
package com.platform.exercise.metrics;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.repository.CourseRepository;
import com.platform.exercise.repository.ExerciseRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BusinessMetricsTest {

    @Mock ExerciseRepository exerciseRepository;
    @Mock CourseRepository courseRepository;

    private SimpleMeterRegistry meterRegistry;
    private BusinessMetrics businessMetrics;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        when(exerciseRepository.countByDeletedFalseAndStatus(Exercise.Status.PUBLISHED)).thenReturn(7L);
        when(courseRepository.countByDeletedFalse()).thenReturn(3L);
        businessMetrics = new BusinessMetrics(meterRegistry, exerciseRepository, courseRepository);
    }

    @Test
    void publishedExercisesGauge_reflectsRepositoryCount() {
        assertThat(meterRegistry.find("business.published.exercises").gauge().value()).isEqualTo(7.0);
    }

    @Test
    void activeCoursesGauge_reflectsRepositoryCount() {
        assertThat(meterRegistry.find("business.active.courses").gauge().value()).isEqualTo(3.0);
    }

    @Test
    void recordSubmissionCreated_incrementsCounterWithExerciseTypeTag() {
        businessMetrics.recordSubmissionCreated("BLOCKLY");
        businessMetrics.recordSubmissionCreated("BLOCKLY");
        businessMetrics.recordSubmissionCreated("PYTHON");

        assertThat(meterRegistry.find("business.submission.created").tag("exercise_type", "BLOCKLY").counter().count())
            .isEqualTo(2.0);
        assertThat(meterRegistry.find("business.submission.created").tag("exercise_type", "PYTHON").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void setActiveStudents30d_updatesGauge() {
        businessMetrics.setActiveStudents30d(42L);
        assertThat(meterRegistry.find("business.active.students").gauge().value()).isEqualTo(42.0);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=BusinessMetricsTest`
Expected: FAIL — compilation error, `BusinessMetrics` and `countByDeletedFalseAndStatus`/`countByDeletedFalse` do not exist.

- [ ] **Step 3: Write the implementation**

Add to `backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java`, inside the interface body (anywhere among the other method declarations):
```java
    long countByDeletedFalseAndStatus(Exercise.Status status);
```

Add to `backend/src/main/java/com/platform/exercise/repository/CourseRepository.java`, inside the interface body:
```java
    long countByDeletedFalse();
```

Create `backend/src/main/java/com/platform/exercise/metrics/BusinessMetrics.java`:
```java
package com.platform.exercise.metrics;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.repository.CourseRepository;
import com.platform.exercise.repository.ExerciseRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

@Component
public class BusinessMetrics {

    private final MeterRegistry meterRegistry;
    private final AtomicLong activeStudents30d = new AtomicLong(0);

    public BusinessMetrics(MeterRegistry meterRegistry,
                            ExerciseRepository exerciseRepository,
                            CourseRepository courseRepository) {
        this.meterRegistry = meterRegistry;
        meterRegistry.gauge("business.published.exercises", exerciseRepository,
            repo -> repo.countByDeletedFalseAndStatus(Exercise.Status.PUBLISHED));
        meterRegistry.gauge("business.active.courses", courseRepository,
            CourseRepository::countByDeletedFalse);
        meterRegistry.gauge("business.active.students", activeStudents30d);
    }

    public void recordSubmissionCreated(String exerciseType) {
        Counter.builder("business.submission.created")
            .tag("exercise_type", exerciseType)
            .register(meterRegistry)
            .increment();
    }

    public void setActiveStudents30d(long count) {
        activeStudents30d.set(count);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=BusinessMetricsTest`
Expected: PASS, 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/ExerciseRepository.java backend/src/main/java/com/platform/exercise/repository/CourseRepository.java backend/src/main/java/com/platform/exercise/metrics/BusinessMetrics.java backend/src/test/java/com/platform/exercise/metrics/BusinessMetricsTest.java
git commit -m "feat(metrics): add BusinessMetrics component with published-exercises and active-courses gauges"
```

---

### Task 11: `BusinessMetricsScheduler` for active-students gauge

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`
- Create: `backend/src/main/java/com/platform/exercise/metrics/BusinessMetricsScheduler.java`
- Test: `backend/src/test/java/com/platform/exercise/metrics/BusinessMetricsSchedulerTest.java`

**Interfaces:**
- Consumes: `BusinessMetrics.setActiveStudents30d(long)` from Task 10.
- Produces: `SubmissionRepository.countDistinctActiveStudentsSince(LocalDateTime since): long`.

- [ ] **Step 1: Write the failing test**

```java
package com.platform.exercise.metrics;

import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BusinessMetricsSchedulerTest {

    @Mock SubmissionRepository submissionRepository;
    @Mock BusinessMetrics businessMetrics;

    @Test
    void refreshActiveStudents_queriesLast30DaysAndUpdatesGauge() {
        when(submissionRepository.countDistinctActiveStudentsSince(any())).thenReturn(15L);

        BusinessMetricsScheduler scheduler = new BusinessMetricsScheduler(submissionRepository, businessMetrics);
        scheduler.refreshActiveStudents();

        verify(businessMetrics).setActiveStudents30d(15L);

        ArgumentCaptor<LocalDateTime> sinceCaptor = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(submissionRepository).countDistinctActiveStudentsSince(sinceCaptor.capture());
        assertThat(sinceCaptor.getValue()).isBefore(LocalDateTime.now().minusDays(29));
        assertThat(sinceCaptor.getValue()).isAfter(LocalDateTime.now().minusDays(31));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=BusinessMetricsSchedulerTest`
Expected: FAIL — compilation error, `BusinessMetricsScheduler` and `countDistinctActiveStudentsSince` do not exist.

- [ ] **Step 3: Write the implementation**

Add to `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`, inside the interface body:
```java
    @Query("""
            SELECT COUNT(DISTINCT s.studentName) FROM Submission s
            WHERE s.exportTimestamp >= :since AND s.deleted = false
            """)
    long countDistinctActiveStudentsSince(@Param("since") LocalDateTime since);
```

Create `backend/src/main/java/com/platform/exercise/metrics/BusinessMetricsScheduler.java`:
```java
package com.platform.exercise.metrics;

import com.platform.exercise.repository.SubmissionRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
@Slf4j
public class BusinessMetricsScheduler {

    private final SubmissionRepository submissionRepository;
    private final BusinessMetrics businessMetrics;

    @PostConstruct
    @Scheduled(fixedRate = 5 * 60 * 1000)
    public void refreshActiveStudents() {
        long count = submissionRepository.countDistinctActiveStudentsSince(LocalDateTime.now().minusDays(30));
        businessMetrics.setActiveStudents30d(count);
        log.debug("Active students (30d) gauge refreshed: {}", count);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=BusinessMetricsSchedulerTest`
Expected: PASS, 1 test green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java backend/src/main/java/com/platform/exercise/metrics/BusinessMetricsScheduler.java backend/src/test/java/com/platform/exercise/metrics/BusinessMetricsSchedulerTest.java
git commit -m "feat(metrics): add scheduled refresh of active-students gauge"
```

---

### Task 12: Wire `SecurityMetrics` (duplicate) + `BusinessMetrics` (submission created) into `FileImportService`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/submission/FileImportService.java`
- Modify: `backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java`

**Interfaces:**
- Consumes: `SecurityMetrics.recordImportRejected(String)` (Task 5), `BusinessMetrics.recordSubmissionCreated(String)` (Task 10).
- Produces: `FileImportService` constructor gains two parameters, `SecurityMetrics securityMetrics` and `BusinessMetrics businessMetrics`, appended after `importBatchRepository`.

- [ ] **Step 1: Write the failing tests**

Modify `backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java`:

Add imports:
```java
import com.platform.exercise.metrics.BusinessMetrics;
import com.platform.exercise.metrics.SecurityMetrics;

import static org.mockito.Mockito.verify;
```

Add mock fields:
```java
    @Mock SecurityMetrics securityMetrics;
    @Mock BusinessMetrics businessMetrics;
```

Update `setUp()`:
```java
    @BeforeEach
    void setUp() {
        service = new FileImportService(
            exerciseRepository, versionRepository, submissionRepository,
            blocklyGrader, pythonGrader, batchCache, new ObjectMapper(),
            userRepository, importBatchRepository, securityMetrics, businessMetrics);
    }
```

Add these test methods (place near `processSingleFile_validJson_returnsImported`):
```java
    @Test
    void processSingleFile_validJson_recordsSubmissionCreatedMetric() {
        stubExercise(1L, 10L);
        when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(false);
        Submission saved = new Submission();
        saved.setId(42L);
        when(submissionRepository.save(any())).thenReturn(saved);
        when(blocklyGrader.grade(anyString(), anyString()))
            .thenReturn(new BlocklyGrader.Result(new BigDecimal("100.00"),
                "{\"type\":\"BLOCKLY\",\"passed\":true}"));
        when(userRepository.findByUsername("Alex")).thenReturn(Optional.empty());
        when(importBatchRepository.findByUuid("batch-1")).thenReturn(Optional.empty());

        service.processSingleFile("alex.json", validBlocklyJson(1L), "batch-1", false);

        verify(businessMetrics).recordSubmissionCreated("BLOCKLY");
    }

    @Test
    void processSingleFile_duplicate_recordsSecurityMetric() {
        stubExercise(1L, 10L);
        when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(true);

        ImportResultDto result = service.processSingleFile("alex.json", validBlocklyJson(1L), "batch-1", false);

        assertThat(result.status()).isEqualTo("DUPLICATE");
        verify(securityMetrics).recordImportRejected("duplicate");
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=FileImportServiceTest`
Expected: FAIL — compilation error, `FileImportService` has no 11-arg constructor.

- [ ] **Step 3: Write the implementation**

Modify `backend/src/main/java/com/platform/exercise/submission/FileImportService.java`:

Add imports:
```java
import com.platform.exercise.metrics.BusinessMetrics;
import com.platform.exercise.metrics.SecurityMetrics;
```

Add fields (after `importBatchRepository`):
```java
    private final SecurityMetrics securityMetrics;
    private final BusinessMetrics businessMetrics;
```

Update the duplicate-check branch inside `processSingleFile()`:
```java
            if (!skipDuplicateCheck && submissionRepository
                    .existsActiveByStudentNameAndExerciseIdAndExportTimestamp(
                        studentName, exerciseId, exportedAt)) {
                batchCache.put(batchId, filename, content);
                securityMetrics.recordImportRejected("duplicate");
                return logAndReturn(batchId, ImportResultDto.duplicate(filename, studentName, null));
            }
```

Update the submission-save block:
```java
            Submission saved = submissionRepository.save(sub);
            businessMetrics.recordSubmissionCreated(exerciseType);

            return logAndReturn(batchId, ImportResultDto.imported(filename, saved.getId(), studentName,
                exercise.getTitle(), exerciseType, autoScore, versionMismatch));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=FileImportServiceTest`
Expected: PASS, all tests green including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/submission/FileImportService.java backend/src/test/java/com/platform/exercise/submission/FileImportServiceTest.java
git commit -m "feat(metrics): record duplicate-import security metric and submission-created business metric"
```

---

### Task 13: "Usage" Grafana dashboard

**Files:**
- Create: `monitoring/grafana/provisioning/dashboards/usage.json`

**Interfaces:**
- Consumes: `business_submission_created_total{exercise_type}`, `business_active_students`, `business_published_exercises`, `business_active_courses` (from Tasks 10-12).

- [ ] **Step 1: Create the dashboard JSON**

```json
{
  "annotations": { "list": [] },
  "description": "Usage — submission volume, active students, published exercises and courses",
  "editable": false,
  "graphTooltip": 1,
  "id": null,
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "ops" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 16, "x": 0, "y": 0 },
      "id": 1,
      "targets": [
        { "expr": "sum(rate(business_submission_created_total[1h])) by (exercise_type)", "legendFormat": "{{exercise_type}}" }
      ],
      "title": "Submissions/hour by Exercise Type",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 8, "x": 16, "y": 0 },
      "id": 2,
      "targets": [
        { "expr": "business_active_students" }
      ],
      "title": "Active Students (30d)",
      "type": "stat"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 8, "x": 0, "y": 8 },
      "id": 3,
      "targets": [
        { "expr": "business_published_exercises" }
      ],
      "title": "Published Exercises",
      "type": "stat"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 8, "x": 8, "y": 8 },
      "id": 4,
      "targets": [
        { "expr": "business_active_courses" }
      ],
      "title": "Active Courses",
      "type": "stat"
    }
  ],
  "refresh": "1m",
  "schemaVersion": 39,
  "tags": ["exercise-platform", "usage"],
  "title": "Usage",
  "uid": "exercise-platform-usage",
  "version": 1
}
```

- [ ] **Step 2: Restart Grafana and verify provisioning**

Run: `docker compose restart grafana`
Expected: `docker compose logs grafana | grep -i usage` shows no error lines.

- [ ] **Step 3: Commit**

```bash
git add monitoring/grafana/provisioning/dashboards/usage.json
git commit -m "feat(monitoring): add Usage Grafana dashboard"
```

---

### Task 14: Full backend test suite + manual end-to-end verification

**Files:** None modified — verification only.

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && mvn test`
Expected: PASS, all tests green (including all tests added in Tasks 1-12).

- [ ] **Step 2: Rebuild and redeploy the api-server, prometheus, and grafana containers**

```bash
docker compose build api-server
docker compose up -d api-server prometheus grafana
```
Expected: all three containers report healthy/running via `docker compose ps`.

- [ ] **Step 3: Exercise the grading pipeline panels**

Submit at least one Blockly exercise (correct answer) and one Python exercise through the normal import flow (or via the student "Run"/submit UI if it routes through the same grading services), then open Grafana at `http://localhost:3001`, navigate to the "Grading Pipeline" dashboard, and confirm the "Grading Throughput" and "p95 Grading Duration" panels show non-empty data points within the last 5 minutes.

- [ ] **Step 4: Exercise the security panels**

Trigger the login rate limit: send 11 rapid POST requests to `/api/v1/auth/login` with bad credentials from the same IP (e.g. via `curl` in a loop). Confirm the "Security & Abuse" dashboard's "Rate-Limit Hits/min by Endpoint" panel shows a `login` data point, and "Auth Failures/min by Reason" shows `bad_credentials`.

- [ ] **Step 5: Exercise the usage panels**

After Step 3's submissions, confirm the "Usage" dashboard's "Submissions/hour by Exercise Type" panel shows both `BLOCKLY` and `PYTHON` series, and "Published Exercises" / "Active Courses" stat panels show non-zero values matching the actual DB state.

- [ ] **Step 6: Confirm no regressions in the existing "Exercise Platform" dashboard**

Open the pre-existing `platform.json` dashboard and confirm its panels (Request Rate, p95 Latency, Error Rate, JVM Heap, DB Connections) still render normally — confirms the `sandbox.grading.duration` → `grading.python.duration` rename and all other changes didn't break unrelated metrics collection.

No commit for this task — it is verification-only. If any step surfaces a bug, fix it as part of the task whose code is at fault and re-run that task's tests before returning here.

---

## Self-Review Notes

- **Spec coverage:** every metric, dashboard panel, and component named in `docs/superpowers/specs/2026-06-30-monitoring-dashboards-design.md` has a corresponding task. Two refinements made during planning, both consistent with spec intent: (1) `FileImportService.processZip()` is dead code (only called from its own test) — actual production ZIP validation lives in `SubmissionService.importFiles()`, so Task 8 instruments the real call site instead. (2) `AuthService` has a third failure path (`ACCOUNT_EXPIRED`) not anticipated in the spec's two-reason list — Task 7 adds `account_expired` as a third tag value for completeness.
- **Placeholder scan:** no TBD/TODO markers; every step has complete code.
- **Type consistency:** `GradingMetrics`, `SecurityMetrics`, `BusinessMetrics` method signatures are identical between their defining task and every consuming task. Constructor parameter lists for `BlocklyGrader`, `PythonGrader`, `SubmissionService`, `FileImportService` are stated explicitly in each task with exact append position.
