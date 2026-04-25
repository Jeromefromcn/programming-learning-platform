package com.platform.exercise.auth;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

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
    void logout_returns204() throws Exception {
        mockMvc.perform(post("/v1/auth/logout"))
            .andExpect(status().isNoContent());
    }
}
