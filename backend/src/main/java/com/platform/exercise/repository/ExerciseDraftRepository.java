package com.platform.exercise.repository;

import com.platform.exercise.domain.ExerciseDraft;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ExerciseDraftRepository extends JpaRepository<ExerciseDraft, Long> {
    Optional<ExerciseDraft> findByUserIdAndExerciseId(Long userId, Long exerciseId);
}
