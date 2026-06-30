package com.platform.exercise.student;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentProgressControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ExerciseRepository exerciseRepository;
    @Autowired ExerciseVersionRepository versionRepository;
    @Autowired SubmissionRepository submissionRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;

    private User student;
    private Exercise exercise1;
    private Exercise exercise2;

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("tutor7");
        tutor.setDisplayName("Tutor Seven");
        tutor.setPasswordHash(passwordEncoder.encode("pw"));
        tutor.setRole(User.Role.TUTOR);
        tutor.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(tutor);

        student = new User();
        student.setUsername("alex01");
        student.setDisplayName("Alex Chen");
        student.setPasswordHash(passwordEncoder.encode("pw"));
        student.setRole(User.Role.STUDENT);
        student.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(student);

        exercise1 = savedPublishedExercise("Hello World", Exercise.ExerciseType.BLOCKLY, tutor.getId());
        exercise2 = savedPublishedExercise("FizzBuzz", Exercise.ExerciseType.PYTHON, tutor.getId());
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Exercise savedPublishedExercise(String title, Exercise.ExerciseType type, Long tutorId) {
        Exercise ex = new Exercise();
        ex.setTitle(title);
        ex.setDescription("desc");
        ex.setType(type);
        ex.setDifficulty(Exercise.Difficulty.EASY);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCreatedBy(tutorId);
        ex = exerciseRepository.save(ex);

        ExerciseVersion ver = new ExerciseVersion();
        ver.setExerciseId(ex.getId());
        ver.setVersionNumber(1);
        ver.setTitle(title);
        ver.setDescription("desc");
        ver.setDifficulty("EASY");
        ver.setHints("[]");
        ver.setConfig("{\"gradingRules\":{}}");
        ver = versionRepository.save(ver);

        ex.setCurrentVersionId(ver.getId());
        return exerciseRepository.save(ex);
    }

    private Submission savedSubmission(Exercise exercise, User owner,
                                       BigDecimal autoScore, BigDecimal tutorScore) {
        Submission s = new Submission();
        s.setExerciseId(exercise.getId());
        s.setGradedVersionId(exercise.getCurrentVersionId());
        s.setStudentName(owner.getDisplayName());
        s.setUserId(owner.getId());
        s.setExerciseType(exercise.getType().name());
        s.setAnswerData("{}");
        s.setExportTimestamp(LocalDateTime.now().minusMinutes(1));
        s.setAutoScore(autoScore);
        s.setTutorScore(tutorScore);
        if (tutorScore != null) {
            s.setGraded(true);
        } else if (autoScore != null) {
            s.setGraded(true);
        }
        return submissionRepository.save(s);
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void noSubmissions_returnsEmptyPage() throws Exception {
        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(0))
            .andExpect(jsonPath("$.submissions.content").isEmpty());
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void withSubmission_returnsSubmissionInPage() throws Exception {
        savedSubmission(exercise1, student, new BigDecimal("80.00"), null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(1))
            .andExpect(jsonPath("$.submissions.content[0].exerciseId").value(exercise1.getId()))
            .andExpect(jsonPath("$.submissions.content[0].exerciseTitle").value("Hello World"))
            .andExpect(jsonPath("$.submissions.content[0].score").value(80.0));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void tutorScoreWinsOverAutoScore() throws Exception {
        savedSubmission(exercise1, student, new BigDecimal("60.00"), new BigDecimal("90.00"));

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.content[0].score").value(90.0))
            .andExpect(jsonPath("$.submissions.content[0].graded").value(true));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void multipleSubmissions_allReturnedPaged() throws Exception {
        savedSubmission(exercise1, student, new BigDecimal("80.00"), null);
        savedSubmission(exercise2, student, new BigDecimal("50.00"), null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(2));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void otherUserSubmissions_notIncluded() throws Exception {
        User other = new User();
        other.setUsername("other01");
        other.setDisplayName("Other User");
        other.setPasswordHash(passwordEncoder.encode("pw"));
        other.setRole(User.Role.STUDENT);
        other.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(other);

        savedSubmission(exercise1, other, new BigDecimal("70.00"), null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.submissions.totalElements").value(0));
    }

    @Test
    void unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isUnauthorized());
    }
}
