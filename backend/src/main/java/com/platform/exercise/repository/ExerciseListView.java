package com.platform.exercise.repository;

import java.time.LocalDateTime;

public interface ExerciseListView {
    Long getId();
    String getTitle();
    String getType();
    String getDifficulty();
    Long getCategoryId();
    String getCategoryName();
    Integer getCurrentVersionNumber();
    String getStatus();
    Integer getLikeCount();
    LocalDateTime getCreatedAt();
}
