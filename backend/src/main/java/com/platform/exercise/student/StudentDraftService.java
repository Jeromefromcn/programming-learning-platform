package com.platform.exercise.student;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseDraft;
import com.platform.exercise.repository.ExerciseDraftRepository;
import com.platform.exercise.repository.ExerciseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class StudentDraftService {

    private final ExerciseDraftRepository draftRepository;
    private final ExerciseRepository exerciseRepository;

    @Transactional(readOnly = true)
    public DraftDto getDraft(Long userId, Long exerciseId) {
        requirePublished(exerciseId);
        return draftRepository.findByUserIdAndExerciseId(userId, exerciseId)
            .map(d -> new DraftDto(d.getAnswerData(), d.getWorkspaceXml(), d.getUpdatedAt()))
            .orElse(null);
    }

    @Transactional
    public DraftDto saveDraft(Long userId, Long exerciseId, SaveDraftRequest req) {
        Exercise exercise = requirePublished(exerciseId);
        ExerciseDraft draft = draftRepository.findByUserIdAndExerciseId(userId, exerciseId)
            .orElseGet(ExerciseDraft::new);
        draft.setUserId(userId);
        draft.setExerciseId(exerciseId);
        draft.setExerciseType(exercise.getType().name());
        draft.setAnswerData(req.answerData());
        draft.setWorkspaceXml(req.workspaceXml());
        ExerciseDraft saved = draftRepository.save(draft);
        return new DraftDto(saved.getAnswerData(), saved.getWorkspaceXml(), saved.getUpdatedAt());
    }

    private Exercise requirePublished(Long exerciseId) {
        return exerciseRepository.findByIdAndDeletedFalse(exerciseId)
            .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
    }
}
