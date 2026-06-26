package com.platform.exercise.student;

import java.time.LocalDateTime;

public record DraftDto(String answerData, String workspaceXml, LocalDateTime updatedAt) {}
