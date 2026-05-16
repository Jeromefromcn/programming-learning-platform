package com.platform.exercise.user;

import com.platform.exercise.common.ErrorCode;

import java.time.Instant;
import java.util.List;

public record ImportValidationErrorResponse(ImportErrorDetails error) {

    public record ImportErrorDetails(String code, String message, String timestamp, List<ImportRowError> rows) {}

    public static ImportValidationErrorResponse of(List<ImportRowError> rows) {
        return new ImportValidationErrorResponse(new ImportErrorDetails(
            ErrorCode.IMPORT_VALIDATION_ERROR.name(),
            "Import failed due to validation errors",
            Instant.now().toString(),
            rows
        ));
    }
}
