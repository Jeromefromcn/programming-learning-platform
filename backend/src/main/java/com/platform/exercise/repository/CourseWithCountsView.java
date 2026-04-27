package com.platform.exercise.repository;

import java.time.LocalDateTime;

public interface CourseWithCountsView {
    Long getId();
    String getName();
    String getDescription();
    Object getCreatedAt();
    Long getExerciseCount();
    Long getStudentCount();
}
