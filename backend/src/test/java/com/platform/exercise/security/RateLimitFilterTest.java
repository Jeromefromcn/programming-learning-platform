package com.platform.exercise.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RateLimitFilterTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private RateLimitFilter filter;

    @Autowired
    private JwtUtil jwtUtil;

    @Test
    void eleventhLoginRequest_returns429() throws Exception {
        String body = "{\"username\":\"x\",\"password\":\"y\"}";
        // First 10 requests pass through to controller (wrong credentials = 4xx, not 429)
        // TODO Task 5: tighten to isUnauthorized() once AuthController returns 401 for bad credentials
        for (int i = 0; i < 10; i++) {
            mockMvc.perform(post("/v1/auth/login")
                    .header("X-Forwarded-For", "10.0.0.99")
                    .contentType("application/json")
                    .content(body))
                .andExpect(status().is4xxClientError());
        }
        // 11th is rate-limited
        mockMvc.perform(post("/v1/auth/login")
                .header("X-Forwarded-For", "10.0.0.99")
                .contentType("application/json")
                .content(body))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error.code").value("RATE_LIMITED"));
    }

    @Test
    void submitEndpoint_allows20ThenBlocks21st() throws Exception {
        String token = jwtUtil.generateToken(99L, "STUDENT");
        // First 20 requests: filter should pass them through (not 429)
        for (int i = 0; i < 20; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST",
                "/v1/student/exercises/5/submissions");
            req.addHeader("Authorization", "Bearer " + token);
            MockHttpServletResponse ok = new MockHttpServletResponse();
            filter.doFilter(req, ok, new MockFilterChain());
            assertNotEquals(429, ok.getStatus());
        }
        // 21st is rate-limited
        MockHttpServletRequest req = new MockHttpServletRequest("POST",
            "/v1/student/exercises/5/submissions");
        req.addHeader("Authorization", "Bearer " + token);
        MockHttpServletResponse blocked = new MockHttpServletResponse();
        filter.doFilter(req, blocked, new MockFilterChain());
        assertEquals(429, blocked.getStatus());
    }
}
