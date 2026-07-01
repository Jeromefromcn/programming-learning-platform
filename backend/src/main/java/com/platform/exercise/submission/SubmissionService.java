package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.ImportBatch;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.metrics.SecurityMetrics;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.ImportBatchRepository;
import com.platform.exercise.repository.SubmissionRepository;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
@RequiredArgsConstructor
public class SubmissionService {

    private final SubmissionRepository submissionRepository;
    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final FileImportService fileImportService;
    private final ImportBatchCache batchCache;
    private final ImportBatchRepository importBatchRepository;
    private final ObjectMapper objectMapper;
    private final SecurityMetrics securityMetrics;

    @Transactional
    public ImportResponseDto importFiles(List<MultipartFile> files, Long importedByUserId) throws IOException {
        // --- Phase 1: collect all file bytes and validate (no writes) ---
        record FileEntry(String name, byte[] bytes) {}
        List<FileEntry> entries = new ArrayList<>();
        List<ImportProblemDto> problems = new ArrayList<>();

        for (MultipartFile file : files) {
            String originalName = file.getOriginalFilename() != null
                ? file.getOriginalFilename() : "unknown";
            byte[] fileBytes = file.getBytes();

            if (originalName.toLowerCase().endsWith(".zip")) {
                // Expand ZIP and validate each entry
                try (ZipInputStream zis =
                         new ZipInputStream(new ByteArrayInputStream(fileBytes))) {
                    ZipEntry entry;
                    long totalBytes = 0;
                    int fileCount = 0;
                    while ((entry = zis.getNextEntry()) != null) {
                        if (entry.isDirectory()) { zis.closeEntry(); continue; }
                        String entryName = entry.getName();
                        if (entryName.contains("..")) {
                            throw new PlatformException(
                                ErrorCode.ZIP_PATH_TRAVERSAL,
                                "Path traversal detected: " + entryName);
                        }
                        if (++fileCount > 500) {
                            throw new PlatformException(
                                ErrorCode.ZIP_TOO_LARGE,
                                "ZIP contains more than 500 files.");
                        }
                        byte[] content = zis.readAllBytes();
                        totalBytes += content.length;
                        if (totalBytes > 100L * 1024 * 1024) {
                            throw new PlatformException(
                                ErrorCode.ZIP_TOO_LARGE,
                                "Decompressed ZIP exceeds 100 MB.");
                        }
                        String filename = new java.io.File(entryName).getName();
                        if (filename.toLowerCase().endsWith(".json")) {
                            entries.add(new FileEntry(filename, content));
                        }
                        zis.closeEntry();
                    }
                }
            } else if (originalName.toLowerCase().endsWith(".json")) {
                entries.add(new FileEntry(originalName, fileBytes));
            } else {
                problems.add(new ImportProblemDto(originalName, "Unsupported file type."));
            }
        }

        // Validate each JSON entry (schema + username)
        for (FileEntry e : entries) {
            ImportProblemDto problem = fileImportService.validateFile(e.name(), e.bytes());
            if (problem != null) problems.add(problem);
        }

        if (!problems.isEmpty()) {
            return ImportResponseDto.validationFailed(problems);
        }

        // Phase 1b: all files must belong to the same exercise
        Map<String, Long> fileExerciseIds = new LinkedHashMap<>();
        for (FileEntry e : entries) {
            try {
                long eid = objectMapper.readTree(e.bytes()).path("exerciseId").asLong(-1L);
                if (eid > 0) fileExerciseIds.put(e.name(), eid);
            } catch (Exception ignored) {} // already validated in phase 1; exerciseId parse cannot fail here
        }
        Set<Long> distinctIds = new LinkedHashSet<>(fileExerciseIds.values());
        if (distinctIds.size() > 1) {
            long expected = distinctIds.iterator().next();
            List<ImportProblemDto> mismatchProblems = fileExerciseIds.entrySet().stream()
                .filter(entry -> entry.getValue() != expected)
                .map(entry -> new ImportProblemDto(entry.getKey(),
                    "Exercise mismatch: this file belongs to exercise #" + entry.getValue()
                    + ", but the batch expects exercise #" + expected))
                .toList();
            return ImportResponseDto.validationFailed(mismatchProblems);
        }

        // --- Phase 2: commit — create batch row, then save each submission ---
        String batchUuid = UUID.randomUUID().toString();
        ImportBatch batch = new ImportBatch();
        batch.setUuid(batchUuid);
        batch.setImportedBy(importedByUserId);
        batch.setFileCount(entries.size());
        batch = importBatchRepository.save(batch);

        List<ImportResultDto> results = new ArrayList<>();
        for (FileEntry e : entries) {
            results.add(fileImportService.processSingleFile(e.name(), e.bytes(), batchUuid, false));
        }

        // Update batch counts
        long imported = results.stream().filter(r -> "IMPORTED".equals(r.status())).count();
        long duplicates = results.stream().filter(r -> "DUPLICATE".equals(r.status())).count();
        long failed = results.stream().filter(r -> "FAILED".equals(r.status())).count();
        batch.setImportedCount((int) imported);
        batch.setDuplicateCount((int) duplicates);
        batch.setFailedCount((int) failed);
        importBatchRepository.save(batch);

        return ImportResponseDto.success(batch.getId(), batchUuid, results,
            new ImportResponseDto.Summary(results.size(), (int) imported, (int) duplicates, (int) failed));
    }

    @Transactional
    public ImportResultDto forceImport(ForceImportRequest req) throws IOException {
        byte[] bytes = batchCache.get(req.batchId(), req.filename())
            .orElseThrow(() -> {
                securityMetrics.recordImportRejected("invalid");
                return new PlatformException(ErrorCode.IMPORT_FILE_INVALID,
                    "Batch expired — please re-import the file.");
            });
        return fileImportService.processSingleFile(req.filename(), bytes, req.batchId(), true);
    }

    public PageResponse<SubmissionListItemDto> list(Long exerciseId, String studentName,
                                                     String source, Long batchId,
                                                     Boolean graded,
                                                     int page, int size) {
        Page<Submission> submissionPage = submissionRepository.findFiltered(
            exerciseId,
            (studentName != null && studentName.isBlank()) ? null : studentName,
            (source != null && source.isBlank()) ? null : source,
            batchId,
            graded,
            PageRequest.of(page, size));

        List<Long> exerciseIds = submissionPage.map(Submission::getExerciseId).toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        Page<SubmissionListItemDto> dtoPage = submissionPage.map(sub ->
            SubmissionListItemDto.of(sub, titleMap.getOrDefault(sub.getExerciseId(), "Unknown")));
        return PageResponse.of(dtoPage);
    }

    public SubmissionDetailDto getById(Long id) {
        Submission sub = submissionRepository.findById(id)
            .filter(s -> !s.isDeleted())
            .orElseThrow(() -> new PlatformException(ErrorCode.SUBMISSION_NOT_FOUND,
                "Submission not found."));
        String exerciseTitle = exerciseRepository.findById(sub.getExerciseId())
            .map(Exercise::getTitle).orElse("Unknown");
        int gradedVersionNumber = versionRepository.findById(sub.getGradedVersionId())
            .map(ExerciseVersion::getVersionNumber).orElse(0);
        return SubmissionDetailDto.of(sub, exerciseTitle, gradedVersionNumber);
    }

    @Transactional
    public SubmissionDetailDto grade(Long id, GradeRequest req) {
        Submission sub = submissionRepository.findById(id)
            .filter(s -> !s.isDeleted())
            .orElseThrow(() -> new PlatformException(ErrorCode.SUBMISSION_NOT_FOUND,
                "Submission not found."));

        if (req.dimensionScores() != null && !req.dimensionScores().isEmpty()) {
            // Rubric mode: compute weighted total, store dimension breakdown
            double weightedSum = req.dimensionScores().stream()
                .mapToDouble(d -> d.score() * d.weight())
                .sum();
            BigDecimal total = BigDecimal.valueOf(weightedSum).setScale(2, java.math.RoundingMode.HALF_UP);
            sub.setTutorScore(total);
            try {
                sub.setTutorGradeDetails(
                    objectMapper.writeValueAsString(req.dimensionScores()));
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new RuntimeException("Failed to serialize dimension scores", e);
            }
        } else if (req.tutorScore() != null) {
            // Instant-feedback mode: direct score override
            sub.setTutorScore(req.tutorScore());
            sub.setTutorGradeDetails(null);
        }

        sub.setTutorComment(req.tutorComment());
        sub.setGraded(true);
        submissionRepository.save(sub);
        return getById(id);
    }

    @Transactional
    public void delete(Long id) {
        Submission sub = submissionRepository.findById(id)
            .filter(s -> !s.isDeleted())
            .orElseThrow(() -> new PlatformException(ErrorCode.SUBMISSION_NOT_FOUND,
                "Submission not found."));
        sub.setDeleted(true);
        submissionRepository.save(sub);
    }

    public void exportCsv(Long exerciseId, HttpServletResponse response) throws IOException {
        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition",
            "attachment; filename=\"grades_" + LocalDate.now() + ".csv\"");

        List<Submission> subs = submissionRepository.findAllForExport(exerciseId);
        List<Long> exerciseIds = subs.stream().map(Submission::getExerciseId).distinct().toList();
        Map<Long, String> titleMap = exerciseRepository.findAllById(exerciseIds).stream()
            .collect(Collectors.toMap(Exercise::getId, Exercise::getTitle));

        try (CSVPrinter printer = new CSVPrinter(
                new OutputStreamWriter(response.getOutputStream(), StandardCharsets.UTF_8),
                CSVFormat.DEFAULT.builder()
                    .setHeader("Student Name", "Exercise Title", "Exercise Type",
                               "Auto Score", "Tutor Score", "Tutor Comment", "Submitted At")
                    .build())) {
            for (Submission sub : subs) {
                printer.printRecord(
                    sub.getStudentName(),
                    titleMap.getOrDefault(sub.getExerciseId(), ""),
                    sub.getExerciseType(),
                    sub.getAutoScore() != null ? sub.getAutoScore().toPlainString() : "",
                    sub.getTutorScore() != null ? sub.getTutorScore().toPlainString() : "",
                    sub.getTutorComment() != null ? sub.getTutorComment() : "",
                    sub.getExportTimestamp().toString());
            }
        }
    }
}
