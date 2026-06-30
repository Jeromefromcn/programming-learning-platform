package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.metrics.GradingMetrics;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.concurrent.*;

@Component
public class BlocklyGrader {

    private static final int TIMEOUT_SECONDS = 3;
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final ObjectMapper mapper = new ObjectMapper();
    private final RhinoSandbox rhinoSandbox;
    private final GradingMetrics gradingMetrics;

    public BlocklyGrader(RhinoSandbox rhinoSandbox, GradingMetrics gradingMetrics) {
        this.rhinoSandbox = rhinoSandbox;
        this.gradingMetrics = gradingMetrics;
    }

    public record Result(BigDecimal autoScore, String autoGradeDetailsJson) {}

    public Result grade(String studentCode, String configJson) {
        try {
            JsonNode config = mapper.readTree(configJson);
            JsonNode outputMatch = config.path("gradingRules").path("outputMatch");

            if (!outputMatch.path("enabled").asBoolean(false)) {
                gradingMetrics.recordBlocklyResult("no_rules_configured");
                return new Result(null,
                    "{\"type\":\"BLOCKLY\",\"rule\":\"none\",\"passed\":null," +
                    "\"error\":\"No grading rules configured\"}");
            }

            String expected = outputMatch.path("expectedOutput").asText("").trim();
            Timer.Sample sample = gradingMetrics.startBlocklyTimer();
            Future<String> future = executor.submit(() -> rhinoSandbox.execute(studentCode));

            String actual = null;
            String error = null;
            try {
                actual = future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                future.cancel(true);
                error = "TIME_LIMIT_EXCEEDED";
            } catch (ExecutionException e) {
                Throwable cause = e.getCause();
                if (cause instanceof InstructionLimitExceededException) {
                    error = "INSTRUCTION_LIMIT_EXCEEDED";
                } else {
                    error = cause != null ? cause.getMessage() : "EXECUTION_ERROR";
                }
            } finally {
                gradingMetrics.stopBlocklyTimer(sample);
            }

            boolean passed = error == null && expected.equals(actual);
            BigDecimal score = error != null ? null
                    : (passed ? new BigDecimal("100.00")
                              : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));

            gradingMetrics.recordBlocklyResult(blocklyOutcome(error, passed));

            String details = String.format(
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":%s," +
                "\"expected\":%s,\"actual\":%s,\"error\":%s}",
                error != null ? "null" : passed,
                mapper.writeValueAsString(expected),
                mapper.writeValueAsString(actual),
                mapper.writeValueAsString(error));

            return new Result(score, details);
        } catch (Exception e) {
            gradingMetrics.recordBlocklyResult("execution_error");
            String errorJson;
            try {
                errorJson = mapper.writeValueAsString(e.getMessage() != null ? e.getMessage() : "EXECUTION_ERROR");
            } catch (Exception ignored) {
                errorJson = "\"EXECUTION_ERROR\"";
            }
            return new Result(null,
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":false," +
                "\"error\":" + errorJson + "}");
        }
    }

    private String blocklyOutcome(String error, boolean passed) {
        if (error == null) {
            return passed ? "passed" : "failed";
        }
        return switch (error) {
            case "TIME_LIMIT_EXCEEDED" -> "time_limit_exceeded";
            case "INSTRUCTION_LIMIT_EXCEEDED" -> "instruction_limit_exceeded";
            default -> "execution_error";
        };
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdown();
    }
}
