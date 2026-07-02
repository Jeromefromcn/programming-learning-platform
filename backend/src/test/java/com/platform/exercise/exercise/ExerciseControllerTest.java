package com.platform.exercise.exercise;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExerciseControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JdbcTemplate jdbcTemplate;

    Long tutorId;
    Long categoryId;

    private String pythonBody() {
        return """
            {
              "title": "FizzBuzz",
              "description": "Classic problem",
              "type": "PYTHON",
              "difficulty": "MEDIUM",
              "categoryId": %d,
              "hints": ["Try modulo"],
              "config": {
                "starterCode": "def fizzbuzz(n):\\n    pass",
                "timeLimitSeconds": 5,
                "testCases": [{"input": "fizzbuzz(3)", "expectedOutput": "\\"Fizz\\"", "visible": true}]
              }
            }
            """.formatted(categoryId);
    }

    private static final String BLOCKLY_BODY = """
            {
              "title": "Print Hello",
              "description": "Simple print",
              "type": "BLOCKLY",
              "difficulty": "EASY",
              "config": {
                "allowedBlocks": ["text_print", "text"],
                "initialWorkspaceXml": "<xml></xml>",
                "showCodeView": true,
                "gradingRules": {
                  "outputMatch": {"enabled": true, "expectedOutput": "Hello World"},
                  "requiredBlocks": {"enabled": false, "blocks": []},
                  "forbiddenBlocks": {"enabled": false, "blocks": []},
                  "blockCountLimit": {"enabled": false, "max": null}
                }
              }
            }
            """;

    @BeforeEach
    void seed() {
        User tutor = new User();
        tutor.setUsername("tutor1");
        tutor.setDisplayName("Tutor One");
        tutor.setPasswordHash(passwordEncoder.encode("pass"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        tutorId = userRepository.save(tutor).getId();

        jdbcTemplate.update("INSERT INTO categories (name) VALUES (?)", "Loops");
        categoryId = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    // ── RBAC ─────────────────────────────────────────────────────────────────

    @Test
    void listExercises_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/v1/exercises")).andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void listExercises_asStudent_returns403() throws Exception {
        mockMvc.perform(get("/v1/exercises")).andExpect(status().isForbidden());
    }

    // ── Create Python ─────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createPythonExercise_valid_returns201() throws Exception {
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("FizzBuzz"))
                .andExpect(jsonPath("$.status").value("DRAFT"))
                .andExpect(jsonPath("$.currentVersion.versionNumber").value(1))
                .andExpect(jsonPath("$.currentVersion.config.starterCode").value("def fizzbuzz(n):\n    pass"))
                .andExpect(jsonPath("$.currentVersion.hints[0]").value("Try modulo"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createExercise_withDeadline_returnsDeadlineInResponse() throws Exception {
        String body = """
                {"title":"T","description":"D","type":"PYTHON","difficulty":"EASY",
                 "deadline":"2026-07-15T23:59:00",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.deadline").value("2026-07-15T23:59:00"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createExercise_withoutDeadline_returnsNullDeadline() throws Exception {
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.deadline").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createPythonExercise_noTestCases_returns400() throws Exception {
        String body = """
                {"title":"T","description":"D","type":"PYTHON","difficulty":"EASY",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,"testCases":[]}}
                """;
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    // ── Create Blockly ────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createBlocklyExercise_valid_returns201() throws Exception {
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BLOCKLY_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.type").value("BLOCKLY"))
                .andExpect(jsonPath("$.currentVersion.versionNumber").value(1));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createBlocklyExercise_noAllowedBlocks_returns400() throws Exception {
        String body = """
                {"title":"T","description":"D","type":"BLOCKLY","difficulty":"EASY",
                 "config":{"allowedBlocks":[],"initialWorkspaceXml":"<xml></xml>","showCodeView":false,
                           "gradingRules":{"outputMatch":{"enabled":false,"expectedOutput":""},
                           "requiredBlocks":{"enabled":false,"blocks":[]},
                           "forbiddenBlocks":{"enabled":false,"blocks":[]},
                           "blockCountLimit":{"enabled":false,"max":null}}}}
                """;
        mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getExercise_exists_returns200() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();

        mockMvc.perform(get("/v1/exercises/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.currentVersion").isNotEmpty());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getExercise_notFound_returns404() throws Exception {
        mockMvc.perform(get("/v1/exercises/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("EXERCISE_NOT_FOUND"));
    }

    // ── Update ────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void updateExercise_createsNewVersion() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();

        String updateBody = """
                {
                  "title": "FizzBuzz Updated",
                  "description": "Updated desc",
                  "difficulty": "HARD",
                  "config": {
                    "starterCode": "def fizzbuzz(n):\\n    return str(n)",
                    "timeLimitSeconds": 10,
                    "testCases": [{"input": "fizzbuzz(3)", "expectedOutput": "\\"Fizz\\"", "visible": true}]
                  }
                }
                """;

        mockMvc.perform(put("/v1/exercises/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("FizzBuzz Updated"))
                .andExpect(jsonPath("$.currentVersion.versionNumber").value(2));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void updateExercise_setsAndClearsDeadline() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();

        String updateWithDeadline = """
                {"title":"FizzBuzz","description":"desc","difficulty":"MEDIUM",
                 "deadline":"2026-08-01T10:00:00",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(put("/v1/exercises/" + id)
                        .contentType(MediaType.APPLICATION_JSON).content(updateWithDeadline))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deadline").value("2026-08-01T10:00:00"));

        String updateClearingDeadline = """
                {"title":"FizzBuzz","description":"desc","difficulty":"MEDIUM",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(put("/v1/exercises/" + id)
                        .contentType(MediaType.APPLICATION_JSON).content(updateClearingDeadline))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deadline").value(org.hamcrest.Matchers.nullValue()));
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteExercise_softDeletes_thenReturns404() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();

        mockMvc.perform(delete("/v1/exercises/" + id)).andExpect(status().isNoContent());
        mockMvc.perform(get("/v1/exercises/" + id)).andExpect(status().isNotFound());
    }

    // ── Publish / Unpublish ───────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void publish_draftExercise_returnsPublished() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();

        mockMvc.perform(patch("/v1/exercises/" + id + "/publish"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void unpublish_publishedExercise_returnsDraft() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();

        mockMvc.perform(patch("/v1/exercises/" + id + "/publish")).andExpect(status().isOk());
        mockMvc.perform(patch("/v1/exercises/" + id + "/unpublish"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void publish_alreadyPublished_isIdempotent() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();

        mockMvc.perform(patch("/v1/exercises/" + id + "/publish")).andExpect(status().isOk());
        mockMvc.perform(patch("/v1/exercises/" + id + "/publish"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PUBLISHED"));
    }

    // ── Version history ───────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listVersions_afterTwoUpdates_returnsThreeVersionsNewestFirst() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();

        String updateBody = """
                {"title":"Updated","description":"desc","difficulty":"EASY",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(put("/v1/exercises/" + id).contentType(MediaType.APPLICATION_JSON).content(updateBody));
        mockMvc.perform(put("/v1/exercises/" + id).contentType(MediaType.APPLICATION_JSON).content(updateBody));

        mockMvc.perform(get("/v1/exercises/" + id + "/versions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].versionNumber").value(3))
                .andExpect(jsonPath("$[0].isCurrent").value(true))
                .andExpect(jsonPath("$[2].versionNumber").value(1));
    }

    // ── Rollback ──────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void rollback_toVersion1_succeeds() throws Exception {
        String createResult = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.id")).longValue();
        Long v1Id = ((Number) com.jayway.jsonpath.JsonPath.read(createResult, "$.currentVersion.id")).longValue();

        String updateBody = """
                {"title":"Updated","description":"desc","difficulty":"EASY",
                 "config":{"starterCode":"pass","timeLimitSeconds":5,
                           "testCases":[{"input":"","expectedOutput":"","visible":true}]}}
                """;
        mockMvc.perform(put("/v1/exercises/" + id).contentType(MediaType.APPLICATION_JSON).content(updateBody));

        mockMvc.perform(post("/v1/exercises/" + id + "/rollback")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"versionId\":" + v1Id + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currentVersionNumber").value(1))
                .andExpect(jsonPath("$.message").value(containsString("version 1")));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void rollback_wrongExerciseVersionId_returns400() throws Exception {
        String r1 = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long ex1Id = ((Number) com.jayway.jsonpath.JsonPath.read(r1, "$.id")).longValue();

        String r2 = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long v2Id = ((Number) com.jayway.jsonpath.JsonPath.read(r2, "$.currentVersion.id")).longValue();

        mockMvc.perform(post("/v1/exercises/" + ex1Id + "/rollback")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"versionId\":" + v2Id + "}"))
                .andExpect(status().isBadRequest());
    }

    // ── List with filters ─────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listExercises_filterByType_returnsOnlyMatching() throws Exception {
        mockMvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(pythonBody()));
        mockMvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(BLOCKLY_BODY));

        mockMvc.perform(get("/v1/exercises?type=PYTHON"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].type").value("PYTHON"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listExercises_filterByStatus_returnsOnlyPublished() throws Exception {
        String r = mockMvc.perform(post("/v1/exercises")
                        .contentType(MediaType.APPLICATION_JSON).content(pythonBody()))
                .andReturn().getResponse().getContentAsString();
        Long id = ((Number) com.jayway.jsonpath.JsonPath.read(r, "$.id")).longValue();
        mockMvc.perform(patch("/v1/exercises/" + id + "/publish"));

        mockMvc.perform(post("/v1/exercises").contentType(MediaType.APPLICATION_JSON).content(BLOCKLY_BODY));

        mockMvc.perform(get("/v1/exercises?status=PUBLISHED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].status").value("PUBLISHED"));
    }
}
