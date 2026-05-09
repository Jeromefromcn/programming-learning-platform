package com.platform.exercise.submission;

import com.platform.exercise.domain.Submission;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SubmissionListItemDto(
    Long id,
    String studentName,
    String exerciseTitle,
    String exerciseType,
    BigDecimal autoScore,
    BigDecimal tutorScore,
    boolean versionMismatch,
    LocalDateTime createdAt
) {
    public static SubmissionListItemDto of(Submission sub, String exerciseTitle) {
        return new SubmissionListItemDto(
            sub.getId(), sub.getStudentName(), exerciseTitle,
            sub.getExerciseType(), sub.getAutoScore(), sub.getTutorScore(),
            sub.isVersionMismatch(), sub.getCreatedAt());
    }
}
