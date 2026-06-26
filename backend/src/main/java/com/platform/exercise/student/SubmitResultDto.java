package com.platform.exercise.student;

import java.math.BigDecimal;

public record SubmitResultDto(Long submissionId, boolean showResult,
                              BigDecimal score, Boolean passed) {}
