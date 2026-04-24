package com.platform.exercise.common;

public class PlatformException extends RuntimeException {

    private final ErrorCode errorCode;

    public PlatformException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}