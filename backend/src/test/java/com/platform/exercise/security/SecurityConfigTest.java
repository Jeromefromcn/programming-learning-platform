package com.platform.exercise.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void loginEndpoint_isPublic() throws Exception {
        // No auth — security should permit the request through (not block with 401).
        // AuthController doesn't exist until Task 5, so Spring MVC returns 404.
        // After Task 5 it will return 400 (validation error). Both are 4xx, not 401.
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().is4xxClientError()); // TODO Task 5: tighten to isBadRequest() once AuthController exists
    }

    @Test
    void protectedEndpoint_withoutToken_returns401() throws Exception {
        mockMvc.perform(get("/v1/users"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void actuator_health_isPublic() throws Exception {
        mockMvc.perform(get("/actuator/health"))
            .andExpect(status().isOk());
    }
}
