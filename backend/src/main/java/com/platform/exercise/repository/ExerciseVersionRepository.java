package com.platform.exercise.repository;

import com.platform.exercise.domain.ExerciseVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ExerciseVersionRepository extends JpaRepository<ExerciseVersion, Long> {

    List<ExerciseVersion> findByExerciseIdOrderByVersionNumberDesc(Long exerciseId);

    @Query("SELECT MAX(ev.versionNumber) FROM ExerciseVersion ev WHERE ev.exerciseId = :exerciseId")
    Optional<Integer> findMaxVersionNumber(@Param("exerciseId") Long exerciseId);

    Optional<ExerciseVersion> findByIdAndExerciseId(Long id, Long exerciseId);
}
