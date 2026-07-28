package com.platform.exercise.student;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.grading.AutoGradeConfigResolver;
import com.platform.exercise.grading.BlocklyGrader;
import com.platform.exercise.grading.PythonGrader;
import com.platform.exercise.metrics.BusinessMetrics;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class StudentSubmissionServiceTest {

    SubmissionRepository submissionRepo;
    ExerciseRepository exerciseRepo;
    ExerciseVersionRepository versionRepo;
    BlocklyGrader blocklyGrader;
    PythonGrader pythonGrader;
    BusinessMetrics businessMetrics;
    StudentSubmissionService service;

    @BeforeEach
    void setUp() {
        submissionRepo = mock(SubmissionRepository.class);
        exerciseRepo = mock(ExerciseRepository.class);
        versionRepo = mock(ExerciseVersionRepository.class);
        blocklyGrader = mock(BlocklyGrader.class);
        pythonGrader = mock(PythonGrader.class);
        businessMetrics = mock(BusinessMetrics.class);
        service = new StudentSubmissionService(submissionRepo, exerciseRepo, versionRepo,
            blocklyGrader, pythonGrader, new AutoGradeConfigResolver(new ObjectMapper()), businessMetrics);
        when(submissionRepo.save(any())).thenAnswer(inv -> {
            Submission s = inv.getArgument(0);
            s.setId(123L);
            return s;
        });
    }

    private void stubExercise(String configJson) {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCurrentVersionId(9L);
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(ex));
        ExerciseVersion v = new ExerciseVersion();
        v.setId(9L);
        v.setVersionNumber(1);
        v.setConfig(configJson);
        when(versionRepo.findById(9L)).thenReturn(Optional.of(v));
        when(pythonGrader.grade(any(), any()))
            .thenReturn(new PythonGrader.Result(BigDecimal.valueOf(100), "{}"));
    }

    @Test
    void submit_autoGradeTrue_returnsScoreAndPassed_andPersistsStudentSource() {
        stubExercise("{\"autoGrade\":true,\"testCases\":[]}");
        SubmitResultDto result = service.submit(7L, "Alice", 2L,
            new SubmitRequest("print(1)", null));

        assertTrue(result.showResult());
        assertEquals(0, BigDecimal.valueOf(100).compareTo(result.score()));
        assertTrue(result.passed());
        verify(submissionRepo).save(argThat(s ->
            "STUDENT".equals(s.getSource()) && s.getUserId().equals(7L)
                && "Alice".equals(s.getStudentName())
                && s.getAutoScore() != null));
    }

    @Test
    void submit_success_recordsSubmissionCreatedMetric() {
        stubExercise("{\"autoGrade\":true,\"testCases\":[]}");

        service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null));

        verify(businessMetrics).recordSubmissionCreated("PYTHON");
    }

    @Test
    void submit_resubmitOverwritingUngraded_recordsMetricAgain() {
        stubExercise("{\"autoGrade\":true,\"testCases\":[]}");
        Submission prior = new Submission();
        prior.setId(50L);
        prior.setUserId(7L);
        prior.setExerciseId(2L);
        prior.setSource("STUDENT");
        prior.setGraded(false);
        when(submissionRepo.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(7L, 2L, "STUDENT"))
            .thenReturn(Optional.of(prior));

        service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null));

        verify(businessMetrics, times(1)).recordSubmissionCreated("PYTHON");
    }

    @Test
    void submit_autoGradeFalse_skipsGradingAndStoresNullScore() {
        stubExercise("{\"autoGrade\":false,\"rubric\":{}}");
        SubmitResultDto result = service.submit(7L, "Alice", 2L,
            new SubmitRequest("print(1)", null));

        assertFalse(result.showResult());
        assertNull(result.score());
        assertNull(result.passed());
        verify(submissionRepo).save(argThat(s -> s.getAutoScore() == null));
        verifyNoInteractions(pythonGrader);
    }

    @Test
    void submit_autoGradeAbsent_defaultsToTrue() {
        stubExercise("{\"testCases\":[]}");
        SubmitResultDto result = service.submit(7L, "Alice", 2L,
            new SubmitRequest("print(1)", null));
        assertTrue(result.showResult());
    }

    @Test
    void submit_deadlineInPast_throwsDeadlinePassed() {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCurrentVersionId(9L);
        ex.setDeadline(LocalDateTime.now().minusDays(1));
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(ex));

        com.platform.exercise.common.PlatformException thrown = assertThrows(
            com.platform.exercise.common.PlatformException.class,
            () -> service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null)));

        assertEquals(com.platform.exercise.common.ErrorCode.EXERCISE_DEADLINE_PASSED, thrown.getErrorCode());
        verify(submissionRepo, never()).save(any());
    }

    @Test
    void submit_deadlineInFuture_succeeds() {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCurrentVersionId(9L);
        ex.setDeadline(LocalDateTime.now().plusDays(1));
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(ex));
        ExerciseVersion v = new ExerciseVersion();
        v.setId(9L);
        v.setVersionNumber(1);
        v.setConfig("{\"autoGrade\":true,\"testCases\":[]}");
        when(versionRepo.findById(9L)).thenReturn(Optional.of(v));
        when(pythonGrader.grade(any(), any()))
            .thenReturn(new PythonGrader.Result(BigDecimal.valueOf(100), "{}"));

        SubmitResultDto result = service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null));

        assertTrue(result.showResult());
    }

    @Test
    void submit_priorUngradedStudentSubmissionExists_softDeletesItAndInsertsNew() {
        stubExercise("{\"autoGrade\":true,\"testCases\":[]}");
        Submission prior = new Submission();
        prior.setId(50L);
        prior.setUserId(7L);
        prior.setExerciseId(2L);
        prior.setSource("STUDENT");
        prior.setGraded(false);
        when(submissionRepo.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(7L, 2L, "STUDENT"))
            .thenReturn(Optional.of(prior));

        service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null));

        assertTrue(prior.isDeleted());
        assertNull(prior.getStudentActiveKey());
        verify(submissionRepo).saveAndFlush(prior);
        verify(submissionRepo).save(any());
    }

    @Test
    void submit_setsStudentActiveKeyOnNewSubmission() {
        stubExercise("{\"autoGrade\":true,\"testCases\":[]}");

        service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null));

        verify(submissionRepo).save(argThat(s ->
            "STUDENT:2:7".equals(s.getStudentActiveKey())));
    }

    @Test
    void submit_priorGradedStudentSubmissionExists_throwsAndDoesNotInsert() {
        stubExercise("{\"autoGrade\":true,\"testCases\":[]}");
        Submission prior = new Submission();
        prior.setId(50L);
        prior.setUserId(7L);
        prior.setExerciseId(2L);
        prior.setSource("STUDENT");
        prior.setGraded(true);
        when(submissionRepo.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(7L, 2L, "STUDENT"))
            .thenReturn(Optional.of(prior));

        com.platform.exercise.common.PlatformException ex = assertThrows(
            com.platform.exercise.common.PlatformException.class,
            () -> service.submit(7L, "Alice", 2L, new SubmitRequest("print(1)", null)));

        assertEquals(com.platform.exercise.common.ErrorCode.SUBMISSION_ALREADY_GRADED, ex.getErrorCode());
        assertFalse(prior.isDeleted());
        verify(submissionRepo, never()).save(any());
    }

    @Test
    void history_autoGradeFalse_hidesStoredScores() {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCurrentVersionId(9L);
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(ex));

        ExerciseVersion v = new ExerciseVersion();
        v.setId(9L);
        v.setConfig("{\"autoGrade\":false}");
        when(versionRepo.findById(9L)).thenReturn(Optional.of(v));

        Submission s = new Submission();
        s.setId(5L);
        s.setCreatedAt(LocalDateTime.now());
        s.setAutoScore(BigDecimal.valueOf(80));
        when(submissionRepo.findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(7L, 2L))
            .thenReturn(List.of(s));

        List<SubmissionHistoryItemDto> history = service.history(7L, 2L);

        assertEquals(1, history.size());
        assertFalse(history.get(0).showResult());
        assertNull(history.get(0).score());
        assertNull(history.get(0).passed());
    }
}
