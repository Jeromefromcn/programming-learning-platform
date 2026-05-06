package com.platform.exercise.student;

public record StudentExerciseDetailDto(
        Long id,
        String title,
        String type,
        String difficulty,
        CategoryRef category,
        StudentVersionDto version,
        int likeCount,
        boolean liked
) {
    public record CategoryRef(Long id, String name) {}
}
