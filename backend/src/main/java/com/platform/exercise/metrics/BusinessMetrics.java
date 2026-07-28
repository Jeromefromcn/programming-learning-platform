package com.platform.exercise.metrics;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.repository.CourseRepository;
import com.platform.exercise.repository.ExerciseRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicLong;

@Component
public class BusinessMetrics {

    private final MeterRegistry meterRegistry;
    private final AtomicLong activeStudents30d = new AtomicLong(0);

    public BusinessMetrics(MeterRegistry meterRegistry,
                            ExerciseRepository exerciseRepository,
                            CourseRepository courseRepository) {
        this.meterRegistry = meterRegistry;
        meterRegistry.gauge("business.published.exercises", exerciseRepository,
            repo -> repo.countByDeletedFalseAndStatus(Exercise.Status.PUBLISHED));
        meterRegistry.gauge("business.active.courses", courseRepository,
            CourseRepository::countByDeletedFalse);
        meterRegistry.gauge("business.active.students", activeStudents30d);
    }

    public void recordSubmissionCreated(String exerciseType) {
        Counter.builder("business.submissions")
            .tag("exercise_type", exerciseType)
            .register(meterRegistry)
            .increment();
    }

    public void setActiveStudents30d(long count) {
        activeStudents30d.set(count);
    }
}
