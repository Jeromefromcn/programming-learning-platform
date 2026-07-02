package com.platform.exercise.repository;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.ImportBatch;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import org.springframework.data.domain.Page;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase.Replace.NONE;

@DataJpaTest
@AutoConfigureTestDatabase(replace = NONE)
@ActiveProfiles("test")
class SubmissionRepositoryTest {

    @Autowired SubmissionRepository repository;
    @Autowired TestEntityManager em;

    private Long exerciseId;
    private Long gradedVersionId;
    private Long userId7;
    private Long userId8;

    @BeforeEach
    void seedParents() {
        // Seed two users for STUDENT submissions
        User user7 = new User();
        user7.setUsername("student_alice");
        user7.setDisplayName("Alice");
        user7.setPasswordHash("hash");
        user7.setRole(User.Role.STUDENT);
        user7.setStatus(User.UserStatus.ACTIVE);
        userId7 = ((User) em.persistAndFlush(user7)).getId();

        User user8 = new User();
        user8.setUsername("student_bob");
        user8.setDisplayName("Bob");
        user8.setPasswordHash("hash");
        user8.setRole(User.Role.STUDENT);
        user8.setStatus(User.UserStatus.ACTIVE);
        userId8 = ((User) em.persistAndFlush(user8)).getId();

        // Seed an exercise (no category needed)
        Exercise exercise = new Exercise();
        exercise.setTitle("Test Exercise");
        exercise.setDescription("desc");
        exercise.setType(Exercise.ExerciseType.PYTHON);
        exercise.setDifficulty(Exercise.Difficulty.EASY);
        exercise.setStatus(Exercise.Status.PUBLISHED);
        exercise.setCreatedBy(userId7);
        exerciseId = ((Exercise) em.persistAndFlush(exercise)).getId();

        // Seed an exercise version (graded_version_id FK)
        ExerciseVersion version = new ExerciseVersion();
        version.setExerciseId(exerciseId);
        version.setVersionNumber(1);
        version.setTitle("Test Exercise");
        version.setDescription("desc");
        version.setDifficulty("EASY");
        version.setConfig("{}");
        gradedVersionId = ((ExerciseVersion) em.persistAndFlush(version)).getId();
    }

    private Submission sub(String source, Long userId, Long exerciseId) {
        Submission s = new Submission();
        s.setExerciseId(exerciseId);
        s.setGradedVersionId(gradedVersionId);
        s.setStudentName("Alice");
        s.setExerciseType("PYTHON");
        s.setAnswerData("code");
        s.setExportTimestamp(LocalDateTime.now());
        s.setSource(source);
        s.setUserId(userId);
        s.setAutoScore(BigDecimal.valueOf(100));
        return s;
    }

    @Test
    void findFiltered_bySource_returnsOnlyMatchingSource() {
        repository.save(sub("STUDENT", userId7, exerciseId));
        repository.save(sub("IMPORT", null, exerciseId));

        var imports = repository.findFiltered(null, null, "IMPORT", null, null, PageRequest.of(0, 20));
        assertEquals(1, imports.getTotalElements());
        assertEquals("IMPORT", imports.getContent().get(0).getSource());

        var all = repository.findFiltered(null, null, null, null, null, PageRequest.of(0, 20));
        assertEquals(2, all.getTotalElements());
    }

    @Test
    void findByUser_returnsOwnHistoryNewestFirst() {
        repository.save(sub("STUDENT", userId7, exerciseId));
        repository.save(sub("STUDENT", userId7, exerciseId));
        repository.save(sub("STUDENT", userId8, exerciseId));

        List<Submission> history =
            repository.findByUserIdAndExerciseIdAndDeletedFalseOrderByCreatedAtDesc(userId7, exerciseId);
        assertEquals(2, history.size());
    }

    private Submission subWithDate(LocalDateTime createdAt, String source, String studentName) {
        Submission s = new Submission();
        s.setExerciseId(exerciseId);
        s.setGradedVersionId(gradedVersionId);
        s.setStudentName(studentName);
        s.setExerciseType("BLOCKLY");
        s.setAnswerData("{}");
        s.setExportTimestamp(LocalDateTime.now());
        s.setSource(source);
        s.setCreatedAt(createdAt);
        return s;
    }

    @Test
    void countForPurge_returnsMatchingNonDeletedCount() {
        LocalDateTime old = LocalDateTime.of(2024, 1, 1, 0, 0);
        LocalDateTime recent = LocalDateTime.of(2025, 6, 1, 0, 0);
        LocalDateTime cutoff = LocalDateTime.of(2025, 1, 1, 0, 0);

        repository.save(subWithDate(old, "IMPORT", "Alice"));
        repository.save(subWithDate(old, "ONLINE", "Bob"));
        repository.save(subWithDate(recent, "IMPORT", "Carol"));

        assertEquals(2, repository.countForPurge(cutoff, null, null));
        assertEquals(1, repository.countForPurge(cutoff, null, "IMPORT"));
        assertEquals(0, repository.countForPurge(cutoff, null, "ONLINE_MISSING"));
    }

    @Test
    void countForPurge_excludesAlreadyDeleted() {
        LocalDateTime old = LocalDateTime.of(2024, 1, 1, 0, 0);
        LocalDateTime cutoff = LocalDateTime.of(2025, 1, 1, 0, 0);

        Submission s = subWithDate(old, "IMPORT", "Dave");
        s.setDeleted(true);
        repository.save(s);

        assertEquals(0, repository.countForPurge(cutoff, null, null));
    }

    @Test
    void softDeleteByFilters_marksMatchingRowsDeleted() {
        LocalDateTime old = LocalDateTime.of(2024, 3, 1, 0, 0);
        LocalDateTime recent = LocalDateTime.of(2025, 9, 1, 0, 0);
        LocalDateTime cutoff = LocalDateTime.of(2025, 1, 1, 0, 0);

        Submission s1 = repository.save(subWithDate(old, "IMPORT", "Eve"));
        Submission s2 = repository.save(subWithDate(recent, "IMPORT", "Frank"));

        int affected = repository.softDeleteByFilters(cutoff, null, null);

        assertEquals(1, affected);
        assertTrue(repository.findById(s1.getId()).map(Submission::isDeleted).orElse(false));
        assertFalse(repository.findById(s2.getId()).map(Submission::isDeleted).orElse(true));
    }

    @Test
    void softDeleteByFilters_clearsActiveKeysOnMatchedRow() {
        LocalDateTime old = LocalDateTime.of(2024, 3, 1, 0, 0);
        LocalDateTime cutoff = LocalDateTime.of(2025, 1, 1, 0, 0);

        Submission s1 = subWithDate(old, "IMPORT", "Eve");
        s1.setImportActiveKey("IMPORT:" + exerciseId + ":Eve");
        Submission saved = repository.save(s1);

        int affected = repository.softDeleteByFilters(cutoff, null, null);

        assertEquals(1, affected);
        Submission reloaded = repository.findById(saved.getId()).orElseThrow();
        assertTrue(reloaded.isDeleted());
        assertNull(reloaded.getImportActiveKey());
    }

    @Test
    void hardDeleteByFilters_permanentlyRemovesMatchingRows() {
        LocalDateTime old = LocalDateTime.of(2024, 6, 1, 0, 0);
        LocalDateTime recent = LocalDateTime.of(2025, 8, 1, 0, 0);
        LocalDateTime cutoff = LocalDateTime.of(2025, 1, 1, 0, 0);

        Submission s1 = repository.save(subWithDate(old, "ONLINE", "Grace"));
        Submission s2 = repository.save(subWithDate(recent, "ONLINE", "Hank"));

        int affected = repository.hardDeleteByFilters(cutoff, null, null);

        assertEquals(1, affected);
        assertFalse(repository.findById(s1.getId()).isPresent());
        assertTrue(repository.findById(s2.getId()).isPresent());
    }

    @Test
    void findByUserIdAndDeletedFalse_paginates_userSubmissions() {
        // Save 3 subs for userId7, 1 for userId8
        for (int i = 0; i < 3; i++) repository.save(sub("STUDENT", userId7, exerciseId));
        repository.save(sub("STUDENT", userId8, exerciseId));

        Page<Submission> page = repository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(
                userId7, PageRequest.of(0, 2));
        assertEquals(3, page.getTotalElements());
        assertEquals(2, page.getContent().size());
    }

    @Test
    void findByUserIdAndDeletedFalse_excludesDeletedRows() {
        Submission s = sub("STUDENT", userId7, exerciseId);
        s.setDeleted(true);
        repository.save(s);
        repository.save(sub("STUDENT", userId7, exerciseId));

        Page<Submission> page = repository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(
                userId7, PageRequest.of(0, 20));
        assertEquals(1, page.getTotalElements());
    }

    @Test
    void findFiltered_byBatchId_returnsOnlyMatchingBatch() {
        ImportBatch batch = new ImportBatch();
        batch.setUuid(java.util.UUID.randomUUID().toString());
        batch.setImportedBy(userId7);
        batch.setFileCount(1);
        batch.setImportedCount(1);
        batch.setDuplicateCount(0);
        batch.setFailedCount(0);
        Long batchId = ((ImportBatch) em.persistAndFlush(batch)).getId();

        Submission withBatch = repository.save(sub("IMPORT", null, exerciseId));
        Submission noBatch = repository.save(sub("IMPORT", null, exerciseId));

        em.getEntityManager().createNativeQuery(
            "UPDATE submissions SET batch_id = :b WHERE id = :id")
            .setParameter("b", batchId)
            .setParameter("id", withBatch.getId())
            .executeUpdate();
        em.flush(); em.clear();

        Page<Submission> result = repository.findFiltered(null, null, null, batchId, null, PageRequest.of(0, 20));
        assertEquals(1, result.getTotalElements());
        assertEquals(withBatch.getId(), result.getContent().get(0).getId());

        Page<Submission> all = repository.findFiltered(null, null, null, null, null, PageRequest.of(0, 20));
        assertEquals(2, all.getTotalElements());
    }

    @Test
    void countGradedGroupByBatchId_returnsBulkStats() {
        // Persist a real ImportBatch so the FK constraint is satisfied in H2.
        ImportBatch batch = new ImportBatch();
        batch.setUuid(java.util.UUID.randomUUID().toString());
        batch.setImportedBy(userId7);
        batch.setFileCount(3);
        batch.setImportedCount(3);
        batch.setDuplicateCount(0);
        batch.setFailedCount(0);
        Long batchA = ((ImportBatch) em.persistAndFlush(batch)).getId();

        Submission s1 = repository.save(sub("IMPORT", null, exerciseId));
        Submission s2 = repository.save(sub("IMPORT", null, exerciseId));
        Submission s3 = repository.save(sub("IMPORT", null, exerciseId));
        em.getEntityManager().createNativeQuery(
            "UPDATE submissions SET batch_id = :b WHERE id IN (:ids)")
            .setParameter("b", batchA)
            .setParameter("ids", List.of(s1.getId(), s2.getId(), s3.getId()))
            .executeUpdate();
        em.getEntityManager().createNativeQuery(
            "UPDATE submissions SET graded = true WHERE id = :id")
            .setParameter("id", s1.getId())
            .executeUpdate();
        em.flush(); em.clear();

        List<Object[]> rows = repository.countGradedGroupByBatchId(List.of(batchA));
        assertEquals(1, rows.size());
        Object[] row = rows.get(0);
        assertEquals(batchA, ((Number) row[0]).longValue());
        assertEquals(3L, ((Number) row[1]).longValue()); // total
        assertEquals(1L, ((Number) row[2]).longValue()); // graded
    }

    @Test
    void findByUserIdFiltered_byExerciseTitle_returnsOnlyMatchingTitle() {
        Exercise other = new Exercise();
        other.setTitle("FizzBuzz Challenge");
        other.setDescription("desc");
        other.setType(Exercise.ExerciseType.PYTHON);
        other.setDifficulty(Exercise.Difficulty.EASY);
        other.setStatus(Exercise.Status.PUBLISHED);
        other.setCreatedBy(userId7);
        Long otherExerciseId = ((Exercise) em.persistAndFlush(other)).getId();

        repository.save(sub("STUDENT", userId7, exerciseId));       // title "Test Exercise"
        repository.save(sub("STUDENT", userId7, otherExerciseId));  // title "FizzBuzz Challenge"

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, "fizz", null, null, PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
        assertEquals(otherExerciseId, result.getContent().get(0).getExerciseId());
    }

    @Test
    void findByUserIdFiltered_byExerciseType_returnsOnlyMatchingType() {
        Submission pythonSub = sub("STUDENT", userId7, exerciseId);
        pythonSub.setExerciseType("PYTHON");
        repository.save(pythonSub);

        Submission blocklySub = sub("STUDENT", userId7, exerciseId);
        blocklySub.setExerciseType("BLOCKLY");
        repository.save(blocklySub);

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, null, "BLOCKLY", null, PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
        assertEquals("BLOCKLY", result.getContent().get(0).getExerciseType());
    }

    @Test
    void findByUserIdFiltered_bySource_returnsOnlyMatchingSource() {
        repository.save(sub("STUDENT", userId7, exerciseId));
        repository.save(sub("IMPORT", userId7, exerciseId));

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, null, null, "IMPORT", PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
        assertEquals("IMPORT", result.getContent().get(0).getSource());
    }

    @Test
    void findByUserIdFiltered_combinedFilters_narrowCorrectly() {
        Submission match = sub("STUDENT", userId7, exerciseId);
        match.setExerciseType("PYTHON");
        repository.save(match);

        Submission wrongType = sub("STUDENT", userId7, exerciseId);
        wrongType.setExerciseType("BLOCKLY");
        repository.save(wrongType);

        Submission wrongSource = sub("IMPORT", userId7, exerciseId);
        wrongSource.setExerciseType("PYTHON");
        repository.save(wrongSource);

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, "Test", "PYTHON", "STUDENT", PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
    }

    @Test
    void findByUserIdFiltered_noMatch_returnsEmptyPage() {
        repository.save(sub("STUDENT", userId7, exerciseId));

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, "nonexistent-title", null, null, PageRequest.of(0, 20));

        assertEquals(0, result.getTotalElements());
    }

    @Test
    void findByUserIdFiltered_scopedToUser_excludesOtherUsersEvenWithMatchingFilters() {
        repository.save(sub("STUDENT", userId8, exerciseId));

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, null, null, null, PageRequest.of(0, 20));

        assertEquals(0, result.getTotalElements());
    }

    @Test
    void findByUserIdFiltered_excludesDeletedRows() {
        Submission deleted = sub("STUDENT", userId7, exerciseId);
        deleted.setDeleted(true);
        repository.save(deleted);
        repository.save(sub("STUDENT", userId7, exerciseId));

        Page<Submission> result = repository.findByUserIdFiltered(
                userId7, null, null, null, PageRequest.of(0, 20));

        assertEquals(1, result.getTotalElements());
    }

    @Test
    void findFiltered_byGraded_returnsOnlyMatchingGradedState() {
        Submission gradedSub = sub("IMPORT", null, exerciseId);
        gradedSub.setGraded(true);
        repository.save(gradedSub);
        repository.save(sub("IMPORT", null, exerciseId));

        Page<Submission> gradedOnly = repository.findFiltered(null, null, null, null, true, PageRequest.of(0, 20));
        assertEquals(1, gradedOnly.getTotalElements());
        assertTrue(gradedOnly.getContent().get(0).isGraded());

        Page<Submission> ungradedOnly = repository.findFiltered(null, null, null, null, false, PageRequest.of(0, 20));
        assertEquals(1, ungradedOnly.getTotalElements());
        assertFalse(ungradedOnly.getContent().get(0).isGraded());

        Page<Submission> all = repository.findFiltered(null, null, null, null, null, PageRequest.of(0, 20));
        assertEquals(2, all.getTotalElements());
    }

    @Test
    void findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse_returnsActiveMatchOnly() {
        Submission activeStudent = repository.save(sub("STUDENT", userId7, exerciseId));
        Submission deletedStudent = sub("STUDENT", userId7, exerciseId);
        deletedStudent.setDeleted(true);
        repository.save(deletedStudent);
        repository.save(sub("IMPORT", userId7, exerciseId)); // different source, must not match

        var found = repository.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(userId7, exerciseId, "STUDENT");

        assertTrue(found.isPresent());
        assertEquals(activeStudent.getId(), found.get().getId());
    }

    @Test
    void findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse_emptyWhenNoActiveMatch() {
        var found = repository.findFirstByUserIdAndExerciseIdAndSourceAndDeletedFalse(userId7, exerciseId, "STUDENT");
        assertTrue(found.isEmpty());
    }

    @Test
    void softDeleteActiveByStudentNameAndExerciseIdAndSource_marksOnlyMatchingActiveImportRows() {
        Exercise other = new Exercise();
        other.setTitle("Other Exercise");
        other.setDescription("desc");
        other.setType(Exercise.ExerciseType.PYTHON);
        other.setDifficulty(Exercise.Difficulty.EASY);
        other.setStatus(Exercise.Status.PUBLISHED);
        other.setCreatedBy(userId7);
        Long otherExerciseId = ((Exercise) em.persistAndFlush(other)).getId();

        Submission targetImport = repository.save(sub("IMPORT", null, exerciseId));
        Submission differentSource = repository.save(sub("STUDENT", userId7, exerciseId));
        Submission differentExercise = repository.save(sub("IMPORT", null, otherExerciseId));

        int affected = repository.softDeleteActiveByStudentNameAndExerciseIdAndSource("Alice", exerciseId, "IMPORT");

        assertEquals(1, affected);
        assertTrue(repository.findById(targetImport.getId()).map(Submission::isDeleted).orElse(false));
        assertFalse(repository.findById(differentSource.getId()).map(Submission::isDeleted).orElse(true));
        assertFalse(repository.findById(differentExercise.getId()).map(Submission::isDeleted).orElse(true));
    }

    @Test
    void studentActiveKey_duplicateActiveInsert_violatesUniqueConstraint() {
        Submission s1 = sub("STUDENT", userId7, exerciseId);
        s1.setStudentActiveKey("STUDENT:" + exerciseId + ":" + userId7);
        repository.saveAndFlush(s1);

        Submission s2 = sub("STUDENT", userId7, exerciseId);
        s2.setStudentActiveKey("STUDENT:" + exerciseId + ":" + userId7);

        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
            () -> repository.saveAndFlush(s2));
    }

    @Test
    void studentActiveKey_nullOnBothRows_doesNotConflict() {
        Submission s1 = sub("STUDENT", userId7, exerciseId);
        s1.setDeleted(true);
        repository.saveAndFlush(s1);

        Submission s2 = sub("STUDENT", userId7, exerciseId);
        s2.setDeleted(true);
        repository.saveAndFlush(s2);
    }

    @Test
    void softDeleteActiveByStudentNameAndExerciseIdAndSource_alsoClearsImportActiveKey() {
        Submission s = sub("IMPORT", null, exerciseId);
        s.setImportActiveKey("IMPORT:" + exerciseId + ":Alice");
        Submission saved = repository.save(s);

        repository.softDeleteActiveByStudentNameAndExerciseIdAndSource("Alice", exerciseId, "IMPORT");

        Submission reloaded = repository.findById(saved.getId()).orElseThrow();
        assertTrue(reloaded.isDeleted());
        assertNull(reloaded.getImportActiveKey());
    }

    @Test
    void softDeleteAllByBatchId_clearsImportActiveKey() {
        ImportBatch batch = new ImportBatch();
        batch.setUuid(java.util.UUID.randomUUID().toString());
        batch.setImportedBy(userId7);
        batch.setFileCount(1);
        batch.setImportedCount(1);
        batch.setDuplicateCount(0);
        batch.setFailedCount(0);
        Long batchId = ((ImportBatch) em.persistAndFlush(batch)).getId();

        Submission s = sub("IMPORT", null, exerciseId);
        s.setImportActiveKey("IMPORT:" + exerciseId + ":Alice");
        Submission saved = repository.save(s);
        em.getEntityManager().createNativeQuery(
            "UPDATE submissions SET batch_id = :b WHERE id = :id")
            .setParameter("b", batchId)
            .setParameter("id", saved.getId())
            .executeUpdate();
        em.flush(); em.clear();

        int affected = repository.softDeleteAllByBatchId(batchId);

        assertEquals(1, affected);
        Submission reloaded = repository.findById(saved.getId()).orElseThrow();
        assertTrue(reloaded.isDeleted());
        assertNull(reloaded.getImportActiveKey());
    }
}
