package com.platform.exercise.repository;

import com.platform.exercise.domain.ImportBatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface ImportBatchRepository extends JpaRepository<ImportBatch, Long> {
    Optional<ImportBatch> findByUuid(String uuid);
    List<ImportBatch> findAllByOrderByCreatedAtDesc();
    Optional<ImportBatch> findByIdAndDeletedFalse(Long id);
    List<ImportBatch> findAllByDeletedFalseOrderByCreatedAtDesc();
}
