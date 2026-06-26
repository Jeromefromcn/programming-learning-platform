package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "exercise_drafts")
@Data
@NoArgsConstructor
public class ExerciseDraft {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "exercise_id", nullable = false)
    private Long exerciseId;

    @Column(name = "exercise_type", nullable = false, length = 20)
    private String exerciseType;

    @Column(name = "answer_data", columnDefinition = "MEDIUMTEXT")
    private String answerData;

    @Column(name = "workspace_xml", columnDefinition = "MEDIUMTEXT")
    private String workspaceXml;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    @PrePersist
    void touch() {
        this.updatedAt = LocalDateTime.now();
    }
}
