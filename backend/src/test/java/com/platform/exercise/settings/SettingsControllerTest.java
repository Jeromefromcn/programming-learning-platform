package com.platform.exercise.settings;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SettingsControllerTest {

    @Autowired private MockMvc mockMvc;

    @Test
    @WithMockUser(username = "admin", roles = "SUPER_ADMIN")
    void getSettings_asAdmin_returns200() throws Exception {
        mockMvc.perform(get("/v1/settings"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.courseFilterEnabled").isBoolean());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getSettings_asTutor_returns200() throws Exception {
        mockMvc.perform(get("/v1/settings"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.courseFilterEnabled").isBoolean());
    }

    @Test
    @WithMockUser(username = "admin", roles = "SUPER_ADMIN")
    void putCourseFilter_asAdmin_returns200AndToggles() throws Exception {
        mockMvc.perform(put("/v1/settings/course-filter")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.courseFilterEnabled").value(true));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void putCourseFilter_asTutor_returns403() throws Exception {
        mockMvc.perform(put("/v1/settings/course-filter")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"enabled\":true}"))
            .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "admin", roles = "SUPER_ADMIN")
    void getCourseFilterImpact_asAdmin_returns200() throws Exception {
        mockMvc.perform(get("/v1/settings/course-filter/impact"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.currentState").isBoolean())
            .andExpect(jsonPath("$.unenrolledStudentCount").isNumber());
    }
}
