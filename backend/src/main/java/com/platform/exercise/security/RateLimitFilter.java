package com.platform.exercise.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
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
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;

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
        String method = request.getMethod();

        // Login: 10/min per IP
        boolean isLoginEndpoint = uri.equals("/v1/auth/login") || uri.equals("/api/v1/auth/login");
        if ("POST".equals(method) && isLoginEndpoint) {
            String ip = resolveIp(request);
            Bucket bucket = buckets.get(ip, k -> newBucket(10, 1));
            if (!bucket.tryConsume(1)) {
                writeRateLimitResponse(response, "Too many login attempts. Try again in 1 minute.");
                return;
            }
        }

        // Import: 5/min per user
        boolean isImportEndpoint = uri.equals("/v1/submissions/import") || uri.equals("/api/v1/submissions/import");
        if ("POST".equals(method) && isImportEndpoint) {
            String userId = extractUserIdFromToken(request);
            if (userId != null) {
                Bucket bucket = buckets.get("import:" + userId, k -> newBucket(5, 1));
                if (!bucket.tryConsume(1)) {
                    writeRateLimitResponse(response, "Import rate limit exceeded. Try again in 1 minute.");
                    return;
                }
            }
        }

        // Student submit: 20/min per user (sandboxed grading is expensive)
        boolean isSubmitEndpoint = uri.matches("(/api)?/v1/student/exercises/\\d+/submissions");
        if ("POST".equals(method) && isSubmitEndpoint) {
            String userId = extractUserIdFromToken(request);
            if (userId != null) {
                Bucket bucket = buckets.get("submit:" + userId, k -> newBucket(20, 1));
                if (!bucket.tryConsume(1)) {
                    writeRateLimitResponse(response, "Submit rate limit exceeded. Try again in 1 minute.");
                    return;
                }
            }
        }

        chain.doFilter(request, response);
    }

    private Bucket newBucket(long capacity, long refillMinutes) {
        return Bucket.builder()
            .addLimit(Bandwidth.builder()
                .capacity(capacity)
                .refillIntervally(capacity, Duration.ofMinutes(refillMinutes))
                .build())
            .build();
    }

    private String extractUserIdFromToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            try {
                return jwtUtil.parseToken(header.substring(7)).getSubject();
            } catch (Exception ignored) {}
        }
        return null;
    }

    private String resolveIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) return xff.split(",")[0].trim();
        return request.getRemoteAddr();
    }

    private void writeRateLimitResponse(HttpServletResponse response, String message) throws IOException {
        response.setStatus(429);
        response.setContentType("application/json");
        response.getWriter().write(
            "{\"error\":{\"code\":\"RATE_LIMITED\",\"message\":\"" + message + "\"," +
            "\"timestamp\":\"" + Instant.now() + "\"}}");
    }
}
