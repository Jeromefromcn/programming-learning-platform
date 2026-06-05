package com.platform.exercise.user;

import java.time.LocalDateTime;

public record UpdateExpirationRequest(
    LocalDateTime expirationDate
) {}