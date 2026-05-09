package com.platform.exercise.repository;

import com.platform.exercise.domain.Submission;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface SubmissionRepository extends JpaRepository<Submission, Long> {

    boolean existsByStudentNameAndExerciseIdAndExportTimestamp(
            String studentName, Long exerciseId, LocalDateTime exportTimestamp);

    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
            ORDER BY created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
            """,
            nativeQuery = true)
    Page<Submission> findFiltered(
            @Param("exerciseId") Long exerciseId,
            @Param("studentName") String studentName,
            Pageable pageable);

    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
            ORDER BY created_at DESC
            """,
            nativeQuery = true)
    List<Submission> findAllForExport(@Param("exerciseId") Long exerciseId);

    List<Submission> findByStudentName(String studentName);
}
