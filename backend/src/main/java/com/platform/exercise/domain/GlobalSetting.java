package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "global_settings")
@Data
@NoArgsConstructor
public class GlobalSetting {

    @Id
    @Column(name = "setting_key", length = 100)
    private String key;

    @Column(name = "setting_value", nullable = false, length = 1000)
    private String value;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
