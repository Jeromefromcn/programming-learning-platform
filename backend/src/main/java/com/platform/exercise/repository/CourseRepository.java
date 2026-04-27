package com.platform.exercise.repository;

import com.platform.exercise.domain.Course;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CourseRepository extends JpaRepository<Course, Long> {

    @Query(value = """
            SELECT c.id, c.name, c.description, c.created_at,
                   COUNT(DISTINCT ce.exercise_id) AS exercise_count,
                   COUNT(DISTINCT cs.user_id) AS student_count
            FROM courses c
            LEFT JOIN course_exercises ce ON ce.course_id = c.id
            LEFT JOIN course_students cs ON cs.course_id = c.id
            WHERE c.is_deleted = false AND c.created_by = :createdBy
            GROUP BY c.id, c.name, c.description, c.created_at
            ORDER BY c.created_at DESC
            """,
            countQuery = "SELECT COUNT(*) FROM courses WHERE is_deleted = false AND created_by = :createdBy",
            nativeQuery = true)
    Page<CourseWithCountsView> findAllWithCountsByCreatedBy(@Param("createdBy") Long createdBy, Pageable pageable);

    @Query(value = """
            SELECT e.id, ev.title, e.exercise_type
            FROM exercises e
            JOIN exercise_versions ev ON ev.id = e.current_version_id
            JOIN course_exercises ce ON ce.exercise_id = e.id
            WHERE ce.course_id = :courseId AND e.is_deleted = false
            ORDER BY ev.title
            """, nativeQuery = true)
    List<ExerciseSummaryView> findExercisesByCourse(@Param("courseId") Long courseId);

    @Query(value = """
            SELECT u.id, u.username, u.display_name
            FROM users u
            JOIN course_students cs ON cs.user_id = u.id
            WHERE cs.course_id = :courseId
            ORDER BY u.display_name
            """, nativeQuery = true)
    List<UserSummaryView> findStudentsByCourse(@Param("courseId") Long courseId);

    @Query(value = """
            SELECT u.id, u.username, u.display_name
            FROM users u
            WHERE u.role = 'STUDENT' AND u.status = 'ACTIVE'
              AND (u.username LIKE CONCAT('%', :q, '%') OR u.display_name LIKE CONCAT('%', :q, '%'))
              AND u.id NOT IN (SELECT cs.user_id FROM course_students cs WHERE cs.course_id = :courseId)
            LIMIT 20
            """, nativeQuery = true)
    List<UserSummaryView> findAvailableStudents(@Param("courseId") Long courseId, @Param("q") String q);

    @Modifying(clearAutomatically = true)
    @Query(value = "INSERT IGNORE INTO course_exercises (course_id, exercise_id) VALUES (:courseId, :exerciseId)",
            nativeQuery = true)
    void insertCourseExercise(@Param("courseId") Long courseId, @Param("exerciseId") Long exerciseId);

    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM course_exercises WHERE course_id = :courseId AND exercise_id = :exerciseId",
            nativeQuery = true)
    void deleteCourseExercise(@Param("courseId") Long courseId, @Param("exerciseId") Long exerciseId);

    @Modifying(clearAutomatically = true)
    @Query(value = "INSERT IGNORE INTO course_students (course_id, user_id) VALUES (:courseId, :userId)",
            nativeQuery = true)
    void insertCourseStudent(@Param("courseId") Long courseId, @Param("userId") Long userId);

    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM course_students WHERE course_id = :courseId AND user_id = :userId",
            nativeQuery = true)
    void deleteCourseStudent(@Param("courseId") Long courseId, @Param("userId") Long userId);

    @Query(value = "SELECT COUNT(*) > 0 FROM course_exercises WHERE course_id = :courseId AND exercise_id = :exerciseId",
            nativeQuery = true)
    boolean existsCourseExercise(@Param("courseId") Long courseId, @Param("exerciseId") Long exerciseId);

    @Query(value = "SELECT COUNT(*) > 0 FROM course_students WHERE course_id = :courseId AND user_id = :userId",
            nativeQuery = true)
    boolean existsCourseStudent(@Param("courseId") Long courseId, @Param("userId") Long userId);
}
