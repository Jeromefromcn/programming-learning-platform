package com.platform.exercise.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Component
@Setter
public class JwtUtil {

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expiry-minutes:15}")
    private long expiryMinutes;

    private SecretKey signingKey;

    @PostConstruct
    public void init() {
        if ("CHANGE_ME_IN_PRODUCTION_USE_A_LONG_RANDOM_STRING".equals(secret)) {
            throw new IllegalStateException(
                "JWT_SECRET is set to the placeholder value. Set JWT_SECRET env var before starting.");
        }
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(Long userId, String role) {
        return Jwts.builder()
            .subject(String.valueOf(userId))
            .claim("role", role)
            .id(UUID.randomUUID().toString())
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + expiryMinutes * 60_000))
            .signWith(signingKey, Jwts.SIG.HS256)
            .compact();
    }

    public Claims parseToken(String token) {
        return Jwts.parser()
            .verifyWith(signingKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    public boolean isTokenValid(String token) {
        try {
            parseToken(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
