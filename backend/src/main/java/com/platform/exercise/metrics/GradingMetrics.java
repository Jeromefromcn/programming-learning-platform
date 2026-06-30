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
