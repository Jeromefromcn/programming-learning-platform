package com.platform.exercise.exercise;

import com.fasterxml.jackson.databind.JsonNode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/exercises")
@RequiredArgsConstructor
@PreAuthorize("hasRole('TUTOR')")
public class ExerciseController {

    private final ExerciseService exerciseService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<PageResponse<ExerciseListItemDto>> list(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String difficulty,
            @RequestParam(required = false) String title,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(
                exerciseService.listExercises(type, status, categoryId, difficulty, title, page, size));
    }

    @PostMapping
    public ResponseEntity<ExerciseDetailDto> create(
            @Valid @RequestBody CreateExerciseRequest req,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.status(HttpStatus.CREATED).body(exerciseService.createExercise(req, userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ExerciseDetailDto> get(@PathVariable Long id) {
        return ResponseEntity.ok(exerciseService.getExercise(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ExerciseDetailDto> update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateExerciseRequest req) {
        return ResponseEntity.ok(exerciseService.updateExercise(id, req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        exerciseService.deleteExercise(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/publish")
    public ResponseEntity<ExerciseDetailDto> publish(@PathVariable Long id) {
        return ResponseEntity.ok(exerciseService.publishExercise(id));
    }

    @PatchMapping("/{id}/unpublish")
    public ResponseEntity<ExerciseDetailDto> unpublish(@PathVariable Long id) {
        return ResponseEntity.ok(exerciseService.unpublishExercise(id));
    }

    @GetMapping("/{id}/versions")
    public ResponseEntity<List<ExerciseVersionDto>> listVersions(@PathVariable Long id) {
        return ResponseEntity.ok(exerciseService.listVersions(id));
    }

    @GetMapping("/{id}/versions/{versionId}")
    public ResponseEntity<ExerciseVersionDto> getVersion(
            @PathVariable Long id,
            @PathVariable Long versionId) {
        return ResponseEntity.ok(exerciseService.getVersion(id, versionId));
    }

    @PostMapping("/{id}/rollback")
    public ResponseEntity<RollbackResponse> rollback(
            @PathVariable Long id,
            @Valid @RequestBody RollbackRequest req) {
        return ResponseEntity.ok(exerciseService.rollbackExercise(id, req));
    }

    @PostMapping("/verify")
    public ResponseEntity<JsonNode> verify(@Valid @RequestBody VerifyRequest req) {
        return ResponseEntity.ok(exerciseService.verifyTestCases(req));
    }

    private Long resolveUserId(Authentication auth) {
        if (auth.getPrincipal() instanceof User user) return user.getId();
        return userRepository.findByUsername(auth.getName()).map(User::getId).orElse(null);
    }
}
