package com.platform.exercise.exercise;

import jakarta.validation.constraints.NotNull;

public record RollbackRequest(@NotNull Long versionId) {}
