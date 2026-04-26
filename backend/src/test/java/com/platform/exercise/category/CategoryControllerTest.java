package com.platform.exercise.category;

import com.platform.exercise.domain.Category;
import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.CategoryRepository;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
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
class CategoryControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JdbcTemplate jdbcTemplate;

    private Long tutorId;

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("tutor1");
        tutor.setDisplayName("Tutor One");
        tutor.setPasswordHash(passwordEncoder.encode("password123"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        tutorId = userRepository.save(tutor).getId();
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listCategories_asTutor_returns200WithExerciseCount() throws Exception {
        categoryRepository.save(new Category("Loops"));
        mockMvc.perform(get("/v1/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].name").value("Loops"))
                .andExpect(jsonPath("$[0].exerciseCount").value(0));
    }

    @Test
    void listCategories_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/v1/categories"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createCategory_validName_returns201WithZeroCount() throws Exception {
        mockMvc.perform(post("/v1/categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Recursion\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Recursion"))
                .andExpect(jsonPath("$.exerciseCount").value(0));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void createCategory_asStudent_returns403() throws Exception {
        mockMvc.perform(post("/v1/categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Recursion\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createCategory_duplicateName_returns409() throws Exception {
        categoryRepository.save(new Category("Loops"));
        mockMvc.perform(post("/v1/categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Loops\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CATEGORY_DUPLICATE"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteCategory_noLinkedExercises_returns204() throws Exception {
        Category cat = categoryRepository.save(new Category("Variables"));
        mockMvc.perform(delete("/v1/categories/" + cat.getId()))
                .andExpect(status().isNoContent());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void deleteCategory_asStudent_returns403() throws Exception {
        Category cat = categoryRepository.save(new Category("Variables"));
        mockMvc.perform(delete("/v1/categories/" + cat.getId()))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteCategory_notFound_returns404() throws Exception {
        mockMvc.perform(delete("/v1/categories/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("CATEGORY_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteCategory_withLinkedExercise_returns409() throws Exception {
        Category cat = categoryRepository.save(new Category("Functions"));
        // Insert a minimal exercise row directly — Exercise JPA entity does not exist yet
        jdbcTemplate.update(
                "INSERT INTO exercises (title, description, type, difficulty, " +
                "category_id, status, is_deleted, like_count, created_by) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                "Ex1", "Desc", "PYTHON", "EASY",
                cat.getId(), "DRAFT", false, 0, tutorId);
        mockMvc.perform(delete("/v1/categories/" + cat.getId()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CATEGORY_HAS_EXERCISES"));
    }
}
