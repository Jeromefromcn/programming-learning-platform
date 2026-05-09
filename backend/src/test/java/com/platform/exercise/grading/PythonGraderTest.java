package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.platform.exercise.exercise.SandboxClient;
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
        grader = new PythonGrader(sandboxClient, mapper, meterRegistry);
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
}
