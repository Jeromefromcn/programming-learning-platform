package com.platform.exercise.settings;

import java.util.List;

public record ImpactResponse(
    boolean currentState,
    int unenrolledStudentCount,
    List<String> unenrolledStudents
) {}
