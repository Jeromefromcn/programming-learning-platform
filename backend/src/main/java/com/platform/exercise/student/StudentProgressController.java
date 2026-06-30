package com.platform.exercise.student;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/student/progress")
@RequiredArgsConstructor
@PreAuthorize("hasRole('STUDENT')")
public class StudentProgressController {

    private final StudentProgressService studentProgressService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<StudentProgressDto> getProgress(
            Authentication authentication,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        User user = (authentication.getPrincipal() instanceof User u) ? u
                : userRepository.findByUsername(authentication.getName())
                        .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND));
        return ResponseEntity.ok(studentProgressService.getProgress(user.getId(), page, size));
    }
}
