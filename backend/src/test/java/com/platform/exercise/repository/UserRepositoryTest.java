package com.platform.exercise.repository;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Test
    void save_and_findByUsername() {
        User user = new User();
        user.setUsername("alice01");
        user.setDisplayName("Alice");
        user.setPasswordHash("hashed");
        user.setRole(Role.STUDENT);
        user.setStatus(UserStatus.ACTIVE);
        userRepository.save(user);

        Optional<User> found = userRepository.findByUsername("alice01");
        assertThat(found).isPresent();
        assertThat(found.get().getRole()).isEqualTo(Role.STUDENT);
    }

    @Test
    void existsByUsername_returnsTrueForExisting() {
        User user = new User();
        user.setUsername("bob02");
        user.setDisplayName("Bob");
        user.setPasswordHash("hashed");
        user.setRole(Role.TUTOR);
        user.setStatus(UserStatus.ACTIVE);
        userRepository.save(user);

        assertThat(userRepository.existsByUsername("bob02")).isTrue();
        assertThat(userRepository.existsByUsername("nobody")).isFalse();
    }
}
