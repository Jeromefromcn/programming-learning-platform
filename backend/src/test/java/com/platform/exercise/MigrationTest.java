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

    @Test
    void v10AddsImportBatchesTableAndSubmissionColumns() throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            // import_batches table exists
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
                    "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='import_batches'")) {
                ResultSet rs = stmt.executeQuery();
                rs.next();
                assertEquals(1, rs.getInt(1), "import_batches table should exist");
            }
            // submissions has new columns
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT LOWER(COLUMN_NAME) FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='submissions'")) {
                ResultSet rs = stmt.executeQuery();
                Set<String> cols = new HashSet<>();
                while (rs.next()) cols.add(rs.getString(1));
                assertTrue(cols.contains("batch_id"), "submissions.batch_id should exist");
                assertTrue(cols.contains("tutor_grade_details"), "submissions.tutor_grade_details should exist");
                assertTrue(cols.contains("graded"), "submissions.graded should exist");
            }
        }
    }

    @Test
    void v12AddsImportBatchesSoftDeleteColumn() throws Exception {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT LOWER(COLUMN_NAME) FROM INFORMATION_SCHEMA.COLUMNS " +
                 "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='import_batches'")) {
            ResultSet rs = stmt.executeQuery();
            Set<String> cols = new HashSet<>();
            while (rs.next()) cols.add(rs.getString(1));
            assertTrue(cols.contains("is_deleted"), "import_batches.is_deleted should exist");
        }
    }

    @Test
    void v8AddsExerciseDraftsTableAndSubmissionSourceColumns() throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES " +
                    "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='exercise_drafts'")) {
                ResultSet rs = stmt.executeQuery();
                rs.next();
                assertEquals(1, rs.getInt(1), "exercise_drafts table should exist");
            }
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT LOWER(COLUMN_NAME) FROM INFORMATION_SCHEMA.COLUMNS " +
                    "WHERE TABLE_SCHEMA='PUBLIC' AND LOWER(TABLE_NAME)='submissions'")) {
                ResultSet rs = stmt.executeQuery();
                Set<String> cols = new HashSet<>();
                while (rs.next()) cols.add(rs.getString(1));
                assertTrue(cols.contains("source"), "submissions.source should exist");
                assertTrue(cols.contains("user_id"), "submissions.user_id should exist");
            }
        }
    }
}