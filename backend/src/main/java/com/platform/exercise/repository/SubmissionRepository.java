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
              AND (:batchId IS NULL OR batch_id = :batchId)
              AND is_deleted = false
            ORDER BY created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND (:studentName IS NULL OR student_name LIKE CONCAT('%', :studentName, '%'))
              AND (:source IS NULL OR source = :source)
              AND (:batchId IS NULL OR batch_id = :batchId)
              AND is_deleted = false
            """,
            nativeQuery = true)
    Page<Submission> findFiltered(
            @Param("exerciseId") Long exerciseId,
            @Param("studentName") String studentName,
            @Param("source") String source,
            @Param("batchId") Long batchId,
            Pageable pageable);

    List<Submission> findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(
            Long userId, Long exerciseId);

    Page<Submission> findByUserIdAndDeletedFalseOrderByCreatedAtDesc(Long userId, Pageable pageable);

    @Query(value = """
            SELECT s.batch_id, COUNT(*) AS total,
                   SUM(CASE WHEN s.graded = 1 THEN 1 ELSE 0 END) AS graded
            FROM submissions s
            WHERE s.batch_id IN (:batchIds) AND s.is_deleted = false
            GROUP BY s.batch_id
            """, nativeQuery = true)
    List<Object[]> countGradedGroupByBatchId(@Param("batchIds") List<Long> batchIds);

    @Query(value = """
            SELECT * FROM submissions
            WHERE (:exerciseId IS NULL OR exercise_id = :exerciseId)
              AND is_deleted = false
            ORDER BY created_at DESC
            """,
            nativeQuery = true)
    List<Submission> findAllForExport(@Param("exerciseId") Long exerciseId);

    List<Submission> findByStudentNameAndDeletedFalse(String studentName);

    List<Submission> findByBatchIdAndDeletedFalseOrderByStudentNameAsc(Long batchId);

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

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE Submission s SET s.deleted = true WHERE s.batchId = :batchId")
    int softDeleteAllByBatchId(@Param("batchId") Long batchId);

    // LOWER() is explicit here (unlike findFiltered's studentName search) because H2 in test
    // mode defaults to case-sensitive LIKE. MySQL's utf8mb4_general_ci already ignores case,
    // so LOWER() is redundant but harmless on MySQL and necessary for H2 test fidelity.
    @Query(value = """
            SELECT s.* FROM submissions s
            LEFT JOIN exercises e ON e.id = s.exercise_id
            WHERE s.user_id = :userId
              AND s.is_deleted = false
              AND (:exerciseTitle IS NULL OR LOWER(e.title) LIKE CONCAT('%', LOWER(:exerciseTitle), '%'))
              AND (:exerciseType IS NULL OR s.exercise_type = :exerciseType)
              AND (:source IS NULL OR s.source = :source)
            ORDER BY s.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM submissions s
            LEFT JOIN exercises e ON e.id = s.exercise_id
            WHERE s.user_id = :userId
              AND s.is_deleted = false
              AND (:exerciseTitle IS NULL OR LOWER(e.title) LIKE CONCAT('%', LOWER(:exerciseTitle), '%'))
              AND (:exerciseType IS NULL OR s.exercise_type = :exerciseType)
              AND (:source IS NULL OR s.source = :source)
            """,
            nativeQuery = true)
    Page<Submission> findByUserIdFiltered(
            @Param("userId") Long userId,
            @Param("exerciseTitle") String exerciseTitle,
            @Param("exerciseType") String exerciseType,
            @Param("source") String source,
            Pageable pageable);
}
