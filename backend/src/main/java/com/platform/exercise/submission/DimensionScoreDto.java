package com.platform.exercise.submission;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

public record DimensionScoreDto(
    @NotBlank String name,
    @DecimalMin("0") @DecimalMax("1") double weight,
    @DecimalMin("0") @DecimalMax("100") double score
) {}
