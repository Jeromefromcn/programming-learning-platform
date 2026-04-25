package com.platform.exercise.repository;

import com.platform.exercise.domain.GlobalSetting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface GlobalSettingRepository extends JpaRepository<GlobalSetting, String> {
}
