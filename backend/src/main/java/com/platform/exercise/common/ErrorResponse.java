package com.platform.exercise.common;

import java.time.Instant;

public record ErrorResponse(ErrorDetails error) {

    public record ErrorDetails(String code, String message, String timestamp) {}

    public static ErrorResponse of(ErrorCode code, String message) {
        return new ErrorResponse(new ErrorDetails(
            code.name(),
            message,
            Instant.now().toString()
        ));
    }
}