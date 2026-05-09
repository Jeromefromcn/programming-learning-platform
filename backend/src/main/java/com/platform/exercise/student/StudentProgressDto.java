package com.platform.exercise.student;

import java.util.List;

public record StudentProgressDto(
        SummaryDto summary,
        List<ProgressExerciseDto> exercises) {

    public record SummaryDto(
            int totalExercises,
            int attemptedCount,
            int gradedCount,
            double averageScore,
            double passRate) {}
}
