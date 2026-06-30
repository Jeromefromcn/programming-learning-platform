package com.platform.exercise.submission;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

public record GradeRequest(
    @DecimalMin("0") @DecimalMax("100") BigDecimal tutorScore,
    @Valid List<DimensionScoreDto> dimensionScores,
    @Size(max = 500) String tutorComment
) {}
