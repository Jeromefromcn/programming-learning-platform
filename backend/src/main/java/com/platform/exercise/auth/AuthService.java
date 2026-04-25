package com.platform.exercise.auth;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.RefreshToken;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.RefreshTokenRepository;
import com.platform.exercise.repository.UserRepository;
import com.platform.exercise.security.JwtUtil;
import com.platform.exercise.user.UserDto;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public AuthResponse login(LoginRequest request, HttpServletResponse response) {
        User user = userRepository.findByUsername(request.username())
            .orElseThrow(() -> new PlatformException(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new PlatformException(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials");
        }

        if (user.getStatus() == User.UserStatus.DISABLED) {
            throw new PlatformException(ErrorCode.ACCOUNT_DISABLED,
                "Account disabled — please contact an administrator");
        }

        String accessToken = jwtUtil.generateToken(user.getId(), user.getRole().name());

        String rawToken = UUID.randomUUID().toString();
        RefreshToken rt = new RefreshToken();
        rt.setUserId(user.getId());
        rt.setTokenHash(sha256(rawToken));
        rt.setExpiresAt(LocalDateTime.now().plusDays(7));
        refreshTokenRepository.save(rt);

        addRefreshCookie(response, rawToken, 7 * 24 * 60 * 60);
        return new AuthResponse(accessToken, UserDto.from(user));
    }

    @Transactional
    public String refresh(String rawToken) {
        String hash = sha256(rawToken);
        RefreshToken rt = refreshTokenRepository.findByTokenHash(hash)
            .orElseThrow(() -> new PlatformException(ErrorCode.TOKEN_EXPIRED, "Refresh token invalid or expired"));

        if (rt.getExpiresAt().isBefore(LocalDateTime.now())) {
            refreshTokenRepository.delete(rt);
            throw new PlatformException(ErrorCode.TOKEN_EXPIRED, "Refresh token expired");
        }

        User user = userRepository.findById(rt.getUserId())
            .orElseThrow(() -> new PlatformException(ErrorCode.TOKEN_EXPIRED, "User not found"));

        return jwtUtil.generateToken(user.getId(), user.getRole().name());
    }

    @Transactional
    public void logout(String rawToken, HttpServletResponse response) {
        if (rawToken != null) {
            refreshTokenRepository.findByTokenHash(sha256(rawToken))
                .ifPresent(refreshTokenRepository::delete);
        }
        addRefreshCookie(response, "", 0);
    }

    private void addRefreshCookie(HttpServletResponse response, String value, int maxAge) {
        Cookie cookie = new Cookie("refreshToken", value);
        cookie.setHttpOnly(true);
        cookie.setSecure(true);
        cookie.setPath("/api/v1/auth");
        cookie.setMaxAge(maxAge);
        response.addCookie(cookie);
    }

    private String sha256(String input) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                .digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 unavailable", e);
        }
    }
}
