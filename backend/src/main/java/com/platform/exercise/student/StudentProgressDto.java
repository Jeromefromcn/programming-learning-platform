package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;

public record StudentProgressDto(
        SummaryDto summary,
        PageResponse<ProgressExerciseDto> exercises) {

    public record SummaryDto(
            int totalExercises,
            int attemptedCount,
            int gradedCount,
            double averageScore,
            double passRate) {}
}
