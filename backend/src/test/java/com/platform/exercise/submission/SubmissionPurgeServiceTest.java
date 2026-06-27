package com.platform.exercise.submission;

import com.platform.exercise.repository.SubmissionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SubmissionPurgeServiceTest {

    @Mock SubmissionRepository submissionRepository;
    @InjectMocks SubmissionPurgeService purgeService;

    private static final LocalDateTime CUTOFF = LocalDateTime.of(2025, 1, 1, 0, 0);

    @Test
    void preview_returnsCountFromRepository() {
        when(submissionRepository.countForPurge(CUTOFF, null, null)).thenReturn(42L);

        PurgePreviewResponse result = purgeService.preview(CUTOFF, null, null);

        assertThat(result.count()).isEqualTo(42L);
        verify(submissionRepository).countForPurge(CUTOFF, null, null);
    }

    @Test
    void preview_withFilters_passesFiltersToRepository() {
        when(submissionRepository.countForPurge(CUTOFF, 7L, "IMPORT")).thenReturn(3L);

        PurgePreviewResponse result = purgeService.preview(CUTOFF, 7L, "IMPORT");

        assertThat(result.count()).isEqualTo(3L);
    }

    @Test
    void purge_softMode_callsSoftDelete() {
        when(submissionRepository.softDeleteByFilters(CUTOFF, null, "ONLINE")).thenReturn(10);

        PurgeResultResponse result = purgeService.purge(CUTOFF, null, "ONLINE", PurgeMode.SOFT);

        assertThat(result.deletedCount()).isEqualTo(10L);
        verify(submissionRepository).softDeleteByFilters(CUTOFF, null, "ONLINE");
    }

    @Test
    void purge_hardMode_callsHardDelete() {
        when(submissionRepository.hardDeleteByFilters(CUTOFF, 5L, null)).thenReturn(7);

        PurgeResultResponse result = purgeService.purge(CUTOFF, 5L, null, PurgeMode.HARD);

        assertThat(result.deletedCount()).isEqualTo(7L);
        verify(submissionRepository).hardDeleteByFilters(CUTOFF, 5L, null);
    }
}
