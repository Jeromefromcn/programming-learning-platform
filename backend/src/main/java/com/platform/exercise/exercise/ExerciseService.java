package com.platform.exercise.exercise;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.Exercise.ExerciseType;
import com.platform.exercise.domain.Exercise.Status;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ExerciseService {

    private final ExerciseRepository exerciseRepository;
    private final ExerciseVersionRepository versionRepository;
    private final ObjectMapper objectMapper;
    private final SandboxClient sandboxClient;

    // ── List ─────────────────────────────────────────────────────────────────

    public PageResponse<ExerciseListItemDto> listExercises(
            String type, String status, Long categoryId, String difficulty,
            String title, int page, int size) {
        Page<ExerciseListItemDto> result = exerciseRepository
                .findAllFiltered(type, status, categoryId, difficulty,
                        (title != null && title.isBlank()) ? null : title,
                        PageRequest.of(page, size))
                .map(ExerciseListItemDto::from);
        return PageResponse.of(result);
    }

    // ── Create ───────────────────────────────────────────────────────────────

    @Transactional
    public ExerciseDetailDto createExercise(CreateExerciseRequest req, Long userId) {
        validateConfig(req.type(), req.config());

        Exercise exercise = new Exercise();
        exercise.setTitle(req.title());
        exercise.setDescription(req.description());
        exercise.setType(req.type());
        exercise.setDifficulty(req.difficulty());
        exercise.setCategoryId(req.categoryId());
        exercise.setCreatedBy(userId);
        Exercise saved = exerciseRepository.save(exercise);

        ExerciseVersion version = buildVersion(saved.getId(), 1, req.title(),
                req.description(), req.difficulty().name(),
                req.hints(), req.config());
        ExerciseVersion savedVersion = versionRepository.save(version);

        saved.setCurrentVersionId(savedVersion.getId());
        exerciseRepository.save(saved);

        return toDetailDto(saved, savedVersion);
    }

    // ── Get ──────────────────────────────────────────────────────────────────

    public ExerciseDetailDto getExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toDetailDto(exercise, version);
    }

    // ── Update (creates new version) ─────────────────────────────────────────

    @Transactional
    public ExerciseDetailDto updateExercise(Long id, UpdateExerciseRequest req) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        validateConfig(exercise.getType(), req.config());

        int nextVersion = versionRepository.findMaxVersionNumber(id).orElse(0) + 1;

        ExerciseVersion version = buildVersion(id, nextVersion, req.title(),
                req.description(), req.difficulty().name(),
                req.hints(), req.config());
        ExerciseVersion savedVersion = versionRepository.save(version);

        exercise.setTitle(req.title());
        exercise.setDescription(req.description());
        exercise.setDifficulty(req.difficulty());
        exercise.setCategoryId(req.categoryId());
        exercise.setCurrentVersionId(savedVersion.getId());
        exerciseRepository.save(exercise);

        return toDetailDto(exercise, savedVersion);
    }

    // ── Delete (soft) ────────────────────────────────────────────────────────

    @Transactional
    public void deleteExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        exercise.setDeleted(true);
        exerciseRepository.save(exercise);
    }

    // ── Publish / Unpublish ───────────────────────────────────────────────────

    @Transactional
    public ExerciseDetailDto publishExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        exercise.setStatus(Status.PUBLISHED);
        exerciseRepository.save(exercise);
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toDetailDto(exercise, version);
    }

    @Transactional
    public ExerciseDetailDto unpublishExercise(Long id) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(id)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        exercise.setStatus(Status.DRAFT);
        exerciseRepository.save(exercise);
        ExerciseVersion version = versionRepository.findById(exercise.getCurrentVersionId())
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toDetailDto(exercise, version);
    }

    // ── Version History ───────────────────────────────────────────────────────

    public List<ExerciseVersionDto> listVersions(Long exerciseId) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return versionRepository.findByExerciseIdOrderByVersionNumberDesc(exerciseId)
                .stream()
                .map(v -> toVersionDto(v, v.getId().equals(exercise.getCurrentVersionId())))
                .toList();
    }

    public ExerciseVersionDto getVersion(Long exerciseId, Long versionId) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        ExerciseVersion version = versionRepository.findByIdAndExerciseId(versionId, exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        return toVersionDto(version, version.getId().equals(exercise.getCurrentVersionId()));
    }

    // ── Rollback ──────────────────────────────────────────────────────────────

    @Transactional
    public RollbackResponse rollbackExercise(Long exerciseId, RollbackRequest req) {
        Exercise exercise = exerciseRepository.findByIdAndDeletedFalse(exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.EXERCISE_NOT_FOUND));
        ExerciseVersion targetVersion = versionRepository
                .findByIdAndExerciseId(req.versionId(), exerciseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.VALIDATION_ERROR,
                        "Version does not belong to this exercise"));
        exercise.setCurrentVersionId(targetVersion.getId());
        exerciseRepository.save(exercise);
        return new RollbackResponse(
                "Exercise rolled back to version " + targetVersion.getVersionNumber() + ".",
                targetVersion.getVersionNumber());
    }

    // ── Verify Test Cases ─────────────────────────────────────────────────────

    public JsonNode verifyTestCases(VerifyRequest req) {
        return sandboxClient.execute(req.starterCode(), req.testCases(), req.timeLimitSeconds());
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void validateConfig(ExerciseType type, JsonNode config) {
        if (type == ExerciseType.BLOCKLY) {
            JsonNode blocks = config.get("allowedBlocks");
            if (blocks == null || !blocks.isArray() || blocks.isEmpty()) {
                throw new PlatformException(ErrorCode.VALIDATION_ERROR,
                        "Blockly exercises must have at least one allowed block");
            }
        } else if (type == ExerciseType.PYTHON) {
            JsonNode testCases = config.get("testCases");
            if (testCases == null || !testCases.isArray() || testCases.isEmpty()) {
                throw new PlatformException(ErrorCode.VALIDATION_ERROR,
                        "Python exercises must have at least one test case");
            }
        }
    }

    private ExerciseVersion buildVersion(Long exerciseId, int versionNumber,
                                          String title, String description,
                                          String difficulty, List<String> hints,
                                          JsonNode config) {
        ExerciseVersion v = new ExerciseVersion();
        v.setExerciseId(exerciseId);
        v.setVersionNumber(versionNumber);
        v.setTitle(title);
        v.setDescription(description);
        v.setDifficulty(difficulty);
        try {
            v.setHints(hints != null ? objectMapper.writeValueAsString(hints) : "[]");
            v.setConfig(objectMapper.writeValueAsString(config));
        } catch (JsonProcessingException e) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "Invalid JSON config");
        }
        return v;
    }

    private ExerciseDetailDto toDetailDto(Exercise exercise, ExerciseVersion version) {
        return new ExerciseDetailDto(
                exercise.getId(),
                exercise.getTitle(),
                exercise.getType().name(),
                exercise.getStatus().name(),
                toVersionDto(version, true));
    }

    private ExerciseVersionDto toVersionDto(ExerciseVersion v, boolean isCurrent) {
        try {
            List<String> hints = v.getHints() != null
                    ? objectMapper.readValue(v.getHints(), new TypeReference<>() {})
                    : List.of();
            JsonNode config = objectMapper.readTree(v.getConfig());
            return new ExerciseVersionDto(v.getId(), v.getVersionNumber(), v.getTitle(),
                    v.getDescription(), v.getDifficulty(), hints, config, v.getCreatedAt(), isCurrent);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to parse version config", e);
        }
    }
}
