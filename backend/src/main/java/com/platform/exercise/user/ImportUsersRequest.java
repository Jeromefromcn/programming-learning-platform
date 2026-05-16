package com.platform.exercise.user;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ImportUsersRequest(
    @NotNull @Size(min = 1, max = 500) List<CreateUserRequest> users
) {}
