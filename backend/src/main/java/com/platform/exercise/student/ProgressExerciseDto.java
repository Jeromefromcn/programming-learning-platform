package com.platform.exercise.student;

public record ProgressExerciseDto(
        Long exerciseId,
        String exerciseTitle,
        String exerciseType,
        String status,       // NOT_ATTEMPTED | ATTEMPTED | GRADED
        Double score,        // null if not graded
        String scoreSource)  // TUTOR | AUTO | null
{}
