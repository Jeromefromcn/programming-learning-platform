package com.platform.exercise.student;

import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/student/exercises/{exerciseId}")
@RequiredArgsConstructor
@PreAuthorize("hasRole('STUDENT')")
public class StudentSubmissionController {

    private final StudentDraftService draftService;
    private final StudentSubmissionService submissionService;
    private final UserRepository userRepository;

    @GetMapping("/draft")
    public ResponseEntity<DraftDto> getDraft(@PathVariable Long exerciseId,
                                             Authentication authentication) {
        DraftDto draft = draftService.getDraft(currentUser(authentication).getId(), exerciseId);
        return draft == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(draft);
    }

    @PutMapping("/draft")
    public ResponseEntity<DraftDto> saveDraft(@PathVariable Long exerciseId,
                                              @RequestBody SaveDraftRequest req,
                                              Authentication authentication) {
        return ResponseEntity.ok(
            draftService.saveDraft(currentUser(authentication).getId(), exerciseId, req));
    }

    @PostMapping("/submissions")
    public ResponseEntity<SubmitResultDto> submit(@PathVariable Long exerciseId,
                                                  @RequestBody @Valid SubmitRequest req,
                                                  Authentication authentication) {
        User user = currentUser(authentication);
        String studentName = user.getDisplayName() != null && !user.getDisplayName().isBlank()
            ? user.getDisplayName() : user.getUsername();
        return ResponseEntity.ok(
            submissionService.submit(user.getId(), studentName, exerciseId, req));
    }

    @GetMapping("/submissions")
    public ResponseEntity<List<SubmissionHistoryItemDto>> history(@PathVariable Long exerciseId,
                                                                  Authentication authentication) {
        return ResponseEntity.ok(
            submissionService.history(currentUser(authentication).getId(), exerciseId));
    }

    private User currentUser(Authentication authentication) {
        if (authentication.getPrincipal() instanceof User user) return user;
        return userRepository.findByUsername(authentication.getName())
            .orElseThrow(() -> new IllegalStateException("Authenticated user not found"));
    }
}
