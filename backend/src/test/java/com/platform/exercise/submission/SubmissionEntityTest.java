package com.platform.exercise.submission;

import com.platform.exercise.domain.Submission;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class SubmissionEntityTest {

    @Test
    void newSubmissionDefaultsToImportSourceWithNoUser() {
        Submission sub = new Submission();
        assertEquals("IMPORT", sub.getSource());
        assertNull(sub.getUserId());
    }

    @Test
    void sourceAndUserIdAreSettable() {
        Submission sub = new Submission();
        sub.setSource("STUDENT");
        sub.setUserId(42L);
        assertEquals("STUDENT", sub.getSource());
        assertEquals(42L, sub.getUserId());
    }
}
