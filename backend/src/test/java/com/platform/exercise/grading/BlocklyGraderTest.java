package com.platform.exercise.grading;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class BlocklyGraderTest {

    private final BlocklyGrader grader = new BlocklyGrader(new RhinoSandbox());

    private static final String CONFIG_MATCH_ON =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello World\"}}}";
    private static final String CONFIG_MATCH_OFF =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":false}}}";

    @Test
    void grade_correctOutput_returns100() {
        BlocklyGrader.Result result = grader.grade("print('Hello World');", CONFIG_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void grade_wrongOutput_returns0() {
        BlocklyGrader.Result result = grader.grade("print('Wrong');", CONFIG_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.autoGradeDetailsJson()).contains("\"passed\":false");
    }

    @Test
    void grade_infiniteLoop_returnsInstructionLimitExceeded() {
        long start = System.currentTimeMillis();
        BlocklyGrader.Result result = grader.grade("while(true){}", CONFIG_MATCH_ON);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("INSTRUCTION_LIMIT_EXCEEDED");
        assertThat(System.currentTimeMillis() - start)
                .as("must complete well before 3-second fallback timeout")
                .isLessThan(2000);
    }

    @Test
    void grade_outputMatchDisabled_returnsNullScoreWithNoRuleMessage() {
        BlocklyGrader.Result result = grader.grade("print('Hello World');", CONFIG_MATCH_OFF);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("No grading rules");
    }

    @Test
    void grade_blocklyGeneratedCode_windowAlertMapped_returns100() {
        BlocklyGrader.Result result = grader.grade("window.alert('Hello World');", CONFIG_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void grade_blocklyGeneratedCode_windowPromptReturnsEmpty() {
        String config = "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"ok\"}}}";
        String code = "var x = window.prompt('Enter value'); print(x === '' ? 'ok' : 'fail');";
        BlocklyGrader.Result result = grader.grade(code, config);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }
}
