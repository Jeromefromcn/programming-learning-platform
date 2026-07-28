package com.platform.exercise.exercise;

import java.time.LocalDateTime;

public record ExerciseDetailDto(
        Long id,
        String title,
        String type,
        String status,
        Long categoryId,
        LocalDateTime deadline,
        ExerciseVersionDto currentVersion
) {}
