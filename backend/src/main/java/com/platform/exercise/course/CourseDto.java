package com.platform.exercise.course;

import com.platform.exercise.repository.CourseWithCountsView;

import java.time.LocalDateTime;

public record CourseDto(
        Long id,
        String name,
        String description,
        LocalDateTime createdAt,
        long exerciseCount,
        long studentCount
) {
    public static CourseDto from(CourseWithCountsView v) {
        LocalDateTime createdAt;
        Object raw = v.getCreatedAt();
        if (raw instanceof LocalDateTime ldt) {
            createdAt = ldt;
        } else if (raw instanceof java.sql.Timestamp ts) {
            createdAt = ts.toLocalDateTime();
        } else {
            createdAt = null;
        }
        return new CourseDto(
                v.getId(),
                v.getName(),
                v.getDescription(),
                createdAt,
                v.getExerciseCount() != null ? v.getExerciseCount() : 0L,
                v.getStudentCount() != null ? v.getStudentCount() : 0L
        );
    }
}
