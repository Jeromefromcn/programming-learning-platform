package com.platform.exercise.course;

import com.platform.exercise.repository.UserSummaryView;

public record UserSummaryDto(Long id, String username, String displayName) {
    public static UserSummaryDto from(UserSummaryView v) {
        return new UserSummaryDto(v.getId(), v.getUsername(), v.getDisplayName());
    }
}
