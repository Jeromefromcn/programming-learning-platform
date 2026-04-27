package com.platform.exercise.course;

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
class CourseControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JdbcTemplate jdbcTemplate;

    private Long tutorId;
    private Long otherTutorId;
    private Long studentId;

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("tutor1");
        tutor.setDisplayName("Tutor One");
        tutor.setPasswordHash(passwordEncoder.encode("password123"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        tutorId = userRepository.save(tutor).getId();

        User otherTutor = new User();
        otherTutor.setUsername("tutor2");
        otherTutor.setDisplayName("Tutor Two");
        otherTutor.setPasswordHash(passwordEncoder.encode("password123"));
        otherTutor.setRole(Role.TUTOR);
        otherTutor.setStatus(UserStatus.ACTIVE);
        otherTutorId = userRepository.save(otherTutor).getId();

        User student = new User();
        student.setUsername("student1");
        student.setDisplayName("Student One");
        student.setPasswordHash(passwordEncoder.encode("password123"));
        student.setRole(Role.STUDENT);
        student.setStatus(UserStatus.ACTIVE);
        studentId = userRepository.save(student).getId();
    }

    // --- CRUD ---

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listCourses_asTutor_returns200WithOwnCoursesOnly() throws Exception {
        jdbcTemplate.update(
                "INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "My Course", "Desc", false, tutorId);
        jdbcTemplate.update(
                "INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "Other Course", "Desc", false, otherTutorId);

        mockMvc.perform(get("/v1/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].name").value("My Course"))
                .andExpect(jsonPath("$.content[0].exerciseCount").value(0))
                .andExpect(jsonPath("$.content[0].studentCount").value(0));
    }

    @Test
    void listCourses_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/v1/courses"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void listCourses_asStudent_returns403() throws Exception {
        mockMvc.perform(get("/v1/courses"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createCourse_valid_returns201() throws Exception {
        mockMvc.perform(post("/v1/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Spring Basics\",\"description\":\"A beginner course\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Spring Basics"))
                .andExpect(jsonPath("$.description").value("A beginner course"))
                .andExpect(jsonPath("$.exerciseCount").value(0))
                .andExpect(jsonPath("$.studentCount").value(0));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createCourse_missingName_returns400() throws Exception {
        mockMvc.perform(post("/v1/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"description\":\"desc\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void createCourse_asStudent_returns403() throws Exception {
        mockMvc.perform(post("/v1/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"My Course\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getCourse_ownCourse_returns200() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "Get Test Course", "Desc2", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(get("/v1/courses/" + courseId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Get Test Course"));
    }

    @Test
    @WithMockUser(username = "tutor2", roles = "TUTOR")
    void getCourse_otherTutorCourse_returns404() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "Tutor1 Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(get("/v1/courses/" + courseId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("COURSE_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getCourse_notFound_returns404() throws Exception {
        mockMvc.perform(get("/v1/courses/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("COURSE_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void updateCourse_ownCourse_returns200() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "Old Name", "Old Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(put("/v1/courses/" + courseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"New Name\",\"description\":\"New Desc\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("New Name"))
                .andExpect(jsonPath("$.description").value("New Desc"));
    }

    @Test
    @WithMockUser(username = "tutor2", roles = "TUTOR")
    void updateCourse_otherTutorCourse_returns404() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "Tutor1 Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(put("/v1/courses/" + courseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Hacked\",\"description\":\"\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteCourse_ownCourse_returns204ThenNotFound() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "To Delete", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(delete("/v1/courses/" + courseId))
                .andExpect(status().isNoContent());

        // Soft-deleted course should no longer be accessible
        mockMvc.perform(get("/v1/courses/" + courseId))
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "tutor2", roles = "TUTOR")
    void deleteCourse_otherTutorCourse_returns404() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "Tutor1 Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(delete("/v1/courses/" + courseId))
                .andExpect(status().isNotFound());
    }

    // --- Exercise association tests ---

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listExercises_emptyCourse_returnsEmptyArray() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "Empty Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(get("/v1/courses/" + courseId + "/exercises"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @WithMockUser(username = "tutor2", roles = "TUTOR")
    void listExercises_otherTutorCourse_returns404() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "Tutor1 Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(get("/v1/courses/" + courseId + "/exercises"))
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void removeExercise_notLinked_returns404() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "My Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(delete("/v1/courses/" + courseId + "/exercises/999999"))
                .andExpect(status().isNotFound());
    }

    // --- Student enrollment tests ---

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listStudents_emptyCourse_returnsEmptyArray() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "My Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(get("/v1/courses/" + courseId + "/students"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void enrollStudents_validStudent_returns200WithEnrolledCount() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "My Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(post("/v1/courses/" + courseId + "/students")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[" + studentId + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrolled").value(1))
                .andExpect(jsonPath("$.skipped").value(0));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void enrollStudents_nonExistentUser_skipsWithError() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "My Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(post("/v1/courses/" + courseId + "/students")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[999999]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrolled").value(0))
                .andExpect(jsonPath("$.skipped").value(1));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void removeStudent_enrolled_returns204() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "My Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update("INSERT INTO course_students (course_id, user_id) VALUES (?, ?)",
                courseId, studentId);

        mockMvc.perform(delete("/v1/courses/" + courseId + "/students/" + studentId))
                .andExpect(status().isNoContent());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void removeStudent_notEnrolled_returns404() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "My Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(delete("/v1/courses/" + courseId + "/students/" + studentId))
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void searchAvailableStudents_returnsMatchingStudents() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "My Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        mockMvc.perform(get("/v1/courses/" + courseId + "/students/available?q=student"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].username").value("student1"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void searchAvailableStudents_alreadyEnrolled_excludedFromResults() throws Exception {
        jdbcTemplate.update("INSERT INTO courses (name, description, is_deleted, created_by) VALUES (?, ?, ?, ?)",
                "My Course", "Desc", false, tutorId);
        Long courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update("INSERT INTO course_students (course_id, user_id) VALUES (?, ?)",
                courseId, studentId);

        mockMvc.perform(get("/v1/courses/" + courseId + "/students/available?q=student"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
