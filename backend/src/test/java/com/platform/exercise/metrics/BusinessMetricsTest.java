package com.platform.exercise.metrics;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.repository.CourseRepository;
import com.platform.exercise.repository.ExerciseRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class BusinessMetricsTest {

    @Mock ExerciseRepository exerciseRepository;
    @Mock CourseRepository courseRepository;

    private SimpleMeterRegistry meterRegistry;
    private BusinessMetrics businessMetrics;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        lenient().when(exerciseRepository.countByDeletedFalseAndStatus(Exercise.Status.PUBLISHED)).thenReturn(7L);
        lenient().when(courseRepository.countByDeletedFalse()).thenReturn(3L);
        businessMetrics = new BusinessMetrics(meterRegistry, exerciseRepository, courseRepository);
    }

    @Test
    void publishedExercisesGauge_reflectsRepositoryCount() {
        assertThat(meterRegistry.find("business.published.exercises").gauge().value()).isEqualTo(7.0);
    }

    @Test
    void activeCoursesGauge_reflectsRepositoryCount() {
        assertThat(meterRegistry.find("business.active.courses").gauge().value()).isEqualTo(3.0);
    }

    @Test
    void recordSubmissionCreated_incrementsCounterWithExerciseTypeTag() {
        businessMetrics.recordSubmissionCreated("BLOCKLY");
        businessMetrics.recordSubmissionCreated("BLOCKLY");
        businessMetrics.recordSubmissionCreated("PYTHON");

        assertThat(meterRegistry.find("business.submissions").tag("exercise_type", "BLOCKLY").counter().count())
            .isEqualTo(2.0);
        assertThat(meterRegistry.find("business.submissions").tag("exercise_type", "PYTHON").counter().count())
            .isEqualTo(1.0);
    }

    @Test
    void setActiveStudents30d_updatesGauge() {
        businessMetrics.setActiveStudents30d(42L);
        assertThat(meterRegistry.find("business.active.students").gauge().value()).isEqualTo(42.0);
    }
}
