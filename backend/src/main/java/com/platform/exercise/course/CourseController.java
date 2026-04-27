package com.platform.exercise.course;

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
@RequestMapping("/v1/courses")
@RequiredArgsConstructor
@PreAuthorize("hasRole('TUTOR')")
public class CourseController {

    private final CourseService courseService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<PageResponse<CourseDto>> listCourses(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(courseService.listCourses(userId, page, size));
    }

    @PostMapping
    public ResponseEntity<CourseDto> createCourse(
            @Valid @RequestBody CreateCourseRequest req,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.status(HttpStatus.CREATED).body(courseService.createCourse(req, userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CourseDto> getCourse(
            @PathVariable Long id,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(courseService.getCourse(id, userId));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CourseDto> updateCourse(
            @PathVariable Long id,
            @Valid @RequestBody UpdateCourseRequest req,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(courseService.updateCourse(id, req, userId));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCourse(
            @PathVariable Long id,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        courseService.deleteCourse(id, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/exercises")
    public ResponseEntity<List<ExerciseSummaryDto>> listExercises(
            @PathVariable Long id,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(courseService.listExercises(id, userId));
    }

    @PostMapping("/{id}/exercises")
    public ResponseEntity<LinkedResult> addExercises(
            @PathVariable Long id,
            @Valid @RequestBody AddExercisesRequest req,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(courseService.addExercises(id, req, userId));
    }

    @DeleteMapping("/{id}/exercises/{exerciseId}")
    public ResponseEntity<Void> removeExercise(
            @PathVariable Long id,
            @PathVariable Long exerciseId,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        courseService.removeExercise(id, exerciseId, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/students")
    public ResponseEntity<List<UserSummaryDto>> listStudents(
            @PathVariable Long id,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(courseService.listStudents(id, userId));
    }

    @PostMapping("/{id}/students")
    public ResponseEntity<EnrollResult> enrollStudents(
            @PathVariable Long id,
            @Valid @RequestBody EnrollStudentsRequest req,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(courseService.enrollStudents(id, req, userId));
    }

    @DeleteMapping("/{id}/students/{studentId}")
    public ResponseEntity<Void> removeStudent(
            @PathVariable Long id,
            @PathVariable Long studentId,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        courseService.removeStudent(id, studentId, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/students/available")
    public ResponseEntity<List<UserSummaryDto>> searchAvailableStudents(
            @PathVariable Long id,
            @RequestParam(required = false) String q,
            Authentication authentication) {
        Long userId = resolveUserId(authentication);
        return ResponseEntity.ok(courseService.searchAvailableStudents(id, q, userId));
    }

    private Long resolveUserId(Authentication auth) {
        if (auth.getPrincipal() instanceof User user) return user.getId();
        return userRepository.findByUsername(auth.getName()).map(User::getId).orElse(null);
    }
}
