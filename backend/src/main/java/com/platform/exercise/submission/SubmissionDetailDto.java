package com.platform.exercise.submission;

import com.platform.exercise.domain.Submission;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SubmissionDetailDto(
    Long id,
    Long exerciseId,
    String studentName,
    String exerciseTitle,
    String exerciseType,
    String answerData,
    String workspaceXml,
    LocalDateTime exportTimestamp,
    boolean versionMismatch,
    Integer studentVersionNumber,
    Integer gradedVersionNumber,
    BigDecimal autoScore,
    String autoGradeDetails,
    BigDecimal tutorScore,
    String tutorComment,
    String tutorGradeDetails,
    boolean graded,
    LocalDateTime createdAt
) {
    public static SubmissionDetailDto of(Submission sub, String exerciseTitle, int gradedVersionNumber) {
        return new SubmissionDetailDto(
            sub.getId(), sub.getExerciseId(), sub.getStudentName(), exerciseTitle,
            sub.getExerciseType(), sub.getAnswerData(), sub.getWorkspaceXml(),
            sub.getExportTimestamp(),
            sub.isVersionMismatch(), sub.getStudentVersionNumber(), gradedVersionNumber,
            sub.getAutoScore(), sub.getAutoGradeDetails(),
            sub.getTutorScore(), sub.getTutorComment(), sub.getTutorGradeDetails(),
            sub.isGraded(), sub.getCreatedAt());
    }
}
