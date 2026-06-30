package com.platform.exercise.submission;

import com.platform.exercise.domain.*;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ImportBatchControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ImportBatchRepository importBatchRepository;
    @Autowired SubmissionRepository submissionRepository;
    @Autowired ExerciseRepository exerciseRepository;
    @Autowired ExerciseVersionRepository versionRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired EntityManager entityManager;
    @MockBean SandboxClient sandboxClient;

    private Long exerciseId;
    private Long gradedVersionId;

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("batch_tutor");
        tutor.setDisplayName("Batch Tutor");
        tutor.setPasswordHash(passwordEncoder.encode("pw"));
        tutor.setRole(User.Role.TUTOR);
        tutor.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(tutor);

        Exercise ex = new Exercise();
        ex.setTitle("Batch Test Exercise");
        ex.setDescription("desc");
        ex.setType(Exercise.ExerciseType.BLOCKLY);
        ex.setDifficulty(Exercise.Difficulty.EASY);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCreatedBy(tutor.getId());
        exerciseId = exerciseRepository.save(ex).getId();

        ExerciseVersion ver = new ExerciseVersion();
        ver.setExerciseId(exerciseId);
        ver.setVersionNumber(1);
        ver.setTitle("Batch Test Exercise");
        ver.setDescription("desc");
        ver.setDifficulty("EASY");
        ver.setConfig("{}");
        gradedVersionId = versionRepository.save(ver).getId();
    }

    private ImportBatch savedBatch() {
        ImportBatch b = new ImportBatch();
        b.setUuid("test-uuid-1");
        b.setFileCount(2);
        b.setImportedCount(2);
        b.setDuplicateCount(0);
        b.setFailedCount(0);
        return importBatchRepository.save(b);
    }

    private Submission submission(String student, Long batchId, boolean deleted) {
        Submission s = new Submission();
        s.setExerciseId(exerciseId);
        s.setGradedVersionId(gradedVersionId);
        s.setStudentName(student);
        s.setExerciseType("BLOCKLY");
        s.setAnswerData("{}");
        s.setExportTimestamp(LocalDateTime.now());
        s.setBatchId(batchId);
        s.setSource("IMPORT");
        s.setDeleted(deleted);
        return s;
    }

    @Test
    @WithMockUser(username = "batch_tutor", roles = "TUTOR")
    void delete_returnsNoContent_andSoftDeletesBatchAndAllSubmissions() throws Exception {
        ImportBatch batch = savedBatch();
        Long aliceId = submissionRepository.save(submission("Alice", batch.getId(), false)).getId();
        Long bobId = submissionRepository.save(submission("Bob", batch.getId(), true)).getId(); // already soft-deleted

        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isNoContent());
        entityManager.flush();
        entityManager.clear();

        // batch row still physically exists, but is flagged deleted
        ImportBatch reloaded = importBatchRepository.findById(batch.getId()).orElseThrow();
        assertThat(reloaded.isDeleted()).isTrue();
        assertThat(importBatchRepository.findByIdAndDeletedFalse(batch.getId())).isEmpty();

        Submission alice = submissionRepository.findById(aliceId).orElseThrow();
        Submission bob = submissionRepository.findById(bobId).orElseThrow();
        assertThat(alice.isDeleted()).isTrue();
        assertThat(bob.isDeleted()).isTrue();
        // batch deletion is now soft (the import_batches row is preserved), so V11's
        // ON DELETE SET NULL never fires here — batch_id is deliberately left intact
        // for audit-trail purposes, consistent with how Submission's other FKs
        // (exerciseId, gradedVersionId) survive its own soft-delete.
        assertThat(alice.getBatchId()).isEqualTo(batch.getId());
        assertThat(bob.getBatchId()).isEqualTo(batch.getId());
    }

    @Test
    @WithMockUser(username = "batch_tutor", roles = "TUTOR")
    void delete_thenBatchExcludedFromList() throws Exception {
        ImportBatch batch = savedBatch();

        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isNoContent());

        mockMvc.perform(get("/v1/import-batches"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content[?(@.id==" + batch.getId() + ")]").isEmpty());
    }

    @Test
    @WithMockUser(username = "batch_tutor", roles = "TUTOR")
    void delete_alreadyDeletedBatch_returnsNotFound() throws Exception {
        ImportBatch batch = savedBatch();
        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isNoContent());

        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "batch_tutor", roles = "TUTOR")
    void delete_returnsNotFound_whenBatchMissing() throws Exception {
        mockMvc.perform(delete("/v1/import-batches/{id}", 99999L))
            .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void delete_returnsForbidden_forStudentRole() throws Exception {
        ImportBatch batch = savedBatch();

        mockMvc.perform(delete("/v1/import-batches/{id}", batch.getId()))
            .andExpect(status().isForbidden());
    }
}
