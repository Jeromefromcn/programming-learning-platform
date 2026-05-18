package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class StudentProgressService {

    private final StudentExerciseService studentExerciseService;
    private final SubmissionRepository submissionRepository;

    public StudentProgressDto getProgress(Long userId, String displayName, int page, int size) {
        List<StudentExerciseListDto> exercises =
                studentExerciseService.listExercises(null, null, null, 0, 1000, userId).content();

        List<Submission> submissions = submissionRepository.findByStudentNameAndDeletedFalse(displayName);

        Map<Long, Submission> bestByExercise = new HashMap<>();
        for (Submission s : submissions) {
            bestByExercise.merge(s.getExerciseId(), s, (existing, candidate) -> {
                BigDecimal ex = effectiveScore(existing);
                BigDecimal ca = effectiveScore(candidate);
                if (ca != null && (ex == null || ca.compareTo(ex) > 0)) return candidate;
                return existing;
            });
        }

        List<ProgressExerciseDto> result = new ArrayList<>();
        int attemptedCount = 0, gradedCount = 0, passCount = 0;
        double scoreSum = 0.0;

        for (StudentExerciseListDto ex : exercises) {
            Submission best = bestByExercise.get(ex.id());
            ProgressExerciseDto dto;
            if (best == null) {
                dto = new ProgressExerciseDto(ex.id(), ex.title(), ex.type(), "NOT_ATTEMPTED", null, null);
            } else {
                BigDecimal eff = effectiveScore(best);
                if (eff == null) {
                    attemptedCount++;
                    dto = new ProgressExerciseDto(ex.id(), ex.title(), ex.type(), "ATTEMPTED", null, null);
                } else {
                    gradedCount++;
                    double score = eff.doubleValue();
                    scoreSum += score;
                    if (score >= 60.0) passCount++;
                    String source = best.getTutorScore() != null ? "TUTOR" : "AUTO";
                    dto = new ProgressExerciseDto(ex.id(), ex.title(), ex.type(), "GRADED", score, source);
                }
            }
            result.add(dto);
        }

        double averageScore = gradedCount > 0
                ? Math.round((scoreSum / gradedCount) * 10.0) / 10.0 : 0.0;
        double passRate = gradedCount > 0
                ? Math.round(((double) passCount / gradedCount * 100) * 10.0) / 10.0 : 0.0;

        // Manually paginate the result list; summary is computed over all exercises
        int total = result.size();
        int fromIdx = Math.min(page * size, total);
        int toIdx = Math.min(fromIdx + size, total);
        int totalPages = size > 0 ? (int) Math.ceil((double) total / size) : 1;
        PageResponse<ProgressExerciseDto> pageResponse =
                new PageResponse<>(result.subList(fromIdx, toIdx), page, size, total, totalPages);

        return new StudentProgressDto(
                new StudentProgressDto.SummaryDto(
                        exercises.size(), attemptedCount, gradedCount, averageScore, passRate),
                pageResponse);
    }

    private BigDecimal effectiveScore(Submission s) {
        return s.getTutorScore() != null ? s.getTutorScore() : s.getAutoScore();
    }
}
