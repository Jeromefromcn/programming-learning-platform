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
        // 50K iterations ≈ 1.1M Rhino bytecode ops, well within the 5M limit
        String result = sandbox.execute(
                "var x = 0; for (var i = 0; i < 50000; i++) { x = i; } print(x);");
        assertThat(result).isEqualTo("49999");
    }
}
