package com.platform.exercise.repository;

import com.platform.exercise.domain.Submission;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

public interface SubmissionRepository extends JpaRepository<Submission, Long> {

    @Query("""
            SELECT COUNT(s) > 0 FROM Submission s
            WHERE s.studentName = :studentName
              AND s.exerciseId = :exerciseId
              AND s.exportTimestamp = :exportTimestamp
              AND s.deleted = false
            """)
    boolean existsActiveByStudentNameAndExerciseIdAndExportTimestamp(
            @Param("studentName") String studentName,
            @Param("exerciseId") Long exerciseId,
            @Param("exportTimestamp") LocalDateTime exportTimestamp);

    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
              AND (:source IS NULL OR source = :source)
              AND is_deleted = false
            ORDER BY created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
              AND (:source IS NULL OR source = :source)
              AND is_deleted = false
            """,
            nativeQuery = true)
    Page<Submission> findFiltered(
            @Param("exerciseId") Long exerciseId,
            @Param("studentName") String studentName,
            @Param("source") String source,
            Pageable pageable);

    List<Submission> findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(
            Long userId, Long exerciseId);

    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND is_deleted = false
            ORDER BY created_at DESC
            """,
            nativeQuery = true)
    List<Submission> findAllForExport(@Param("exerciseId") Long exerciseId);

    List<Submission> findByStudentNameAndDeletedFalse(String studentName);

    @Query("""
            SELECT COUNT(s) FROM Submission s
            WHERE s.createdAt < :before
              AND (:exerciseId IS NULL OR s.exerciseId = :exerciseId)
              AND (:source IS NULL OR s.source = :source)
              AND s.deleted = false
            """)
    long countForPurge(@Param("before") LocalDateTime before,
                       @Param("exerciseId") Long exerciseId,
                       @Param("source") String source);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Submission s SET s.deleted = true
            WHERE s.createdAt < :before
              AND (:exerciseId IS NULL OR s.exerciseId = :exerciseId)
              AND (:source IS NULL OR s.source = :source)
              AND s.deleted = false
            """)
    int softDeleteByFilters(@Param("before") LocalDateTime before,
                            @Param("exerciseId") Long exerciseId,
                            @Param("source") String source);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            DELETE FROM Submission s
            WHERE s.createdAt < :before
              AND (:exerciseId IS NULL OR s.exerciseId = :exerciseId)
              AND (:source IS NULL OR s.source = :source)
            """)
    int hardDeleteByFilters(@Param("before") LocalDateTime before,
                            @Param("exerciseId") Long exerciseId,
                            @Param("source") String source);

    @Query("""
            SELECT COUNT(DISTINCT s.studentName) FROM Submission s
            WHERE s.exportTimestamp >= :since AND s.deleted = false
            """)
    long countDistinctActiveStudentsSince(@Param("since") LocalDateTime since);
}
