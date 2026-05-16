package com.platform.exercise.settings;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.domain.GlobalSetting;
import com.platform.exercise.repository.GlobalSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SettingsService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(SettingsService.class);

    private static final String KEY_COURSE_FILTER = "course_filter_enabled";
    private static final String KEY_MENU_CONFIG = "menu_config";

    private static final Map<String, List<String>> DEFAULT_MENU_CONFIG = Map.of(
        "STUDENT",     List.of("exercises", "progress"),
        "TUTOR",       List.of("exercises", "courses", "categories", "submissions"),
        "SUPER_ADMIN", List.of("exercises", "courses", "categories", "submissions", "users", "settings")
    );

    private final GlobalSettingRepository settingRepository;
    private final ObjectMapper objectMapper;

    @Cacheable("settings")
    @Transactional(readOnly = true)
    public SettingsResponse getSettings() {
        boolean enabled = readBool(KEY_COURSE_FILTER);
        return new SettingsResponse(enabled);
    }

    @Transactional(readOnly = true)
    public ImpactResponse getCourseFilterImpact() {
        boolean current = readBool(KEY_COURSE_FILTER);
        return new ImpactResponse(current, 0, List.of());
    }

    @CacheEvict(value = "settings", allEntries = true)
    @Transactional
    public SettingsResponse updateCourseFilter(boolean enabled) {
        GlobalSetting setting = settingRepository.findById(KEY_COURSE_FILTER)
            .orElseGet(() -> { GlobalSetting s = new GlobalSetting(); s.setKey(KEY_COURSE_FILTER); return s; });
        setting.setValue(String.valueOf(enabled));
        settingRepository.save(setting);
        return new SettingsResponse(enabled);
    }

    @Transactional(readOnly = true)
    public List<String> getMenuConfig(String role) {
        return settingRepository.findById(KEY_MENU_CONFIG)
            .map(s -> parseMenuConfig(s.getValue()).getOrDefault(role, defaultFor(role)))
            .orElse(defaultFor(role));
    }

    @Transactional(readOnly = true)
    public Map<String, List<String>> getAllMenuConfig() {
        return settingRepository.findById(KEY_MENU_CONFIG)
            .map(s -> parseMenuConfig(s.getValue()))
            .orElse(new HashMap<>(DEFAULT_MENU_CONFIG));
    }

    @Transactional
    public void updateMenuConfig(Map<String, List<String>> config) {
        validateMenuConfig(config);
        String json;
        try {
            json = objectMapper.writeValueAsString(config);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize menu config");
        }
        if (json.length() > 1000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Menu configuration exceeds maximum allowed size");
        }
        GlobalSetting setting = settingRepository.findById(KEY_MENU_CONFIG)
            .orElseGet(() -> { GlobalSetting s = new GlobalSetting(); s.setKey(KEY_MENU_CONFIG); return s; });
        setting.setValue(json);
        settingRepository.save(setting);
    }

    private Map<String, List<String>> parseMenuConfig(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, List<String>>>() {});
        } catch (JsonProcessingException e) {
            log.warn("Failed to parse menu_config from DB, using defaults: {}", e.getMessage());
            return new HashMap<>(DEFAULT_MENU_CONFIG);
        }
    }

    private List<String> defaultFor(String role) {
        return DEFAULT_MENU_CONFIG.getOrDefault(role, List.of());
    }

    private void validateMenuConfig(Map<String, List<String>> config) {
        for (Map.Entry<String, List<String>> entry : config.entrySet()) {
            String role = entry.getKey();
            List<String> sections = entry.getValue();
            if (sections == null || !sections.contains("exercises")) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "exercises must be present for role: " + role);
            }
            if (!role.equals("SUPER_ADMIN") &&
                    (sections.contains("users") || sections.contains("settings"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "users and settings are only allowed for SUPER_ADMIN");
            }
        }
    }

    private boolean readBool(String key) {
        return settingRepository.findById(key)
            .map(s -> Boolean.parseBoolean(s.getValue()))
            .orElse(false);
    }
}
