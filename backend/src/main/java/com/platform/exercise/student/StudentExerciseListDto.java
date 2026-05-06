package com.platform.exercise.student;

import com.platform.exercise.repository.ExerciseListView;

public record StudentExerciseListDto(
        Long id,
        String title,
        String type,
        String difficulty,
        CategoryRef category,
        Integer currentVersionNumber,
        int likeCount
) {
    public record CategoryRef(Long id, String name) {}

    public static StudentExerciseListDto from(ExerciseListView v) {
        CategoryRef cat = (v.getCategoryId() != null && v.getCategoryName() != null)
                ? new CategoryRef(v.getCategoryId(), v.getCategoryName())
                : null;
        return new StudentExerciseListDto(
                v.getId(), v.getTitle(), v.getType(), v.getDifficulty(),
                cat, v.getCurrentVersionNumber(),
                v.getLikeCount() != null ? v.getLikeCount() : 0);
    }
}
