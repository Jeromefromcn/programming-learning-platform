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
    boolean graded,
    BigDecimal score,     // tutorScore if present, else autoScore, else null
    String answerData,
    String workspaceXml,
    LocalDateTime createdAt
) {
    public static ProgressSubmissionDto of(Submission sub, String exerciseTitle) {
        BigDecimal score = sub.getTutorScore() != null ? sub.getTutorScore() : sub.getAutoScore();
        return new ProgressSubmissionDto(
            sub.getId(), sub.getExerciseId(), exerciseTitle,
            sub.getExerciseType(), sub.getSource(),
            sub.isGraded(), score,
            sub.getAnswerData(), sub.getWorkspaceXml(),
            sub.getCreatedAt());
    }
}
