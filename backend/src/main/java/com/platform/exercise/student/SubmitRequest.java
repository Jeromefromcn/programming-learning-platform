package com.platform.exercise.student;

import jakarta.validation.constraints.NotBlank;

public record SubmitRequest(@NotBlank String answerData, String workspaceXml) {}
