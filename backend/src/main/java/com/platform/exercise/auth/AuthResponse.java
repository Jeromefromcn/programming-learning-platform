package com.platform.exercise.auth;

import com.platform.exercise.user.UserDto;

public record AuthResponse(String accessToken, UserDto user) {}
