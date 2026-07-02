package com.platform.exercise.student;

import java.time.LocalDateTime;

public record StudentExerciseDetailDto(
        Long id,
        String title,
        String type,
        String difficulty,
        CategoryRef category,
        StudentVersionDto version,
        int likeCount,
        boolean liked,
        LocalDateTime deadline
) {
    public record CategoryRef(Long id, String name) {}
}
