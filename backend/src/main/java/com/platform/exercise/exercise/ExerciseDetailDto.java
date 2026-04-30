package com.platform.exercise.exercise;

public record ExerciseDetailDto(
        Long id,
        String title,
        String type,
        String status,
        ExerciseVersionDto currentVersion
) {}
