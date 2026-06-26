package com.platform.exercise.repository;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace.NONE;

@DataJpaTest
@AutoConfigureTestDatabase(replace = NONE)
@ActiveProfiles("test")
class SubmissionRepositoryTest {

    @Autowired SubmissionRepository repository;
    @Autowired TestEntityManager em;

    private Long exerciseId;
    private Long gradedVersionId;
    private Long userId7;
    private Long userId8;

    @BeforeEach
    void seedParents() {
        // Seed two users for STUDENT submissions
        User user7 = new User();
        user7.setUsername("student_alice");
        user7.setDisplayName("Alice");
        user7.setPasswordHash("hash");
        user7.setRole(User.Role.STUDENT);
        user7.setStatus(User.UserStatus.ACTIVE);
        userId7 = ((User) em.persistAndFlush(user7)).getId();

        User user8 = new User();
        user8.setUsername("student_bob");
        user8.setDisplayName("Bob");
        user8.setPasswordHash("hash");
        user8.setRole(User.Role.STUDENT);
        user8.setStatus(User.UserStatus.ACTIVE);
        userId8 = ((User) em.persistAndFlush(user8)).getId();

        // Seed an exercise (no category needed)
        Exercise exercise = new Exercise();
        exercise.setTitle("Test Exercise");
        exercise.setDescription("desc");
        exercise.setType(Exercise.ExerciseType.PYTHON);
        exercise.setDifficulty(Exercise.Difficulty.EASY);
        exercise.setStatus(Exercise.Status.PUBLISHED);
        exercise.setCreatedBy(userId7);
        exerciseId = ((Exercise) em.persistAndFlush(exercise)).getId();

        // Seed an exercise version (graded_version_id FK)
        ExerciseVersion version = new ExerciseVersion();
        version.setExerciseId(exerciseId);
        version.setVersionNumber(1);
        version.setTitle("Test Exercise");
        version.setDescription("desc");
        version.setDifficulty("EASY");
        version.setConfig("{}");
        gradedVersionId = ((ExerciseVersion) em.persistAndFlush(version)).getId();
    }

    private Submission sub(String source, Long userId, Long exerciseId) {
        Submission s = new Submission();
        s.setExerciseId(exerciseId);
        s.setGradedVersionId(gradedVersionId);
        s.setStudentName("Alice");
        s.setExerciseType("PYTHON");
        s.setAnswerData("code");
        s.setExportTimestamp(LocalDateTime.now());
        s.setSource(source);
        s.setUserId(userId);
        s.setAutoScore(BigDecimal.valueOf(100));
        return s;
    }

    @Test
    void findFiltered_bySource_returnsOnlyMatchingSource() {
        repository.save(sub("STUDENT", userId7, exerciseId));
        repository.save(sub("IMPORT", null, exerciseId));

        var imports = repository.findFiltered(null, null, "IMPORT", PageRequest.of(0, 20));
        assertEquals(1, imports.getTotalElements());
        assertEquals("IMPORT", imports.getContent().get(0).getSource());

        var all = repository.findFiltered(null, null, null, PageRequest.of(0, 20));
        assertEquals(2, all.getTotalElements());
    }

    @Test
    void findByUser_returnsOwnHistoryNewestFirst() {
        repository.save(sub("STUDENT", userId7, exerciseId));
        repository.save(sub("STUDENT", userId7, exerciseId));
        repository.save(sub("STUDENT", userId8, exerciseId));

        List<Submission> history =
            repository.findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(userId7, exerciseId);
        assertEquals(2, history.size());
    }
}
