package com.platform.exercise.metrics;

import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BusinessMetricsSchedulerTest {

    @Mock SubmissionRepository submissionRepository;
    @Mock BusinessMetrics businessMetrics;

    @Test
    void refreshActiveStudents_queriesLast30DaysAndUpdatesGauge() {
        when(submissionRepository.countDistinctActiveStudentsSince(any())).thenReturn(15L);

        BusinessMetricsScheduler scheduler = new BusinessMetricsScheduler(submissionRepository, businessMetrics);
        scheduler.refreshActiveStudents();

        verify(businessMetrics).setActiveStudents30d(15L);

        ArgumentCaptor<LocalDateTime> sinceCaptor = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(submissionRepository).countDistinctActiveStudentsSince(sinceCaptor.capture());
        assertThat(sinceCaptor.getValue()).isBefore(LocalDateTime.now().minusDays(29));
        assertThat(sinceCaptor.getValue()).isAfter(LocalDateTime.now().minusDays(31));
    }
}
