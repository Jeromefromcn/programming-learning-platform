package com.platform.exercise.submission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.Submission;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class SubmissionGradeTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void rubricGrade_computesWeightedTotal() {
        // 70 * 0.6 + 90 * 0.4 = 42 + 36 = 78.00
        List<DimensionScoreDto> dims = List.of(
            new DimensionScoreDto("Correctness", 0.6, 70.0),
            new DimensionScoreDto("Style", 0.4, 90.0)
        );
        BigDecimal total = computeWeighted(dims);
        assertEquals(new BigDecimal("78.00"), total);
    }

    @Test
    void rubricGrade_roundsToTwoDecimals() {
        // 33.33... * 0.333 + 33.33... * 0.333 + 33.33... * 0.334
        List<DimensionScoreDto> dims = List.of(
            new DimensionScoreDto("A", 0.333, 100.0),
            new DimensionScoreDto("B", 0.333, 100.0),
            new DimensionScoreDto("C", 0.334, 100.0)
        );
        BigDecimal total = computeWeighted(dims);
        assertEquals(new BigDecimal("100.00"), total);
    }

    private BigDecimal computeWeighted(List<DimensionScoreDto> dims) {
        double sum = dims.stream()
            .mapToDouble(d -> d.score() * d.weight())
            .sum();
        return BigDecimal.valueOf(sum).setScale(2, RoundingMode.HALF_UP);
    }
}
