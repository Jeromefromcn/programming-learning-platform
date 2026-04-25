package com.platform.exercise.repository;

import com.platform.exercise.domain.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Modifying
    @Transactional
    void deleteByUserId(Long userId);

    @Modifying
    @Transactional
    void deleteByExpiresAtBefore(LocalDateTime cutoff);
}
