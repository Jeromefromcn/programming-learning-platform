package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.ImportBatch;
import com.platform.exercise.metrics.SecurityMetrics;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.ImportBatchRepository;
import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SubmissionImportRestrictionTest {

    @Mock FileImportService fileImportService;
    @Mock SubmissionRepository submissionRepository;
    @Mock ExerciseRepository exerciseRepository;
    @Mock ExerciseVersionRepository versionRepository;
    @Mock ImportBatchCache batchCache;
    @Mock ImportBatchRepository importBatchRepository;
    @Mock SecurityMetrics securityMetrics;

    final ObjectMapper objectMapper = new ObjectMapper();
    SubmissionService submissionService;

    @BeforeEach
    void setUp() {
        submissionService = new SubmissionService(
            submissionRepository, exerciseRepository, versionRepository,
            fileImportService, batchCache, importBatchRepository, objectMapper, securityMetrics);
    }

    private static byte[] submissionJson(long exerciseId, String studentName) {
        return ("{\"exerciseId\":" + exerciseId + ",\"exerciseType\":\"PYTHON\"," +
            "\"studentName\":\"" + studentName + "\",\"answer\":\"print()\"," +
            "\"exportedAt\":\"2026-01-01T00:00:00Z\"}")
            .getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void importFiles_mixedExerciseIds_returnsValidationFailed() throws IOException {
        byte[] f1 = submissionJson(1, "alice");
        byte[] f2 = submissionJson(2, "bob");
        MockMultipartFile mf1 = new MockMultipartFile("files", "alice.json", "application/json", f1);
        MockMultipartFile mf2 = new MockMultipartFile("files", "bob.json",   "application/json", f2);

        when(fileImportService.validateFile(eq("alice.json"), any())).thenReturn(null);
        when(fileImportService.validateFile(eq("bob.json"),   any())).thenReturn(null);

        ImportResponseDto response = submissionService.importFiles(List.of(mf1, mf2), null);

        assertThat(response.ok()).isFalse();
        assertThat(response.problems()).hasSize(1);
        assertThat(response.problems().get(0).filename()).isEqualTo("bob.json");
        assertThat(response.problems().get(0).reason()).contains("exercise #2");
        assertThat(response.problems().get(0).reason()).contains("exercise #1");
    }

    @Test
    void importFiles_allSameExercise_proceedsToPhase2() throws IOException {
        byte[] f1 = submissionJson(1, "alice");
        byte[] f2 = submissionJson(1, "bob");
        MockMultipartFile mf1 = new MockMultipartFile("files", "alice.json", "application/json", f1);
        MockMultipartFile mf2 = new MockMultipartFile("files", "bob.json",   "application/json", f2);

        when(fileImportService.validateFile(eq("alice.json"), any())).thenReturn(null);
        when(fileImportService.validateFile(eq("bob.json"),   any())).thenReturn(null);
        when(importBatchRepository.save(any(ImportBatch.class))).thenAnswer(inv -> {
            ImportBatch b = inv.getArgument(0);
            b.setId(99L);
            return b;
        });
        when(fileImportService.processSingleFile(any(), any(), any(), anyBoolean()))
            .thenReturn(ImportResultDto.failed("x.json", "stub"));

        ImportResponseDto response = submissionService.importFiles(List.of(mf1, mf2), null);

        // No restriction violation → proceeds to phase 2 → ok=true response
        assertThat(response.ok()).isTrue();
        assertThat(response.problems()).isNull();
    }

    @Test
    void importFiles_singleFile_alwaysPasses() throws IOException {
        byte[] f1 = submissionJson(5, "carol");
        MockMultipartFile mf1 = new MockMultipartFile("files", "carol.json", "application/json", f1);

        when(fileImportService.validateFile(eq("carol.json"), any())).thenReturn(null);
        when(importBatchRepository.save(any(ImportBatch.class))).thenAnswer(inv -> {
            ImportBatch b = inv.getArgument(0);
            b.setId(1L);
            return b;
        });
        when(fileImportService.processSingleFile(any(), any(), any(), anyBoolean()))
            .thenReturn(ImportResultDto.failed("carol.json", "stub"));

        ImportResponseDto response = submissionService.importFiles(List.of(mf1), null);

        assertThat(response.ok()).isTrue();
    }
}
