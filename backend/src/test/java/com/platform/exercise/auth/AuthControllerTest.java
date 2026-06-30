package com.platform.exercise.auth;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AuthControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private MeterRegistry meterRegistry;

    @BeforeEach
    void seed() {
        User u = new User();
        u.setUsername("testuser");
        u.setDisplayName("Test User");
        u.setPasswordHash(passwordEncoder.encode("password123"));
        u.setRole(Role.STUDENT);
        u.setStatus(UserStatus.ACTIVE);
        userRepository.save(u);

        User disabled = new User();
        disabled.setUsername("disableduser");
        disabled.setDisplayName("Disabled");
        disabled.setPasswordHash(passwordEncoder.encode("password123"));
        disabled.setRole(Role.STUDENT);
        disabled.setStatus(UserStatus.DISABLED);
        userRepository.save(disabled);

        User expired = new User();
        expired.setUsername("expireduser");
        expired.setDisplayName("Expired");
        expired.setPasswordHash(passwordEncoder.encode("password123"));
        expired.setRole(Role.STUDENT);
        expired.setStatus(UserStatus.ACTIVE);
        expired.setExpirationDate(java.time.LocalDateTime.now().minusDays(1));
        userRepository.save(expired);
    }

    @Test
    void login_validCredentials_returns200WithToken() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"testuser\",\"password\":\"password123\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").isNotEmpty())
            .andExpect(jsonPath("$.user.username").value("testuser"))
            .andExpect(jsonPath("$.user.role").value("STUDENT"))
            .andExpect(cookie().exists("refreshToken"));
    }

    @Test
    void login_wrongPassword_returns401() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"testuser\",\"password\":\"wrong\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void login_disabledUser_returns403() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"disableduser\",\"password\":\"password123\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("ACCOUNT_DISABLED"));
    }

    @Test
    void refresh_noToken_returns401() throws Exception {
        mockMvc.perform(post("/v1/auth/refresh"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void refresh_validCookie_returnsAccessTokenAndUser() throws Exception {
        // First login to obtain a refresh cookie
        var loginResult = mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"testuser\",\"password\":\"password123\"}"))
            .andExpect(status().isOk())
            .andReturn();

        jakarta.servlet.http.Cookie refreshCookie = loginResult.getResponse().getCookie("refreshToken");

        // Now call refresh with that cookie
        mockMvc.perform(post("/v1/auth/refresh").cookie(refreshCookie))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").isNotEmpty())
            .andExpect(jsonPath("$.user.username").value("testuser"))
            .andExpect(jsonPath("$.user.role").value("STUDENT"));
    }

    @Test
    void refresh_disabledUser_returns403() throws Exception {
        // Login as a normal user first to get their refresh cookie
        var loginResult = mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"testuser\",\"password\":\"password123\"}"))
            .andExpect(status().isOk())
            .andReturn();

        jakarta.servlet.http.Cookie refreshCookie = loginResult.getResponse().getCookie("refreshToken");

        // Disable the user in the DB
        User user = userRepository.findByUsername("testuser").orElseThrow();
        user.setStatus(User.UserStatus.DISABLED);
        userRepository.save(user);

        // Refresh should now be denied
        mockMvc.perform(post("/v1/auth/refresh").cookie(refreshCookie))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("ACCOUNT_DISABLED"));
    }

    @Test
    void logout_returns204() throws Exception {
        mockMvc.perform(post("/v1/auth/logout"))
            .andExpect(status().isNoContent());
    }

    @Test
    void login_expiredUser_returns403() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"expireduser\",\"password\":\"password123\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("ACCOUNT_EXPIRED"));
    }

    @Test
    void login_expiredUser_wrongPassword_returns403() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"expireduser\",\"password\":\"wrongpass\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("ACCOUNT_EXPIRED"));
    }

    @Test
    void refresh_expiredUser_returns403() throws Exception {
        var loginResult = mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"testuser\",\"password\":\"password123\"}"))
            .andExpect(status().isOk())
            .andReturn();

        jakarta.servlet.http.Cookie refreshCookie = loginResult.getResponse().getCookie("refreshToken");

        User user = userRepository.findByUsername("testuser").orElseThrow();
        user.setExpirationDate(java.time.LocalDateTime.now().minusDays(1));
        userRepository.save(user);

        mockMvc.perform(post("/v1/auth/refresh").cookie(refreshCookie))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("ACCOUNT_EXPIRED"));
    }

    @Test
    void login_validCredentials_stampsLastLoginAt() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content("{\"username\":\"testuser\",\"password\":\"password123\"}"))
            .andExpect(status().isOk());

        User updated = userRepository.findByUsername("testuser").orElseThrow();
        assertNotNull(updated.getLastLoginAt(), "lastLoginAt must be set after login");
    }

    @Test
    void login_expirationCleared_returns200() throws Exception {
        User user = userRepository.findByUsername("expireduser").orElseThrow();
        user.setExpirationDate(null);
        userRepository.save(user);

        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"expireduser\",\"password\":\"password123\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").isNotEmpty());
    }

    @Test
    void login_wrongPassword_recordsBadCredentialsMetric() throws Exception {
        double before = countAuthFailures("bad_credentials");

        // Distinct X-Forwarded-For so this call lands in its own RateLimitFilter bucket,
        // isolated from the login-call budget shared by the rest of this test class.
        mockMvc.perform(post("/v1/auth/login")
                .header("X-Forwarded-For", "203.0.113.42")
                .contentType("application/json")
                .content("{\"username\":\"nonexistent-metrics-test-user\",\"password\":\"wrong\"}"))
            .andExpect(status().is4xxClientError());

        assertThat(countAuthFailures("bad_credentials")).isEqualTo(before + 1);
    }

    private double countAuthFailures(String reason) {
        var counter = meterRegistry.find("security.auth.failure").tag("reason", reason).counter();
        return counter == null ? 0.0 : counter.count();
    }
}
