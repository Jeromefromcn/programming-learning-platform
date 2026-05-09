package com.platform.exercise.grading;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class BlocklyGraderTest {

    private final BlocklyGrader grader = new BlocklyGrader();

    private static final String BLOCKLY_CONFIG_OUTPUT_MATCH_ON =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":true,\"expectedOutput\":\"Hello World\"}}}";
    private static final String BLOCKLY_CONFIG_OUTPUT_MATCH_OFF =
            "{\"gradingRules\":{\"outputMatch\":{\"enabled\":false}}}";

    @Test
    void grade_correctOutput_returns100() {
        String code = "print('Hello World');";
        BlocklyGrader.Result result = grader.grade(code, BLOCKLY_CONFIG_OUTPUT_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(new BigDecimal("100.00"));
    }

    @Test
    void grade_wrongOutput_returns0() {
        String code = "print('Wrong');";
        BlocklyGrader.Result result = grader.grade(code, BLOCKLY_CONFIG_OUTPUT_MATCH_ON);
        assertThat(result.autoScore()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(result.autoGradeDetailsJson()).contains("\"passed\":false");
    }

    @Test
    void grade_infiniteLoop_returnsNullScoreWithTleError() {
        String code = "while(true){}";
        BlocklyGrader.Result result = grader.grade(code, BLOCKLY_CONFIG_OUTPUT_MATCH_ON);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("TIME_LIMIT_EXCEEDED");
    }

    @Test
    void grade_outputMatchDisabled_returnsNullScoreWithNoRuleMessage() {
        String code = "print('Hello World');";
        BlocklyGrader.Result result = grader.grade(code, BLOCKLY_CONFIG_OUTPUT_MATCH_OFF);
        assertThat(result.autoScore()).isNull();
        assertThat(result.autoGradeDetailsJson()).contains("No grading rules");
    }
}
