package com.platform.exercise.student;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import com.platform.exercise.settings.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentExerciseControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired SettingsService settingsService;

    Long studentId;
    Long tutorId;
    Long categoryId;
    Long publishedPythonExId;
    Long publishedBlocklyExId;
    Long courseId;

    @BeforeEach
    void seed() {
        // Reset course filter cache to off before every test
        settingsService.updateCourseFilter(false);

        User student = new User();
        student.setUsername("student1");
        student.setDisplayName("Alice");
        student.setPasswordHash(passwordEncoder.encode("pass"));
        student.setRole(Role.STUDENT);
        student.setStatus(UserStatus.ACTIVE);
        studentId = userRepository.save(student).getId();

        User tutor = new User();
        tutor.setUsername("tutor1");
        tutor.setDisplayName("Tutor One");
        tutor.setPasswordHash(passwordEncoder.encode("pass"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        tutorId = userRepository.save(tutor).getId();

        jdbcTemplate.update("INSERT INTO categories (name) VALUES (?)", "Loops");
        categoryId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        // Python exercise: 1 visible + 1 hidden test case, no gradingRules in config
        publishedPythonExId = createPythonExercise("FizzBuzz", "PUBLISHED", tutorId, categoryId);
        // Blockly exercise: has gradingRules in config
        publishedBlocklyExId = createBlocklyExercise("Hello World", "PUBLISHED", tutorId, categoryId);
        // Draft — must never appear in student list or detail
        createPythonExercise("Draft Exercise", "DRAFT", tutorId, categoryId);

        jdbcTemplate.update(
            "INSERT INTO courses (name, description, created_by) VALUES (?,?,?)",
            "CS101", "Intro course", tutorId);
        courseId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);

        // Link only FizzBuzz to the course
        jdbcTemplate.update(
            "INSERT INTO course_exercises (course_id, exercise_id) VALUES (?,?)",
            courseId, publishedPythonExId);

        // Enroll student1 in course
        jdbcTemplate.update(
            "INSERT INTO course_students (course_id, user_id) VALUES (?,?)",
            courseId, studentId);
    }

    // ── List ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_courseFilterOff_returnsAllPublished() throws Exception {
        mockMvc.perform(get("/v1/student/exercises"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(2));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_courseFilterOn_enrolledStudent_returnsLinkedExercisesOnly() throws Exception {
        settingsService.updateCourseFilter(true);
        mockMvc.perform(get("/v1/student/exercises"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1))
            .andExpect(jsonPath("$.content[0].title").value("FizzBuzz"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_courseFilterOn_unenrolledStudent_returnsEmpty() throws Exception {
        settingsService.updateCourseFilter(true);
        jdbcTemplate.update(
            "DELETE FROM course_students WHERE course_id=? AND user_id=?",
            courseId, studentId);
        mockMvc.perform(get("/v1/student/exercises"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(0));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_filterByType_returnsPythonOnly() throws Exception {
        mockMvc.perform(get("/v1/student/exercises").param("type", "PYTHON"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1))
            .andExpect(jsonPath("$.content[0].type").value("PYTHON"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_filterByCategoryId_returnsExercisesInCategory() throws Exception {
        mockMvc.perform(get("/v1/student/exercises")
                .param("categoryId", categoryId.toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(2));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void list_filterByDifficulty_returnsMatchingExercises() throws Exception {
        // FizzBuzz is MEDIUM, Hello World is EASY
        mockMvc.perform(get("/v1/student/exercises").param("difficulty", "MEDIUM"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void list_asTutor_returns200_becauseTutorInheritsStudentRole() throws Exception {
        mockMvc.perform(get("/v1/student/exercises"))
            .andExpect(status().isOk());
    }

    // ── Get by ID ─────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_publishedPythonExercise_stripsHiddenTestCasesAndGradingRules() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/" + publishedPythonExId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(publishedPythonExId))
            .andExpect(jsonPath("$.version.config.visibleTestCases").isArray())
            .andExpect(jsonPath("$.version.config.visibleTestCases.length()").value(1))
            .andExpect(jsonPath("$.version.config.testCases").doesNotExist())
            .andExpect(jsonPath("$.version.config.gradingRules").doesNotExist());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_publishedPythonExercise_stripsReferenceSolution() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/" + publishedPythonExId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version.config.visibleTestCases").isArray())
            .andExpect(jsonPath("$.version.config.referenceSolution").doesNotExist());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_exerciseWithDeadline_includesDeadlineInResponse() throws Exception {
        jdbcTemplate.update("UPDATE exercises SET deadline = ? WHERE id = ?",
            java.sql.Timestamp.valueOf("2026-07-15 23:59:00"), publishedPythonExId);

        mockMvc.perform(get("/v1/student/exercises/" + publishedPythonExId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deadline").value("2026-07-15T23:59:00"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_exerciseWithoutDeadline_deadlineIsNull() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/" + publishedPythonExId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deadline").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_publishedBlocklyExercise_stripsGradingRulesKeepsAllowedBlocks() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/" + publishedBlocklyExId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version.config.allowedBlocks").isArray())
            .andExpect(jsonPath("$.version.config.gradingRules").doesNotExist());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_draftExercise_returns404() throws Exception {
        Long draftId = createPythonExercise("Another Draft", "DRAFT", tutorId, categoryId);
        mockMvc.perform(get("/v1/student/exercises/" + draftId))
            .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_softDeletedExercise_returns404() throws Exception {
        jdbcTemplate.update("UPDATE exercises SET is_deleted=true WHERE id=?", publishedPythonExId);
        mockMvc.perform(get("/v1/student/exercises/" + publishedPythonExId))
            .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_nonExistentExercise_returns404() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/99999"))
            .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_blocklyExercise_viewAnswerOn_keepsAnswerWorkspaceXml() throws Exception {
        Long exId = createBlocklyExerciseWithAnswer("Viewable", true, tutorId, categoryId);
        mockMvc.perform(get("/v1/student/exercises/" + exId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version.config.canViewAnswer").value(true))
            .andExpect(jsonPath("$.version.config.answerWorkspaceXml").exists());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void get_blocklyExercise_viewAnswerOff_stripsAnswerWorkspaceXml() throws Exception {
        Long exId = createBlocklyExerciseWithAnswer("Hidden", false, tutorId, categoryId);
        mockMvc.perform(get("/v1/student/exercises/" + exId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.version.config.canViewAnswer").value(false))
            .andExpect(jsonPath("$.version.config.answerWorkspaceXml").doesNotExist());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Long createPythonExercise(String title, String status, Long createdBy, Long catId) {
        jdbcTemplate.update(
            "INSERT INTO exercises (title, description, type, difficulty, category_id, status, created_by) VALUES (?,?,?,?,?,?,?)",
            title, "A description", "PYTHON", "MEDIUM", catId, status, createdBy);
        Long exId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update(
            "INSERT INTO exercise_versions (exercise_id, version_number, title, description, difficulty, hints, config) VALUES (?,?,?,?,?,?,?)",
            exId, 1, title, "A description", "MEDIUM", null,
            "{\"starterCode\":\"def f():\\n    pass\",\"timeLimitSeconds\":5," +
            "\"referenceSolution\":\"def f():\\n    return 1\"," +
            "\"testCases\":[" +
            "{\"input\":\"f()\",\"expectedOutput\":\"1\",\"visible\":true}," +
            "{\"input\":\"f()\",\"expectedOutput\":\"2\",\"visible\":false}]}");
        Long verId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update("UPDATE exercises SET current_version_id=? WHERE id=?", verId, exId);
        return exId;
    }

    private Long createBlocklyExercise(String title, String status, Long createdBy, Long catId) {
        jdbcTemplate.update(
            "INSERT INTO exercises (title, description, type, difficulty, category_id, status, created_by) VALUES (?,?,?,?,?,?,?)",
            title, "A description", "BLOCKLY", "EASY", catId, status, createdBy);
        Long exId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update(
            "INSERT INTO exercise_versions (exercise_id, version_number, title, description, difficulty, hints, config) VALUES (?,?,?,?,?,?,?)",
            exId, 1, title, "A description", "EASY", null,
            "{\"allowedBlocks\":[\"text_print\",\"text\"]," +
            "\"initialWorkspaceXml\":\"<xml/>\",\"showCodeView\":false," +
            "\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello World\"}," +
            "\"requiredBlocks\":{\"enabled\":false,\"blocks\":[]}}}");
        Long verId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update("UPDATE exercises SET current_version_id=? WHERE id=?", verId, exId);
        return exId;
    }

    private Long createBlocklyExerciseWithAnswer(String title, boolean canViewAnswer,
                                                 Long createdBy, Long catId) {
        jdbcTemplate.update(
            "INSERT INTO exercises (title, description, type, difficulty, category_id, status, created_by) VALUES (?,?,?,?,?,?,?)",
            title, "A description", "BLOCKLY", "EASY", catId, "PUBLISHED", createdBy);
        Long exId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update(
            "INSERT INTO exercise_versions (exercise_id, version_number, title, description, difficulty, hints, config) VALUES (?,?,?,?,?,?,?)",
            exId, 1, title, "A description", "EASY", null,
            "{\"allowedBlocks\":[\"text_print\"]," +
            "\"initialWorkspaceXml\":\"<xml/>\",\"showCodeView\":false," +
            "\"canViewAnswer\":" + canViewAnswer + "," +
            "\"answerWorkspaceXml\":\"<xml><block type=\\\"text_print\\\"></block></xml>\"," +
            "\"gradingRules\":{\"outputMatch\":{\"enabled\":false,\"expectedOutput\":\"\"}}}");
        Long verId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update("UPDATE exercises SET current_version_id=? WHERE id=?", verId, exId);
        return exId;
    }
}
