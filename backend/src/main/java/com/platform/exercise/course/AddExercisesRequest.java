package com.platform.exercise.course;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record AddExercisesRequest(@NotEmpty List<Long> exerciseIds) {}
