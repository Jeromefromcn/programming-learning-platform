package com.platform.exercise.settings;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;

    @GetMapping
    public ResponseEntity<SettingsResponse> getSettings() {
        return ResponseEntity.ok(settingsService.getSettings());
    }

    @GetMapping("/course-filter/impact")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ImpactResponse> getCourseFilterImpact() {
        return ResponseEntity.ok(settingsService.getCourseFilterImpact());
    }

    @PutMapping("/course-filter")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<SettingsResponse> updateCourseFilter(@RequestBody CourseFilterRequest req) {
        return ResponseEntity.ok(settingsService.updateCourseFilter(req.enabled()));
    }
}
