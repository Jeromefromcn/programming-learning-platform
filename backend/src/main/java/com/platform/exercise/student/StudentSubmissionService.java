package com.platform.exercise.student;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.grading.AutoGradeConfigResolver;
import com.platform.exercise.grading.BlocklyGrader;
import com.platform.exercise.grading.PythonGrader;
import com.platform.exercise.metrics.BusinessMetrics;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class StudentSubmissionService {

    private static final BigDecimal PASS_THRESHOLD = BigDecimal.valueOf(100);

    private final SubmissionRepository submissionRepository;
    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final BlocklyGrader blocklyGrader;
    private final PythonGrader pythonGrader;
    private final AutoGradeConfigResolver autoGradeConfigResolver;
    private final BusinessMetrics businessMetrics;

    @Transactional
    public SubmitResultDto submit(Long userId, String studentName, Long exerciseId, SubmitRequest req) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
            .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));

        if (exercise.getDeadline() != null && LocalDateTime.now().isAfter(exercise.getDeadline())) {
            throw new PlatformException(ErrorCode.EXERCISE_DEADLINE_PASSED,
                "The submission deadline for this exercise has passed.");
        }

        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));

        submissionRepository.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(userId, exerciseId, "STUDENT")
            .ifPresent(existing -> {
                if (existing.isGraded()) {
                    throw new PlatformException(ErrorCode.SUBMISSION_ALREADY_GRADED,
                        "This exercise has already been graded and cannot be resubmitted.");
                }
                existing.setDeleted(true);
                existing.setStudentActiveKey(null);
                // Flush now: the new row's INSERT below is forced immediate by IDENTITY
                // generation, so a deferred UPDATE here would still see the old
                // student_active_key in the DB at insert time and collide with the
                // unique index. saveAndFlush avoids that ordering hazard.
                submissionRepository.saveAndFlush(existing);
            });

        boolean autoGrade = autoGradeConfigResolver.isEnabled(version.getConfig());
        String type = exercise.getType().name();
        BigDecimal autoScore = null;
        String autoGradeDetails = null;
        if (autoGrade) {
            if ("BLOCKLY".equals(type)) {
                BlocklyGrader.Result gr = blocklyGrader.grade(req.answerData(), version.getConfig());
                autoScore = gr.autoScore();
                autoGradeDetails = gr.autoGradeDetailsJson();
            } else {
                PythonGrader.Result gr = pythonGrader.grade(req.answerData(), version.getConfig());
                autoScore = gr.autoScore();
                autoGradeDetails = gr.autoGradeDetailsJson();
            }
        }

        Submission sub = new Submission();
        sub.setExerciseId(exerciseId);
        sub.setGradedVersionId(version.getId());
        sub.setStudentName(studentName);
        sub.setExerciseType(type);
        sub.setAnswerData(req.answerData());
        sub.setWorkspaceXml(req.workspaceXml());
        sub.setExportTimestamp(LocalDateTime.now());
        sub.setVersionMismatch(false);
        sub.setStudentVersionNumber(version.getVersionNumber());
        sub.setAutoScore(autoScore);
        sub.setAutoGradeDetails(autoGradeDetails);
        sub.setSource("STUDENT");
        sub.setUserId(userId);
        sub.setStudentActiveKey("STUDENT:" + exerciseId + ":" + userId);
        Submission saved = submissionRepository.save(sub);
        businessMetrics.recordSubmissionCreated(type);

        return new SubmitResultDto(
            saved.getId(),
            autoGrade,
            autoGrade ? autoScore : null,
            autoGrade ? passed(autoScore) : null);
    }

    @Transactional(readOnly = true)
    public List<SubmissionHistoryItemDto> history(Long userId, Long exerciseId) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
            .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        boolean autoGrade = exercise.getCurrentVersionId() != null
            && versionRepository.findById(exercise.getCurrentVersionId())
                .map(v -> autoGradeConfigResolver.isEnabled(v.getConfig())).orElse(true);

        return submissionRepository
            .findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(userId, exerciseId)
            .stream()
            .map(s -> new SubmissionHistoryItemDto(
                s.getId(), s.getCreatedAt(), autoGrade,
                autoGrade ? s.getAutoScore() : null,
                autoGrade ? passed(s.getAutoScore()) : null))
            .toList();
    }

    private boolean passed(BigDecimal score) {
        return score != null && score.compareTo(PASS_THRESHOLD) >= 0;
    }
}
