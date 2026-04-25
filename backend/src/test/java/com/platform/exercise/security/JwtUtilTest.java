package com.platform.exercise.security;

import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtUtilTest {

    private JwtUtil jwtUtil;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(jwtUtil, "secret",
            "test-secret-min-32-chars-for-testing-only-1234");
        ReflectionTestUtils.setField(jwtUtil, "expiryMinutes", 15L);
        jwtUtil.init();
    }

    @Test
    void generateAndParse_roundTrip() {
        String token = jwtUtil.generateToken(42L, "STUDENT");
        var claims = jwtUtil.parseToken(token);
        assertThat(claims.getSubject()).isEqualTo("42");
        assertThat(claims.get("role", String.class)).isEqualTo("STUDENT");
    }

    @Test
    void isTokenValid_returnsFalseForTamperedToken() {
        String token = jwtUtil.generateToken(1L, "STUDENT");
        assertThat(jwtUtil.isTokenValid(token + "tampered")).isFalse();
    }

    @Test
    void init_throwsWhenSecretIsPlaceholder() {
        JwtUtil bad = new JwtUtil();
        ReflectionTestUtils.setField(bad, "secret",
            "CHANGE_ME_IN_PRODUCTION_USE_A_LONG_RANDOM_STRING");
        ReflectionTestUtils.setField(bad, "expiryMinutes", 15L);
        assertThatThrownBy(bad::init).isInstanceOf(IllegalStateException.class);
    }
}
