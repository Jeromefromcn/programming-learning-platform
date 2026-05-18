package com.platform.exercise.submission;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
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

import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SubmissionService {

    private final SubmissionRepository submissionRepository;
    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final FileImportService fileImportService;
    private final ImportBatchCache batchCache;

    @Transactional
    public ImportResponseDto importFiles(List<MultipartFile> files) throws IOException {
        String batchId = UUID.randomUUID().toString();
        List<ImportResultDto> results = new ArrayList<>();

        for (MultipartFile file : files) {
            String name = file.getOriginalFilename() != null ? file.getOriginalFilename() : "unknown";
            if (name.toLowerCase().endsWith(".zip")) {
                results.addAll(fileImportService.processZip(file.getBytes(), batchId));
            } else if (name.toLowerCase().endsWith(".json")) {
                results.add(fileImportService.processSingleFile(name, file.getBytes(), batchId, false));
            } else {
                results.add(ImportResultDto.failed(name, "Unsupported file type."));
            }
        }

        long imported = results.stream().filter(r -> "IMPORTED".equals(r.status())).count();
        long duplicates = results.stream().filter(r -> "DUPLICATE".equals(r.status())).count();
        long failed = results.stream().filter(r -> "FAILED".equals(r.status())).count();
        return new ImportResponseDto(batchId, results,
            new ImportResponseDto.Summary(results.size(), (int) imported, (int) duplicates, (int) failed));
    }

    @Transactional
    public ImportResultDto forceImport(ForceImportRequest req) throws IOException {
        byte[] bytes = batchCache.get(req.batchId(), req.filename())
            .orElseThrow(() -> new PlatformException(ErrorCode.IMPORT_FILE_INVALID,
                "Batch expired — please re-import the file."));
        return fileImportService.processSingleFile(req.filename(), bytes, req.batchId(), true);
    }

    public PageResponse<SubmissionListItemDto> list(Long exerciseId, String studentName,
                                                     int page, int size) {
        Page<Submission> submissionPage = submissionRepository.findFiltered(
            exerciseId,
            (studentName != null && studentName.isBlank()) ? null : studentName,
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
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND,
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
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND,
                "Submission not found."));
        sub.setTutorScore(req.tutorScore());
        sub.setTutorComment(req.tutorComment());
        submissionRepository.save(sub);
        return getById(id);
    }

    @Transactional
    public void delete(Long id) {
        Submission sub = submissionRepository.findById(id)
            .filter(s -> !s.isDeleted())
            .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND,
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
