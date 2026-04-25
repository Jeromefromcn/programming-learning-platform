package com.platform.exercise.user;

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

@RestController
@RequestMapping("/v1/users")
@RequiredArgsConstructor
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class UserController {

    private final UserService userService;
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<PageResponse<UserDto>> listUsers(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(userService.listUsers(page, size, role, status));
    }

    @PostMapping
    public ResponseEntity<UserDto> createUser(@Valid @RequestBody CreateUserRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.createUser(req));
    }

    @PatchMapping("/{id}/role")
    public ResponseEntity<UserDto> updateRole(
            @PathVariable Long id,
            @Valid @RequestBody UpdateRoleRequest req) {
        return ResponseEntity.ok(userService.updateRole(id, req));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<UserDto> updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateStatusRequest req,
            Authentication authentication) {
        Long currentUserId = resolveCurrentUserId(authentication);
        return ResponseEntity.ok(userService.updateStatus(id, req, currentUserId));
    }

    private Long resolveCurrentUserId(Authentication authentication) {
        Object principal = authentication.getPrincipal();
        if (principal instanceof User user) {
            return user.getId();
        }
        // @WithMockUser in tests provides a UserDetails with username only
        String username = authentication.getName();
        return userRepository.findByUsername(username)
            .map(User::getId)
            .orElse(null);
    }
}
