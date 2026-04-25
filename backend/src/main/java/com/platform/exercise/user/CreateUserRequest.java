package com.platform.exercise.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
    @NotBlank @Size(min = 3, max = 64) String username,
    @NotBlank @Size(min = 1, max = 128) String displayName,
    @NotBlank @Size(min = 8) String password,
    @NotBlank String role
) {}
