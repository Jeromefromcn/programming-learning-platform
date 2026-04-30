package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDateTime;
import java.util.List;

public record ExerciseVersionDto(
        Long id,
        int versionNumber,
        String title,
        String description,
        String difficulty,
        List<String> hints,
        JsonNode config,
        LocalDateTime createdAt,
        boolean isCurrent
) {}
