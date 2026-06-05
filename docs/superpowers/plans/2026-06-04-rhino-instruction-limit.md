# Rhino Instruction Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Blockly grading from leaving zombie threads by using Rhino's instruction observer to hard-kill runaway JS (infinite loops, excessive computation) from inside the engine.

**Architecture:** Extract Rhino execution into a new `RhinoSandbox` Spring component that installs a custom `ContextFactory` with an instruction counter. `BlocklyGrader` delegates all JS execution to `RhinoSandbox` and maps `InstructionLimitExceededException` to the `INSTRUCTION_LIMIT_EXCEEDED` error string. The unbounded thread pool is replaced with a fixed pool of 4.

**Tech Stack:** Java 25, Rhino 1.7.15 (`org.mozilla:rhino`), JUnit 5, AssertJ, Spring Boot 3.5.0.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `backend/src/main/java/com/platform/exercise/grading/InstructionLimitExceededException.java` | Typed signal thrown by observer |
| Create | `backend/src/main/java/com/platform/exercise/grading/RhinoSandbox.java` | Custom ContextFactory + JS execution |
| Modify | `backend/src/main/java/com/platform/exercise/grading/BlocklyGrader.java` | Delegate to RhinoSandbox, fix thread pool |
| Create | `backend/src/test/java/com/platform/exercise/grading/RhinoSandboxTest.java` | Unit tests for RhinoSandbox |
| Modify | `backend/src/test/java/com/platform/exercise/grading/BlocklyGraderTest.java` | Update infinite loop test; wire RhinoSandbox |

---

### Task 1: `InstructionLimitExceededException`

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/grading/InstructionLimitExceededException.java`

No test needed — this is a plain signal type with no logic.

- [ ] **Step 1: Create the exception class**

```java
package com.platform.exercise.grading;

public class InstructionLimitExceededException extends RuntimeException {
    public InstructionLimitExceededException() {
        super("INSTRUCTION_LIMIT_EXCEEDED");
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/grading/InstructionLimitExceededException.java
git commit -m "feat(grading): add InstructionLimitExceededException"
```

---

### Task 2: `RhinoSandboxTest` — write failing tests first

**Files:**
- Create: `backend/src/test/java/com/platform/exercise/grading/RhinoSandboxTest.java`

- [ ] **Step 1: Write the failing tests**

```java
package com.platform.exercise.grading;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RhinoSandboxTest {

    private final RhinoSandbox sandbox = new RhinoSandbox();

    @Test
    void execute_normalCode_returnsOutput() {
        String result = sandbox.execute("print('hello');");
        assertThat(result).isEqualTo("hello");
    }

    @Test
    void execute_windowAlert_returnsOutput() {
        String result = sandbox.execute("window.alert('hi');");
        assertThat(result).isEqualTo("hi");
    }

    @Test
    void execute_windowPrompt_returnsEmpty() {
        String result = sandbox.execute("print(window.prompt('x') === '' ? 'ok' : 'fail');");
        assertThat(result).isEqualTo("ok");
    }

    @Test
    void execute_infiniteLoop_throwsInstructionLimitExceeded() {
        long start = System.currentTimeMillis();
        assertThatThrownBy(() -> sandbox.execute("while(true){}"))
                .isInstanceOf(InstructionLimitExceededException.class);
        assertThat(System.currentTimeMillis() - start)
                .as("infinite loop must be killed in under 2 seconds")
                .isLessThan(2000);
    }

    @Test
    void execute_largeButFiniteLoop_completes() {
        // 50K iterations is well within the 500K instruction limit
        String result = sandbox.execute(
                "var x = 0; for (var i = 0; i < 50000; i++) { x = i; } print(x);");
        assertThat(result).isEqualTo("49999");
    }
}
```

- [ ] **Step 2: Run the tests — verify they fail with compilation error**

```bash
cd backend && mvn test -Dtest=RhinoSandboxTest -q 2>&1 | tail -10
```

Expected: compilation error — `RhinoSandbox` does not exist yet.

---

### Task 3: Implement `RhinoSandbox`

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/grading/RhinoSandbox.java`

- [ ] **Step 1: Create `RhinoSandbox.java`**

```java
package com.platform.exercise.grading;

import org.mozilla.javascript.*;
import org.springframework.stereotype.Component;

@Component
public class RhinoSandbox {

    private static final int INSTRUCTION_LIMIT = 500_000;
    private static final int OBSERVER_THRESHOLD = 10_000;
    private static final Object COUNT_KEY = new Object();

    static {
        ContextFactory.initGlobal(new LimitedContextFactory());
    }

    public String execute(String code) {
        StringBuilder output = new StringBuilder();
        Context cx = Context.enter();
        try {
            cx.putThreadLocal(COUNT_KEY, 0);
            Scriptable scope = cx.initSafeStandardObjects();

            BaseFunction printFn = new BaseFunction() {
                @Override
                public Object call(Context cx, Scriptable scope,
                                   Scriptable thisObj, Object[] args) {
                    if (args.length > 0) {
                        output.append(Context.toString(args[0])).append('\n');
                    }
                    return Context.getUndefinedValue();
                }
            };
            scope.put("print", scope, printFn);

            ScriptableObject window = (ScriptableObject) cx.newObject(scope);
            window.put("alert", window, printFn);
            window.put("prompt", window, new BaseFunction() {
                @Override
                public Object call(Context cx, Scriptable scope,
                                   Scriptable thisObj, Object[] args) {
                    return "";
                }
            });
            scope.put("window", scope, window);

            cx.evaluateString(scope, code, "student", 1, null);
        } finally {
            Context.exit();
        }
        return output.toString().stripTrailing();
    }

    private static class LimitedContextFactory extends ContextFactory {

        @Override
        protected Context makeContext() {
            Context cx = super.makeContext();
            cx.setOptimizationLevel(-1);
            cx.setInstructionObserverThreshold(OBSERVER_THRESHOLD);
            return cx;
        }

        @Override
        protected void observeInstructionCount(Context cx, int instructionCount) {
            Integer prev = (Integer) cx.getThreadLocal(COUNT_KEY);
            int total = (prev == null ? 0 : prev) + instructionCount;
            cx.putThreadLocal(COUNT_KEY, total);
            if (total > INSTRUCTION_LIMIT) {
                throw new InstructionLimitExceededException();
            }
        }
    }
}
```

- [ ] **Step 2: Run `RhinoSandboxTest` — all tests must pass**

```bash
cd backend && mvn test -Dtest=RhinoSandboxTest -q 2>&1 | tail -10
```

Expected:
```
[INFO] Tests run: 5, Failures: 0, Errors: 0, Skipped: 0
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/grading/RhinoSandbox.java \
        backend/src/test/java/com/platform/exercise/grading/RhinoSandboxTest.java
git commit -m "feat(grading): add RhinoSandbox with 500K instruction limit"
```

---

### Task 4: Update `BlocklyGraderTest`

**Files:**
- Modify: `backend/src/test/java/com/platform/exercise/grading/BlocklyGraderTest.java`

The existing infinite loop test expects `TIME_LIMIT_EXCEEDED`. After the fix it must return `INSTRUCTION_LIMIT_EXCEEDED`. The grader constructor will also require a `RhinoSandbox` argument.

- [ ] **Step 1: Update the test file**

Replace the entire contents of `BlocklyGraderTest.java` with:

```java
package com.platform.exercise.grading;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class BlocklyGraderTest {

    private final BlocklyGrader grader = new BlocklyGrader(new RhinoSandbox());

    private static final String CONFIG_MATCH_ON =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello World\"}}}";
    private static final String CONFIG_MATCH_OFF =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":false}}}";

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
}
```

- [ ] **Step 2: Run tests — expect compilation failure (BlocklyGrader still has no-arg constructor)**

```bash
cd backend && mvn test -Dtest=BlocklyGraderTest -q 2>&1 | tail -10
```

Expected: compilation error — `BlocklyGrader(RhinoSandbox)` constructor does not exist yet.

---

### Task 5: Update `BlocklyGrader`

**Files:**
- Modify: `backend/src/main/java/com/platform/exercise/grading/BlocklyGrader.java`

- [ ] **Step 1: Rewrite `BlocklyGrader.java`**

Replace the entire contents with:

```java
package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.concurrent.*;

@Component
public class BlocklyGrader {

    private static final int TIMEOUT_SECONDS = 3;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final ObjectMapper mapper = new ObjectMapper();
    private final RhinoSandbox rhinoSandbox;

    public BlocklyGrader(RhinoSandbox rhinoSandbox) {
        this.rhinoSandbox = rhinoSandbox;
    }

    public record Result(BigDecimal autoScore, String autoGradeDetailsJson) {}

    public Result grade(String studentCode, String configJson) {
        try {
            JsonNode config = mapper.readTree(configJson);
            JsonNode outputMatch = config.path("gradingRules").path("outputMatch");

            if (!outputMatch.path("enabled").asBoolean(false)) {
                return new Result(null,
                    "{\"type\":\"BLOCKLY\",\"rule\":\"none\",\"passed\":null," +
                    "\"error\":\"No grading rules configured\"}");
            }

            String expected = outputMatch.path("expectedOutput").asText("").trim();
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
            }

            boolean passed = error == null && expected.equals(actual);
            BigDecimal score = error != null ? null
                    : (passed ? new BigDecimal("100.00")
                              : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));

            String details = String.format(
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":%s," +
                "\"expected\":%s,\"actual\":%s,\"error\":%s}",
                error != null ? "null" : passed,
                mapper.writeValueAsString(expected),
                mapper.writeValueAsString(actual),
                mapper.writeValueAsString(error));

            return new Result(score, details);
        } catch (Exception e) {
            return new Result(null,
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":false," +
                "\"error\":\"" + e.getMessage() + "\"}");
        }
    }
}
```

- [ ] **Step 2: Run all grading tests — all must pass**

```bash
cd backend && mvn test -Dtest="RhinoSandboxTest,BlocklyGraderTest" -q 2>&1 | tail -10
```

Expected:
```
[INFO] Tests run: 11, Failures: 0, Errors: 0, Skipped: 0
```

- [ ] **Step 3: Run full backend test suite — no regressions**

```bash
cd backend && mvn test -q 2>&1 | tail -15
```

Expected: `BUILD SUCCESS` with 0 failures.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/grading/BlocklyGrader.java \
        backend/src/test/java/com/platform/exercise/grading/BlocklyGraderTest.java
git commit -m "feat(grading): wire BlocklyGrader to RhinoSandbox, fix thread pool"
```
