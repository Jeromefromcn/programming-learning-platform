package com.platform.exercise.repository;

import com.platform.exercise.domain.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);
    void deleteByUserId(Long userId);
    void deleteByExpiresAtBefore(LocalDateTime cutoff);
}
