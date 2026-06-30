package com.platform.exercise.submission;

import java.time.LocalDateTime;

public record ImportBatchDto(
    Long id,
    LocalDateTime createdAt,
    int fileCount,
    int importedCount,
    int duplicateCount,
    int failedCount,
    String gradedStatus   // ALL | PARTIAL | NONE
) {}
