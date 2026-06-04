package com.platform.exercise.grading;

public class InstructionLimitExceededException extends RuntimeException {
    public InstructionLimitExceededException() {
        super("INSTRUCTION_LIMIT_EXCEEDED");
    }
}
