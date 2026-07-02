package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StudentProgressServiceTest {

    @Mock SubmissionRepository submissionRepository;
    @Mock ExerciseRepository exerciseRepository;
    @InjectMocks StudentProgressService service;

    @Test
    void getProgress_returnsAutoScoreEvenWhenTutorScoreAndGradedAreSet() {
        Submission sub = new Submission();
        sub.setId(1L);
        sub.setExerciseId(10L);
        sub.setExerciseType("PYTHON");
        sub.setSource("STUDENT");
        sub.setGraded(true);
        sub.setAutoScore(new BigDecimal("70.00"));
        sub.setTutorScore(new BigDecimal("85.00"));
        sub.setCreatedAt(LocalDateTime.now());

        Exercise exercise = new Exercise();
        exercise.setId(10L);
        exercise.setTitle("Loops");

        when(submissionRepository.findByUserIdFiltered(
                eq(42L), isNull(), isNull(), isNull(), any())).thenReturn(new PageImpl<>(List.of(sub)));
        when(exerciseRepository.findAllById(List.of(10L))).thenReturn(List.of(exercise));

        StudentProgressDto result = service.getProgress(42L, 0, 20, null, null, null);

        assertEquals(1, result.submissions().totalElements());
        ProgressSubmissionDto item = result.submissions().content().get(0);
        assertEquals(1L, item.submissionId());
        assertEquals("Loops", item.exerciseTitle());
        assertEquals(new BigDecimal("70.00"), item.score());
    }

    @Test
    void getProgress_scoreIsNullWhenAutoScoreNotSet() {
        Submission sub = new Submission();
        sub.setId(2L);
        sub.setExerciseId(10L);
        sub.setExerciseType("PYTHON");
        sub.setSource("STUDENT");
        sub.setGraded(true);
        sub.setTutorScore(new BigDecimal("90.00"));
        sub.setCreatedAt(LocalDateTime.now());

        Exercise exercise = new Exercise();
        exercise.setId(10L);
        exercise.setTitle("Loops");

        when(submissionRepository.findByUserIdFiltered(
                eq(42L), isNull(), isNull(), isNull(), any())).thenReturn(new PageImpl<>(List.of(sub)));
        when(exerciseRepository.findAllById(List.of(10L))).thenReturn(List.of(exercise));

        StudentProgressDto result = service.getProgress(42L, 0, 20, null, null, null);

        ProgressSubmissionDto item = result.submissions().content().get(0);
        assertNull(item.score());
    }

    @Test
    void getProgress_emptyWhenNoSubmissions() {
        when(submissionRepository.findByUserIdFiltered(
                eq(99L), isNull(), isNull(), isNull(), any())).thenReturn(new PageImpl<>(List.of()));
        when(exerciseRepository.findAllById(List.of())).thenReturn(List.of());

        StudentProgressDto result = service.getProgress(99L, 0, 20, null, null, null);

        assertEquals(0, result.submissions().totalElements());
    }

    @Test
    void getProgress_passesFiltersThroughToRepository() {
        when(submissionRepository.findByUserIdFiltered(
                eq(42L), eq("fizz"), eq("PYTHON"), eq("STUDENT"), any()))
                .thenReturn(new PageImpl<>(List.of()));
        when(exerciseRepository.findAllById(List.of())).thenReturn(List.of());

        service.getProgress(42L, 0, 20, "fizz", "PYTHON", "STUDENT");

        verify(submissionRepository).findByUserIdFiltered(
                eq(42L), eq("fizz"), eq("PYTHON"), eq("STUDENT"), any());
    }
}
