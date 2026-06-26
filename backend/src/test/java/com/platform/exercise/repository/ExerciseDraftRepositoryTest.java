package com.platform.exercise.repository;

import com.platform.exercise.domain.ExerciseDraft;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace.NONE;

@DataJpaTest
@AutoConfigureTestDatabase(replace = NONE)
@ActiveProfiles("test")
class ExerciseDraftRepositoryTest {

    @Autowired ExerciseDraftRepository repository;

    @Test
    void savesAndFindsDraftByUserAndExercise() {
        ExerciseDraft draft = new ExerciseDraft();
        draft.setUserId(1L);
        draft.setExerciseId(2L);
        draft.setExerciseType("PYTHON");
        draft.setAnswerData("print(1)");
        repository.save(draft);

        Optional<ExerciseDraft> found = repository.findByUserIdAndExerciseId(1L, 2L);
        assertTrue(found.isPresent());
        assertEquals("print(1)", found.get().getAnswerData());
    }

    @Test
    void returnsEmptyWhenNoDraftForUser() {
        assertTrue(repository.findByUserIdAndExerciseId(99L, 99L).isEmpty());
    }
}
