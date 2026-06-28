package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.ImportBatchRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ImportBatchServiceTest {

    // ---- existing static-method tests (unchanged) ----

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

    // ---- export pivot tests ----

    @Mock ImportBatchRepository importBatchRepository;
    @Mock SubmissionRepository submissionRepository;
    @Mock UserRepository userRepository;
    @Mock ExerciseRepository exerciseRepository;
    @Mock ExerciseVersionRepository versionRepository;

    final ObjectMapper objectMapper = new ObjectMapper();
    ImportBatchService service;

    @BeforeEach
    void setUp() {
        service = new ImportBatchService(
            importBatchRepository, submissionRepository, userRepository,
            exerciseRepository, versionRepository, objectMapper);
    }

    private Exercise exercise(long id, long versionId, String title) {
        Exercise ex = new Exercise();
        ex.setId(id);
        ex.setTitle(title);
        ex.setCurrentVersionId(versionId);
        return ex;
    }

    private ExerciseVersion version(long id, String configJson) {
        ExerciseVersion v = new ExerciseVersion();
        v.setId(id);
        v.setConfig(configJson);
        return v;
    }

    private Submission submission(String studentName, long exerciseId,
                                  String gradeDetails, BigDecimal tutorScore, BigDecimal autoScore) {
        Submission s = new Submission();
        s.setStudentName(studentName);
        s.setExerciseId(exerciseId);
        s.setTutorGradeDetails(gradeDetails);
        s.setTutorScore(tutorScore);
        s.setAutoScore(autoScore);
        return s;
    }

    @Test
    void exportBatchCsv_rubricMode_oneRowPerSubmissionWithDimColumns() throws IOException {
        Exercise ex = exercise(1L, 10L, "Algo Test");
        ExerciseVersion ver = version(10L,
            "{\"rubric\":{\"dimensions\":[{\"name\":\"Logic\",\"weight\":0.6},{\"name\":\"Style\",\"weight\":0.4}]}}");
        Submission sub = submission("alice", 1L,
            "[{\"name\":\"Logic\",\"weight\":0.6,\"score\":80.0},{\"name\":\"Style\",\"weight\":0.4,\"score\":70.0}]",
            new BigDecimal("76.00"), null);

        when(submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc(1L))
            .thenReturn(List.of(sub));
        when(exerciseRepository.findById(1L)).thenReturn(Optional.of(ex));
        when(versionRepository.findById(10L)).thenReturn(Optional.of(ver));
        when(exerciseRepository.findAllById(List.of(1L))).thenReturn(List.of(ex));

        MockHttpServletResponse response = new MockHttpServletResponse();
        service.exportBatchCsv(1L, response);

        String[] lines = response.getContentAsString().split("\\r?\\n");
        assertThat(lines[0]).contains("Logic (60%)").contains("Style (40%)");
        assertThat(lines[0]).doesNotContain("Dimension").doesNotContain("Weight");
        assertThat(lines).hasSize(2); // header + 1 row
        assertThat(lines[1]).contains("alice").contains("80.0").contains("70.0").contains("76.00");
    }

    @Test
    void exportBatchCsv_instantFeedbackMode_noDimColumns() throws IOException {
        Exercise ex = exercise(2L, 20L, "Quick Quiz");
        ExerciseVersion ver = version(20L, "{\"showResult\":true,\"rubric\":{\"dimensions\":[]}}");
        Submission sub = submission("bob", 2L, null, null, new BigDecimal("90.00"));

        when(submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc(1L))
            .thenReturn(List.of(sub));
        when(exerciseRepository.findById(2L)).thenReturn(Optional.of(ex));
        when(versionRepository.findById(20L)).thenReturn(Optional.of(ver));
        when(exerciseRepository.findAllById(List.of(2L))).thenReturn(List.of(ex));

        MockHttpServletResponse response = new MockHttpServletResponse();
        service.exportBatchCsv(1L, response);

        String[] lines = response.getContentAsString().split("\\r?\\n");
        // Header must have exactly: Student Name, Display Name, Exercise Title, Total Score
        assertThat(lines[0]).isEqualTo("Student Name,Display Name,Exercise Title,Total Score");
        assertThat(lines[1]).contains("bob").contains("90.00");
    }

    @Test
    void exportBatchCsv_ungradedSubmission_dimAndTotalCellsEmpty() throws IOException {
        Exercise ex = exercise(3L, 30L, "Rubric Only");
        ExerciseVersion ver = version(30L,
            "{\"rubric\":{\"dimensions\":[{\"name\":\"Logic\",\"weight\":1.0}]}}");
        Submission sub = submission("carol", 3L, null, null, null);

        when(submissionRepository.findByBatchIdAndDeletedFalseOrderByStudentNameAsc(1L))
            .thenReturn(List.of(sub));
        when(exerciseRepository.findById(3L)).thenReturn(Optional.of(ex));
        when(versionRepository.findById(30L)).thenReturn(Optional.of(ver));
        when(exerciseRepository.findAllById(List.of(3L))).thenReturn(List.of(ex));

        MockHttpServletResponse response = new MockHttpServletResponse();
        service.exportBatchCsv(1L, response);

        String[] lines = response.getContentAsString().split("\\r?\\n");
        // Header has the dim column
        assertThat(lines[0]).contains("Logic (100%)");
        // carol's row: student name, empty display, title, empty dim score, empty total
        assertThat(lines[1]).startsWith("carol,");
        // Both the dim score and total score are empty (ends with ",,")
        assertThat(lines[1]).endsWith(",,");
    }
}
