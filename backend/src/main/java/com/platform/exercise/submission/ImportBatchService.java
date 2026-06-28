package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.ImportBatch;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ImportBatchRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ImportBatchService {

    private final ImportBatchRepository importBatchRepository;
    private final SubmissionRepository submissionRepository;
    private final UserRepository userRepository;
    private final ExerciseRepository exerciseRepository;
    private final ObjectMapper objectMapper;

    public PageResponse<ImportBatchDto> list(Long batchId, String gradedStatus, int page, int size) {
        // Load all batches (university scale — manageable without SQL-level gradedStatus filter)
        List<ImportBatch> all = importBatchRepository.findAllByOrderByCreatedAtDesc();
        if (batchId != null) {
            all = all.stream().filter(b -> b.getId().equals(batchId)).toList();
        }

        // Bulk-load graded counts
        List<Long> ids = all.stream().map(ImportBatch::getId).toList();
        Map<Long, long[]> countMap = buildCountMap(ids);

        // Build DTOs with gradedStatus
        List<ImportBatchDto> dtos = all.stream().map(b -> {
            long[] counts = countMap.getOrDefault(b.getId(), new long[]{0L, 0L});
            return new ImportBatchDto(b.getId(), b.getCreatedAt(),
                b.getFileCount(), b.getImportedCount(), b.getDuplicateCount(), b.getFailedCount(),
                computeGradedStatus(counts[0], counts[1]));
        }).toList();

        // Apply gradedStatus filter in-memory
        if (gradedStatus != null && !gradedStatus.isBlank()) {
            dtos = dtos.stream().filter(d -> d.gradedStatus().equals(gradedStatus)).toList();
        }

        // Manual pagination
        int total = dtos.size();
        int from = Math.min(page * size, total);
        int to   = Math.min(from + size, total);
        int totalPages = size > 0 ? (int) Math.ceil((double) total / size) : 1;
        return new PageResponse<>(dtos.subList(from, to), page, size, total, totalPages);
    }

    public void exportBatchCsv(Long batchId, HttpServletResponse response) throws IOException {
        List<Submission> subs = submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc(batchId);

        // Build lookup maps
        List<Long> exerciseIds = subs.stream().map(Submission::getExerciseId).distinct().toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(e -> e.getId(), e -> e.getTitle()));
        Map<Long, String> displayNameMap = subs.stream()
            .filter(s -> s.getUserId() != null)
            .map(Submission::getUserId)
            .distinct()
            .flatMap(uid -> userRepository.findById(uid).stream())
            .collect(Collectors.toMap(User::getId, u ->
                u.getDisplayName() != null ? u.getDisplayName() : u.getUsername()));

        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition",
            "attachment; filename=\"batch_" + batchId + "_" + LocalDate.now() + ".csv\"");

        try (CSVPrinter printer = new CSVPrinter(
                new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8),
                CSVFormat.DEFAULT.builder()
                    .setHeader("Student Name", "Display Name", "Exercise Title",
                               "Dimension", "Weight", "Dimension Score", "Total Score")
                    .build())) {
            for (Submission sub : subs) {
                String displayName = sub.getUserId() != null
                    ? displayNameMap.getOrDefault(sub.getUserId(), "") : "";
                String title = titleMap.getOrDefault(sub.getExerciseId(), "");
                String totalScore = sub.getTutorScore() != null
                    ? sub.getTutorScore().toPlainString()
                    : (sub.getAutoScore() != null ? sub.getAutoScore().toPlainString() : "");

                if (sub.getTutorGradeDetails() != null) {
                    // Rubric: one row per dimension
                    try {
                        com.fasterxml.jackson.databind.JavaType listType = objectMapper.getTypeFactory()
                            .constructCollectionType(List.class, DimensionScoreDto.class);
                        List<DimensionScoreDto> dims = objectMapper.readValue(sub.getTutorGradeDetails(), listType);
                        for (DimensionScoreDto d : dims) {
                            printer.printRecord(sub.getStudentName(), displayName, title,
                                d.name(), d.weight(), d.score(), totalScore);
                        }
                    } catch (Exception e) {
                        printer.printRecord(sub.getStudentName(), displayName, title,
                            "", "", "", totalScore);
                    }
                } else {
                    // Auto/instant-feedback: single row, empty dimension columns
                    printer.printRecord(sub.getStudentName(), displayName, title,
                        "", "", "", totalScore);
                }
            }
        }
    }

    // package-private for unit test
    static String computeGradedStatus(long total, long graded) {
        if (total == 0 || total == graded) return "ALL";
        if (graded == 0) return "NONE";
        return "PARTIAL";
    }

    private Map<Long, long[]> buildCountMap(List<Long> batchIds) {
        if (batchIds.isEmpty()) return Map.of();
        return submissionRepository.countGradedGroupByBatchId(batchIds).stream()
            .collect(Collectors.toMap(
                row -> ((Number) row[0]).longValue(),
                row -> new long[]{((Number) row[1]).longValue(), ((Number) row[2]).longValue()} // [0]=total, [1]=graded
            ));
    }
}
