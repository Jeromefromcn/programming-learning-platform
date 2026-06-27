package com.platform.exercise.submission;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;

@RestController
@RequestMapping("/v1/submissions/purge")
@RequiredArgsConstructor
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class SubmissionPurgeController {

    private final SubmissionPurgeService purgeService;

    @GetMapping("/preview")
    public ResponseEntity<PurgePreviewResponse> preview(
            @RequestParam(required = false) String before,
            @RequestParam(required = false) Long exerciseId,
            @RequestParam(required = false) String source) {
        LocalDateTime cutoff = parseBefore(before);
        validateSource(source);
        return ResponseEntity.ok(purgeService.preview(cutoff, exerciseId, source));
    }

    @DeleteMapping
    public ResponseEntity<PurgeResultResponse> purge(
            @RequestParam(required = false) String before,
            @RequestParam(required = false) Long exerciseId,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String mode) {
        LocalDateTime cutoff = parseBefore(before);
        validateSource(source);
        PurgeMode purgeMode = parseMode(mode);
        return ResponseEntity.ok(purgeService.purge(cutoff, exerciseId, source, purgeMode));
    }

    private LocalDateTime parseBefore(String before) {
        if (before == null || before.isBlank()) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "before date is required.");
        }
        try {
            return LocalDate.parse(before).atStartOfDay();
        } catch (DateTimeParseException e) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "Invalid date format. Use YYYY-MM-DD.");
        }
    }

    private void validateSource(String source) {
        if (source != null && !source.equals("IMPORT") && !source.equals("STUDENT")) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "source must be IMPORT or STUDENT.");
        }
    }

    private PurgeMode parseMode(String mode) {
        if (mode == null || mode.isBlank()) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "mode is required.");
        }
        try {
            return PurgeMode.valueOf(mode);
        } catch (IllegalArgumentException e) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "mode must be SOFT or HARD.");
        }
    }
}
