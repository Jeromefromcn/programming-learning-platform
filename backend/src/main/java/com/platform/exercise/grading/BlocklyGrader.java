package com.platform.exercise.grading;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mozilla.javascript.*;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.concurrent.*;

@Component
public class BlocklyGrader {

    private static final int TIMEOUT_SECONDS = 3;
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ObjectMapper mapper = new ObjectMapper();

    public record Result(BigDecimal autoScore, String autoGradeDetailsJson) {}

    public Result grade(String studentCode, String configJson) {
        try {
            JsonNode config = mapper.readTree(configJson);
            JsonNode outputMatch = config.path("gradingRules").path("outputMatch");

            if (!outputMatch.path("enabled").asBoolean(false)) {
                return new Result(null,
                    "{\"type\":\"BLOCKLY\",\"rule\":\"none\",\"passed\":null," +
                    "\"error\":\"No grading rules configured\"}");
            }

            String expected = outputMatch.path("expectedOutput").asText("").trim();
            Future<String> future = executor.submit(() -> runInRhino(studentCode));

            String actual = null;
            String error = null;
            try {
                actual = future.get(TIMEOUT_SECONDS, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                future.cancel(true);
                error = "TIME_LIMIT_EXCEEDED";
            } catch (ExecutionException e) {
                error = e.getCause() != null ? e.getCause().getMessage() : "EXECUTION_ERROR";
            }

            boolean passed = error == null && expected.equals(actual);
            BigDecimal score = error != null ? null
                    : (passed ? new BigDecimal("100.00")
                              : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));

            String details = String.format(
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":%s," +
                "\"expected\":%s,\"actual\":%s,\"error\":%s}",
                error != null ? "null" : passed,
                mapper.writeValueAsString(expected),
                mapper.writeValueAsString(actual),
                mapper.writeValueAsString(error));

            return new Result(score, details);
        } catch (Exception e) {
            return new Result(null,
                "{\"type\":\"BLOCKLY\",\"rule\":\"outputMatch\",\"passed\":false," +
                "\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    private String runInRhino(String code) {
        StringBuilder output = new StringBuilder();
        Context cx = Context.enter();
        try {
            cx.setOptimizationLevel(-1);
            Scriptable scope = cx.initSafeStandardObjects();

            BaseFunction printFn = new BaseFunction() {
                @Override
                public Object call(Context cx, Scriptable scope, Scriptable thisObj, Object[] args) {
                    if (args.length > 0) {
                        output.append(Context.toString(args[0])).append('\n');
                    }
                    return Context.getUndefinedValue();
                }
            };
            scope.put("print", scope, printFn);

            // Blockly's javascriptGenerator emits window.alert() for text_print and
            // window.prompt() for text_prompt — neither exists in Rhino by default.
            ScriptableObject window = (ScriptableObject) cx.newObject(scope);
            window.put("alert", window, printFn);
            window.put("prompt", window, new BaseFunction() {
                @Override
                public Object call(Context cx, Scriptable scope, Scriptable thisObj, Object[] args) {
                    return "";
                }
            });
            scope.put("window", scope, window);

            cx.evaluateString(scope, code, "student", 1, null);
        } finally {
            Context.exit();
        }
        return output.toString().stripTrailing();
    }
}
