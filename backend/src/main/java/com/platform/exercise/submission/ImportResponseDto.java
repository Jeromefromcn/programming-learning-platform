package com.platform.exercise.submission;

import java.util.List;

public record ImportResponseDto(
    boolean ok,
    Long importBatchId,
    String batchId,
    List<ImportResultDto> results,
    Summary summary,
    List<ImportProblemDto> problems
) {
    public record Summary(int total, int imported, int duplicates, int failed) {}

    static ImportResponseDto success(Long importBatchId, String batchId,
                                     List<ImportResultDto> results, Summary summary) {
        return new ImportResponseDto(true, importBatchId, batchId, results, summary, null);
    }

    static ImportResponseDto validationFailed(List<ImportProblemDto> problems) {
        return new ImportResponseDto(false, null, null, null, null, problems);
    }
}
