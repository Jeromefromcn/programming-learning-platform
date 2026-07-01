package com.platform.exercise.submission;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.User;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/v1/submissions")
@RequiredArgsConstructor
@PreAuthorize("hasRole('TUTOR')")
public class SubmissionController {

    private final SubmissionService submissionService;

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportResponseDto> importFiles(
            @RequestParam("files") List<MultipartFile> files,
            Authentication authentication) throws IOException {
        Long userId = null;
        if (authentication != null && authentication.getPrincipal() instanceof User u) {
            userId = u.getId();
        }
        return ResponseEntity.ok(submissionService.importFiles(files, userId));
    }

    @PostMapping("/import-duplicate")
    public ResponseEntity<ImportResultDto> forceImport(
            @RequestBody @Valid ForceImportRequest req) throws IOException {
        return ResponseEntity.ok(submissionService.forceImport(req));
    }

    @GetMapping
    public ResponseEntity<PageResponse<SubmissionListItemDto>> list(
            @RequestParam(required = false) Long exerciseId,
            @RequestParam(required = false) String studentName,
            @RequestParam(defaultValue = "IMPORT") String source,
            @RequestParam(required = false) Long batchId,
            @RequestParam(required = false) Boolean graded,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(submissionService.list(exerciseId, studentName, source, batchId, graded, page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<SubmissionDetailDto> getById(@PathVariable Long id) {
        return ResponseEntity.ok(submissionService.getById(id));
    }

    @PutMapping("/{id}/grade")
    public ResponseEntity<SubmissionDetailDto> grade(
            @PathVariable Long id,
            @RequestBody @Valid GradeRequest req) {
        return ResponseEntity.ok(submissionService.grade(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        submissionService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/export-csv")
    @PreAuthorize("permitAll()")
    public void exportCsv(
            @RequestParam(required = false) Long exerciseId,
            HttpServletResponse response) throws IOException {
        submissionService.exportCsv(exerciseId, response);
    }
}
