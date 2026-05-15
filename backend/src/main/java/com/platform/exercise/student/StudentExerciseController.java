package com.platform.exercise.student;

import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/student/exercises")
@RequiredArgsConstructor
@PreAuthorize("hasRole('STUDENT')")
public class StudentExerciseController {

    private final StudentExerciseService studentExerciseService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<PageResponse<StudentExerciseListDto>> list(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String difficulty,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(
                studentExerciseService.listExercises(type, categoryId, difficulty, page, size, userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<StudentExerciseDetailDto> get(@PathVariable Long id) {
        return ResponseEntity.ok(studentExerciseService.getExercise(id));
    }

    private Long resolveUserId(Authentication authentication) {
        if (authentication.getPrincipal() instanceof User user) return user.getId();
        return userRepository.findByUsername(authentication.getName())
                .map(User::getId)
                .orElse(null);
    }
}
