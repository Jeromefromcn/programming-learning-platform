package com.platform.exercise.course;

import java.util.List;

public record EnrollResult(int enrolled, int skipped, List<String> errors) {}
