package com.platform.exercise.user;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class UserControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    private Long adminId;

    @BeforeEach
    void seed() {
        User admin = new User();
        admin.setUsername("admin");
        admin.setDisplayName("Admin User");
        admin.setPasswordHash(passwordEncoder.encode("password123"));
        admin.setRole(Role.SUPER_ADMIN);
        admin.setStatus(UserStatus.ACTIVE);
        adminId = userRepository.save(admin).getId();

        User student = new User();
        student.setUsername("student1");
        student.setDisplayName("Student One");
        student.setPasswordHash(passwordEncoder.encode("password123"));
        student.setRole(Role.STUDENT);
        student.setStatus(UserStatus.ACTIVE);
        userRepository.save(student);
    }

    @Test
    @WithMockUser(username = "admin", roles = "SUPER_ADMIN")
    void listUsers_asAdmin_returns200WithPage() throws Exception {
        mockMvc.perform(get("/v1/users"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content").isArray())
            .andExpect(jsonPath("$.totalElements").isNumber());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void listUsers_asStudent_returns403() throws Exception {
        mockMvc.perform(get("/v1/users"))
            .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "admin", roles = "SUPER_ADMIN")
    void createUser_validRequest_returns201() throws Exception {
        mockMvc.perform(post("/v1/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"username":"newuser","displayName":"New User",\
                        "password":"securepass1","role":"STUDENT"}
                        """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.username").value("newuser"))
            .andExpect(jsonPath("$.role").value("STUDENT"));
    }

    @Test
    @WithMockUser(username = "admin", roles = "SUPER_ADMIN")
    void createUser_duplicateUsername_returns409() throws Exception {
        mockMvc.perform(post("/v1/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"username":"student1","displayName":"Dup",\
                        "password":"securepass1","role":"STUDENT"}
                        """))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("USERNAME_TAKEN"));
    }

    @Test
    @WithMockUser(username = "admin", roles = "SUPER_ADMIN")
    void patchRole_validRequest_returns200() throws Exception {
        User target = userRepository.findByUsername("student1").orElseThrow();
        mockMvc.perform(patch("/v1/users/" + target.getId() + "/role")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"TUTOR\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("TUTOR"));
    }

    @Test
    @WithMockUser(username = "admin", roles = "SUPER_ADMIN")
    void patchStatus_disableSelf_returns400() throws Exception {
        mockMvc.perform(patch("/v1/users/" + adminId + "/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"DISABLED\"}"))
            .andExpect(status().isBadRequest());
    }
}
