package com.platform.exercise.repository;

import com.platform.exercise.domain.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CategoryRepository extends JpaRepository<Category, Long> {

    @Query(value = """
            SELECT c.id, c.name,
                   COUNT(e.id) AS exercise_count
            FROM categories c
            LEFT JOIN exercises e
                   ON e.category_id = c.id AND e.is_deleted = false
            GROUP BY c.id, c.name
            ORDER BY c.name
            """, nativeQuery = true)
    List<CategoryView> findAllWithExerciseCount();

    @Query(value = "SELECT COUNT(*) FROM exercises WHERE category_id = :id AND is_deleted = false",
           nativeQuery = true)
    long countNonDeletedByCategory(@Param("id") Long id);
}
