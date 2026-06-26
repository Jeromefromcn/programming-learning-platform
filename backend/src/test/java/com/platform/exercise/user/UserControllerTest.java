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

import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
        admin.setUsername("admin_test");          // avoid collision with V2 Flyway seed (username 'admin')
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
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
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
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
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
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
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
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void patchRole_validRequest_returns200() throws Exception {
        User target = userRepository.findByUsername("student1").orElseThrow();
        mockMvc.perform(patch("/v1/users/" + target.getId() + "/role")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"TUTOR\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("TUTOR"));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void patchStatus_disableSelf_returns400() throws Exception {
        mockMvc.perform(patch("/v1/users/" + adminId + "/status")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"DISABLED\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void importUsers_validRequest_returns200WithCount() throws Exception {
        mockMvc.perform(post("/v1/users/import")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"users":[{"username":"imported1","displayName":"Imported One",\
                        "password":"pass1234","role":"STUDENT"}]}
                        """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.imported").value(1));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void importUsers_duplicateUsername_returns400WithRowErrors() throws Exception {
        mockMvc.perform(post("/v1/users/import")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"users":[{"username":"student1","displayName":"Dup",\
                        "password":"pass1234","role":"STUDENT"}]}
                        """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("IMPORT_VALIDATION_ERROR"))
            .andExpect(jsonPath("$.error.rows[0].row").value(2))
            .andExpect(jsonPath("$.error.rows[0].field").value("username"));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void importUsers_allOrNothing_noUsersCreatedOnError() throws Exception {
        mockMvc.perform(post("/v1/users/import")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"users":[
                          {"username":"valid_new","displayName":"Valid","password":"pass1234","role":"STUDENT"},
                          {"username":"student1","displayName":"Dup","password":"pass1234","role":"STUDENT"}
                        ]}
                        """))
            .andExpect(status().isBadRequest());
        assertFalse(userRepository.existsByUsername("valid_new"));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void importUsers_withExpirationDate_setsExpirationDate() throws Exception {
        mockMvc.perform(post("/v1/users/import")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"users":[{"username":"expiring_import","displayName":"Expiring",\
                        "password":"pass1234","role":"STUDENT",\
                        "expirationDate":"2027-06-01T00:00:00"}]}
                        """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.imported").value(1));

        User user = userRepository.findByUsername("expiring_import").orElseThrow();
        assertEquals(java.time.LocalDateTime.parse("2027-06-01T00:00:00"), user.getExpirationDate());
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void importUsers_pastExpirationDate_returns400() throws Exception {
        String pastDate = LocalDateTime.now().minusDays(1).toString();

        mockMvc.perform(post("/v1/users/import")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"users":[{"username":"pastimport","displayName":"Past Import",\
                        "password":"pass1234","role":"STUDENT",\
                        "expirationDate":"%s"}]}
                        """.formatted(pastDate)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("IMPORT_VALIDATION_ERROR"))
            .andExpect(jsonPath("$.error.rows[0].field").value("expirationDate"));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void changePassword_validRequest_returns204AndUpdatesHash() throws Exception {
        mockMvc.perform(patch("/v1/users/me/password")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"currentPassword":"password123","newPassword":"newpassword99"}
                        """))
            .andExpect(status().isNoContent());
        User updated = userRepository.findByUsername("admin_test").orElseThrow();
        assertTrue(passwordEncoder.matches("newpassword99", updated.getPasswordHash()));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void changePassword_wrongCurrentPassword_returns400() throws Exception {
        mockMvc.perform(patch("/v1/users/me/password")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"currentPassword":"wrongpassword","newPassword":"newpassword99"}
                        """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("WRONG_CURRENT_PASSWORD"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void changePassword_asStudent_returns204() throws Exception {
        mockMvc.perform(patch("/v1/users/me/password")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"currentPassword":"password123","newPassword":"newpassword99"}
                        """))
            .andExpect(status().isNoContent());
        User updated = userRepository.findByUsername("student1").orElseThrow();
        assertTrue(passwordEncoder.matches("newpassword99", updated.getPasswordHash()));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void changePassword_shortNewPassword_returns400() throws Exception {
        mockMvc.perform(patch("/v1/users/me/password")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"currentPassword":"password123","newPassword":"short"}
                        """))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void resetPassword_validTarget_returns204AndSetsKnownHash() throws Exception {
        User target = userRepository.findByUsername("student1").orElseThrow();
        mockMvc.perform(post("/v1/users/" + target.getId() + "/reset-password"))
            .andExpect(status().isNoContent());
        User updated = userRepository.findByUsername("student1").orElseThrow();
        assertTrue(passwordEncoder.matches("12345678", updated.getPasswordHash()));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void resetPassword_self_returns400() throws Exception {
        mockMvc.perform(post("/v1/users/" + adminId + "/reset-password"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("CANNOT_MODIFY_SELF"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void resetPassword_asStudent_returns403() throws Exception {
        mockMvc.perform(post("/v1/users/1/reset-password"))
            .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void resetPassword_unknownId_returns404() throws Exception {
        mockMvc.perform(post("/v1/users/999999/reset-password"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("USER_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void patchExpiration_validRequest_returns200WithExpirationDate() throws Exception {
        User target = userRepository.findByUsername("student1").orElseThrow();
        String futureDate = LocalDateTime.now().plusDays(30).toString();

        mockMvc.perform(patch("/v1/users/" + target.getId() + "/expiration")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expirationDate\":\"" + futureDate + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.expirationDate").isNotEmpty());
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void patchExpiration_clearExpiration_returns200WithNull() throws Exception {
        User target = userRepository.findByUsername("student1").orElseThrow();
        target.setExpirationDate(LocalDateTime.now().plusDays(30));
        userRepository.save(target);

        mockMvc.perform(patch("/v1/users/" + target.getId() + "/expiration")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expirationDate\":null}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.expirationDate").isEmpty());
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void createUser_withExpirationDate_returns201WithDate() throws Exception {
        String futureDate = LocalDateTime.now().plusDays(30).toString();

        mockMvc.perform(post("/v1/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"username":"expiringuser","displayName":"Expiring User",\
                        "password":"securepass1","role":"STUDENT",\
                        "expirationDate":"%s"}
                        """.formatted(futureDate)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.expirationDate").isNotEmpty());
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void createUser_pastExpirationDate_returns400() throws Exception {
        String pastDate = LocalDateTime.now().minusDays(1).toString();

        mockMvc.perform(post("/v1/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"username":"pastuser","displayName":"Past User",\
                        "password":"securepass1","role":"STUDENT",\
                        "expirationDate":"%s"}
                        """.formatted(pastDate)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void patchExpiration_pastDate_returns400() throws Exception {
        User target = userRepository.findByUsername("student1").orElseThrow();
        String pastDate = LocalDateTime.now().minusDays(1).toString();

        mockMvc.perform(patch("/v1/users/" + target.getId() + "/expiration")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expirationDate\":\"" + pastDate + "\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void listUsers_returnsExpirationDateField() throws Exception {
        userRepository.findByUsername("admin_test").ifPresent(u -> {
            u.setExpirationDate(LocalDateTime.now().plusDays(30));
            userRepository.save(u);
        });

        mockMvc.perform(get("/v1/users"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.username=='admin_test')].expirationDate").isNotEmpty());
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void listUsers_returnsLastLoginAtField() throws Exception {
        User target = userRepository.findByUsername("student1").orElseThrow();
        target.setLastLoginAt(LocalDateTime.of(2026, 1, 15, 10, 30));
        userRepository.save(target);

        mockMvc.perform(get("/v1/users"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.username=='student1')].lastLoginAt").isNotEmpty());
    }

    @Test
    @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
    void listUsers_returnsNullLastLoginAtWhenNeverLoggedIn() throws Exception {
        mockMvc.perform(get("/v1/users"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.username=='student1')].lastLoginAt[0]").doesNotExist());
    }
}
