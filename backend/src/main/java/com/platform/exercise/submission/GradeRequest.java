package com.platform.exercise.submission;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record GradeRequest(
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal tutorScore,
    @Size(max = 500) String tutorComment
) {}
