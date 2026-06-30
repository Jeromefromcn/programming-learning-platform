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
