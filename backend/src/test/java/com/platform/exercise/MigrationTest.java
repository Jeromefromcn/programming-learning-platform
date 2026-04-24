package com.platform.exercise;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class MigrationTest {

    @Autowired
    private DataSource dataSource;

    @Test
    void v1MigrationCreatesAllElevenTables() throws Exception {
        List<String> expected = List.of(
            "users", "refresh_tokens", "categories", "courses",
            "exercises", "exercise_versions", "course_exercises",
            "course_students", "submissions", "exercise_likes", "global_settings"
        );
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT LOWER(TABLE_NAME) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'PUBLIC'")) {
            ResultSet rs = stmt.executeQuery();
            Set<String> actual = new HashSet<>();
            while (rs.next()) actual.add(rs.getString(1));
            for (String table : expected) {
                assertTrue(actual.contains(table), "Missing table: " + table);
            }
        }
    }

    @Test
    void globalSettingsSeedRowExists() throws Exception {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT setting_value FROM global_settings WHERE setting_key = 'course_filter_enabled'")) {
            ResultSet rs = stmt.executeQuery();
            assertTrue(rs.next(), "Seed row 'course_filter_enabled' should exist");
            assertEquals("false", rs.getString("setting_value"));
        }
    }
}