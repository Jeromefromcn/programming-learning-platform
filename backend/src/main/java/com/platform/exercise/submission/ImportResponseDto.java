package com.platform.exercise.submission;

import java.util.List;

public record ImportResponseDto(
    String batchId,
    List<ImportResultDto> results,
    Summary summary
) {
    public record Summary(int total, int imported, int duplicates, int failed) {}
}
