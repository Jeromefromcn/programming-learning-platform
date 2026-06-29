package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ImportBatch;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.ImportBatchRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
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
    private final ExerciseVersionRepository versionRepository;
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
        List<Submission> subs = submissionRepository
            .findByBatchIdAndDeletedFalseOrderByStudentNameAsc(batchId);
        // All submissions in a batch share one exercise (enforced by importFiles Phase 1b).
        // The header is derived from the first submission's exercise config.

        List<DimensionDef> dimensions = List.of();
        if (!subs.isEmpty()) {
            dimensions = loadDimensions(subs.get(0).getExerciseId());
        }

        Map<Long, String> displayNameMap = subs.stream()
            .filter(s -> s.getUserId() != null)
            .map(Submission::getUserId)
            .distinct()
            .flatMap(uid -> userRepository.findById(uid).stream())
            .collect(Collectors.toMap(User::getId, u ->
                u.getDisplayName() != null ? u.getDisplayName() : u.getUsername()));

        List<Long> exerciseIds = subs.stream().map(Submission::getExerciseId).distinct().toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition",
            "attachment; filename=\"batch_" + batchId + "_" + LocalDate.now() + ".csv\"");

        List<String> headers = buildHeaders(dimensions);

        try (CSVPrinter printer = new CSVPrinter(
                new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8),
                CSVFormat.DEFAULT.builder()
                    .setHeader(headers.toArray(new String[0]))
                    .build())) {
            for (Submission sub : subs) {
                String displayName = sub.getUserId() != null
                    ? displayNameMap.getOrDefault(sub.getUserId(), "") : "";
                String title = titleMap.getOrDefault(sub.getExerciseId(), "");
                String totalScore = sub.getTutorScore() != null
                    ? sub.getTutorScore().toPlainString()
                    : (sub.getAutoScore() != null ? sub.getAutoScore().toPlainString() : "");

                List<Object> row = new ArrayList<>();
                row.add(sub.getStudentName());
                row.add(displayName);
                row.add(title);

                if (!dimensions.isEmpty()) {
                    Map<String, Double> dimScores = parseDimScores(sub.getTutorGradeDetails());
                    for (DimensionDef d : dimensions) {
                        Double score = dimScores.get(d.name());
                        row.add(score != null ? score : "");
                    }
                }
                row.add(totalScore);
                row.add(sub.getTutorComment() != null ? sub.getTutorComment() : "");
                printer.printRecord(row);
            }
        }
    }

    private record DimensionDef(String name, double weight) {}

    private List<DimensionDef> loadDimensions(long exerciseId) {
        return exerciseRepository.findById(exerciseId)
            .flatMap(ex -> versionRepository.findById(ex.getCurrentVersionId()))
            .map(v -> parseDimensionConfig(v.getConfig()))
            .orElse(List.of());
    }

    private List<DimensionDef> parseDimensionConfig(String configJson) {
        try {
            JsonNode dims = objectMapper.readTree(configJson).path("rubric").path("dimensions");
            if (dims.isMissingNode() || !dims.isArray()) return List.of();
            List<DimensionDef> result = new ArrayList<>();
            for (JsonNode d : dims) {
                result.add(new DimensionDef(d.path("name").asText(), d.path("weight").asDouble()));
            }
            return result;
        } catch (Exception e) {
            return List.of();
        }
    }

    private List<String> buildHeaders(List<DimensionDef> dimensions) {
        List<String> h = new ArrayList<>(List.of("Student Name", "Display Name", "Exercise Title"));
        for (DimensionDef d : dimensions) {
            h.add(d.name() + " (" + (int) Math.round(d.weight() * 100) + "%)");
        }
        h.add("Total Score");
        h.add("Tutor Comment");
        return h;
    }

    private Map<String, Double> parseDimScores(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            com.fasterxml.jackson.databind.JavaType listType = objectMapper.getTypeFactory()
                .constructCollectionType(List.class, DimensionScoreDto.class);
            List<DimensionScoreDto> dims = objectMapper.readValue(json, listType);
            return dims.stream()
                .collect(Collectors.toMap(DimensionScoreDto::name, DimensionScoreDto::score));
        } catch (Exception e) {
            return Map.of();
        }
    }

    @Transactional
    public void deleteBatch(Long id) {
        if (!importBatchRepository.existsById(id)) {
            throw new PlatformException(ErrorCode.BATCH_NOT_FOUND, "Batch not found.");
        }
        submissionRepository.softDeleteAllByBatchId(id);
        importBatchRepository.deleteById(id);
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
