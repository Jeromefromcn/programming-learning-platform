# Design: Rhino Instruction Limit for Blockly Grading

**Date:** 2026-06-04
**Status:** Approved

## Problem

`BlocklyGrader` runs student JavaScript (generated from Blockly) inside the Rhino engine. A 3-second `Future.get()` timeout exists, but `future.cancel(true)` only sets a thread interrupt flag — it has no effect on a tight CPU loop (`while(true){}`). The thread keeps running after the timeout, consuming CPU indefinitely. With `newCachedThreadPool()`, concurrent malicious or buggy submissions can pile up unlimited zombie threads and exhaust the server.

## Goal

- Infinite loops and runaway code are **terminated inside Rhino** before reaching the timeout
- Zombie threads are **impossible**: the executing thread always exits
- Server stability is guaranteed regardless of student code content
- No deprecated APIs (`Thread.stop()`)

## Approach: Rhino Instruction Observer

Rhino's interpreted mode (`setOptimizationLevel(-1)`) supports an instruction observer. Every N instructions Rhino calls `observeInstructionCount()` on the `ContextFactory`. Throwing from that callback unwinds the JS call stack and exits `evaluateString()` cleanly. The thread terminates normally — no external kill needed.

## Components

### 1. New: `RhinoSandbox.java`

Location: `backend/src/main/java/com/platform/exercise/grading/RhinoSandbox.java`

Responsibilities:
- Owns a private static inner `ContextFactory` subclass that overrides `observeInstructionCount()`
- Registers the factory once via `ContextFactory.initGlobal()` at class load time
- Exposes a single method: `String execute(String code) throws InstructionLimitExceededException`

Instruction observer logic:
- `setInstructionObserverThreshold(10_000)` — observer called every 10,000 instructions (low call overhead)
- Observer reads cumulative count from `cx.getThreadLocal(COUNT_KEY)`, adds the current delta, writes back
- When total exceeds **5,000,000**, throws `InstructionLimitExceededException` (a `RuntimeException`). Note: Rhino counts bytecode-level operations, not source statements — a 50K-iteration `for` loop consumes ~1.1M Rhino instructions, so 500K was too low.
- Counter is stored per-`Context` (thread-local), so concurrent executions are fully independent

The `execute()` method:
- Calls `Context.enter()` / `Context.exit()` in a try-finally
- Sets up `initSafeStandardObjects()`, `print` function, `window.alert` / `window.prompt` shim (moved from `BlocklyGrader`)
- Catches `InstructionLimitExceededException` and re-throws it; lets all other exceptions propagate

### 2. Modified: `BlocklyGrader.java`

Changes:
- Inject `RhinoSandbox` (Spring `@Component`, constructor injection)
- Replace `runInRhino(studentCode)` call with `rhinoSandbox.execute(studentCode)`
- Remove the inline `runInRhino()` method and the direct Rhino imports
- Add catch for `InstructionLimitExceededException` alongside `TimeoutException` → maps to error string `"INSTRUCTION_LIMIT_EXCEEDED"`
- Replace `Executors.newCachedThreadPool()` with `Executors.newFixedThreadPool(4)` — caps concurrent grading threads at 4; excess requests queue rather than spawning unbounded threads

### 3. New exception: `InstructionLimitExceededException`

A simple `RuntimeException` subclass. Lives in the `grading` package. Used as a typed signal from `RhinoSandbox` to `BlocklyGrader`.

## Error Handling

| Condition | Error string in response JSON |
|---|---|
| Instruction limit hit (infinite loop) | `INSTRUCTION_LIMIT_EXCEEDED` |
| Wall-clock timeout (fallback, should rarely trigger) | `TIME_LIMIT_EXCEEDED` |
| JS runtime error | exception message |

The 3-second `Future.get()` timeout is kept as a belt-and-suspenders fallback in case a future Rhino version or edge case slips past the instruction counter.

## Limits

| Parameter | Value | Rationale |
|---|---|---|
| Instruction observer threshold | 10,000 | Low overhead; observer overhead is negligible at this granularity |
| Instruction limit | 5,000,000 | Rhino counts bytecode ops; 50K source iterations ≈ 1.1M Rhino instructions. 5M allows reasonable programs while killing tight infinite loops in <2s |
| Grading thread pool size | 4 | Matches CPU cores for compute-bound work; prevents unbounded thread creation |
| Wall-clock timeout (existing) | 3 seconds | Safety fallback only |

## Testing

- Unit test: `BlocklyGraderTest` — add cases for `while(true){}`; assert result contains `INSTRUCTION_LIMIT_EXCEEDED` and completes in < 2 seconds
- Unit test: `RhinoSandboxTest` — test `execute()` directly: normal code returns output, infinite loop throws `InstructionLimitExceededException`
- Existing passing tests must remain green

## Out of Scope

- Client-side Blockly execution (Web Worker) — already safe, unchanged
- Python grading — uses nsjail, unchanged
- Changing the grading score formula or response schema
