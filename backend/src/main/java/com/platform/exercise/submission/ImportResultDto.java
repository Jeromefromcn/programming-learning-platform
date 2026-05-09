package com.platform.exercise.submission;

import java.math.BigDecimal;

public record ImportResultDto(
    String filename,
    String status,
    Long submissionId,
    String studentName,
    String exerciseTitle,
    String exerciseType,
    BigDecimal autoScore,
    boolean versionMismatch,
    String message
) {
    static ImportResultDto imported(String filename, Long submissionId, String studentName,
            String exerciseTitle, String exerciseType, BigDecimal autoScore, boolean versionMismatch) {
        return new ImportResultDto(filename, "IMPORTED", submissionId, studentName,
                exerciseTitle, exerciseType, autoScore, versionMismatch, null);
    }

    static ImportResultDto duplicate(String filename, String studentName, String exerciseTitle) {
        return new ImportResultDto(filename, "DUPLICATE", null, studentName,
                exerciseTitle, null, null, false, "Duplicate submission detected.");
    }

    static ImportResultDto failed(String filename, String message) {
        return new ImportResultDto(filename, "FAILED", null, null, null, null, null, false, message);
    }
}
