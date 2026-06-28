package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "submissions")
@Data
@NoArgsConstructor
public class Submission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "exercise_id", nullable = false)
    private Long exerciseId;

    @Column(name = "graded_version_id", nullable = false)
    private Long gradedVersionId;

    @Column(name = "student_name", nullable = false, length = 128)
    private String studentName;

    @Column(name = "exercise_type", nullable = false, length = 20)
    private String exerciseType;

    @Column(name = "answer_data", nullable = false, columnDefinition = "MEDIUMTEXT")
    private String answerData;

    @Column(name = "workspace_xml", columnDefinition = "MEDIUMTEXT")
    private String workspaceXml;

    @Column(name = "export_timestamp", nullable = false)
    private LocalDateTime exportTimestamp;

    @Column(name = "version_mismatch", nullable = false)
    private boolean versionMismatch = false;

    @Column(name = "student_version_number")
    private Integer studentVersionNumber;

    @Column(name = "auto_score", precision = 5, scale = 2)
    private BigDecimal autoScore;

    @Column(name = "auto_grade_details", columnDefinition = "JSON")
    private String autoGradeDetails;

    @Column(name = "tutor_score", precision = 5, scale = 2)
    private BigDecimal tutorScore;

    @Column(name = "tutor_comment", columnDefinition = "TEXT")
    private String tutorComment;

    @Column(name = "import_batch_id", length = 36)
    private String importBatchId;

    @Column(name = "batch_id")
    private Long batchId;

    @Column(name = "tutor_grade_details", columnDefinition = "JSON")
    private String tutorGradeDetails;

    @Column(name = "graded", nullable = false)
    private boolean graded = false;

    @Column(name = "source", nullable = false, length = 20)
    private String source = "IMPORT";

    @Column(name = "user_id")
    private Long userId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "is_deleted", nullable = false)
    private boolean deleted = false;
}
