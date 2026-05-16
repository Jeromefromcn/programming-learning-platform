package com.platform.exercise.user;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.RefreshTokenRepository;
import com.platform.exercise.repository.UserRepository;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public PageResponse<UserDto> listUsers(int page, int size, String role, String status) {
        Specification<User> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (role != null && !role.isBlank()) {
                predicates.add(cb.equal(root.get("role"), Role.valueOf(role)));
            }
            if (status != null && !status.isBlank()) {
                predicates.add(cb.equal(root.get("status"), UserStatus.valueOf(status)));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        var pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return PageResponse.of(userRepository.findAll(spec, pageable).map(UserDto::from));
    }

    @Transactional
    public UserDto createUser(CreateUserRequest req) {
        if (userRepository.existsByUsername(req.username())) {
            throw new PlatformException(ErrorCode.USERNAME_TAKEN);
        }
        User user = new User();
        user.setUsername(req.username());
        user.setDisplayName(req.displayName());
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setRole(Role.valueOf(req.role()));
        user.setStatus(UserStatus.ACTIVE);
        return UserDto.from(userRepository.save(user));
    }

    @Transactional
    public ImportUsersResult importUsers(ImportUsersRequest req) {
        List<ImportRowError> errors = new ArrayList<>();
        Set<String> seenUsernames = new HashSet<>();
        int rowNum = 2; // Excel row 1 = header, row 2 = first data row
        for (CreateUserRequest r : req.users()) {
            if (r.username() == null || r.username().isBlank()) {
                errors.add(new ImportRowError(rowNum, "username", "must not be blank"));
            } else if (r.username().length() < 3) {
                errors.add(new ImportRowError(rowNum, "username", "min 3 characters"));
            } else if (r.username().length() > 64) {
                errors.add(new ImportRowError(rowNum, "username", "max 64 characters"));
            } else if (!seenUsernames.add(r.username())) {
                errors.add(new ImportRowError(rowNum, "username", "duplicate within this file"));
            } else if (userRepository.existsByUsername(r.username())) {
                errors.add(new ImportRowError(rowNum, "username", "already taken"));
            }
            if (r.displayName() == null || r.displayName().isBlank()) {
                errors.add(new ImportRowError(rowNum, "displayName", "must not be blank"));
            } else if (r.displayName().length() > 128) {
                errors.add(new ImportRowError(rowNum, "displayName", "max 128 characters"));
            }
            if (r.password() == null || r.password().isBlank()) {
                errors.add(new ImportRowError(rowNum, "password", "must not be blank"));
            } else if (r.password().length() < 8) {
                errors.add(new ImportRowError(rowNum, "password", "min 8 characters"));
            }
            if (r.role() == null || r.role().isBlank()) {
                errors.add(new ImportRowError(rowNum, "role", "must not be blank"));
            } else {
                try {
                    Role.valueOf(r.role());
                } catch (IllegalArgumentException e) {
                    errors.add(new ImportRowError(rowNum, "role", "must be STUDENT, TUTOR, or SUPER_ADMIN"));
                }
            }
            rowNum++;
        }
        if (!errors.isEmpty()) {
            throw new ImportValidationException(errors);
        }
        for (CreateUserRequest r : req.users()) {
            User user = new User();
            user.setUsername(r.username());
            user.setDisplayName(r.displayName());
            user.setPasswordHash(passwordEncoder.encode(r.password()));
            user.setRole(Role.valueOf(r.role()));
            user.setStatus(UserStatus.ACTIVE);
            userRepository.save(user);
        }
        return new ImportUsersResult(req.users().size());
    }

    @Transactional
    public UserDto updateRole(Long id, UpdateRoleRequest req) {
        User user = userRepository.findById(id)
            .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND));
        user.setRole(Role.valueOf(req.role()));
        return UserDto.from(userRepository.save(user));
    }

    @Transactional
    public UserDto updateStatus(Long id, UpdateStatusRequest req, Long currentUserId) {
        if (id.equals(currentUserId)) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "Cannot change your own status");
        }
        User user = userRepository.findById(id)
            .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND));
        UserStatus newStatus = UserStatus.valueOf(req.status());
        user.setStatus(newStatus);
        userRepository.save(user);
        if (newStatus == UserStatus.DISABLED) {
            refreshTokenRepository.deleteByUserId(id);
        }
        return UserDto.from(user);
    }
}
