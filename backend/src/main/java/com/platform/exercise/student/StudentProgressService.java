package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StudentProgressService {

    private final SubmissionRepository submissionRepository;
    private final ExerciseRepository exerciseRepository;

    public StudentProgressDto getProgress(Long userId, int page, int size,
                                           String exerciseTitle, String exerciseType, String source) {
        Page<Submission> subPage = submissionRepository
            .findByUserIdFiltered(userId, exerciseTitle, exerciseType, source, PageRequest.of(page, size));

        List<Long> exerciseIds = subPage.map(Submission::getExerciseId).toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        Page<ProgressSubmissionDto> dtoPage = subPage.map(sub ->
            ProgressSubmissionDto.of(sub, titleMap.getOrDefault(sub.getExerciseId(), "Unknown")));

        return new StudentProgressDto(PageResponse.of(dtoPage));
    }
}
