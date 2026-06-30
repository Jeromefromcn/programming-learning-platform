package com.platform.exercise.submission;

import com.platform.exercise.common.PageResponse;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("/v1/import-batches")
@RequiredArgsConstructor
@PreAuthorize("hasRole('TUTOR')")
public class ImportBatchController {

    private final ImportBatchService importBatchService;

    @GetMapping
    public ResponseEntity<PageResponse<ImportBatchDto>> list(
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) String gradedStatus,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(importBatchService.list(batchId, gradedStatus, page, size));
    }

    @GetMapping("/{id}/export")
    public void exportCsv(@PathVariable Long id, HttpServletResponse response) throws IOException {
        importBatchService.exportBatchCsv(id, response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        importBatchService.deleteBatch(id);
        return ResponseEntity.noContent().build();
    }
}
