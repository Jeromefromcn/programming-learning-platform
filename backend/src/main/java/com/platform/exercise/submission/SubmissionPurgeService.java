package com.platform.exercise.submission;

import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class SubmissionPurgeService {

    private final SubmissionRepository submissionRepository;

    @Transactional(readOnly = true)
    public PurgePreviewResponse preview(LocalDateTime before, Long exerciseId, String source) {
        long count = submissionRepository.countForPurge(before, exerciseId, source);
        return new PurgePreviewResponse(count);
    }

    @Transactional
    public PurgeResultResponse purge(LocalDateTime before, Long exerciseId, String source, PurgeMode mode) {
        int affected = switch (mode) {
            case SOFT -> submissionRepository.softDeleteByFilters(before, exerciseId, source);
            case HARD -> submissionRepository.hardDeleteByFilters(before, exerciseId, source);
        };
        return new PurgeResultResponse(affected);
    }
}
