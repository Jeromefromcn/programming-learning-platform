package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.grading.BlocklyGrader;
import com.platform.exercise.grading.PythonGrader;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
@RequiredArgsConstructor
public class FileImportService {

    private static final Logger log = LoggerFactory.getLogger(FileImportService.class);

    private static final long MAX_ZIP_DECOMPRESSED_BYTES = 100L * 1024 * 1024;
    private static final int MAX_ZIP_FILES = 500;
    private static final List<String> REQUIRED_FIELDS =
        List.of("exerciseId", "exerciseType", "studentName", "answer", "exportedAt");

    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final SubmissionRepository submissionRepository;
    private final BlocklyGrader blocklyGrader;
    private final PythonGrader pythonGrader;
    private final ImportBatchCache batchCache;
    private final ObjectMapper objectMapper;

    List<ImportResultDto> processZip(byte[] zipBytes, String batchId) throws IOException {
        List<ImportResultDto> results = new ArrayList<>();
        long totalBytes = 0;
        int fileCount = 0;

        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) { zis.closeEntry(); continue; }
                String entryName = entry.getName();
                if (entryName.contains("..")) {
                    throw new PlatformException(ErrorCode.ZIP_PATH_TRAVERSAL,
                        "Path traversal detected: " + entryName);
                }
                if (++fileCount > MAX_ZIP_FILES) {
                    throw new PlatformException(ErrorCode.ZIP_TOO_LARGE,
                        "ZIP contains more than " + MAX_ZIP_FILES + " files.");
                }
                byte[] content = zis.readAllBytes();
                totalBytes += content.length;
                if (totalBytes > MAX_ZIP_DECOMPRESSED_BYTES) {
                    throw new PlatformException(ErrorCode.ZIP_TOO_LARGE,
                        "Decompressed ZIP exceeds 100 MB.");
                }
                String filename = new File(entryName).getName();
                if (filename.toLowerCase().endsWith(".json")) {
                    results.add(processSingleFile(filename, content, batchId, false));
                }
                zis.closeEntry();
            }
        }
        return results;
    }

    ImportResultDto processSingleFile(String filename, byte[] content,
                                      String batchId, boolean skipDuplicateCheck) {
        try {
            JsonNode node = objectMapper.readTree(content);

            List<String> missing = REQUIRED_FIELDS.stream()
                .filter(f -> node.path(f).isMissingNode())
                .toList();
            if (!missing.isEmpty()) {
                return ImportResultDto.failed(filename,
                    "Missing required fields: " + String.join(", ", missing));
            }

            long exerciseId = node.path("exerciseId").asLong();
            String exerciseType = node.path("exerciseType").asText();
            String studentName = node.path("studentName").asText();
            String answer = node.path("answer").asText();
            String exportedAtStr = node.path("exportedAt").asText();
            Integer studentVersion = node.path("exerciseVersion").isMissingNode()
                ? null : node.path("exerciseVersion").asInt();

            LocalDateTime exportedAt = parseTimestamp(exportedAtStr);

            if (!skipDuplicateCheck && submissionRepository
                    .existsActiveByStudentNameAndExerciseIdAndExportTimestamp(
                        studentName, exerciseId, exportedAt)) {
                batchCache.put(batchId, filename, content);
                return logAndReturn(batchId, ImportResultDto.duplicate(filename, studentName, null));
            }

            Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId).orElse(null);
            if (exercise == null) {
                return logAndReturn(batchId, ImportResultDto.failed(filename, "Exercise not found or has been deleted."));
            }

            ExerciseVersion currentVersion = versionRepository
                .findById(exercise.getCurrentVersionId()).orElse(null);
            if (currentVersion == null) {
                return logAndReturn(batchId, ImportResultDto.failed(filename, "Exercise configuration not found."));
            }

            boolean versionMismatch = studentVersion != null
                && studentVersion != currentVersion.getVersionNumber();

            BigDecimal autoScore;
            String autoGradeDetails;
            if ("BLOCKLY".equals(exerciseType)) {
                BlocklyGrader.Result gr = blocklyGrader.grade(answer, currentVersion.getConfig());
                autoScore = gr.autoScore();
                autoGradeDetails = gr.autoGradeDetailsJson();
            } else if ("PYTHON".equals(exerciseType)) {
                PythonGrader.Result gr = pythonGrader.grade(answer, currentVersion.getConfig());
                autoScore = gr.autoScore();
                autoGradeDetails = gr.autoGradeDetailsJson();
            } else {
                return logAndReturn(batchId, ImportResultDto.failed(filename, "Unknown exercise type: " + exerciseType));
            }

            Submission sub = new Submission();
            sub.setExerciseId(exerciseId);
            sub.setGradedVersionId(currentVersion.getId());
            sub.setStudentName(studentName);
            sub.setExerciseType(exerciseType);
            sub.setAnswerData(answer);
            sub.setExportTimestamp(exportedAt);
            sub.setVersionMismatch(versionMismatch);
            sub.setStudentVersionNumber(studentVersion);
            sub.setAutoScore(autoScore);
            sub.setAutoGradeDetails(autoGradeDetails);
            sub.setImportBatchId(batchId);
            Submission saved = submissionRepository.save(sub);

            return logAndReturn(batchId, ImportResultDto.imported(filename, saved.getId(), studentName,
                exercise.getTitle(), exerciseType, autoScore, versionMismatch));

        } catch (PlatformException e) {
            throw e;
        } catch (Exception e) {
            return logAndReturn(batchId, ImportResultDto.failed(filename, "Parse error: " + e.getMessage()));
        }
    }

    private ImportResultDto logAndReturn(String batchId, ImportResultDto result) {
        MDC.put("importBatchId", batchId);
        MDC.put("importFilename", result.filename());
        MDC.put("importStatus", result.status());
        MDC.put("importAutoScore", result.autoScore() != null ? result.autoScore().toPlainString() : "");
        try {
            log.info("Import file processed");
        } finally {
            MDC.remove("importBatchId");
            MDC.remove("importFilename");
            MDC.remove("importStatus");
            MDC.remove("importAutoScore");
        }
        return result;
    }

    private LocalDateTime parseTimestamp(String raw) {
        try {
            return OffsetDateTime.parse(raw).toLocalDateTime();
        } catch (DateTimeParseException e) {
            return LocalDateTime.parse(raw);
        }
    }
}
