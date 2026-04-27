package com.platform.exercise.course;

import com.platform.exercise.repository.ExerciseSummaryView;

public record ExerciseSummaryDto(Long id, String title, String exerciseType) {
    public static ExerciseSummaryDto from(ExerciseSummaryView v) {
        return new ExerciseSummaryDto(v.getId(), v.getTitle(), v.getExerciseType());
    }
}
