package com.platform.exercise.exercise;

import com.platform.exercise.repository.ExerciseListView;
import java.time.LocalDateTime;

public record ExerciseListItemDto(
        Long id,
        String title,
        String type,
        String difficulty,
        CategoryRef category,
        Integer currentVersionNumber,
        String status,
        int likeCount,
        LocalDateTime createdAt
) {
    public record CategoryRef(Long id, String name) {}

    public static ExerciseListItemDto from(ExerciseListView v) {
        CategoryRef cat = (v.getCategoryId() != null && v.getCategoryName() != null)
                ? new CategoryRef(v.getCategoryId(), v.getCategoryName())
                : null;
        return new ExerciseListItemDto(
                v.getId(), v.getTitle(), v.getType(), v.getDifficulty(),
                cat, v.getCurrentVersionNumber(), v.getStatus(),
                v.getLikeCount() != null ? v.getLikeCount() : 0,
                v.getCreatedAt());
    }
}
