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
