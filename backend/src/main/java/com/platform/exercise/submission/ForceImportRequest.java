package com.platform.exercise.submission;

import jakarta.validation.constraints.NotBlank;

public record ForceImportRequest(
    @NotBlank String batchId,
    @NotBlank String filename
) {}
