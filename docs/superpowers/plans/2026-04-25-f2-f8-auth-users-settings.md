# F-2 + F-8 Implementation Plan (Auth, User Management, Global Settings)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement JWT-based login/logout (F-2.1), SUPER_ADMIN user management (F-2.2), and global course-filter settings (F-8) — backend-first (all REST endpoints + H2 tests), then React frontend.

**Architecture:** Backend: Spring Security + JwtFilter validates Bearer tokens on every request; per-request DB status check enables instant user disable. Refresh tokens stored as SHA-256 hashes in `refresh_tokens` table, raw value in HttpOnly cookie. Settings cached 30 s via Caffeine; F-8 impact assessment is stubbed (returns empty list) until F-3.2 adds enrollment data. Frontend: React Context holds access token in JS memory only; Axios interceptor retries on 401 with silent refresh.

**Tech Stack:** Spring Boot 3.2.5 · JJWT 0.12.6 · Bucket4j 8.7.0 · Caffeine · Spring Security role hierarchy · React 18 · Vite 5 · Axios · Vitest + React Testing Library

---

## File Map

**Create (backend):**
- `backend/src/main/java/com/platform/exercise/domain/User.java`
- `backend/src/main/java/com/platform/exercise/domain/RefreshToken.java`
- `backend/src/main/java/com/platform/exercise/domain/GlobalSetting.java`
- `backend/src/main/java/com/platform/exercise/repository/UserRepository.java`
- `backend/src/main/java/com/platform/exercise/repository/RefreshTokenRepository.java`
- `backend/src/main/java/com/platform/exercise/repository/GlobalSettingRepository.java`
- `backend/src/main/java/com/platform/exercise/security/JwtUtil.java`
- `backend/src/main/java/com/platform/exercise/security/JwtFilter.java`
- `backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java`
- `backend/src/main/java/com/platform/exercise/auth/LoginRequest.java`
- `backend/src/main/java/com/platform/exercise/auth/AuthResponse.java`
- `backend/src/main/java/com/platform/exercise/auth/AuthController.java`
- `backend/src/main/java/com/platform/exercise/auth/AuthService.java`
- `backend/src/main/java/com/platform/exercise/auth/RefreshTokenCleanupJob.java`
- `backend/src/main/java/com/platform/exercise/user/UserDto.java`
- `backend/src/main/java/com/platform/exercise/user/CreateUserRequest.java`
- `backend/src/main/java/com/platform/exercise/user/UpdateRoleRequest.java`
- `backend/src/main/java/com/platform/exercise/user/UpdateStatusRequest.java`
- `backend/src/main/java/com/platform/exercise/user/UserController.java`
- `backend/src/main/java/com/platform/exercise/user/UserService.java`
- `backend/src/main/java/com/platform/exercise/settings/CacheConfig.java`
- `backend/src/main/java/com/platform/exercise/settings/SettingsResponse.java`
- `backend/src/main/java/com/platform/exercise/settings/ImpactResponse.java`
- `backend/src/main/java/com/platform/exercise/settings/CourseFilterRequest.java`
- `backend/src/main/java/com/platform/exercise/settings/CourseFilterResponse.java`
- `backend/src/main/java/com/platform/exercise/settings/SettingsController.java`
- `backend/src/main/java/com/platform/exercise/settings/SettingsService.java`

**Modify (backend):**
- `backend/pom.xml` — add Bucket4j, Caffeine, spring-boot-starter-cache
- `backend/src/main/resources/application.yml` — add `app.jwt.*` config
- `backend/src/main/resources/application-test.yml` — add test JWT secret
- `backend/src/main/java/com/platform/exercise/security/SecurityConfig.java` — replace placeholder

**Create (frontend):**
- `frontend/src/contexts/AuthContext.jsx`
- `frontend/src/api/axiosInstance.js`
- `frontend/src/api/authApi.js`
- `frontend/src/components/ProtectedRoute.jsx`
- `frontend/src/pages/student/StudentPage.jsx`
- `frontend/src/pages/tutor/TutorPage.jsx`
- `frontend/src/pages/admin/AdminDashboardPage.jsx`
- `frontend/src/pages/admin/UserManagementPage.jsx`
- `frontend/src/components/admin/CreateUserModal.jsx`
- `frontend/src/pages/admin/GlobalSettingsPage.jsx`

**Modify (frontend):**
- `frontend/package.json` — add vitest, @vitest/ui, @testing-library/react, @testing-library/jest-dom, jsdom
- `frontend/vite.config.js` — add test config
- `frontend/src/App.jsx` — full routing

---

## Task 1: Domain Entities + Repositories

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/domain/User.java`
- Create: `backend/src/main/java/com/platform/exercise/domain/RefreshToken.java`
- Create: `backend/src/main/java/com/platform/exercise/domain/GlobalSetting.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/UserRepository.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/RefreshTokenRepository.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/GlobalSettingRepository.java`
- Test: `backend/src/test/java/com/platform/exercise/repository/UserRepositoryTest.java`

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/platform/exercise/repository/UserRepositoryTest.java
package com.platform.exercise.repository;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && mvn test -pl . -Dtest=UserRepositoryTest -q 2>&1 | tail -20
```
Expected: FAIL — `User` class not found.

- [ ] **Step 3: Create `User.java`**

```java
// backend/src/main/java/com/platform/exercise/domain/User.java
package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Data
@NoArgsConstructor
public class User {

    public enum Role { STUDENT, TUTOR, SUPER_ADMIN }
    public enum UserStatus { ACTIVE, DISABLED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String username;

    @Column(name = "display_name", nullable = false, length = 128)
    private String displayName;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserStatus status = UserStatus.ACTIVE;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
```

- [ ] **Step 4: Create `RefreshToken.java`**

```java
// backend/src/main/java/com/platform/exercise/domain/RefreshToken.java
package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "refresh_tokens")
@Data
@NoArgsConstructor
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token_hash", nullable = false, length = 255)
    private String tokenHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
```

- [ ] **Step 5: Create `GlobalSetting.java`**

```java
// backend/src/main/java/com/platform/exercise/domain/GlobalSetting.java
package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "global_settings")
@Data
@NoArgsConstructor
public class GlobalSetting {

    @Id
    @Column(name = "setting_key", length = 100)
    private String key;

    @Column(name = "setting_value", nullable = false, length = 1000)
    private String value;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
```

- [ ] **Step 6: Create `UserRepository.java`**

```java
// backend/src/main/java/com/platform/exercise/repository/UserRepository.java
package com.platform.exercise.repository;

import com.platform.exercise.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
}
```

- [ ] **Step 7: Create `RefreshTokenRepository.java`**

```java
// backend/src/main/java/com/platform/exercise/repository/RefreshTokenRepository.java
package com.platform.exercise.repository;

import com.platform.exercise.domain.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);
    void deleteByUserId(Long userId);
    void deleteByExpiresAtBefore(LocalDateTime cutoff);
}
```

- [ ] **Step 8: Create `GlobalSettingRepository.java`**

```java
// backend/src/main/java/com/platform/exercise/repository/GlobalSettingRepository.java
package com.platform.exercise.repository;

import com.platform.exercise.domain.GlobalSetting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface GlobalSettingRepository extends JpaRepository<GlobalSetting, String> {
}
```

- [ ] **Step 9: Run test to verify it passes**

```bash
cd backend && mvn test -Dtest=UserRepositoryTest -q 2>&1 | tail -10
```
Expected: BUILD SUCCESS, 2 tests passing.

- [ ] **Step 10: Commit**

```bash
cd backend && git add src/main/java/com/platform/exercise/domain/ src/main/java/com/platform/exercise/repository/ src/test/java/com/platform/exercise/repository/
git commit -m "feat(auth): add User, RefreshToken, GlobalSetting entities and repositories"
```

---

## Task 2: JwtUtil

**Files:**
- Modify: `backend/src/main/resources/application.yml`
- Modify: `backend/src/main/resources/application-test.yml`
- Create: `backend/src/main/java/com/platform/exercise/security/JwtUtil.java`
- Test: `backend/src/test/java/com/platform/exercise/security/JwtUtilTest.java`

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/platform/exercise/security/JwtUtilTest.java
package com.platform.exercise.security;

import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtUtilTest {

    private JwtUtil jwtUtil;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(jwtUtil, "secret",
            "test-secret-min-32-chars-for-testing-only-1234");
        ReflectionTestUtils.setField(jwtUtil, "expiryMinutes", 15L);
        jwtUtil.init();
    }

    @Test
    void generateAndParse_roundTrip() {
        String token = jwtUtil.generateToken(42L, "STUDENT");
        var claims = jwtUtil.parseToken(token);
        assertThat(claims.getSubject()).isEqualTo("42");
        assertThat(claims.get("role", String.class)).isEqualTo("STUDENT");
    }

    @Test
    void isTokenValid_returnsFalseForTamperedToken() {
        String token = jwtUtil.generateToken(1L, "STUDENT");
        assertThat(jwtUtil.isTokenValid(token + "tampered")).isFalse();
    }

    @Test
    void init_throwsWhenSecretIsPlaceholder() {
        JwtUtil bad = new JwtUtil();
        ReflectionTestUtils.setField(bad, "secret",
            "CHANGE_ME_IN_PRODUCTION_USE_A_LONG_RANDOM_STRING");
        ReflectionTestUtils.setField(bad, "expiryMinutes", 15L);
        assertThatThrownBy(bad::init).isInstanceOf(IllegalStateException.class);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && mvn test -Dtest=JwtUtilTest -q 2>&1 | tail -10
```
Expected: FAIL — `JwtUtil` not found.

- [ ] **Step 3: Add JWT config to `application.yml`**

Add under the existing content (after the `logging:` block):

```yaml
app:
  jwt:
    secret: ${JWT_SECRET:CHANGE_ME_IN_PRODUCTION_USE_A_LONG_RANDOM_STRING}
    expiry-minutes: 15
```

- [ ] **Step 4: Add test JWT secret to `application-test.yml`**

Add at the end of the file:

```yaml
app:
  jwt:
    secret: test-secret-min-32-chars-for-testing-only-1234
    expiry-minutes: 15
```

- [ ] **Step 5: Create `JwtUtil.java`**

```java
// backend/src/main/java/com/platform/exercise/security/JwtUtil.java
package com.platform.exercise.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

@Component
@Setter
public class JwtUtil {

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expiry-minutes:15}")
    private long expiryMinutes;

    private SecretKey signingKey;

    @PostConstruct
    public void init() {
        if ("CHANGE_ME_IN_PRODUCTION_USE_A_LONG_RANDOM_STRING".equals(secret)) {
            throw new IllegalStateException(
                "JWT_SECRET is set to the placeholder value. Set JWT_SECRET env var before starting.");
        }
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(Long userId, String role) {
        return Jwts.builder()
            .subject(String.valueOf(userId))
            .claim("role", role)
            .id(UUID.randomUUID().toString())
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + expiryMinutes * 60_000))
            .signWith(signingKey, Jwts.SIG.HS256)
            .compact();
    }

    public Claims parseToken(String token) {
        return Jwts.parser()
            .verifyWith(signingKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    public boolean isTokenValid(String token) {
        try {
            parseToken(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd backend && mvn test -Dtest=JwtUtilTest -q 2>&1 | tail -10
```
Expected: BUILD SUCCESS, 3 tests passing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/security/JwtUtil.java \
        backend/src/test/java/com/platform/exercise/security/JwtUtilTest.java \
        backend/src/main/resources/application.yml \
        backend/src/main/resources/application-test.yml
git commit -m "feat(auth): add JwtUtil with HS256 token generation and @PostConstruct secret validation"
```

---

## Task 3: JwtFilter + SecurityConfig

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/security/JwtFilter.java`
- Modify: `backend/src/main/java/com/platform/exercise/security/SecurityConfig.java`
- Test: `backend/src/test/java/com/platform/exercise/security/SecurityConfigTest.java`

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/platform/exercise/security/SecurityConfigTest.java
package com.platform.exercise.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void loginEndpoint_isPublic() throws Exception {
        // No auth — should reach the controller (not blocked by security), returning 400 not 401
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isBadRequest()); // validation error, not 401
    }

    @Test
    void protectedEndpoint_withoutToken_returns401() throws Exception {
        mockMvc.perform(get("/v1/users"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void actuator_health_isPublic() throws Exception {
        mockMvc.perform(get("/actuator/health"))
            .andExpect(status().isOk());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && mvn test -Dtest=SecurityConfigTest -q 2>&1 | tail -15
```
Expected: `protectedEndpoint_withoutToken_returns401` fails (currently `permitAll` so returns 404 not 401).

- [ ] **Step 3: Create `JwtFilter.java`**

```java
// backend/src/main/java/com/platform/exercise/security/JwtFilter.java
package com.platform.exercise.security;

import com.platform.exercise.domain.User;
import com.platform.exercise.repository.UserRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
@RequiredArgsConstructor
public class JwtFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            try {
                Claims claims = jwtUtil.parseToken(token);
                Long userId = Long.parseLong(claims.getSubject());
                userRepository.findById(userId).ifPresent(user -> {
                    if (user.getStatus() == User.UserStatus.ACTIVE) {
                        String role = claims.get("role", String.class);
                        var auth = new UsernamePasswordAuthenticationToken(
                            user, null,
                            List.of(new SimpleGrantedAuthority("ROLE_" + role))
                        );
                        auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    }
                });
            } catch (JwtException | IllegalArgumentException ignored) {
                // Invalid token — proceed unauthenticated
            }
        }
        chain.doFilter(request, response);
    }
}
```

- [ ] **Step 4: Replace `SecurityConfig.java`**

```java
// backend/src/main/java/com/platform/exercise/security/SecurityConfig.java
package com.platform.exercise.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
import org.springframework.security.access.expression.method.MethodSecurityExpressionHandler;
import org.springframework.security.access.hierarchicalroles.RoleHierarchy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.time.Instant;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtFilter jwtFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/v1/auth/login", "/v1/auth/refresh").permitAll()
                .requestMatchers("/actuator/**").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((req, res, e) -> {
                    res.setStatus(401);
                    res.setContentType("application/json");
                    res.getWriter().write(
                        "{\"error\":{\"code\":\"INVALID_CREDENTIALS\"," +
                        "\"message\":\"Authentication required\"," +
                        "\"timestamp\":\"" + Instant.now() + "\"}}");
                })
                .accessDeniedHandler((req, res, e) -> {
                    res.setStatus(403);
                    res.setContentType("application/json");
                    res.getWriter().write(
                        "{\"error\":{\"code\":\"ACCESS_DENIED\"," +
                        "\"message\":\"Access denied\"," +
                        "\"timestamp\":\"" + Instant.now() + "\"}}");
                })
            );
        return http.build();
    }

    @Bean
    public RoleHierarchy roleHierarchy() {
        RoleHierarchyImpl h = new RoleHierarchyImpl();
        h.setHierarchy("ROLE_SUPER_ADMIN > ROLE_TUTOR > ROLE_STUDENT");
        return h;
    }

    @Bean
    static MethodSecurityExpressionHandler methodSecurityExpressionHandler(RoleHierarchy rh) {
        DefaultMethodSecurityExpressionHandler h = new DefaultMethodSecurityExpressionHandler();
        h.setRoleHierarchy(rh);
        return h;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && mvn test -Dtest=SecurityConfigTest,ActuatorHealthTest -q 2>&1 | tail -10
```
Expected: BUILD SUCCESS, 4 tests passing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/security/ \
        backend/src/test/java/com/platform/exercise/security/SecurityConfigTest.java
git commit -m "feat(auth): add JwtFilter and full SecurityConfig with role hierarchy"
```

---

## Task 4: RateLimitFilter

**Files:**
- Modify: `backend/pom.xml` — add Bucket4j
- Create: `backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java`
- Test: `backend/src/test/java/com/platform/exercise/security/RateLimitFilterTest.java`

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/platform/exercise/security/RateLimitFilterTest.java
package com.platform.exercise.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class RateLimitFilterTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void eleventhLoginRequest_returns429() throws Exception {
        String body = "{\"username\":\"x\",\"password\":\"y\"}";
        // First 10 requests pass through to controller (wrong credentials = 401, not 429)
        for (int i = 0; i < 10; i++) {
            mockMvc.perform(post("/v1/auth/login")
                    .header("X-Forwarded-For", "10.0.0.99")
                    .contentType("application/json")
                    .content(body))
                .andExpect(status().isUnauthorized());
        }
        // 11th is rate-limited
        mockMvc.perform(post("/v1/auth/login")
                .header("X-Forwarded-For", "10.0.0.99")
                .contentType("application/json")
                .content(body))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error.code").value("RATE_LIMITED"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && mvn test -Dtest=RateLimitFilterTest -q 2>&1 | tail -10
```
Expected: FAIL — 11th request is still 401, not 429.

- [ ] **Step 3: Add Bucket4j to `pom.xml`**

Inside the `<dependencies>` section, after the Rhino block:

```xml
<!-- Rate limiting -->
<dependency>
    <groupId>com.bucket4j</groupId>
    <artifactId>bucket4j-core</artifactId>
    <version>8.7.0</version>
</dependency>
```

- [ ] **Step 4: Create `RateLimitFilter.java`**

```java
// backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java
package com.platform.exercise.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Order(1)
public class RateLimitFilter extends OncePerRequestFilter {

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {
        if ("POST".equals(request.getMethod()) && request.getRequestURI().endsWith("/auth/login")) {
            String ip = resolveIp(request);
            Bucket bucket = buckets.computeIfAbsent(ip, k ->
                Bucket.builder()
                    .addLimit(Bandwidth.classic(10, Refill.intervally(10, Duration.ofMinutes(1))))
                    .build()
            );
            if (!bucket.tryConsume(1)) {
                response.setStatus(429);
                response.setContentType("application/json");
                response.getWriter().write(
                    "{\"error\":{\"code\":\"RATE_LIMITED\"," +
                    "\"message\":\"Too many login attempts. Try again in 1 minute.\"," +
                    "\"timestamp\":\"" + Instant.now() + "\"}}");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private String resolveIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && mvn test -Dtest=RateLimitFilterTest -q 2>&1 | tail -10
```
Expected: BUILD SUCCESS, 1 test passing.

- [ ] **Step 6: Commit**

```bash
git add backend/pom.xml \
        backend/src/main/java/com/platform/exercise/security/RateLimitFilter.java \
        backend/src/test/java/com/platform/exercise/security/RateLimitFilterTest.java
git commit -m "feat(auth): add Bucket4j rate limit filter — 10 req/min per IP on /auth/login"
```

---

## Task 5: AuthController + AuthService

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/auth/LoginRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/auth/AuthResponse.java`
- Create: `backend/src/main/java/com/platform/exercise/user/UserDto.java`
- Create: `backend/src/main/java/com/platform/exercise/auth/AuthService.java`
- Create: `backend/src/main/java/com/platform/exercise/auth/AuthController.java`
- Test: `backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java`

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/platform/exercise/auth/AuthControllerTest.java
package com.platform.exercise.auth;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AuthControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;

    @BeforeEach
    void seed() {
        User u = new User();
        u.setUsername("testuser");
        u.setDisplayName("Test User");
        u.setPasswordHash(passwordEncoder.encode("password123"));
        u.setRole(Role.STUDENT);
        u.setStatus(UserStatus.ACTIVE);
        userRepository.save(u);

        User disabled = new User();
        disabled.setUsername("disableduser");
        disabled.setDisplayName("Disabled");
        disabled.setPasswordHash(passwordEncoder.encode("password123"));
        disabled.setRole(Role.STUDENT);
        disabled.setStatus(UserStatus.DISABLED);
        userRepository.save(disabled);
    }

    @Test
    void login_validCredentials_returns200WithToken() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"testuser\",\"password\":\"password123\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").isNotEmpty())
            .andExpect(jsonPath("$.user.username").value("testuser"))
            .andExpect(jsonPath("$.user.role").value("STUDENT"))
            .andExpect(cookie().exists("refreshToken"));
    }

    @Test
    void login_wrongPassword_returns401() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"testuser\",\"password\":\"wrong\"}"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void login_disabledUser_returns403() throws Exception {
        mockMvc.perform(post("/v1/auth/login")
                .contentType("application/json")
                .content("{\"username\":\"disableduser\",\"password\":\"password123\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error.code").value("ACCOUNT_DISABLED"));
    }

    @Test
    void refresh_noToken_returns401() throws Exception {
        mockMvc.perform(post("/v1/auth/refresh"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void logout_returns204() throws Exception {
        mockMvc.perform(post("/v1/auth/logout"))
            .andExpect(status().isNoContent());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && mvn test -Dtest=AuthControllerTest -q 2>&1 | tail -15
```
Expected: FAIL — `AuthController` not found.

- [ ] **Step 3: Create `UserDto.java`**

```java
// backend/src/main/java/com/platform/exercise/user/UserDto.java
package com.platform.exercise.user;

import com.platform.exercise.domain.User;
import java.time.LocalDateTime;

public record UserDto(
    Long id,
    String username,
    String displayName,
    String role,
    String status,
    LocalDateTime createdAt
) {
    public static UserDto from(User user) {
        return new UserDto(
            user.getId(),
            user.getUsername(),
            user.getDisplayName(),
            user.getRole().name(),
            user.getStatus().name(),
            user.getCreatedAt()
        );
    }
}
```

- [ ] **Step 4: Create `LoginRequest.java`**

```java
// backend/src/main/java/com/platform/exercise/auth/LoginRequest.java
package com.platform.exercise.auth;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
    @NotBlank String username,
    @NotBlank String password
) {}
```

- [ ] **Step 5: Create `AuthResponse.java`**

```java
// backend/src/main/java/com/platform/exercise/auth/AuthResponse.java
package com.platform.exercise.auth;

import com.platform.exercise.user.UserDto;

public record AuthResponse(String accessToken, UserDto user) {}
```

- [ ] **Step 6: Create `AuthService.java`**

```java
// backend/src/main/java/com/platform/exercise/auth/AuthService.java
package com.platform.exercise.auth;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.RefreshToken;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.RefreshTokenRepository;
import com.platform.exercise.repository.UserRepository;
import com.platform.exercise.security.JwtUtil;
import com.platform.exercise.user.UserDto;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public AuthResponse login(LoginRequest request, HttpServletResponse response) {
        User user = userRepository.findByUsername(request.username())
            .orElseThrow(() -> new PlatformException(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new PlatformException(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials");
        }

        if (user.getStatus() == User.UserStatus.DISABLED) {
            throw new PlatformException(ErrorCode.ACCOUNT_DISABLED,
                "Account disabled — please contact an administrator");
        }

        String accessToken = jwtUtil.generateToken(user.getId(), user.getRole().name());

        String rawToken = UUID.randomUUID().toString();
        RefreshToken rt = new RefreshToken();
        rt.setUserId(user.getId());
        rt.setTokenHash(sha256(rawToken));
        rt.setExpiresAt(LocalDateTime.now().plusDays(7));
        refreshTokenRepository.save(rt);

        addRefreshCookie(response, rawToken, 7 * 24 * 60 * 60);
        return new AuthResponse(accessToken, UserDto.from(user));
    }

    @Transactional
    public String refresh(String rawToken) {
        String hash = sha256(rawToken);
        RefreshToken rt = refreshTokenRepository.findByTokenHash(hash)
            .orElseThrow(() -> new PlatformException(ErrorCode.TOKEN_EXPIRED, "Refresh token invalid or expired"));

        if (rt.getExpiresAt().isBefore(LocalDateTime.now())) {
            refreshTokenRepository.delete(rt);
            throw new PlatformException(ErrorCode.TOKEN_EXPIRED, "Refresh token expired");
        }

        User user = userRepository.findById(rt.getUserId())
            .orElseThrow(() -> new PlatformException(ErrorCode.TOKEN_EXPIRED, "User not found"));

        return jwtUtil.generateToken(user.getId(), user.getRole().name());
    }

    @Transactional
    public void logout(String rawToken, HttpServletResponse response) {
        if (rawToken != null) {
            refreshTokenRepository.findByTokenHash(sha256(rawToken))
                .ifPresent(refreshTokenRepository::delete);
        }
        addRefreshCookie(response, "", 0);
    }

    private void addRefreshCookie(HttpServletResponse response, String value, int maxAge) {
        Cookie cookie = new Cookie("refreshToken", value);
        cookie.setHttpOnly(true);
        cookie.setSecure(true);
        cookie.setPath("/api/v1/auth");
        cookie.setMaxAge(maxAge);
        response.addCookie(cookie);
    }

    private String sha256(String input) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                .digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 unavailable", e);
        }
    }
}
```

- [ ] **Step 7: Create `AuthController.java`**

```java
// backend/src/main/java/com/platform/exercise/auth/AuthController.java
package com.platform.exercise.auth;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.User;
import com.platform.exercise.user.UserDto;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletResponse response) {
        return ResponseEntity.ok(authService.login(request, response));
    }

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, String>> refresh(
            @CookieValue(name = "refreshToken", required = false) String refreshToken) {
        if (refreshToken == null) {
            throw new PlatformException(ErrorCode.TOKEN_EXPIRED, "No refresh token");
        }
        return ResponseEntity.ok(Map.of("accessToken", authService.refresh(refreshToken)));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = "refreshToken", required = false) String refreshToken,
            HttpServletResponse response) {
        authService.logout(refreshToken, response);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> me(Authentication authentication) {
        User user = (User) authentication.getPrincipal();
        return ResponseEntity.ok(UserDto.from(user));
    }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd backend && mvn test -Dtest=AuthControllerTest -q 2>&1 | tail -10
```
Expected: BUILD SUCCESS, 5 tests passing.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/auth/ \
        backend/src/main/java/com/platform/exercise/user/UserDto.java \
        backend/src/test/java/com/platform/exercise/auth/
git commit -m "feat(auth): implement login, refresh, logout, and /me endpoints"
```

---

## Task 6: UserController + UserService

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/user/CreateUserRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/user/UpdateRoleRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/user/UpdateStatusRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/user/UserService.java`
- Create: `backend/src/main/java/com/platform/exercise/user/UserController.java`
- Test: `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/platform/exercise/user/UserControllerTest.java
package com.platform.exercise.user;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import com.platform.exercise.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class UserControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JwtUtil jwtUtil;

    private String adminToken;
    private String studentToken;
    private Long studentId;

    @BeforeEach
    void seed() {
        User admin = new User();
        admin.setUsername("admin");
        admin.setDisplayName("Admin");
        admin.setPasswordHash(passwordEncoder.encode("pass"));
        admin.setRole(Role.SUPER_ADMIN);
        admin.setStatus(UserStatus.ACTIVE);
        admin = userRepository.save(admin);
        adminToken = jwtUtil.generateToken(admin.getId(), "SUPER_ADMIN");

        User student = new User();
        student.setUsername("stu01");
        student.setDisplayName("Student One");
        student.setPasswordHash(passwordEncoder.encode("pass"));
        student.setRole(Role.STUDENT);
        student.setStatus(UserStatus.ACTIVE);
        student = userRepository.save(student);
        studentToken = jwtUtil.generateToken(student.getId(), "STUDENT");
        studentId = student.getId();
    }

    @Test
    void listUsers_asSuperAdmin_returns200() throws Exception {
        mockMvc.perform(get("/v1/users")
                .header("Authorization", "Bearer " + adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.content").isArray());
    }

    @Test
    void listUsers_asStudent_returns403() throws Exception {
        mockMvc.perform(get("/v1/users")
                .header("Authorization", "Bearer " + studentToken))
            .andExpect(status().isForbidden());
    }

    @Test
    void createUser_success_returns201() throws Exception {
        mockMvc.perform(post("/v1/users")
                .header("Authorization", "Bearer " + adminToken)
                .contentType("application/json")
                .content("{\"username\":\"newuser\",\"displayName\":\"New\",\"password\":\"Password1!\",\"role\":\"STUDENT\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.username").value("newuser"));
    }

    @Test
    void createUser_duplicateUsername_returns409() throws Exception {
        mockMvc.perform(post("/v1/users")
                .header("Authorization", "Bearer " + adminToken)
                .contentType("application/json")
                .content("{\"username\":\"stu01\",\"displayName\":\"Dup\",\"password\":\"Password1!\",\"role\":\"STUDENT\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("USERNAME_TAKEN"));
    }

    @Test
    void patchRole_success_returns200() throws Exception {
        mockMvc.perform(patch("/v1/users/" + studentId + "/role")
                .header("Authorization", "Bearer " + adminToken)
                .contentType("application/json")
                .content("{\"role\":\"TUTOR\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("TUTOR"));
    }

    @Test
    void patchStatus_disable_returns200() throws Exception {
        mockMvc.perform(patch("/v1/users/" + studentId + "/status")
                .header("Authorization", "Bearer " + adminToken)
                .contentType("application/json")
                .content("{\"status\":\"DISABLED\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DISABLED"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && mvn test -Dtest=UserControllerTest -q 2>&1 | tail -15
```
Expected: FAIL — `UserController` not found.

- [ ] **Step 3: Create request records**

```java
// backend/src/main/java/com/platform/exercise/user/CreateUserRequest.java
package com.platform.exercise.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
    @NotBlank @Size(min = 3, max = 64) String username,
    @NotBlank @Size(min = 1, max = 128) String displayName,
    @NotBlank @Size(min = 8) String password,
    @NotBlank String role
) {}
```

```java
// backend/src/main/java/com/platform/exercise/user/UpdateRoleRequest.java
package com.platform.exercise.user;
import jakarta.validation.constraints.NotBlank;
public record UpdateRoleRequest(@NotBlank String role) {}
```

```java
// backend/src/main/java/com/platform/exercise/user/UpdateStatusRequest.java
package com.platform.exercise.user;
import jakarta.validation.constraints.NotBlank;
public record UpdateStatusRequest(@NotBlank String status) {}
```

- [ ] **Step 4: Create `UserService.java`**

```java
// backend/src/main/java/com/platform/exercise/user/UserService.java
package com.platform.exercise.user;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.RefreshTokenRepository;
import com.platform.exercise.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;

    public PageResponse<UserDto> listUsers(int page, int size, String role, String status) {
        var pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        Specification<User> spec = Specification.where(null);
        if (role != null && !role.isBlank()) {
            spec = spec.and((r, q, cb) -> cb.equal(r.get("role"), Role.valueOf(role)));
        }
        if (status != null && !status.isBlank()) {
            spec = spec.and((r, q, cb) -> cb.equal(r.get("status"), UserStatus.valueOf(status)));
        }
        return PageResponse.of(userRepository.findAll(spec, pageable).map(UserDto::from));
    }

    @Transactional
    public UserDto createUser(CreateUserRequest req) {
        if (userRepository.existsByUsername(req.username())) {
            throw new PlatformException(ErrorCode.USERNAME_TAKEN, "Username already taken");
        }
        User u = new User();
        u.setUsername(req.username());
        u.setDisplayName(req.displayName());
        u.setPasswordHash(passwordEncoder.encode(req.password()));
        u.setRole(Role.valueOf(req.role()));
        u.setStatus(UserStatus.ACTIVE);
        return UserDto.from(userRepository.save(u));
    }

    @Transactional
    public UserDto updateRole(Long id, UpdateRoleRequest req) {
        User u = userRepository.findById(id)
            .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND, "User not found"));
        u.setRole(Role.valueOf(req.role()));
        return UserDto.from(userRepository.save(u));
    }

    @Transactional
    public UserDto updateStatus(Long id, UpdateStatusRequest req) {
        User u = userRepository.findById(id)
            .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND, "User not found"));
        u.setStatus(UserStatus.valueOf(req.status()));
        if (u.getStatus() == UserStatus.DISABLED) {
            refreshTokenRepository.deleteByUserId(id);
        }
        return UserDto.from(userRepository.save(u));
    }
}
```

- [ ] **Step 5: Create `UserController.java`**

```java
// backend/src/main/java/com/platform/exercise/user/UserController.java
package com.platform.exercise.user;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.User;
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
public class UserController {

    private final UserService userService;

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<PageResponse<UserDto>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(userService.listUsers(page, size, role, status));
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<UserDto> create(@Valid @RequestBody CreateUserRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.createUser(req));
    }

    @PatchMapping("/{id}/role")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<UserDto> updateRole(
            @PathVariable Long id,
            @Valid @RequestBody UpdateRoleRequest req) {
        return ResponseEntity.ok(userService.updateRole(id, req));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<UserDto> updateStatus(
            @PathVariable Long id,
            @Valid @RequestBody UpdateStatusRequest req,
            Authentication authentication) {
        User current = (User) authentication.getPrincipal();
        if (current.getId().equals(id)) {
            throw new PlatformException(ErrorCode.VALIDATION_ERROR, "Cannot change your own account status");
        }
        return ResponseEntity.ok(userService.updateStatus(id, req));
    }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && mvn test -Dtest=UserControllerTest -q 2>&1 | tail -10
```
Expected: BUILD SUCCESS, 6 tests passing.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/user/ \
        backend/src/test/java/com/platform/exercise/user/
git commit -m "feat(user): implement user management CRUD endpoints (SUPER_ADMIN only)"
```

---

## Task 7: CacheConfig + SettingsController + SettingsService

**Files:**
- Modify: `backend/pom.xml` — add spring-boot-starter-cache + caffeine
- Create: `backend/src/main/java/com/platform/exercise/settings/CacheConfig.java`
- Create: `backend/src/main/java/com/platform/exercise/settings/SettingsResponse.java`
- Create: `backend/src/main/java/com/platform/exercise/settings/ImpactResponse.java`
- Create: `backend/src/main/java/com/platform/exercise/settings/CourseFilterRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/settings/CourseFilterResponse.java`
- Create: `backend/src/main/java/com/platform/exercise/settings/SettingsService.java`
- Create: `backend/src/main/java/com/platform/exercise/settings/SettingsController.java`
- Test: `backend/src/test/java/com/platform/exercise/settings/SettingsControllerTest.java`

- [ ] **Step 1: Write the failing test**

```java
// backend/src/test/java/com/platform/exercise/settings/SettingsControllerTest.java
package com.platform.exercise.settings;

import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.UserRepository;
import com.platform.exercise.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class SettingsControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JwtUtil jwtUtil;

    private String adminToken;
    private String tutorToken;

    @BeforeEach
    void seed() {
        User admin = new User();
        admin.setUsername("settingsadmin");
        admin.setDisplayName("Admin");
        admin.setPasswordHash(passwordEncoder.encode("pass"));
        admin.setRole(Role.SUPER_ADMIN);
        admin.setStatus(UserStatus.ACTIVE);
        admin = userRepository.save(admin);
        adminToken = jwtUtil.generateToken(admin.getId(), "SUPER_ADMIN");

        User tutor = new User();
        tutor.setUsername("tutor01");
        tutor.setDisplayName("Tutor");
        tutor.setPasswordHash(passwordEncoder.encode("pass"));
        tutor.setRole(Role.TUTOR);
        tutor.setStatus(UserStatus.ACTIVE);
        tutor = userRepository.save(tutor);
        tutorToken = jwtUtil.generateToken(tutor.getId(), "TUTOR");
    }

    @Test
    void getSettings_authenticated_returns200() throws Exception {
        mockMvc.perform(get("/v1/settings")
                .header("Authorization", "Bearer " + adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.courseFilterEnabled").value(false));
    }

    @Test
    void getSettings_asTutor_returns200() throws Exception {
        mockMvc.perform(get("/v1/settings")
                .header("Authorization", "Bearer " + tutorToken))
            .andExpect(status().isOk());
    }

    @Test
    void putCourseFilter_asSuperAdmin_togglesValue() throws Exception {
        mockMvc.perform(put("/v1/settings/course-filter")
                .header("Authorization", "Bearer " + adminToken)
                .contentType("application/json")
                .content("{\"enabled\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.courseFilterEnabled").value(true))
            .andExpect(jsonPath("$.impact.unenrolledStudentCount").value(0));
    }

    @Test
    void putCourseFilter_asTutor_returns403() throws Exception {
        mockMvc.perform(put("/v1/settings/course-filter")
                .header("Authorization", "Bearer " + tutorToken)
                .contentType("application/json")
                .content("{\"enabled\":true}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void getImpact_asSuperAdmin_returnsStub() throws Exception {
        mockMvc.perform(get("/v1/settings/course-filter/impact")
                .header("Authorization", "Bearer " + adminToken))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.unenrolledStudentCount").value(0));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && mvn test -Dtest=SettingsControllerTest -q 2>&1 | tail -15
```
Expected: FAIL — `SettingsController` not found.

- [ ] **Step 3: Add cache dependencies to `pom.xml`**

Add after the Bucket4j dependency:

```xml
<!-- Caching -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-cache</artifactId>
</dependency>
<dependency>
    <groupId>com.github.ben-manes.caffeine</groupId>
    <artifactId>caffeine</artifactId>
</dependency>
```

- [ ] **Step 4: Create `CacheConfig.java`**

```java
// backend/src/main/java/com/platform/exercise/settings/CacheConfig.java
package com.platform.exercise.settings;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.TimeUnit;

@Configuration
@EnableCaching
public class CacheConfig {

    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager("settings");
        manager.setCaffeine(Caffeine.newBuilder().expireAfterWrite(30, TimeUnit.SECONDS));
        return manager;
    }
}
```

- [ ] **Step 5: Create response/request records**

```java
// backend/src/main/java/com/platform/exercise/settings/SettingsResponse.java
package com.platform.exercise.settings;
public record SettingsResponse(boolean courseFilterEnabled) {}
```

```java
// backend/src/main/java/com/platform/exercise/settings/ImpactResponse.java
package com.platform.exercise.settings;
import java.util.List;
public record ImpactResponse(boolean currentState, int unenrolledStudentCount, List<Object> unenrolledStudents) {}
```

```java
// backend/src/main/java/com/platform/exercise/settings/CourseFilterRequest.java
package com.platform.exercise.settings;
public record CourseFilterRequest(boolean enabled) {}
```

```java
// backend/src/main/java/com/platform/exercise/settings/CourseFilterResponse.java
package com.platform.exercise.settings;
public record CourseFilterResponse(boolean courseFilterEnabled, ImpactResponse impact, String message) {}
```

- [ ] **Step 6: Create `SettingsService.java`**

```java
// backend/src/main/java/com/platform/exercise/settings/SettingsService.java
package com.platform.exercise.settings;

import com.platform.exercise.domain.GlobalSetting;
import com.platform.exercise.repository.GlobalSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SettingsService {

    private final GlobalSettingRepository settingRepository;

    @Cacheable("settings")
    public SettingsResponse getSettings() {
        boolean enabled = readCourseFilterEnabled();
        return new SettingsResponse(enabled);
    }

    public ImpactResponse getImpact() {
        boolean current = readCourseFilterEnabled();
        // Stub: replace with real query when F-3.2 (course enrollment) is implemented
        return new ImpactResponse(current, 0, List.of());
    }

    @CacheEvict(value = "settings", allEntries = true)
    @Transactional
    public CourseFilterResponse updateCourseFilter(boolean enabled) {
        GlobalSetting setting = settingRepository.findById("course_filter_enabled")
            .orElseGet(() -> {
                GlobalSetting s = new GlobalSetting();
                s.setKey("course_filter_enabled");
                return s;
            });
        setting.setValue(String.valueOf(enabled));
        settingRepository.save(setting);

        ImpactResponse impact = new ImpactResponse(enabled, 0, List.of());
        String message = enabled
            ? "Course filter enabled. 0 students are not enrolled in any course."
            : "Course filter disabled. All published exercises are now visible to students.";
        return new CourseFilterResponse(enabled, impact, message);
    }

    private boolean readCourseFilterEnabled() {
        return settingRepository.findById("course_filter_enabled")
            .map(s -> Boolean.parseBoolean(s.getValue()))
            .orElse(false);
    }
}
```

- [ ] **Step 7: Create `SettingsController.java`**

```java
// backend/src/main/java/com/platform/exercise/settings/SettingsController.java
package com.platform.exercise.settings;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/settings")
@RequiredArgsConstructor
public class SettingsController {

    private final SettingsService settingsService;

    @GetMapping
    public ResponseEntity<SettingsResponse> getSettings() {
        return ResponseEntity.ok(settingsService.getSettings());
    }

    @GetMapping("/course-filter/impact")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<ImpactResponse> getImpact() {
        return ResponseEntity.ok(settingsService.getImpact());
    }

    @PutMapping("/course-filter")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<CourseFilterResponse> updateCourseFilter(
            @RequestBody CourseFilterRequest request) {
        return ResponseEntity.ok(settingsService.updateCourseFilter(request.enabled()));
    }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd backend && mvn test -Dtest=SettingsControllerTest -q 2>&1 | tail -10
```
Expected: BUILD SUCCESS, 5 tests passing.

- [ ] **Step 9: Run full backend test suite**

```bash
cd backend && mvn test -q 2>&1 | tail -15
```
Expected: BUILD SUCCESS, all tests passing.

- [ ] **Step 10: Commit**

```bash
git add backend/pom.xml \
        backend/src/main/java/com/platform/exercise/settings/ \
        backend/src/test/java/com/platform/exercise/settings/
git commit -m "feat(settings): add global settings endpoint with Caffeine 30s cache (F-8)"
```

---

## Task 8: RefreshTokenCleanupJob

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/auth/RefreshTokenCleanupJob.java`
- Modify: `backend/src/main/java/com/platform/exercise/ExerciseApplication.java` — add `@EnableScheduling`

- [ ] **Step 1: Add `@EnableScheduling` to `ExerciseApplication.java`**

```java
// Add import and annotation to the existing file
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling   // add this
public class ExerciseApplication { ... }
```

- [ ] **Step 2: Create `RefreshTokenCleanupJob.java`**

```java
// backend/src/main/java/com/platform/exercise/auth/RefreshTokenCleanupJob.java
package com.platform.exercise.auth;

import com.platform.exercise.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
@Slf4j
public class RefreshTokenCleanupJob {

    private final RefreshTokenRepository refreshTokenRepository;

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void deleteExpiredTokens() {
        refreshTokenRepository.deleteByExpiresAtBefore(LocalDateTime.now());
        log.info("Expired refresh tokens purged");
    }
}
```

- [ ] **Step 3: Run full test suite to confirm no regressions**

```bash
cd backend && mvn test -q 2>&1 | tail -10
```
Expected: BUILD SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/auth/RefreshTokenCleanupJob.java \
        backend/src/main/java/com/platform/exercise/ExerciseApplication.java
git commit -m "feat(auth): add daily cron job to purge expired refresh tokens"
```

---

## Task 9: Frontend — AuthContext + Axios + authApi

**Files:**
- Modify: `frontend/package.json` — add vitest, @testing-library/react, @testing-library/jest-dom, jsdom
- Modify: `frontend/vite.config.js` — add test block
- Create: `frontend/src/contexts/AuthContext.jsx`
- Create: `frontend/src/api/axiosInstance.js`
- Create: `frontend/src/api/authApi.js`
- Test: `frontend/src/contexts/AuthContext.test.jsx`

- [ ] **Step 1: Install frontend test dependencies**

```bash
cd frontend && npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Add test config to `vite.config.js`**

Read the current file, then add the `test` block:

```js
// vite.config.js — add inside defineConfig({...})
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: './src/test/setup.js',
},
```

- [ ] **Step 3: Create test setup file**

```js
// frontend/src/test/setup.js
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add test script to `package.json`**

Add `"test": "vitest run"` to the `scripts` block.

- [ ] **Step 5: Write the failing test**

```jsx
// frontend/src/contexts/AuthContext.test.jsx
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

function TestConsumer() {
  const { user, accessToken } = useAuth();
  return (
    <div>
      <span data-testid="user">{user ? user.username : 'none'}</span>
      <span data-testid="token">{accessToken || 'none'}</span>
    </div>
  );
}

test('initial state: user and accessToken are null', () => {
  render(<AuthProvider><TestConsumer /></AuthProvider>);
  expect(screen.getByTestId('user').textContent).toBe('none');
  expect(screen.getByTestId('token').textContent).toBe('none');
});

test('login sets user and accessToken in context', async () => {
  render(<AuthProvider><TestConsumer /></AuthProvider>);
  const { login } = screen.getByTestId('user').__reactFiber
    ? (() => { throw new Error('use act'); })()
    : {};
  // We test the context value by reaching it through a hook-using component
  // simpler approach: render with a button that calls login
});
```

> **Note:** This test setup is partial — the real test is in Step 6. Delete the above file and replace with the version below after seeing the compile error in Step 5b.

- [ ] **Step 5b: Run test to verify it fails**

```bash
cd frontend && npm test 2>&1 | tail -15
```
Expected: FAIL — `AuthContext` not found.

- [ ] **Step 6: Create `AuthContext.jsx`**

```jsx
// frontend/src/contexts/AuthContext.jsx
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance, { setAuthHandlers } from '../api/axiosInstance';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const tokenRef = useRef(null);

  // Keep ref in sync so Axios interceptor always sees the latest token
  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  const login = useCallback((token, userData) => {
    setAccessToken(token);
    setUser(userData);
  }, []);

  const logout = useCallback(async () => {
    try { await axiosInstance.post('/v1/auth/logout'); } catch (_) {}
    setAccessToken(null);
    setUser(null);
  }, []);

  // Wire Axios interceptor to this context's token ref and logout handler.
  // onUnauthorized only clears local state — no API call to avoid a loop.
  useEffect(() => {
    setAuthHandlers(
      () => tokenRef.current,
      () => { setAccessToken(null); setUser(null); }
    );
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 7: Create `axiosInstance.js`**

```js
// frontend/src/api/axiosInstance.js
import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true, // send refresh token cookie on /auth/refresh
});

// Will be set by AuthProvider after mount
let getToken = () => null;
let onUnauthorized = () => {};

export function setAuthHandlers(tokenGetter, unauthorizedHandler) {
  getToken = tokenGetter;
  onUnauthorized = unauthorizedHandler;
}

axiosInstance.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let pendingRequests = [];

axiosInstance.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes('/v1/auth/')) {
      original._retry = true;
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const res = await axiosInstance.post('/v1/auth/refresh');
          const newToken = res.data.accessToken;
          pendingRequests.forEach(cb => cb(newToken));
          pendingRequests = [];
          return axiosInstance(original);
        } catch (_) {
          onUnauthorized();
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }
      return new Promise(resolve => {
        pendingRequests.push(token => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(axiosInstance(original));
        });
      });
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
```

- [ ] **Step 8: Create `authApi.js`**

```js
// frontend/src/api/authApi.js
import axiosInstance from './axiosInstance';

export const authApi = {
  login: (username, password) =>
    axiosInstance.post('/v1/auth/login', { username, password }).then(r => r.data),

  logout: () =>
    axiosInstance.post('/v1/auth/logout'),

  refresh: () =>
    axiosInstance.post('/v1/auth/refresh').then(r => r.data),

  me: () =>
    axiosInstance.get('/v1/auth/me').then(r => r.data),
};
```

- [ ] **Step 9: Replace the test with a working version**

```jsx
// frontend/src/contexts/AuthContext.test.jsx
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { vi } from 'vitest';

// Mock axiosInstance to avoid real HTTP calls
vi.mock('../api/axiosInstance', () => ({
  default: {
    post: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockRejectedValue({ response: { status: 401 } }),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

function ShowAuth() {
  const { user, accessToken } = useAuth();
  return (
    <>
      <span data-testid="user">{user?.username ?? 'none'}</span>
      <span data-testid="token">{accessToken ?? 'none'}</span>
    </>
  );
}

test('initial state is null', () => {
  render(<AuthProvider><ShowAuth /></AuthProvider>);
  expect(screen.getByTestId('user')).toHaveTextContent('none');
  expect(screen.getByTestId('token')).toHaveTextContent('none');
});
```

- [ ] **Step 10: Run test to verify it passes**

```bash
cd frontend && npm test 2>&1 | tail -10
```
Expected: 1 test passing.

- [ ] **Step 11: Commit**

```bash
cd frontend && git add src/contexts/ src/api/ src/test/ package.json vite.config.js
git commit -m "feat(frontend): add AuthContext, Axios interceptor with silent refresh, authApi"
```

---

## Task 10: ProtectedRoute + App Routing + LoginPage

**Files:**
- Create: `frontend/src/components/ProtectedRoute.jsx`
- Create: `frontend/src/pages/student/StudentPage.jsx`
- Create: `frontend/src/pages/tutor/TutorPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/login/LoginPage.jsx`

- [ ] **Step 1: Create `ProtectedRoute.jsx`**

```jsx
// frontend/src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, requiredRole }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;

  const roleRank = { STUDENT: 1, TUTOR: 2, SUPER_ADMIN: 3 };
  if (requiredRole && (roleRank[user.role] ?? 0) < (roleRank[requiredRole] ?? 0)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}
```

- [ ] **Step 2: Create placeholder pages**

```jsx
// frontend/src/pages/student/StudentPage.jsx
export default function StudentPage() {
  return <div><h1>Student Dashboard</h1><p>Coming soon — F-5.</p></div>;
}
```

```jsx
// frontend/src/pages/tutor/TutorPage.jsx
export default function TutorPage() {
  return <div><h1>Tutor Dashboard</h1><p>Coming soon — F-4.</p></div>;
}
```

```jsx
// frontend/src/pages/admin/AdminDashboardPage.jsx
import { Link } from 'react-router-dom';
export default function AdminDashboardPage() {
  return (
    <div style={{ padding: 32 }}>
      <h1>Admin Dashboard</h1>
      <nav style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <Link to="/admin/users">User Management</Link>
        <Link to="/admin/settings">Global Settings</Link>
        <Link to="/admin/categories">Category Management</Link>
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Update `App.jsx` with full routing**

```jsx
// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/login/LoginPage';
import StudentPage from './pages/student/StudentPage';
import TutorPage from './pages/tutor/TutorPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import UserManagementPage from './pages/admin/UserManagementPage';
import GlobalSettingsPage from './pages/admin/GlobalSettingsPage';

function Unauthorized() {
  return <div style={{ padding: 32 }}><h2>Access Denied</h2><p>You do not have permission to view this page.</p></div>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/student" element={
            <ProtectedRoute requiredRole="STUDENT"><StudentPage /></ProtectedRoute>
          } />
          <Route path="/tutor" element={
            <ProtectedRoute requiredRole="TUTOR"><TutorPage /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="SUPER_ADMIN"><AdminDashboardPage /></ProtectedRoute>
          } />
          <Route path="/admin/users" element={
            <ProtectedRoute requiredRole="SUPER_ADMIN"><UserManagementPage /></ProtectedRoute>
          } />
          <Route path="/admin/settings" element={
            <ProtectedRoute requiredRole="SUPER_ADMIN"><GlobalSettingsPage /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Replace `LoginPage.jsx` with real implementation**

```jsx
// frontend/src/pages/login/LoginPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../api/authApi';

const ROLE_ROUTES = { STUDENT: '/student', TUTOR: '/tutor', SUPER_ADMIN: '/admin' };

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login(username, password);
      login(data.accessToken, data.user);
      navigate(ROLE_ROUTES[data.user.role] ?? '/student', { replace: true });
    } catch (err) {
      const code = err.response?.data?.error?.code;
      if (code === 'ACCOUNT_DISABLED') {
        setError('Account disabled — please contact an administrator');
      } else {
        setError('Invalid username or password');
      }
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <form onSubmit={handleSubmit} style={{ border: '1px solid #ccc', borderRadius: 8, padding: 32, width: 360 }}>
        <h2 style={{ marginBottom: 24 }}>Programming Exercise Platform</h2>
        {error && (
          <div role="alert" style={{ marginBottom: 16, padding: 10, background: '#fdecea', color: '#c62828', borderRadius: 4 }}>
            {error}
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="username">Username</label>
          <input id="username" value={username} onChange={e => setUsername(e.target.value)}
            required autoComplete="username"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            required autoComplete="current-password"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: 10, background: loading ? '#90caf9' : '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Logging in…' : 'Login'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Run frontend tests**

```bash
cd frontend && npm test 2>&1 | tail -10
```
Expected: All tests passing.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/ src/pages/ src/App.jsx
git commit -m "feat(frontend): add ProtectedRoute, full routing, and working LoginPage"
```

---

## Task 11: Admin Pages — UserManagement + GlobalSettings

**Files:**
- Create: `frontend/src/pages/admin/UserManagementPage.jsx`
- Create: `frontend/src/components/admin/CreateUserModal.jsx`
- Create: `frontend/src/pages/admin/GlobalSettingsPage.jsx`
- Create: `frontend/src/api/userApi.js`
- Create: `frontend/src/api/settingsApi.js`

- [ ] **Step 1: Create `userApi.js`**

```js
// frontend/src/api/userApi.js
import axiosInstance from './axiosInstance';

export const userApi = {
  list: (params) =>
    axiosInstance.get('/v1/users', { params }).then(r => r.data),
  create: (data) =>
    axiosInstance.post('/v1/users', data).then(r => r.data),
  updateRole: (id, role) =>
    axiosInstance.patch(`/v1/users/${id}/role`, { role }).then(r => r.data),
  updateStatus: (id, status) =>
    axiosInstance.patch(`/v1/users/${id}/status`, { status }).then(r => r.data),
};
```

- [ ] **Step 2: Create `settingsApi.js`**

```js
// frontend/src/api/settingsApi.js
import axiosInstance from './axiosInstance';

export const settingsApi = {
  get: () =>
    axiosInstance.get('/v1/settings').then(r => r.data),
  getImpact: () =>
    axiosInstance.get('/v1/settings/course-filter/impact').then(r => r.data),
  updateCourseFilter: (enabled) =>
    axiosInstance.put('/v1/settings/course-filter', { enabled }).then(r => r.data),
};
```

- [ ] **Step 3: Create `CreateUserModal.jsx`**

```jsx
// frontend/src/components/admin/CreateUserModal.jsx
import { useState } from 'react';
import { userApi } from '../../api/userApi';

const ROLES = ['STUDENT', 'TUTOR', 'SUPER_ADMIN'];

export default function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'STUDENT' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function update(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const user = await userApi.create(form);
      onCreated(user);
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setError(code === 'USERNAME_TAKEN' ? 'Username already taken' : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onSubmit={submit} style={{ background: '#fff', borderRadius: 8, padding: 32, width: 400 }}>
        <h3 style={{ marginBottom: 16 }}>New User</h3>
        {error && <div role="alert" style={{ marginBottom: 12, color: '#c62828' }}>{error}</div>}
        {[['username', 'Username'], ['displayName', 'Display Name'], ['password', 'Password']].map(([k, label]) => (
          <div key={k} style={{ marginBottom: 12 }}>
            <label>{label}</label>
            <input type={k === 'password' ? 'password' : 'text'} value={form[k]}
              onChange={update(k)} required style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ marginBottom: 16 }}>
          <label>Role</label>
          <select value={form.role} onChange={update('role')}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px' }}>
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Create `UserManagementPage.jsx`**

```jsx
// frontend/src/pages/admin/UserManagementPage.jsx
import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { userApi } from '../../api/userApi';
import CreateUserModal from '../../components/admin/CreateUserModal';

const ROLE_BADGE = { STUDENT: '#1976d2', TUTOR: '#388e3c', SUPER_ADMIN: '#7b1fa2' };
const STATUS_BADGE = { ACTIVE: '#2e7d32', DISABLED: '#c62828' };

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await userApi.list({
        page, size: 20,
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { status: statusFilter }),
      });
      setUsers(data.content);
      setTotalPages(data.totalPages);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, roleFilter, statusFilter]);

  async function handleRoleChange(id, role) {
    await userApi.updateRole(id, role);
    load();
  }

  async function handleStatusToggle(u) {
    const newStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (newStatus === 'DISABLED' && !confirm(`Disable ${u.username}? All active sessions will be invalidated.`)) return;
    await userApi.updateStatus(u.id, newStatus);
    load();
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>User Management</h1>
        <button onClick={() => setShowCreate(true)}
          style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
          + New User
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(0); }}
          style={{ padding: 8 }}>
          <option value="">All Roles</option>
          {['STUDENT', 'TUTOR', 'SUPER_ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
          style={{ padding: 8 }}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
        </select>
      </div>

      {loading ? <p>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Username</th>
              <th style={{ padding: 8 }}>Display Name</th>
              <th style={{ padding: 8 }}>Role</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{u.username}</td>
                <td style={{ padding: 8 }}>{u.displayName}</td>
                <td style={{ padding: 8 }}>
                  <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value)}
                    disabled={u.id === currentUser?.id}
                    style={{ padding: 4, color: ROLE_BADGE[u.role] }}>
                    {['STUDENT', 'TUTOR', 'SUPER_ADMIN'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={{ padding: 8 }}>
                  <span style={{ color: STATUS_BADGE[u.status], fontWeight: 600 }}>{u.status}</span>
                </td>
                <td style={{ padding: 8 }}>
                  {u.id !== currentUser?.id && (
                    <button onClick={() => handleStatusToggle(u)}
                      style={{ padding: '4px 10px', cursor: 'pointer' }}>
                      {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span>Page {page + 1} / {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `GlobalSettingsPage.jsx`**

```jsx
// frontend/src/pages/admin/GlobalSettingsPage.jsx
import { useEffect, useState } from 'react';
import { settingsApi } from '../../api/settingsApi';

export default function GlobalSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    settingsApi.get().then(d => setEnabled(d.courseFilterEnabled)).finally(() => setLoading(false));
  }, []);

  async function handleToggle() {
    const newValue = !enabled;

    if (newValue) {
      const impact = await settingsApi.getImpact();
      const count = impact.unenrolledStudentCount;
      const msg = count === 0
        ? 'No students are currently unenrolled. Enable the course filter?'
        : `${count} student(s) have no course enrollment and will see no exercises. Enable the filter anyway?`;
      if (!confirm(msg)) return;
    }

    setSaving(true);
    try {
      const res = await settingsApi.updateCourseFilter(newValue);
      setEnabled(res.courseFilterEnabled);
      setToast(res.message);
      setTimeout(() => setToast(''), 4000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <div style={{ padding: 32 }}>
      <h1>Global Settings</h1>

      {toast && (
        <div role="status" style={{ marginBottom: 16, padding: 12, background: '#e8f5e9', borderRadius: 4, color: '#2e7d32' }}>
          {toast}
        </div>
      )}

      <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>Course Filter</span>
        <button
          onClick={handleToggle}
          disabled={saving}
          style={{
            width: 56, height: 28, borderRadius: 14, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: enabled ? '#388e3c' : '#ccc', position: 'relative', transition: 'background 0.2s',
          }}>
          <span style={{
            position: 'absolute', top: 3, left: enabled ? 30 : 4,
            width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          }} />
        </button>
        <span style={{ color: enabled ? '#388e3c' : '#757575' }}>
          {enabled ? 'ON — Students see only enrolled-course exercises' : 'OFF — Students see all published exercises'}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run frontend tests**

```bash
cd frontend && npm test 2>&1 | tail -10
```
Expected: All tests passing.

- [ ] **Step 7: Start dev server and smoke-test**

```bash
# In one terminal: start backend
cd backend && mvn spring-boot:run -Dspring-boot.run.jvmArguments="-DJWT_SECRET=dev-secret-at-least-32-chars-long-123"

# In another terminal: start frontend
cd frontend && npm run dev
```

Open `http://localhost:5173` — verify:
- Login page renders (not disabled)
- Wrong credentials shows error
- Login with a seeded SUPER_ADMIN user redirects to `/admin`
- `/admin/users` loads the user table
- Creating a user shows in the list
- Disabling a user works (confirm dialog appears)
- `/admin/settings` shows the toggle
- Toggling course filter updates the state

- [ ] **Step 8: Commit**

```bash
cd frontend && git add src/
git commit -m "feat(frontend): implement UserManagement and GlobalSettings admin pages (F-2.2, F-8)"
```

---

## Post-Implementation Checklist

- [ ] `cd backend && mvn test` — all backend tests pass (no regressions)
- [ ] `cd frontend && npm test` — all frontend tests pass
- [ ] Update `docs/4_feature_specs/p0.md` progress table: mark F-2.1, F-2.2, F-8 as `[x]`
- [ ] Verify `.env` / docker-compose has a real `JWT_SECRET` (not the placeholder)
- [ ] `docker compose up -d --build` — verify all containers healthy after rebuild

---

## Seed Data for Manual Testing

To create a SUPER_ADMIN user for first login, run this against MySQL after stack is up:

```sql
-- password = 'Admin123!'  (bcrypt strength 12 — generate via Java or use below hash)
-- To generate: run `echo -n 'Admin123!' | htpasswd -iBc /dev/null admin` or use a bcrypt tool
INSERT INTO users (username, display_name, password_hash, role, status)
VALUES ('admin', 'Platform Admin', '$2a$12$REPLACE_WITH_REAL_BCRYPT_HASH', 'SUPER_ADMIN', 'ACTIVE');
```

Or add a Flyway seed migration `V2__seed_admin.sql` (dev only — never commit real credentials).
