package com.platform.exercise.metrics;

import com.platform.exercise.repository.SubmissionRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
@Slf4j
public class BusinessMetricsScheduler {

    private final SubmissionRepository submissionRepository;
    private final BusinessMetrics businessMetrics;

    @PostConstruct
    @Scheduled(fixedRate = 5 * 60 * 1000)
    public void refreshActiveStudents() {
        long count = submissionRepository.countDistinctActiveStudentsSince(LocalDateTime.now().minusDays(30));
        businessMetrics.setActiveStudents30d(count);
        log.debug("Active students (30d) gauge refreshed: {}", count);
    }
}
