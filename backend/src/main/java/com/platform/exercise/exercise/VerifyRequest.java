package com.platform.exercise.exercise;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record VerifyRequest(
        @NotBlank String starterCode,
        @Min(1) @Max(30) int timeLimitSeconds,
        @NotEmpty List<TestCaseItem> testCases
) {
    public record TestCaseItem(String input, String expectedOutput) {}
}
