package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import com.platform.exercise.domain.Exercise.Difficulty;
import com.platform.exercise.domain.Exercise.ExerciseType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CreateExerciseRequest(
        @NotBlank String title,
        @NotBlank String description,
        @NotNull ExerciseType type,
        @NotNull Difficulty difficulty,
        Long categoryId,
        List<String> hints,
        @NotNull JsonNode config
) {}
