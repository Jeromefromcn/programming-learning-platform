package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SubmissionControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ExerciseRepository exerciseRepository;
    @Autowired ExerciseVersionRepository versionRepository;
    @Autowired SubmissionRepository submissionRepository;
    @Autowired UserRepository userRepository;
    @Autowired com.platform.exercise.repository.ImportBatchRepository importBatchRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired ObjectMapper objectMapper;
    @MockBean SandboxClient sandboxClient;

    private Exercise blocklyExercise;
    private ExerciseVersion blocklyVersion;

    private static final String BLOCKLY_CONFIG =
        "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello\"}}}";
    private static final String PYTHON_CONFIG =
        "{\"timeLimitSeconds\":5,\"testCases\":[{\"input\":\"f(1)\",\"expectedOutput\":\"1\",\"visible\":true}]}";

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("tutor1");
        tutor.setDisplayName("Tutor One");
        tutor.setPasswordHash(passwordEncoder.encode("pw"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        userRepository.save(tutor);

        blocklyExercise = new Exercise();
        blocklyExercise.setTitle("Hello Exercise");
        blocklyExercise.setDescription("desc");
        blocklyExercise.setType(Exercise.ExerciseType.BLOCKLY);
        blocklyExercise.setDifficulty(Exercise.Difficulty.EASY);
        blocklyExercise.setStatus(Exercise.Status.PUBLISHED);
        blocklyExercise.setCreatedBy(tutor.getId());
        blocklyExercise = exerciseRepository.save(blocklyExercise);

        blocklyVersion = new ExerciseVersion();
        blocklyVersion.setExerciseId(blocklyExercise.getId());
        blocklyVersion.setVersionNumber(1);
        blocklyVersion.setTitle("Hello Exercise");
        blocklyVersion.setDescription("desc");
        blocklyVersion.setDifficulty("EASY");
        blocklyVersion.setHints("[]");
        blocklyVersion.setConfig(BLOCKLY_CONFIG);
        blocklyVersion = versionRepository.save(blocklyVersion);

        blocklyExercise.setCurrentVersionId(blocklyVersion.getId());
        exerciseRepository.save(blocklyExercise);

        Exercise pythonExercise = new Exercise();
        pythonExercise.setTitle("Python Exercise");
        pythonExercise.setDescription("desc");
        pythonExercise.setType(Exercise.ExerciseType.PYTHON);
        pythonExercise.setDifficulty(Exercise.Difficulty.MEDIUM);
        pythonExercise.setStatus(Exercise.Status.PUBLISHED);
        pythonExercise.setCreatedBy(tutor.getId());
        pythonExercise = exerciseRepository.save(pythonExercise);

        ExerciseVersion pythonVersion = new ExerciseVersion();
        pythonVersion.setExerciseId(pythonExercise.getId());
        pythonVersion.setVersionNumber(1);
        pythonVersion.setTitle("Python Exercise");
        pythonVersion.setDescription("desc");
        pythonVersion.setDifficulty("MEDIUM");
        pythonVersion.setHints("[]");
        pythonVersion.setConfig(PYTHON_CONFIG);
        pythonVersion = versionRepository.save(pythonVersion);

        pythonExercise.setCurrentVersionId(pythonVersion.getId());
        exerciseRepository.save(pythonExercise);
    }

    private String blocklyExportJson(long exerciseId, String studentName, int version) {
        return String.format("""
            {"platformVersion":"1.0","exerciseId":%d,"exerciseTitle":"Hello Exercise",
             "exerciseType":"BLOCKLY","exerciseVersion":%d,"studentName":"%s",
             "answer":"print('Hello');","exportedAt":"2026-05-01T10:00:00Z"}""",
            exerciseId, version, studentName);
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void importSingleBlocklyJson_valid_returnsImported() throws Exception {
        // studentName must match a registered user — "tutor1" is seeded in @BeforeEach
        MockMultipartFile file = new MockMultipartFile("files", "tutor1.json", "application/json",
            blocklyExportJson(blocklyExercise.getId(), "tutor1", 1).getBytes());

        mockMvc.perform(multipart("/v1/submissions/import").file(file))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ok").value(true))
            .andExpect(jsonPath("$.summary.imported").value(1))
            .andExpect(jsonPath("$.results[0].status").value("IMPORTED"))
            .andExpect(jsonPath("$.results[0].autoScore").exists())
            .andExpect(jsonPath("$.batchId").isNotEmpty());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void importDuplicateJson_secondTime_returnsDuplicateStatus() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", "tutor1.json", "application/json",
            blocklyExportJson(blocklyExercise.getId(), "tutor1", 1).getBytes());

        // First import
        mockMvc.perform(multipart("/v1/submissions/import").file(file)).andExpect(status().isOk());

        // Second import — same file; duplicate is NOT a validation-abort, phase 2 proceeds
        mockMvc.perform(multipart("/v1/submissions/import")
                .file(new MockMultipartFile("files", "tutor1.json", "application/json",
                    blocklyExportJson(blocklyExercise.getId(), "tutor1", 1).getBytes())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ok").value(true))
            .andExpect(jsonPath("$.summary.duplicates").value(1))
            .andExpect(jsonPath("$.results[0].status").value("DUPLICATE"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void importMissingFields_returnsValidationFailed() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", "bad.json", "application/json",
            "{\"exerciseId\":1}".getBytes());

        mockMvc.perform(multipart("/v1/submissions/import").file(file))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ok").value(false))
            .andExpect(jsonPath("$.problems[0].filename").value("bad.json"))
            .andExpect(jsonPath("$.problems[0].reason").value(org.hamcrest.Matchers.containsString("Missing required fields")));
    }

    @Test
    void importFiles_unauthenticated_returns401() throws Exception {
        MockMultipartFile file = new MockMultipartFile("files", "alex.json", "application/json",
            blocklyExportJson(blocklyExercise.getId(), "Alex", 1).getBytes());

        mockMvc.perform(multipart("/v1/submissions/import").file(file))
            .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listSubmissions_noFilter_returnsAll() throws Exception {
        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        submissionRepository.save(sub);

        mockMvc.perform(get("/v1/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[0].studentName").value("Alex"))
            .andExpect(jsonPath("$.content[0].exerciseTitle").value("Hello Exercise"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void gradeSubmission_validRequest_persistsTutorScore() throws Exception {
        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        Submission saved = submissionRepository.save(sub);

        mockMvc.perform(put("/v1/submissions/" + saved.getId() + "/grade")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"tutorScore\":80.0,\"tutorComment\":\"Good effort!\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.tutorScore").value(80.0))
            .andExpect(jsonPath("$.tutorComment").value("Good effort!"));

        Submission updated = submissionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.getTutorScore()).isEqualByComparingTo(new BigDecimal("80.00"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteSubmission_returns204() throws Exception {
        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        Submission saved = submissionRepository.save(sub);

        mockMvc.perform(delete("/v1/submissions/" + saved.getId()))
            .andExpect(status().isNoContent());

        Submission updated = submissionRepository.findById(saved.getId()).orElseThrow();
        assertThat(updated.isDeleted()).isTrue();
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteSubmission_notFound_returns404() throws Exception {
        mockMvc.perform(delete("/v1/submissions/99999"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("SUBMISSION_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteSubmission_alreadyDeleted_returns404() throws Exception {
        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        sub.setDeleted(true);
        Submission saved = submissionRepository.save(sub);

        mockMvc.perform(delete("/v1/submissions/" + saved.getId()))
            .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listSubmissions_excludesDeletedSubmissions() throws Exception {
        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        sub.setDeleted(true);
        submissionRepository.save(sub);

        mockMvc.perform(get("/v1/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content").isEmpty());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void importAfterDelete_treatedAsNewSubmission() throws Exception {
        // studentName must match a registered user — "tutor1" is seeded in @BeforeEach
        MockMultipartFile file = new MockMultipartFile("files", "tutor1.json", "application/json",
            blocklyExportJson(blocklyExercise.getId(), "tutor1", 1).getBytes());

        // Import once
        mockMvc.perform(multipart("/v1/submissions/import").file(file)).andExpect(status().isOk());

        // Soft-delete it
        Submission sub = submissionRepository.findByStudentNameAndDeletedFalse("tutor1").get(0);
        sub.setDeleted(true);
        submissionRepository.save(sub);

        // Re-import same file — should succeed as new import, not duplicate
        mockMvc.perform(multipart("/v1/submissions/import")
                .file(new MockMultipartFile("files", "tutor1.json", "application/json",
                    blocklyExportJson(blocklyExercise.getId(), "tutor1", 1).getBytes())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ok").value(true))
            .andExpect(jsonPath("$.results[0].status").value("IMPORTED"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void list_defaultsToImportSource_excludesStudentSubmissions() throws Exception {
        // Insert a STUDENT-source submission directly
        Submission studentSub = new Submission();
        studentSub.setExerciseId(blocklyExercise.getId());
        studentSub.setGradedVersionId(blocklyVersion.getId());
        studentSub.setStudentName("Bob");
        studentSub.setExerciseType("PYTHON");
        studentSub.setAnswerData("code");
        studentSub.setExportTimestamp(LocalDateTime.now());
        studentSub.setSource("STUDENT");
        studentSub.setAutoScore(new java.math.BigDecimal("100"));
        submissionRepository.save(studentSub);

        mockMvc.perform(get("/v1/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").isEmpty());

        mockMvc.perform(get("/v1/submissions").param("source", "STUDENT"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.studentName=='Bob')]").exists());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listSubmissions_includesBatchIdInResponse() throws Exception {
        com.platform.exercise.domain.ImportBatch batch = new com.platform.exercise.domain.ImportBatch();
        batch.setUuid(java.util.UUID.randomUUID().toString());
        batch.setImportedBy(null);
        batch.setFileCount(1);
        batch.setImportedCount(1);
        batch.setDuplicateCount(0);
        batch.setFailedCount(0);
        com.platform.exercise.domain.ImportBatch savedBatch = importBatchRepository.save(batch);

        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        sub.setBatchId(savedBatch.getId());
        submissionRepository.save(sub);

        mockMvc.perform(get("/v1/submissions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[0].batchId").value(savedBatch.getId()));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listSubmissions_filterByBatchId_returnsOnlyMatchingSubmissions() throws Exception {
        com.platform.exercise.domain.ImportBatch batch = new com.platform.exercise.domain.ImportBatch();
        batch.setUuid(java.util.UUID.randomUUID().toString());
        batch.setImportedBy(null);
        batch.setFileCount(1);
        batch.setImportedCount(1);
        batch.setDuplicateCount(0);
        batch.setFailedCount(0);
        com.platform.exercise.domain.ImportBatch savedBatch = importBatchRepository.save(batch);

        Submission withBatch = new Submission();
        withBatch.setExerciseId(blocklyExercise.getId());
        withBatch.setGradedVersionId(blocklyVersion.getId());
        withBatch.setStudentName("Alice");
        withBatch.setExerciseType("BLOCKLY");
        withBatch.setAnswerData("code");
        withBatch.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        withBatch.setBatchId(savedBatch.getId());
        submissionRepository.save(withBatch);

        Submission noBatch = new Submission();
        noBatch.setExerciseId(blocklyExercise.getId());
        noBatch.setGradedVersionId(blocklyVersion.getId());
        noBatch.setStudentName("Bob");
        noBatch.setExerciseType("BLOCKLY");
        noBatch.setAnswerData("code");
        noBatch.setExportTimestamp(LocalDateTime.of(2026, 5, 2, 10, 0));
        submissionRepository.save(noBatch);

        mockMvc.perform(get("/v1/submissions").param("batchId", savedBatch.getId().toString()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content.length()").value(1))
            .andExpect(jsonPath("$.content[0].studentName").value("Alice"));
    }

    @Test
    void exportCsv_unauthenticated_returns200WithCsv() throws Exception {
        Submission sub = new Submission();
        sub.setExerciseId(blocklyExercise.getId());
        sub.setGradedVersionId(blocklyVersion.getId());
        sub.setStudentName("Alex");
        sub.setExerciseType("BLOCKLY");
        sub.setAnswerData("print('Hello');");
        sub.setExportTimestamp(LocalDateTime.of(2026, 5, 1, 10, 0));
        sub.setAutoScore(new BigDecimal("100.00"));
        submissionRepository.save(sub);

        String csv = mockMvc.perform(get("/v1/submissions/export-csv"))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", org.hamcrest.Matchers.containsString("text/csv")))
            .andReturn().getResponse().getContentAsString();

        assertThat(csv).contains("Alex");
        assertThat(csv).contains("Hello Exercise");
        assertThat(csv).contains("100.00");
        assertThat(csv).doesNotContain("null");
    }
}
