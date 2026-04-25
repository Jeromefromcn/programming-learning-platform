package com.platform.exercise.user;

import com.platform.exercise.domain.User;
import java.time.LocalDateTime;

public record UserDto(
    Long id,
    String username,
    String displayName,
    String role,
    String status,
    LocalDateTime createdAt
) {
    public static UserDto from(User user) {
        return new UserDto(
            user.getId(),
            user.getUsername(),
            user.getDisplayName(),
            user.getRole().name(),
            user.getStatus().name(),
            user.getCreatedAt()
        );
    }
}
