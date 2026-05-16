package com.platform.exercise.settings;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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

    @GetMapping("/menu-config")
    public ResponseEntity<Map<String, List<String>>> getMenuConfig(Authentication authentication) {
        String role = extractRole(authentication);
        return ResponseEntity.ok(Map.of("sections", settingsService.getMenuConfig(role)));
    }

    @GetMapping("/menu-config/all")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, List<String>>> getAllMenuConfig() {
        return ResponseEntity.ok(settingsService.getAllMenuConfig());
    }

    @PutMapping("/menu-config")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Void> updateMenuConfig(
            @RequestBody Map<String, List<String>> config) {
        settingsService.updateMenuConfig(config);
        return ResponseEntity.noContent().build();
    }

    private String extractRole(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .findFirst()
                .map(a -> a.getAuthority().replace("ROLE_", ""))
                .orElse("STUDENT");
    }
}
