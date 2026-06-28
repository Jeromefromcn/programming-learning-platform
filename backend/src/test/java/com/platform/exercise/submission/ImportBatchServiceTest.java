package com.platform.exercise.submission;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ImportBatchServiceTest {

    @Test
    void gradedStatus_ALL_whenAllSubmissionsGraded() {
        assertEquals("ALL", ImportBatchService.computeGradedStatus(3L, 3L));
    }

    @Test
    void gradedStatus_ALL_whenNoBatchSubmissions() {
        assertEquals("ALL", ImportBatchService.computeGradedStatus(0L, 0L));
    }

    @Test
    void gradedStatus_PARTIAL_whenSomeGraded() {
        assertEquals("PARTIAL", ImportBatchService.computeGradedStatus(3L, 1L));
    }

    @Test
    void gradedStatus_NONE_whenNoneGraded() {
        assertEquals("NONE", ImportBatchService.computeGradedStatus(3L, 0L));
    }
}
