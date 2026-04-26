package com.platform.exercise.category;

import com.platform.exercise.domain.Category;
import com.platform.exercise.repository.CategoryView;

public record CategoryDto(Long id, String name, long exerciseCount) {

    public static CategoryDto from(CategoryView v) {
        return new CategoryDto(v.getId(), v.getName(),
                v.getExerciseCount() != null ? v.getExerciseCount() : 0L);
    }

    public static CategoryDto from(Category c) {
        return new CategoryDto(c.getId(), c.getName(), 0L);
    }
}
