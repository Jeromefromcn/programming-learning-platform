package com.platform.exercise.common;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.*;

class ErrorCodeTest {

    @Test
    void everyErrorCodeHasAnHttpStatus() {
        for (ErrorCode code : ErrorCode.values()) {
            assertNotNull(code.getHttpStatus(), code.name() + " must have an HTTP status");
        }
    }

    @Test
    void invalidCredentialsIsUnauthorized() {
        assertEquals(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS.getHttpStatus());
    }

    @Test
    void exerciseNotFoundIsNotFound() {
        assertEquals(HttpStatus.NOT_FOUND, ErrorCode.EXERCISE_NOT_FOUND.getHttpStatus());
    }

    @Test
    void usernameTakenIsConflict() {
        assertEquals(HttpStatus.CONFLICT, ErrorCode.USERNAME_TAKEN.getHttpStatus());
    }

    @Test
    void rateLimitedIsTooManyRequests() {
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED.getHttpStatus());
    }
}