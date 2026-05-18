package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.Exercise.ExerciseType;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.grading.BlocklyGrader;
import com.platform.exercise.grading.PythonGrader;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileImportServiceTest {

    @Mock ExerciseRepository exerciseRepository;
    @Mock ExerciseVersionRepository versionRepository;
    @Mock SubmissionRepository submissionRepository;
    @Mock BlocklyGrader blocklyGrader;
    @Mock PythonGrader pythonGrader;
    @Mock ImportBatchCache batchCache;

    private FileImportService service;

    private static final String BLOCKLY_CONFIG =
        "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello\"}}}";

    private byte[] validBlocklyJson(long exerciseId) {
        return String.format("""
            {"platformVersion":"1.0","exerciseId":%d,"exerciseTitle":"Hello","exerciseType":"BLOCKLY",
             "exerciseVersion":1,"studentName":"Alex","answer":"print('Hello');",
             "exportedAt":"2026-05-01T10:00:00Z"}""", exerciseId).getBytes();
    }

    @BeforeEach
    void setUp() {
        service = new FileImportService(
            exerciseRepository, versionRepository, submissionRepository,
            blocklyGrader, pythonGrader, batchCache, new ObjectMapper());
    }

    private void stubExercise(long exerciseId, long versionId) {
        Exercise exercise = new Exercise();
        exercise.setId(exerciseId);
        exercise.setTitle("Hello");
        exercise.setType(ExerciseType.BLOCKLY);
        exercise.setCurrentVersionId(versionId);
        when(exerciseRepository.findByIdAndDeletedFalse(exerciseId)).thenReturn(Optional.of(exercise));

        ExerciseVersion version = new ExerciseVersion();
        version.setId(versionId);
        version.setVersionNumber(1);
        version.setConfig(BLOCKLY_CONFIG);
        when(versionRepository.findById(versionId)).thenReturn(Optional.of(version));
    }

    @Test
    void processSingleFile_validJson_returnsImported() {
        stubExercise(1L, 10L);
        when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(false);
        Submission saved = new Submission();
        saved.setId(42L);
        when(submissionRepository.save(any())).thenReturn(saved);
        when(blocklyGrader.grade(anyString(), anyString()))
            .thenReturn(new BlocklyGrader.Result(new BigDecimal("100.00"),
                "{\"type\":\"BLOCKLY\",\"passed\":true}"));

        ImportResultDto result = service.processSingleFile("alex.json", validBlocklyJson(1L), "batch-1", false);

        assertThat(result.status()).isEqualTo("IMPORTED");
        assertThat(result.submissionId()).isEqualTo(42L);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void processSingleFile_missingRequiredField_returnsFailed() {
        byte[] badJson = "{\"exerciseId\":1}".getBytes();
        ImportResultDto result = service.processSingleFile("bad.json", badJson, "batch-1", false);
        assertThat(result.status()).isEqualTo("FAILED");
        assertThat(result.message()).contains("Missing required fields");
    }

    @Test
    void processSingleFile_exerciseNotFound_returnsFailed() {
        when(exerciseRepository.findByIdAndDeletedFalse(99L)).thenReturn(Optional.empty());
        when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(false);
        ImportResultDto result = service.processSingleFile("missing.json", validBlocklyJson(99L), "batch-1", false);
        assertThat(result.status()).isEqualTo("FAILED");
        assertThat(result.message()).contains("Exercise not found");
    }

    @Test
    void processSingleFile_duplicate_returnsDuplicateAndCachesBytes() {
        when(submissionRepository.existsActiveByStudentNameAndExerciseIdAndExportTimestamp(any(), any(), any()))
            .thenReturn(true);
        byte[] content = validBlocklyJson(1L);

        ImportResultDto result = service.processSingleFile("dup.json", content, "batch-1", false);

        assertThat(result.status()).isEqualTo("DUPLICATE");
        verify(batchCache).put("batch-1", "dup.json", content);
    }

    @Test
    void processZip_pathTraversal_throwsPlatformException() {
        byte[] zipBytes = buildZipWithEntry("../evil.json", "{\"x\":1}".getBytes());
        assertThatThrownBy(() -> service.processZip(zipBytes, "batch-1"))
            .hasMessageContaining("Path traversal");
    }

    private byte[] buildZipWithEntry(String entryName, byte[] content) {
        try {
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(bos);
            zos.putNextEntry(new java.util.zip.ZipEntry(entryName));
            zos.write(content);
            zos.closeEntry();
            zos.close();
            return bos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
