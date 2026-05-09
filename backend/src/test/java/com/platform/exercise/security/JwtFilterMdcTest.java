package com.platform.exercise.security;

import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JwtFilterMdcTest {

    @Mock JwtUtil jwtUtil;
    @Mock UserRepository userRepository;

    JwtFilter filter;

    @BeforeEach
    void setUp() {
        filter = new JwtFilter(jwtUtil, userRepository);
    }

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void populatesUserIdAndRoleInMdcOnValidToken() throws Exception {
        Claims claims = mock(Claims.class);
        when(claims.getSubject()).thenReturn("42");
        when(claims.get("role", String.class)).thenReturn("TUTOR");
        when(jwtUtil.parseToken("valid-token")).thenReturn(claims);

        User user = new User();
        user.setId(42L);
        user.setStatus(User.UserStatus.ACTIVE);
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("Authorization", "Bearer valid-token");
        MockHttpServletResponse res = new MockHttpServletResponse();

        String[] capturedUserId = new String[1];
        String[] capturedRole = new String[1];

        filter.doFilterInternal(req, res, (request, response) -> {
            capturedUserId[0] = MDC.get("userId");
            capturedRole[0] = MDC.get("role");
        });

        assertThat(capturedUserId[0]).isEqualTo("42");
        assertThat(capturedRole[0]).isEqualTo("TUTOR");
    }

    @Test
    void doesNotSetMdcWhenNoAuthHeader() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();

        String[] capturedUserId = new String[1];
        filter.doFilterInternal(req, res, (request, response) -> {
            capturedUserId[0] = MDC.get("userId");
        });

        assertThat(capturedUserId[0]).isNull();
    }
}
