package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;

public record StudentProgressDto(PageResponse<ProgressSubmissionDto> submissions) {}
