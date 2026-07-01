package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class AutoGradeConfigResolverTest {

    private final AutoGradeConfigResolver resolver = new AutoGradeConfigResolver(new ObjectMapper());

    @Test
    void returnsTrue_whenAutoGradeIsTrue() {
        assertTrue(resolver.isEnabled("{\"autoGrade\":true,\"testCases\":[]}"));
    }

    @Test
    void returnsFalse_whenAutoGradeIsFalse() {
        assertFalse(resolver.isEnabled("{\"autoGrade\":false,\"rubric\":{}}"));
    }

    @Test
    void returnsTrue_whenKeyAbsent() {
        assertTrue(resolver.isEnabled("{\"testCases\":[]}"));
    }

    @Test
    void returnsTrue_whenMalformedJson() {
        assertTrue(resolver.isEnabled("not-json"));
    }

    @Test
    void returnsTrue_forDoubleEncodedConfig() throws Exception {
        String inner = "{\"autoGrade\":true}";
        String doubleEncoded = new ObjectMapper().writeValueAsString(inner);
        assertTrue(resolver.isEnabled(doubleEncoded));
    }

    @Test
    void returnsFalse_forDoubleEncodedConfigWithFalse() throws Exception {
        String inner = "{\"autoGrade\":false}";
        String doubleEncoded = new ObjectMapper().writeValueAsString(inner);
        assertFalse(resolver.isEnabled(doubleEncoded));
    }
}
