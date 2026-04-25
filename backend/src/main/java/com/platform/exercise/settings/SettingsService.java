package com.platform.exercise.settings;

import com.platform.exercise.domain.GlobalSetting;
import com.platform.exercise.repository.GlobalSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SettingsService {

    private static final String KEY_COURSE_FILTER = "course_filter_enabled";

    private final GlobalSettingRepository settingRepository;

    @Cacheable("settings")
    @Transactional(readOnly = true)
    public SettingsResponse getSettings() {
        boolean enabled = readBool(KEY_COURSE_FILTER);
        return new SettingsResponse(enabled);
    }

    @Transactional(readOnly = true)
    public ImpactResponse getCourseFilterImpact() {
        boolean current = readBool(KEY_COURSE_FILTER);
        // Full student/course query is wired up in a later feature; stub returns 0 for now
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

    private boolean readBool(String key) {
        return settingRepository.findById(key)
            .map(s -> Boolean.parseBoolean(s.getValue()))
            .orElse(false);
    }
}
