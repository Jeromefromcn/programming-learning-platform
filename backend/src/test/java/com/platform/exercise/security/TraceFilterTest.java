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
