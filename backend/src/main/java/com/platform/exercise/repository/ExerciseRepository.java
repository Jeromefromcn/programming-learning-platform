package com.platform.exercise.repository;

import com.platform.exercise.domain.Exercise;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface ExerciseRepository extends JpaRepository<Exercise, Long> {

    Optional<Exercise> findByIdAndDeletedFalse(Long id);

    @Query(value = """
            SELECT e.id, e.title, e.type, e.difficulty, e.category_id,
                   c.name AS category_name,
                   ev.version_number AS current_version_number,
                   e.status, e.like_count, e.created_at
            FROM exercises e
            LEFT JOIN categories c ON c.id = e.category_id
            LEFT JOIN exercise_versions ev ON ev.id = e.current_version_id
            WHERE e.is_deleted = false
              AND (:type IS NULL OR e.type = :type)
              AND (:status IS NULL OR e.status = :status)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
              AND (:title IS NULL OR e.title LIKE CONCAT('%', :title, '%'))
            ORDER BY e.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM exercises e
            WHERE e.is_deleted = false
              AND (:type IS NULL OR e.type = :type)
              AND (:status IS NULL OR e.status = :status)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
              AND (:title IS NULL OR e.title LIKE CONCAT('%', :title, '%'))
            """,
            nativeQuery = true)
    Page<ExerciseListView> findAllFiltered(
            @Param("type") String type,
            @Param("status") String status,
            @Param("categoryId") Long categoryId,
            @Param("difficulty") String difficulty,
            @Param("title") String title,
            Pageable pageable);

    // ── Student browse — course filter OFF ───────────────────────────────────

    @Query(value = """
            SELECT e.id, e.title, e.type, e.difficulty, e.category_id,
                   c.name AS category_name,
                   ev.version_number AS current_version_number,
                   e.status, e.like_count, e.created_at
            FROM exercises e
            LEFT JOIN categories c ON c.id = e.category_id
            LEFT JOIN exercise_versions ev ON ev.id = e.current_version_id
            WHERE e.is_deleted = false AND e.status = 'PUBLISHED'
              AND (:type IS NULL OR e.type = :type)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
            ORDER BY e.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM exercises e
            WHERE e.is_deleted = false AND e.status = 'PUBLISHED'
              AND (:type IS NULL OR e.type = :type)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
            """,
            nativeQuery = true)
    Page<ExerciseListView> findPublishedFiltered(
            @Param("type") String type,
            @Param("categoryId") Long categoryId,
            @Param("difficulty") String difficulty,
            Pageable pageable);

    // ── Student browse — course filter ON ────────────────────────────────────

    @Query(value = """
            SELECT e.id, e.title, e.type, e.difficulty, e.category_id,
                   c.name AS category_name,
                   ev.version_number AS current_version_number,
                   e.status, e.like_count, e.created_at
            FROM exercises e
            LEFT JOIN categories c ON c.id = e.category_id
            LEFT JOIN exercise_versions ev ON ev.id = e.current_version_id
            WHERE e.is_deleted = false AND e.status = 'PUBLISHED'
              AND (:type IS NULL OR e.type = :type)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
              AND e.id IN (
                  SELECT ce.exercise_id FROM course_exercises ce
                  WHERE ce.course_id IN (
                      SELECT cs.course_id FROM course_students cs WHERE cs.user_id = :userId
                  )
              )
            ORDER BY e.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM exercises e
            WHERE e.is_deleted = false AND e.status = 'PUBLISHED'
              AND (:type IS NULL OR e.type = :type)
              AND (:categoryId IS NULL OR e.category_id = :categoryId)
              AND (:difficulty IS NULL OR e.difficulty = :difficulty)
              AND e.id IN (
                  SELECT ce.exercise_id FROM course_exercises ce
                  WHERE ce.course_id IN (
                      SELECT cs.course_id FROM course_students cs WHERE cs.user_id = :userId
                  )
              )
            """,
            nativeQuery = true)
    Page<ExerciseListView> findPublishedFilteredForStudent(
            @Param("type") String type,
            @Param("categoryId") Long categoryId,
            @Param("difficulty") String difficulty,
            @Param("userId") Long userId,
            Pageable pageable);
}
