package com.platform.exercise.common;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.*;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void platformException_mapsToCorrectHttpStatus() {
        PlatformException ex = new PlatformException(ErrorCode.EXERCISE_NOT_FOUND, "Exercise 42 not found");
        ResponseEntity<ErrorResponse> response = handler.handlePlatformException(ex);
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void platformException_bodyContainsCodeAndMessage() {
        PlatformException ex = new PlatformException(ErrorCode.USERNAME_TAKEN, "Username already in use");
        ResponseEntity<ErrorResponse> response = handler.handlePlatformException(ex);
        assertNotNull(response.getBody());
        assertEquals("USERNAME_TAKEN", response.getBody().error().code());
        assertEquals("Username already in use", response.getBody().error().message());
        assertNotNull(response.getBody().error().timestamp());
    }

    @Test
    void platformException_conflictMapsTo409() {
        PlatformException ex = new PlatformException(ErrorCode.CATEGORY_DUPLICATE, "Already exists");
        ResponseEntity<ErrorResponse> response = handler.handlePlatformException(ex);
        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
    }
}