package com.platform.exercise.submission;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SubmissionPurgeControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired SubmissionRepository submissionRepository;
    @Autowired ExerciseRepository exerciseRepository;
    @Autowired ExerciseVersionRepository versionRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @MockBean SandboxClient sandboxClient;

    private Long exerciseId;
    private Long gradedVersionId;

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("purge_tutor");
        tutor.setDisplayName("Purge Tutor");
        tutor.setPasswordHash(passwordEncoder.encode("pw"));
        tutor.setRole(User.Role.TUTOR);
        tutor.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(tutor);

        Exercise ex = new Exercise();
        ex.setTitle("Purge Test Exercise");
        ex.setDescription("desc");
        ex.setType(Exercise.ExerciseType.BLOCKLY);
        ex.setDifficulty(Exercise.Difficulty.EASY);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCreatedBy(tutor.getId());
        exerciseId = exerciseRepository.save(ex).getId();

        ExerciseVersion ver = new ExerciseVersion();
        ver.setExerciseId(exerciseId);
        ver.setVersionNumber(1);
        ver.setTitle("Purge Test Exercise");
        ver.setDescription("desc");
        ver.setDifficulty("EASY");
        ver.setConfig("{}");
        gradedVersionId = versionRepository.save(ver).getId();

        // Old submission (before cutoff)
        Submission old = submission("Alice", "IMPORT", LocalDateTime.of(2024, 6, 1, 0, 0));
        submissionRepository.save(old);

        // Recent submission (after cutoff)
        Submission recent = submission("Bob", "IMPORT", LocalDateTime.of(2025, 6, 1, 0, 0));
        submissionRepository.save(recent);
    }

    private Submission submission(String studentName, String source, LocalDateTime createdAt) {
        Submission s = new Submission();
        s.setExerciseId(exerciseId);
        s.setGradedVersionId(gradedVersionId);
        s.setStudentName(studentName);
        s.setExerciseType("BLOCKLY");
        s.setAnswerData("{}");
        s.setExportTimestamp(LocalDateTime.now());
        s.setSource(source);
        s.setCreatedAt(createdAt);
        return s;
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void preview_returnsCountOfMatchingSubmissions() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview").param("before", "2025-01-01"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.count").value(1));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void preview_withSourceFilter_filtersCorrectly() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview")
                .param("before", "2025-01-01")
                .param("source", "ONLINE"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.count").value(0));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void preview_missingBefore_returns400() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void preview_invalidDateFormat_returns400() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview").param("before", "not-a-date"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(roles = "TUTOR")
    void preview_tutorRole_returns403() throws Exception {
        mockMvc.perform(get("/v1/submissions/purge/preview").param("before", "2025-01-01"))
            .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_softMode_marksRowsDeleted() throws Exception {
        mockMvc.perform(delete("/v1/submissions/purge")
                .param("before", "2025-01-01")
                .param("mode", "SOFT"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deletedCount").value(1));

        long remaining = submissionRepository.countForPurge(
            LocalDateTime.of(2025, 1, 1, 0, 0), null, null);
        assertThat(remaining).isEqualTo(0);
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_hardMode_removesRows() throws Exception {
        long beforeCount = submissionRepository.count();

        mockMvc.perform(delete("/v1/submissions/purge")
                .param("before", "2025-01-01")
                .param("mode", "HARD"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.deletedCount").value(1));

        assertThat(submissionRepository.count()).isEqualTo(beforeCount - 1);
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_missingMode_returns400() throws Exception {
        mockMvc.perform(delete("/v1/submissions/purge").param("before", "2025-01-01"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_invalidMode_returns400() throws Exception {
        mockMvc.perform(delete("/v1/submissions/purge")
                .param("before", "2025-01-01")
                .param("mode", "GARBAGE"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    @WithMockUser(roles = "SUPER_ADMIN")
    void purge_invalidSource_returns400() throws Exception {
        mockMvc.perform(delete("/v1/submissions/purge")
                .param("before", "2025-01-01")
                .param("mode", "SOFT")
                .param("source", "UNKNOWN"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }
}
