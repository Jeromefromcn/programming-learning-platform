package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AutoGradeConfigResolver {

    private final ObjectMapper objectMapper;

    public boolean isEnabled(String configJson) {
        try {
            JsonNode config = objectMapper.readTree(configJson);
            if (config.isTextual()) config = objectMapper.readTree(config.asText());
            JsonNode node = config.get("autoGrade");
            return node == null || node.asBoolean(true);
        } catch (Exception e) {
            return true;
        }
    }
}
