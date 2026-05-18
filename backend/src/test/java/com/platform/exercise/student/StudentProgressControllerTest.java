package com.platform.exercise.student;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import com.platform.exercise.settings.SettingsService;
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

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.nullValue;
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
    @Autowired SettingsService settingsService;

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

        // Student — displayName "Alex Chen" matched against submission.student_name
        User student = new User();
        student.setUsername("alex01");
        student.setDisplayName("Alex Chen");
        student.setPasswordHash(passwordEncoder.encode("pw"));
        student.setRole(User.Role.STUDENT);
        student.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(student);

        exercise1 = savedPublishedExercise("Hello World", Exercise.ExerciseType.BLOCKLY, tutor.getId());
        exercise2 = savedPublishedExercise("FizzBuzz", Exercise.ExerciseType.PYTHON, tutor.getId());

        // Ensure course filter is off for most tests
        settingsService.updateCourseFilter(false);
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

    private Submission savedSubmission(Exercise exercise, String studentName,
                                       BigDecimal autoScore, BigDecimal tutorScore) {
        Submission s = new Submission();
        s.setExerciseId(exercise.getId());
        s.setGradedVersionId(exercise.getCurrentVersionId());
        s.setStudentName(studentName);
        s.setExerciseType("BLOCKLY");
        s.setAnswerData("{}");
        s.setExportTimestamp(LocalDateTime.now().minusMinutes(1));
        s.setAutoScore(autoScore);
        s.setTutorScore(tutorScore);
        return submissionRepository.save(s);
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void noSubmissions_allNotAttempted_summaryZeros() throws Exception {
        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.totalExercises").value(2))
            .andExpect(jsonPath("$.summary.attemptedCount").value(0))
            .andExpect(jsonPath("$.summary.gradedCount").value(0))
            .andExpect(jsonPath("$.summary.averageScore").value(0.0))
            .andExpect(jsonPath("$.summary.passRate").value(0.0))
            .andExpect(jsonPath("$.exercises.content[0].status").value("NOT_ATTEMPTED"))
            .andExpect(jsonPath("$.exercises.content[1].status").value("NOT_ATTEMPTED"));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void submissionWithNullScore_statusAttempted() throws Exception {
        savedSubmission(exercise1, "Alex Chen", null, null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.attemptedCount").value(1))
            .andExpect(jsonPath("$.summary.gradedCount").value(0))
            .andExpect(jsonPath("$.exercises.content[?(@.exerciseId == " + exercise1.getId() + ")].status")
                .value("ATTEMPTED"))
            .andExpect(jsonPath("$.exercises.content[?(@.exerciseId == " + exercise1.getId() + ")].score",
                hasItem(nullValue())));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void submissionWithAutoScore_statusGraded_sourceAuto() throws Exception {
        savedSubmission(exercise1, "Alex Chen", new BigDecimal("80.00"), null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.gradedCount").value(1))
            .andExpect(jsonPath("$.exercises.content[?(@.exerciseId == " + exercise1.getId() + ")].status")
                .value("GRADED"))
            .andExpect(jsonPath("$.exercises.content[?(@.exerciseId == " + exercise1.getId() + ")].score")
                .value(80.0))
            .andExpect(jsonPath("$.exercises.content[?(@.exerciseId == " + exercise1.getId() + ")].scoreSource")
                .value("AUTO"));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void submissionWithTutorScore_tutorWins_sourceTutor() throws Exception {
        savedSubmission(exercise1, "Alex Chen", new BigDecimal("60.00"), new BigDecimal("90.00"));

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.exercises.content[?(@.exerciseId == " + exercise1.getId() + ")].score")
                .value(90.0))
            .andExpect(jsonPath("$.exercises.content[?(@.exerciseId == " + exercise1.getId() + ")].scoreSource")
                .value("TUTOR"));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void multipleSubmissionsSameExercise_highestScoreReturned() throws Exception {
        savedSubmission(exercise1, "Alex Chen", new BigDecimal("40.00"), null);
        savedSubmission(exercise1, "Alex Chen", new BigDecimal("95.00"), null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.exercises.content[?(@.exerciseId == " + exercise1.getId() + ")].score")
                .value(95.0));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void passRateComputation_onePassOneFail() throws Exception {
        savedSubmission(exercise1, "Alex Chen", new BigDecimal("80.00"), null); // pass
        savedSubmission(exercise2, "Alex Chen", new BigDecimal("50.00"), null); // fail

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.gradedCount").value(2))
            .andExpect(jsonPath("$.summary.passRate").value(50.0));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void courseFilterEnabled_studentNotEnrolled_allNotAttempted() throws Exception {
        settingsService.updateCourseFilter(true);
        savedSubmission(exercise1, "Alex Chen", new BigDecimal("80.00"), null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.totalExercises").value(0))
            .andExpect(jsonPath("$.exercises.content").isEmpty());
    }

    @Test
    void unauthenticated_returns401() throws Exception {
        // No @WithMockUser — verifies endpoint requires authentication
        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isUnauthorized());
    }
}
