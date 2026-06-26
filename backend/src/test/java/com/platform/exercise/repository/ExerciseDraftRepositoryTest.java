package com.platform.exercise.repository;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseDraft;
import com.platform.exercise.domain.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
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
    @Autowired TestEntityManager em;

    private Long userId;
    private Long exerciseId;

    @BeforeEach
    void seedParents() {
        // Persist a minimal User so fk_draft_user is satisfied
        User user = new User();
        user.setUsername("draft_user");
        user.setDisplayName("Draft User");
        user.setPasswordHash("hash");
        user.setRole(User.Role.STUDENT);
        user.setStatus(User.UserStatus.ACTIVE);
        userId = ((User) em.persistAndFlush(user)).getId();

        // Persist a minimal Exercise (no category, no version yet) so fk_draft_exercise is satisfied
        Exercise exercise = new Exercise();
        exercise.setTitle("Draft Exercise");
        exercise.setDescription("desc");
        exercise.setType(Exercise.ExerciseType.PYTHON);
        exercise.setDifficulty(Exercise.Difficulty.EASY);
        exercise.setStatus(Exercise.Status.PUBLISHED);
        exercise.setCreatedBy(userId);
        exerciseId = ((Exercise) em.persistAndFlush(exercise)).getId();
    }

    @Test
    void savesAndFindsDraftByUserAndExercise() {
        ExerciseDraft draft = new ExerciseDraft();
        draft.setUserId(userId);
        draft.setExerciseId(exerciseId);
        draft.setExerciseType("PYTHON");
        draft.setAnswerData("print(1)");
        repository.save(draft);

        Optional<ExerciseDraft> found = repository.findByUserIdAndExerciseId(userId, exerciseId);
        assertTrue(found.isPresent());
        assertEquals("print(1)", found.get().getAnswerData());
    }

    @Test
    void returnsEmptyWhenNoDraftForUser() {
        assertTrue(repository.findByUserIdAndExerciseId(99L, 99L).isEmpty());
    }
}
