package com.platform.exercise.student;

import com.platform.exercise.domain.Submission;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ProgressSubmissionDto(
    Long submissionId,
    Long exerciseId,
    String exerciseTitle,
    String exerciseType,
    String source,        // STUDENT | IMPORT
    BigDecimal score,     // autoScore only — tutor review status is not shown here
    String answerData,
    String workspaceXml,
    LocalDateTime createdAt
) {
    public static ProgressSubmissionDto of(Submission sub, String exerciseTitle) {
        return new ProgressSubmissionDto(
            sub.getId(), sub.getExerciseId(), exerciseTitle,
            sub.getExerciseType(), sub.getSource(),
            sub.getAutoScore(),
            sub.getAnswerData(), sub.getWorkspaceXml(),
            sub.getCreatedAt());
    }
}
