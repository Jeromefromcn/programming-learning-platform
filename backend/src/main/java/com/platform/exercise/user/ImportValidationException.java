package com.platform.exercise.user;

import java.util.List;

public class ImportValidationException extends RuntimeException {
    private final List<ImportRowError> errors;

    public ImportValidationException(List<ImportRowError> errors) {
        super("Import validation failed");
        this.errors = errors;
    }

    public List<ImportRowError> getErrors() {
        return errors;
    }
}
