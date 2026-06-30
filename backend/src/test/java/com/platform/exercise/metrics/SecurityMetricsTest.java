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

        assertThat(meterRegistry.find("security.rate.limit.exceeded").tag("endpoint", "login").counter().count())
            .isEqualTo(2.0);
        assertThat(meterRegistry.find("security.rate.limit.exceeded").tag("endpoint", "import").counter().count())
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
