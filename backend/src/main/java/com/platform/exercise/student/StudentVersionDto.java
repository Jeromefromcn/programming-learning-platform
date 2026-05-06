package com.platform.exercise.student;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public record StudentVersionDto(
        Long id,
        int versionNumber,
        String description,
        List<String> hints,
        JsonNode config
) {}
