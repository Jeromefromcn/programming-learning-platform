package com.platform.exercise.common;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED),
    ACCOUNT_DISABLED(HttpStatus.FORBIDDEN),
    TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED),
    ACCESS_DENIED(HttpStatus.FORBIDDEN),
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND),
    USERNAME_TAKEN(HttpStatus.CONFLICT),
    EXERCISE_NOT_FOUND(HttpStatus.NOT_FOUND),
    COURSE_NOT_FOUND(HttpStatus.NOT_FOUND),
    CATEGORY_NOT_FOUND(HttpStatus.NOT_FOUND),
    CATEGORY_DUPLICATE(HttpStatus.CONFLICT),
    CATEGORY_HAS_EXERCISES(HttpStatus.CONFLICT),
    IMPORT_FILE_INVALID(HttpStatus.BAD_REQUEST),
    IMPORT_EXERCISE_MISSING(HttpStatus.BAD_REQUEST),
    IMPORT_DUPLICATE(HttpStatus.CONFLICT),
    ZIP_PATH_TRAVERSAL(HttpStatus.BAD_REQUEST),
    ZIP_TOO_LARGE(HttpStatus.BAD_REQUEST),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS);

    private final HttpStatus httpStatus;

    ErrorCode(HttpStatus httpStatus) {
        this.httpStatus = httpStatus;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
}