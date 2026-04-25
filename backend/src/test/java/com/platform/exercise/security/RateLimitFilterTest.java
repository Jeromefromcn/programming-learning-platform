package com.platform.exercise.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RateLimitFilterTest {

    @Autowired
    private MockMvc mockMvc;

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
}
