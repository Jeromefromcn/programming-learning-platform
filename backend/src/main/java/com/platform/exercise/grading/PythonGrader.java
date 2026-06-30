package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.exercise.SandboxClient;
import com.platform.exercise.exercise.VerifyRequest;
import com.platform.exercise.metrics.GradingMetrics;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class PythonGrader {

    private final SandboxClient sandboxClient;
    private final ObjectMapper objectMapper;
    private final GradingMetrics gradingMetrics;

    public record Result(BigDecimal autoScore, String autoGradeDetailsJson) {}

    public Result grade(String studentCode, String configJson) {
        try {
            JsonNode config = objectMapper.readTree(configJson);
            int timeLimitSeconds = config.path("timeLimitSeconds").asInt(5);

            List<VerifyRequest.TestCaseItem> testCases = new ArrayList<>();
            for (JsonNode tc : config.path("testCases")) {
                testCases.add(new VerifyRequest.TestCaseItem(
                    tc.path("input").asText(""),
                    tc.path("expectedOutput").asText("")
                ));
            }

            Timer.Sample sample = gradingMetrics.startPythonTimer();
            JsonNode sandboxResponse;
            try {
                sandboxResponse = sandboxClient.execute(studentCode, testCases, timeLimitSeconds);
            } finally {
                gradingMetrics.stopPythonTimer(sample);
            }

            JsonNode results = sandboxResponse.path("results");

            int total = 0, passed = 0;
            for (JsonNode r : results) {
                total++;
                if (r.path("passed").asBoolean(false)) passed++;
            }

            BigDecimal score = total == 0 ? null
                    : new BigDecimal(passed)
                        .multiply(new BigDecimal("100"))
                        .divide(new BigDecimal(total), 2, RoundingMode.HALF_UP);

            String details = String.format(
                "{\"type\":\"PYTHON\",\"results\":%s,\"passedCount\":%d,\"totalCount\":%d}",
                results.toString(), passed, total);

            gradingMetrics.recordPythonResult("completed");
            return new Result(score, details);

        } catch (SandboxClient.SandboxUnavailableException e) {
            gradingMetrics.recordPythonResult("sandbox_unavailable");
            return new Result(null, "{\"type\":\"PYTHON\",\"error\":\"SANDBOX_UNAVAILABLE\"}");
        } catch (Exception e) {
            gradingMetrics.recordPythonResult("error");
            return new Result(null,
                "{\"type\":\"PYTHON\",\"error\":\"" + e.getMessage() + "\"}");
        }
    }
}
