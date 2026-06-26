package com.platform.exercise.student;

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
class StudentSubmissionControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JdbcTemplate jdbcTemplate;

    Long studentId;
    Long pythonExId;

    @BeforeEach
    void seed() {
        User student = new User();
        student.setUsername("student1");
        student.setDisplayName("Alice");
        student.setPasswordHash(passwordEncoder.encode("pass"));
        student.setRole(Role.STUDENT);
        student.setStatus(UserStatus.ACTIVE);
        studentId = userRepository.save(student).getId();

        jdbcTemplate.update(
            "INSERT INTO exercises (title, description, type, difficulty, status, created_by) " +
            "VALUES (?,?,?,?,?,?)",
            "FizzBuzz", "d", "PYTHON", "EASY", "PUBLISHED", studentId);
        pythonExId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update(
            "INSERT INTO exercise_versions (exercise_id, version_number, title, description, difficulty, hints, config) " +
            "VALUES (?,?,?,?,?,?,?)",
            pythonExId, 1, "FizzBuzz", "d", "EASY", null,
            "{\"showResult\":true,\"starterCode\":\"x=1\",\"timeLimitSeconds\":5," +
            "\"testCases\":[{\"input\":\"print(1)\",\"expectedOutput\":\"1\",\"visible\":true}]}");
        Long verId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbcTemplate.update("UPDATE exercises SET current_version_id=? WHERE id=?", verId, pythonExId);
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void getDraft_whenNone_returns204() throws Exception {
        mockMvc.perform(get("/v1/student/exercises/" + pythonExId + "/draft"))
            .andExpect(status().isNoContent());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void putThenGetDraft_roundTrips() throws Exception {
        mockMvc.perform(put("/v1/student/exercises/" + pythonExId + "/draft")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"answerData\":\"print(42)\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.answerData").value("print(42)"));

        mockMvc.perform(get("/v1/student/exercises/" + pythonExId + "/draft"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.answerData").value("print(42)"));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void submit_returnsScoreAndPassed_andAppearsInHistory() throws Exception {
        mockMvc.perform(post("/v1/student/exercises/" + pythonExId + "/submissions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"answerData\":\"print(1)\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissionId").exists())
            .andExpect(jsonPath("$.showResult").value(true));

        mockMvc.perform(get("/v1/student/exercises/" + pythonExId + "/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void submit_blankAnswer_returns400() throws Exception {
        mockMvc.perform(post("/v1/student/exercises/" + pythonExId + "/submissions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"answerData\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
