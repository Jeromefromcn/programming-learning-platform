package com.platform.exercise.student;

import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.repository.ExerciseDraftRepository;
import com.platform.exercise.repository.ExerciseRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StudentDraftServiceTest {

    ExerciseDraftRepository draftRepo;
    ExerciseRepository exerciseRepo;
    StudentDraftService service;

    @BeforeEach
    void setUp() {
        draftRepo = mock(ExerciseDraftRepository.class);
        exerciseRepo = mock(ExerciseRepository.class);
        service = new StudentDraftService(draftRepo, exerciseRepo);
    }

    private Exercise publishedExercise() {
        Exercise ex = new Exercise();
        ex.setId(2L);
        ex.setType(Exercise.ExerciseType.PYTHON);
        ex.setStatus(Exercise.Status.PUBLISHED);
        return ex;
    }

    @Test
    void getDraft_returnsNullWhenNone() {
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(publishedExercise()));
        when(draftRepo.findByUserIdAndExerciseId(1L, 2L)).thenReturn(Optional.empty());
        assertNull(service.getDraft(1L, 2L));
    }

    @Test
    void saveDraft_createsThenOverwritesSameRow() {
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.of(publishedExercise()));
        when(draftRepo.findByUserIdAndExerciseId(1L, 2L)).thenReturn(Optional.empty());
        when(draftRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        DraftDto saved = service.saveDraft(1L, 2L, new SaveDraftRequest("print(1)", null));
        assertEquals("print(1)", saved.answerData());
        verify(draftRepo).save(argThat(d ->
            d.getUserId().equals(1L) && d.getExerciseId().equals(2L)
                && "PYTHON".equals(d.getExerciseType())));
    }

    @Test
    void saveDraft_missingExercise_throws() {
        when(exerciseRepo.findByIdAndDeletedFalse(2L)).thenReturn(Optional.empty());
        assertThrows(PlatformException.class,
            () -> service.saveDraft(1L, 2L, new SaveDraftRequest("x", null)));
    }
}
