package com.platform.exercise.student;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.repository.CategoryRepository;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.settings.SettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class StudentExerciseService {

    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final CategoryRepository categoryRepository;
    private final SettingsService settingsService;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public PageResponse<StudentExerciseListDto> listExercises(
            String type, Long categoryId, String difficulty, int page, int size, Long userId) {
        PageRequest pageable = PageRequest.of(page, size);
        boolean filterEnabled = settingsService.getSettings().courseFilterEnabled();
        Page<StudentExerciseListDto> result = filterEnabled
                ? exerciseRepository.findPublishedFilteredForStudent(
                        type, categoryId, difficulty, userId, pageable)
                        .map(StudentExerciseListDto::from)
                : exerciseRepository.findPublishedFiltered(
                        type, categoryId, difficulty, pageable)
                        .map(StudentExerciseListDto::from);
        return PageResponse.of(result);
    }

    @Transactional(readOnly = true)
    public StudentExerciseDetailDto getExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .filter(e -> e.getStatus() == Exercise.Status.PUBLISHED)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toDetailDto(exercise, version);
    }

    private StudentExerciseDetailDto toDetailDto(Exercise exercise, ExerciseVersion version) {
        try {
            List<String> hints = version.getHints() != null
                    ? objectMapper.readValue(version.getHints(), new TypeReference<>() {})
                    : List.of();
            JsonNode rawConfig = objectMapper.readTree(version.getConfig());
            JsonNode strippedConfig = stripConfig(exercise.getType().name(), rawConfig);

            StudentExerciseDetailDto.CategoryRef cat = null;
            if (exercise.getCategoryId() != null) {
                cat = categoryRepository.findById(exercise.getCategoryId())
                        .map(c -> new StudentExerciseDetailDto.CategoryRef(c.getId(), c.getName()))
                        .orElse(null);
            }

            StudentVersionDto versionDto = new StudentVersionDto(
                    version.getId(), version.getVersionNumber(),
                    version.getDescription(), hints, strippedConfig);

            return new StudentExerciseDetailDto(
                    exercise.getId(), exercise.getTitle(),
                    exercise.getType().name(), exercise.getDifficulty().name(),
                    cat, versionDto, exercise.getLikeCount(), false);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to parse version config", e);
        }
    }

    private JsonNode stripConfig(String type, JsonNode config) {
        ObjectNode stripped = (ObjectNode) config.deepCopy();
        stripped.remove("gradingRules");
        if ("PYTHON".equals(type)) {
            JsonNode testCases = stripped.get("testCases");
            ArrayNode visible = objectMapper.createArrayNode();
            if (testCases != null && testCases.isArray()) {
                for (JsonNode tc : testCases) {
                    if (tc.path("visible").asBoolean(true)) {
                        ObjectNode clean = (ObjectNode) tc.deepCopy();
                        clean.remove("visible");
                        visible.add(clean);
                    }
                }
            }
            stripped.remove("testCases");
            stripped.set("visibleTestCases", visible);
        }
        return stripped;
    }
}
