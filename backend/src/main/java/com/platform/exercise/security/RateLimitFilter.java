package com.platform.exercise.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.TimeUnit;

// Order(1) places this before Spring Security's FilterChainProxy (a single servlet filter).
// Rate-limiting must fire before JWT validation to block brute-force attempts on public endpoints.
@Component
@Order(1)
public class RateLimitFilter extends OncePerRequestFilter {

    private final Cache<String, Bucket> buckets = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterAccess(2, TimeUnit.MINUTES)
            .build();

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain)
            throws ServletException, IOException {
        String uri = request.getRequestURI();
        // Matches /v1/auth/login (test context) and /api/v1/auth/login (real context)
        boolean isLoginEndpoint = uri.equals("/v1/auth/login") || uri.equals("/api/v1/auth/login");
        if ("POST".equals(request.getMethod()) && isLoginEndpoint) {
            String ip = resolveIp(request);
            Bucket bucket = buckets.get(ip, k ->
                Bucket.builder()
                    .addLimit(Bandwidth.builder()
                        .capacity(10)
                        .refillIntervally(10, Duration.ofMinutes(1))
                        .build())
                    .build()
            );
            if (!bucket.tryConsume(1)) {
                response.setStatus(429);
                response.setContentType("application/json");
                response.getWriter().write(
                    "{\"error\":{\"code\":\"RATE_LIMITED\"," +
                    "\"message\":\"Too many login attempts. Try again in 1 minute.\"," +
                    "\"timestamp\":\"" + Instant.now() + "\"}}");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private String resolveIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
