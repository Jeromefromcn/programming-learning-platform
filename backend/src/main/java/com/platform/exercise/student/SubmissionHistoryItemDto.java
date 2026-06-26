package com.platform.exercise.student;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SubmissionHistoryItemDto(Long submissionId, LocalDateTime createdAt,
                                       boolean showResult, BigDecimal score, Boolean passed) {}
