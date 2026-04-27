# F3.2 — Course Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full course management — backend CRUD + exercise/student association APIs and tutor-facing frontend (list, create/edit form, detail tabs).

**Architecture:** `Course` entity with no `@ManyToMany` mappings; join tables (`course_exercises`, `course_students`) managed via `@Modifying @Query` native SQL in `CourseRepository`. Interface projections (`CourseWithCountsView`) return per-course counts in a single JOIN query, matching the existing `CategoryView` pattern.

**Tech Stack:** Spring Boot 3.2.5 · Spring Data JPA · H2 (test, MySQL mode) · React 18 · Axios

---

## File Map

**Backend — create:**
- `backend/src/main/java/com/platform/exercise/domain/Course.java`
- `backend/src/main/java/com/platform/exercise/repository/CourseRepository.java`
- `backend/src/main/java/com/platform/exercise/repository/CourseWithCountsView.java`
- `backend/src/main/java/com/platform/exercise/repository/ExerciseSummaryView.java`
- `backend/src/main/java/com/platform/exercise/repository/UserSummaryView.java`
- `backend/src/main/java/com/platform/exercise/course/CourseController.java`
- `backend/src/main/java/com/platform/exercise/course/CourseService.java`
- `backend/src/main/java/com/platform/exercise/course/CourseDto.java`
- `backend/src/main/java/com/platform/exercise/course/ExerciseSummaryDto.java`
- `backend/src/main/java/com/platform/exercise/course/UserSummaryDto.java`
- `backend/src/main/java/com/platform/exercise/course/CreateCourseRequest.java`
- `backend/src/main/java/com/platform/exercise/course/UpdateCourseRequest.java`
- `backend/src/main/java/com/platform/exercise/course/AddExercisesRequest.java`
- `backend/src/main/java/com/platform/exercise/course/EnrollStudentsRequest.java`
- `backend/src/main/java/com/platform/exercise/course/EnrollResult.java`
- `backend/src/main/java/com/platform/exercise/course/LinkedResult.java`
- `backend/src/test/java/com/platform/exercise/course/CourseControllerTest.java`

**Frontend — create:**
- `frontend/src/api/courseApi.js`
- `frontend/src/pages/tutor/CourseManagementPage.jsx`
- `frontend/src/pages/tutor/CourseFormPage.jsx`
- `frontend/src/pages/tutor/CourseDetailPage.jsx`

**Frontend — modify:**
- `frontend/src/App.jsx`
- `frontend/src/pages/tutor/TutorPage.jsx`

---

## Task 1: Course entity + projections

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/domain/Course.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/CourseWithCountsView.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/ExerciseSummaryView.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/UserSummaryView.java`

- [ ] **Step 1: Write Course entity**

```java
// backend/src/main/java/com/platform/exercise/domain/Course.java
package com.platform.exercise.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Entity
@Table(name = "courses")
@Data
@NoArgsConstructor
public class Course {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    // Field named 'deleted' so Lombok generates isDeleted() / setDeleted()
    // mapped to column is_deleted to match schema
    @Column(name = "is_deleted", nullable = false)
    private boolean deleted = false;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PreUpdate
    protected void onUpdate() { this.updatedAt = LocalDateTime.now(); }
}
```

- [ ] **Step 2: Write projections**

```java
// backend/src/main/java/com/platform/exercise/repository/CourseWithCountsView.java
package com.platform.exercise.repository;

import java.time.LocalDateTime;

public interface CourseWithCountsView {
    Long getId();
    String getName();
    String getDescription();
    LocalDateTime getCreatedAt();
    Long getExerciseCount();
    Long getStudentCount();
}
```

```java
// backend/src/main/java/com/platform/exercise/repository/ExerciseSummaryView.java
package com.platform.exercise.repository;

public interface ExerciseSummaryView {
    Long getId();
    String getTitle();
    String getType();
    String getDifficulty();
    String getStatus();
}
```

```java
// backend/src/main/java/com/platform/exercise/repository/UserSummaryView.java
package com.platform.exercise.repository;

public interface UserSummaryView {
    Long getId();
    String getUsername();
    String getDisplayName();
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd backend && mvn compile -q
```
Expected: BUILD SUCCESS with no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/domain/Course.java \
        backend/src/main/java/com/platform/exercise/repository/CourseWithCountsView.java \
        backend/src/main/java/com/platform/exercise/repository/ExerciseSummaryView.java \
        backend/src/main/java/com/platform/exercise/repository/UserSummaryView.java
git commit -m "feat(f3-2): add Course entity and projection interfaces"
```

---

## Task 2: CourseRepository + DTOs + request/response records

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/repository/CourseRepository.java`
- Create: `backend/src/main/java/com/platform/exercise/course/CourseDto.java`
- Create: `backend/src/main/java/com/platform/exercise/course/ExerciseSummaryDto.java`
- Create: `backend/src/main/java/com/platform/exercise/course/UserSummaryDto.java`
- Create: `backend/src/main/java/com/platform/exercise/course/CreateCourseRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/course/UpdateCourseRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/course/AddExercisesRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/course/EnrollStudentsRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/course/EnrollResult.java`
- Create: `backend/src/main/java/com/platform/exercise/course/LinkedResult.java`

- [ ] **Step 1: Write CourseRepository**

```java
// backend/src/main/java/com/platform/exercise/repository/CourseRepository.java
package com.platform.exercise.repository;

import com.platform.exercise.domain.Course;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CourseRepository extends JpaRepository<Course, Long> {

    @Query(value = """
            SELECT c.id, c.name, c.description, c.created_at,
                   COUNT(DISTINCT ce.exercise_id) AS exercise_count,
                   COUNT(DISTINCT cs.user_id)     AS student_count
            FROM courses c
            LEFT JOIN course_exercises ce ON ce.course_id = c.id
            LEFT JOIN course_students  cs ON cs.course_id = c.id
            WHERE c.is_deleted = false AND c.created_by = :createdBy
            GROUP BY c.id, c.name, c.description, c.created_at
            ORDER BY c.created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM courses
            WHERE is_deleted = false AND created_by = :createdBy
            """,
            nativeQuery = true)
    Page<CourseWithCountsView> findAllWithCountsByCreatedBy(
            @Param("createdBy") Long createdBy, Pageable pageable);

    @Query(value = """
            SELECT c.id, c.name, c.description, c.created_at,
                   COUNT(DISTINCT ce.exercise_id) AS exercise_count,
                   COUNT(DISTINCT cs.user_id)     AS student_count
            FROM courses c
            LEFT JOIN course_exercises ce ON ce.course_id = c.id
            LEFT JOIN course_students  cs ON cs.course_id = c.id
            WHERE c.id = :id AND c.is_deleted = false AND c.created_by = :createdBy
            GROUP BY c.id, c.name, c.description, c.created_at
            """,
            nativeQuery = true)
    Optional<CourseWithCountsView> findByIdAndCreatedBy(
            @Param("id") Long id, @Param("createdBy") Long createdBy);

    // --- course_exercises ---

    @Modifying(clearAutomatically = true)
    @Query(value = "INSERT IGNORE INTO course_exercises (course_id, exercise_id) VALUES (:courseId, :exerciseId)",
           nativeQuery = true)
    void insertCourseExercise(@Param("courseId") Long courseId, @Param("exerciseId") Long exerciseId);

    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM course_exercises WHERE course_id = :courseId AND exercise_id = :exerciseId",
           nativeQuery = true)
    void deleteCourseExercise(@Param("courseId") Long courseId, @Param("exerciseId") Long exerciseId);

    @Query(value = """
            SELECT COUNT(*) > 0 FROM exercises
            WHERE id = :exerciseId AND status = 'PUBLISHED' AND is_deleted = false
            """,
           nativeQuery = true)
    boolean isExercisePublished(@Param("exerciseId") Long exerciseId);

    @Query(value = """
            SELECT e.id, e.title, e.type, e.difficulty, e.status
            FROM exercises e
            JOIN course_exercises ce ON ce.exercise_id = e.id
            WHERE ce.course_id = :courseId AND e.is_deleted = false
            ORDER BY ce.created_at
            """,
           nativeQuery = true)
    List<ExerciseSummaryView> findExercisesInCourse(@Param("courseId") Long courseId);

    // --- course_students ---

    @Modifying(clearAutomatically = true)
    @Query(value = "INSERT IGNORE INTO course_students (course_id, user_id) VALUES (:courseId, :userId)",
           nativeQuery = true)
    void insertCourseStudent(@Param("courseId") Long courseId, @Param("userId") Long userId);

    @Modifying(clearAutomatically = true)
    @Query(value = "DELETE FROM course_students WHERE course_id = :courseId AND user_id = :userId",
           nativeQuery = true)
    void deleteCourseStudent(@Param("courseId") Long courseId, @Param("userId") Long userId);

    @Query(value = """
            SELECT COUNT(*) > 0 FROM users
            WHERE id = :userId AND role = 'STUDENT' AND status = 'ACTIVE'
            """,
           nativeQuery = true)
    boolean isUserActiveStudent(@Param("userId") Long userId);

    @Query(value = """
            SELECT u.id, u.username, u.display_name
            FROM users u
            JOIN course_students cs ON cs.user_id = u.id
            WHERE cs.course_id = :courseId
            ORDER BY u.display_name
            """,
           nativeQuery = true)
    List<UserSummaryView> findStudentsInCourse(@Param("courseId") Long courseId);

    @Query(value = """
            SELECT u.id, u.username, u.display_name
            FROM users u
            WHERE u.role = 'STUDENT' AND u.status = 'ACTIVE'
              AND (u.username LIKE CONCAT('%', :q, '%')
                OR u.display_name LIKE CONCAT('%', :q, '%'))
              AND u.id NOT IN (
                  SELECT cs.user_id FROM course_students cs WHERE cs.course_id = :courseId
              )
            LIMIT 20
            """,
           nativeQuery = true)
    List<UserSummaryView> findAvailableStudents(
            @Param("courseId") Long courseId, @Param("q") String q);
}
```

- [ ] **Step 2: Write DTOs and request/response records**

```java
// backend/src/main/java/com/platform/exercise/course/CourseDto.java
package com.platform.exercise.course;

import com.platform.exercise.domain.Course;
import com.platform.exercise.repository.CourseWithCountsView;
import java.time.LocalDateTime;

public record CourseDto(
        Long id, String name, String description,
        long exerciseCount, long studentCount, LocalDateTime createdAt) {

    public static CourseDto from(CourseWithCountsView v) {
        return new CourseDto(v.getId(), v.getName(), v.getDescription(),
                v.getExerciseCount() != null ? v.getExerciseCount() : 0L,
                v.getStudentCount() != null ? v.getStudentCount() : 0L,
                v.getCreatedAt());
    }

    public static CourseDto from(Course c) {
        return new CourseDto(c.getId(), c.getName(), c.getDescription(),
                0L, 0L, c.getCreatedAt());
    }
}
```

```java
// backend/src/main/java/com/platform/exercise/course/ExerciseSummaryDto.java
package com.platform.exercise.course;

import com.platform.exercise.repository.ExerciseSummaryView;

public record ExerciseSummaryDto(Long id, String title, String type, String difficulty, String status) {
    public static ExerciseSummaryDto from(ExerciseSummaryView v) {
        return new ExerciseSummaryDto(v.getId(), v.getTitle(), v.getType(), v.getDifficulty(), v.getStatus());
    }
}
```

```java
// backend/src/main/java/com/platform/exercise/course/UserSummaryDto.java
package com.platform.exercise.course;

import com.platform.exercise.repository.UserSummaryView;

public record UserSummaryDto(Long id, String username, String displayName) {
    public static UserSummaryDto from(UserSummaryView v) {
        return new UserSummaryDto(v.getId(), v.getUsername(), v.getDisplayName());
    }
}
```

```java
// backend/src/main/java/com/platform/exercise/course/CreateCourseRequest.java
package com.platform.exercise.course;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateCourseRequest(
        @NotBlank @Size(max = 200) String name,
        String description) {}
```

```java
// backend/src/main/java/com/platform/exercise/course/UpdateCourseRequest.java
package com.platform.exercise.course;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateCourseRequest(
        @NotBlank @Size(max = 200) String name,
        String description) {}
```

```java
// backend/src/main/java/com/platform/exercise/course/AddExercisesRequest.java
package com.platform.exercise.course;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record AddExercisesRequest(
        @NotEmpty @Size(max = 200) List<Long> exerciseIds) {}
```

```java
// backend/src/main/java/com/platform/exercise/course/EnrollStudentsRequest.java
package com.platform.exercise.course;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record EnrollStudentsRequest(
        @NotEmpty @Size(max = 200) List<Long> userIds) {}
```

```java
// backend/src/main/java/com/platform/exercise/course/EnrollResult.java
package com.platform.exercise.course;

import java.util.List;

public record EnrollResult(int enrolled, List<String> errors) {}
```

```java
// backend/src/main/java/com/platform/exercise/course/LinkedResult.java
package com.platform.exercise.course;

public record LinkedResult(int linked) {}
```

- [ ] **Step 3: Verify compilation**

```bash
cd backend && mvn compile -q
```
Expected: BUILD SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/repository/CourseRepository.java \
        backend/src/main/java/com/platform/exercise/course/
git commit -m "feat(f3-2): add CourseRepository, DTOs, and request/response records"
```

---

## Task 3: Course CRUD — TDD

**Files:**
- Create: `backend/src/test/java/com/platform/exercise/course/CourseControllerTest.java`
- Create: `backend/src/main/java/com/platform/exercise/course/CourseService.java`
- Create: `backend/src/main/java/com/platform/exercise/course/CourseController.java`

- [ ] **Step 1: Write failing CRUD tests**

```java
// backend/src/test/java/com/platform/exercise/course/CourseControllerTest.java
package com.platform.exercise.course;

import com.platform.exercise.domain.Course;
import com.platform.exercise.domain.User;
import com.platform.exercise.domain.User.Role;
import com.platform.exercise.domain.User.UserStatus;
import com.platform.exercise.repository.CourseRepository;
import com.platform.exercise.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CourseControllerTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private CourseRepository courseRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private JdbcTemplate jdbcTemplate;

    private Long tutor1Id;
    private Long tutor2Id;
    private Long student1Id;

    @BeforeEach
    void seed() {
        User t1 = new User();
        t1.setUsername("tutor1"); t1.setDisplayName("Tutor One");
        t1.setPasswordHash(passwordEncoder.encode("pass")); t1.setRole(Role.TUTOR); t1.setStatus(UserStatus.ACTIVE);
        tutor1Id = userRepository.save(t1).getId();

        User t2 = new User();
        t2.setUsername("tutor2"); t2.setDisplayName("Tutor Two");
        t2.setPasswordHash(passwordEncoder.encode("pass")); t2.setRole(Role.TUTOR); t2.setStatus(UserStatus.ACTIVE);
        tutor2Id = userRepository.save(t2).getId();

        User s1 = new User();
        s1.setUsername("student1"); s1.setDisplayName("Student One");
        s1.setPasswordHash(passwordEncoder.encode("pass")); s1.setRole(Role.STUDENT); s1.setStatus(UserStatus.ACTIVE);
        student1Id = userRepository.save(s1).getId();
    }

    // ---- helpers ----

    private Long createCourseFor(Long userId, String name) {
        Course c = new Course();
        c.setName(name); c.setDescription("desc"); c.setCreatedBy(userId);
        return courseRepository.save(c).getId();
    }

    // ---- CRUD ----

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createCourse_validData_returns201() throws Exception {
        mockMvc.perform(post("/v1/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"CS101\",\"description\":\"Intro\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("CS101"))
                .andExpect(jsonPath("$.exerciseCount").value(0))
                .andExpect(jsonPath("$.studentCount").value(0));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void createCourse_blankName_returns400() throws Exception {
        mockMvc.perform(post("/v1/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void createCourse_unauthenticated_returns401() throws Exception {
        mockMvc.perform(post("/v1/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"CS101\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "student1", roles = "STUDENT")
    void createCourse_asStudent_returns403() throws Exception {
        mockMvc.perform(post("/v1/courses")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"CS101\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void listCourses_tutorSeesOnlyOwnCourses() throws Exception {
        createCourseFor(tutor1Id, "My Course");
        createCourseFor(tutor2Id, "Other Course");

        mockMvc.perform(get("/v1/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].name").value("My Course"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getCourse_validOwner_returns200() throws Exception {
        Long id = createCourseFor(tutor1Id, "CS101");
        mockMvc.perform(get("/v1/courses/" + id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("CS101"));
    }

    @Test
    @WithMockUser(username = "tutor2", roles = "TUTOR")
    void getCourse_notOwner_returns404() throws Exception {
        Long id = createCourseFor(tutor1Id, "CS101");
        mockMvc.perform(get("/v1/courses/" + id))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("COURSE_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void updateCourse_validData_returns200() throws Exception {
        Long id = createCourseFor(tutor1Id, "Old Name");
        mockMvc.perform(put("/v1/courses/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"New Name\",\"description\":\"Updated\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("New Name"));
    }

    @Test
    @WithMockUser(username = "tutor2", roles = "TUTOR")
    void updateCourse_notOwner_returns404() throws Exception {
        Long id = createCourseFor(tutor1Id, "CS101");
        mockMvc.perform(put("/v1/courses/" + id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Hacked\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void deleteCourse_validOwner_returns204AndSoftDeletes() throws Exception {
        Long id = createCourseFor(tutor1Id, "CS101");
        mockMvc.perform(delete("/v1/courses/" + id))
                .andExpect(status().isNoContent());
        // verify soft-delete: course still in DB with deleted=true
        Course c = courseRepository.findById(id).orElseThrow();
        assert c.isDeleted();
    }

    @Test
    @WithMockUser(username = "tutor2", roles = "TUTOR")
    void deleteCourse_notOwner_returns404() throws Exception {
        Long id = createCourseFor(tutor1Id, "CS101");
        mockMvc.perform(delete("/v1/courses/" + id))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && mvn test -pl . -Dtest=CourseControllerTest -q 2>&1 | tail -5
```
Expected: compilation error (CourseController/CourseService do not exist yet).

- [ ] **Step 3: Write CourseService**

```java
// backend/src/main/java/com/platform/exercise/course/CourseService.java
package com.platform.exercise.course;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PageResponse;
import com.platform.exercise.common.PlatformException;
import com.platform.exercise.domain.Course;
import com.platform.exercise.repository.CourseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CourseService {

    private final CourseRepository courseRepository;

    @Transactional(readOnly = true)
    public PageResponse<CourseDto> list(Long userId, int page, int size) {
        return PageResponse.of(
                courseRepository.findAllWithCountsByCreatedBy(userId, PageRequest.of(page, size))
                                .map(CourseDto::from));
    }

    @Transactional
    public CourseDto create(CreateCourseRequest req, Long userId) {
        Course c = new Course();
        c.setName(req.name());
        c.setDescription(req.description());
        c.setCreatedBy(userId);
        return CourseDto.from(courseRepository.save(c));
    }

    @Transactional(readOnly = true)
    public CourseDto getById(Long courseId, Long userId) {
        return courseRepository.findByIdAndCreatedBy(courseId, userId)
                .map(CourseDto::from)
                .orElseThrow(() -> new PlatformException(ErrorCode.COURSE_NOT_FOUND));
    }

    @Transactional
    public CourseDto update(Long courseId, UpdateCourseRequest req, Long userId) {
        Course c = findAndValidateOwnership(courseId, userId);
        c.setName(req.name());
        c.setDescription(req.description());
        courseRepository.save(c);
        return courseRepository.findByIdAndCreatedBy(courseId, userId)
                .map(CourseDto::from)
                .orElseThrow(() -> new PlatformException(ErrorCode.COURSE_NOT_FOUND));
    }

    @Transactional
    public void softDelete(Long courseId, Long userId) {
        Course c = findAndValidateOwnership(courseId, userId);
        c.setDeleted(true);
        courseRepository.save(c);
    }

    @Transactional
    public LinkedResult addExercises(Long courseId, AddExercisesRequest req, Long userId) {
        findAndValidateOwnership(courseId, userId);
        for (Long eid : req.exerciseIds()) {
            if (!courseRepository.isExercisePublished(eid)) {
                throw new PlatformException(ErrorCode.EXERCISE_NOT_FOUND,
                        "Exercise " + eid + " not found or not published");
            }
        }
        req.exerciseIds().forEach(eid -> courseRepository.insertCourseExercise(courseId, eid));
        return new LinkedResult(req.exerciseIds().size());
    }

    @Transactional
    public void removeExercise(Long courseId, Long exerciseId, Long userId) {
        findAndValidateOwnership(courseId, userId);
        courseRepository.deleteCourseExercise(courseId, exerciseId);
    }

    @Transactional(readOnly = true)
    public List<ExerciseSummaryDto> getExercises(Long courseId, Long userId) {
        findAndValidateOwnership(courseId, userId);
        return courseRepository.findExercisesInCourse(courseId).stream()
                .map(ExerciseSummaryDto::from).toList();
    }

    @Transactional
    public EnrollResult enrollStudents(Long courseId, EnrollStudentsRequest req, Long userId) {
        findAndValidateOwnership(courseId, userId);
        List<String> errors = new ArrayList<>();
        int enrolled = 0;
        for (Long uid : req.userIds()) {
            if (!courseRepository.isUserActiveStudent(uid)) {
                errors.add("User " + uid + " is not an active student");
                continue;
            }
            courseRepository.insertCourseStudent(courseId, uid);
            enrolled++;
        }
        return new EnrollResult(enrolled, errors);
    }

    @Transactional
    public void unenrollStudent(Long courseId, Long studentId, Long userId) {
        findAndValidateOwnership(courseId, userId);
        courseRepository.deleteCourseStudent(courseId, studentId);
    }

    @Transactional(readOnly = true)
    public List<UserSummaryDto> getStudents(Long courseId, Long userId) {
        findAndValidateOwnership(courseId, userId);
        return courseRepository.findStudentsInCourse(courseId).stream()
                .map(UserSummaryDto::from).toList();
    }

    @Transactional(readOnly = true)
    public List<UserSummaryDto> searchAvailableStudents(Long courseId, String q, Long userId) {
        findAndValidateOwnership(courseId, userId);
        return courseRepository.findAvailableStudents(courseId, q == null ? "" : q).stream()
                .map(UserSummaryDto::from).toList();
    }

    private Course findAndValidateOwnership(Long courseId, Long userId) {
        Course c = courseRepository.findById(courseId)
                .orElseThrow(() -> new PlatformException(ErrorCode.COURSE_NOT_FOUND));
        if (c.isDeleted() || !c.getCreatedBy().equals(userId)) {
            throw new PlatformException(ErrorCode.COURSE_NOT_FOUND);
        }
        return c;
    }
}
```

- [ ] **Step 4: Write CourseController**

The controller injects `UserRepository` only to resolve the user ID from a `@WithMockUser` principal in tests (real requests have a `User` entity as principal — see `JwtFilter`).

```java
// backend/src/main/java/com/platform/exercise/course/CourseController.java
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
    public ResponseEntity<PageResponse<CourseDto>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication auth) {
        return ResponseEntity.ok(courseService.list(resolveUserId(auth), page, size));
    }

    @PostMapping
    public ResponseEntity<CourseDto> create(
            @Valid @RequestBody CreateCourseRequest req, Authentication auth) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(courseService.create(req, resolveUserId(auth)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CourseDto> getById(@PathVariable Long id, Authentication auth) {
        return ResponseEntity.ok(courseService.getById(id, resolveUserId(auth)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<CourseDto> update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateCourseRequest req,
            Authentication auth) {
        return ResponseEntity.ok(courseService.update(id, req, resolveUserId(auth)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, Authentication auth) {
        courseService.softDelete(id, resolveUserId(auth));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/exercises")
    public ResponseEntity<LinkedResult> addExercises(
            @PathVariable Long id,
            @Valid @RequestBody AddExercisesRequest req,
            Authentication auth) {
        return ResponseEntity.ok(courseService.addExercises(id, req, resolveUserId(auth)));
    }

    @DeleteMapping("/{id}/exercises/{exerciseId}")
    public ResponseEntity<Void> removeExercise(
            @PathVariable Long id, @PathVariable Long exerciseId, Authentication auth) {
        courseService.removeExercise(id, exerciseId, resolveUserId(auth));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/exercises")
    public ResponseEntity<List<ExerciseSummaryDto>> getExercises(
            @PathVariable Long id, Authentication auth) {
        return ResponseEntity.ok(courseService.getExercises(id, resolveUserId(auth)));
    }

    @PostMapping("/{id}/students")
    public ResponseEntity<EnrollResult> enrollStudents(
            @PathVariable Long id,
            @Valid @RequestBody EnrollStudentsRequest req,
            Authentication auth) {
        return ResponseEntity.ok(courseService.enrollStudents(id, req, resolveUserId(auth)));
    }

    @DeleteMapping("/{id}/students/{userId}")
    public ResponseEntity<Void> unenrollStudent(
            @PathVariable Long id, @PathVariable Long userId, Authentication auth) {
        courseService.unenrollStudent(id, userId, resolveUserId(auth));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/students")
    public ResponseEntity<List<UserSummaryDto>> getStudents(
            @PathVariable Long id, Authentication auth) {
        return ResponseEntity.ok(courseService.getStudents(id, resolveUserId(auth)));
    }

    @GetMapping("/{id}/students/available")
    public ResponseEntity<List<UserSummaryDto>> searchAvailableStudents(
            @PathVariable Long id,
            @RequestParam(required = false) String q,
            Authentication auth) {
        return ResponseEntity.ok(courseService.searchAvailableStudents(id, q, resolveUserId(auth)));
    }

    private Long resolveUserId(Authentication auth) {
        if (auth.getPrincipal() instanceof User user) return user.getId();
        return userRepository.findByUsername(auth.getName())
                .map(User::getId).orElse(null);
    }
}
```

- [ ] **Step 5: Run CRUD tests — verify they pass**

```bash
cd backend && mvn test -Dtest=CourseControllerTest -q 2>&1 | tail -10
```
Expected: all CRUD tests pass. If `CourseWithCountsView.getCreatedAt()` causes a type mismatch error (H2 returns `Timestamp` instead of `LocalDateTime`), change the projection return type to `Object` and update `CourseDto.from(CourseWithCountsView)`:
```java
// projection change:
Object getCreatedAt();

// CourseDto.from change:
LocalDateTime createdAt = switch (v.getCreatedAt()) {
    case java.sql.Timestamp ts -> ts.toLocalDateTime();
    case LocalDateTime ldt -> ldt;
    default -> null;
};
return new CourseDto(v.getId(), v.getName(), v.getDescription(),
        v.getExerciseCount() != null ? v.getExerciseCount() : 0L,
        v.getStudentCount() != null ? v.getStudentCount() : 0L,
        createdAt);
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/course/CourseService.java \
        backend/src/main/java/com/platform/exercise/course/CourseController.java \
        backend/src/test/java/com/platform/exercise/course/CourseControllerTest.java
git commit -m "feat(f3-2): implement Course CRUD API (TDD)"
```

---

## Task 4: Exercise association endpoints — TDD

**Files:**
- Modify: `backend/src/test/java/com/platform/exercise/course/CourseControllerTest.java`

- [ ] **Step 1: Add exercise tests to `CourseControllerTest`**

Add these methods inside the existing test class (after the CRUD block):

```java
    // ---- exercise association ----

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void addExercises_publishedExercise_returns200WithLinkedCount() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        Long exerciseId = jdbcTemplate.queryForObject(
                "INSERT INTO exercises (title, description, type, difficulty, status, " +
                "is_deleted, like_count, created_by) VALUES (?,?,?,?,?,?,?,?) RETURNING id",
                Long.class,
                "Ex1", "Desc", "PYTHON", "EASY", "PUBLISHED", false, 0, tutor1Id);

        mockMvc.perform(post("/v1/courses/" + courseId + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseIds\":[" + exerciseId + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.linked").value(1));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void addExercises_draftExercise_returns400() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        Long exerciseId = jdbcTemplate.queryForObject(
                "INSERT INTO exercises (title, description, type, difficulty, status, " +
                "is_deleted, like_count, created_by) VALUES (?,?,?,?,?,?,?,?) RETURNING id",
                Long.class,
                "Ex2", "Desc", "PYTHON", "EASY", "DRAFT", false, 0, tutor1Id);

        mockMvc.perform(post("/v1/courses/" + courseId + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseIds\":[" + exerciseId + "]}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("EXERCISE_NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void addExercises_idempotent_returns200() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        Long exerciseId = jdbcTemplate.queryForObject(
                "INSERT INTO exercises (title, description, type, difficulty, status, " +
                "is_deleted, like_count, created_by) VALUES (?,?,?,?,?,?,?,?) RETURNING id",
                Long.class,
                "Ex3", "Desc", "PYTHON", "EASY", "PUBLISHED", false, 0, tutor1Id);
        // link once
        jdbcTemplate.update("INSERT INTO course_exercises (course_id, exercise_id) VALUES (?,?)",
                courseId, exerciseId);
        // link again — should not error
        mockMvc.perform(post("/v1/courses/" + courseId + "/exercises")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"exerciseIds\":[" + exerciseId + "]}"))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void removeExercise_returns204() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        Long exerciseId = jdbcTemplate.queryForObject(
                "INSERT INTO exercises (title, description, type, difficulty, status, " +
                "is_deleted, like_count, created_by) VALUES (?,?,?,?,?,?,?,?) RETURNING id",
                Long.class,
                "Ex4", "Desc", "PYTHON", "EASY", "PUBLISHED", false, 0, tutor1Id);
        jdbcTemplate.update("INSERT INTO course_exercises (course_id, exercise_id) VALUES (?,?)",
                courseId, exerciseId);

        mockMvc.perform(delete("/v1/courses/" + courseId + "/exercises/" + exerciseId))
                .andExpect(status().isNoContent());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getExercises_returnsLinkedExercises() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        Long exerciseId = jdbcTemplate.queryForObject(
                "INSERT INTO exercises (title, description, type, difficulty, status, " +
                "is_deleted, like_count, created_by) VALUES (?,?,?,?,?,?,?,?) RETURNING id",
                Long.class,
                "Ex5", "Desc", "PYTHON", "EASY", "PUBLISHED", false, 0, tutor1Id);
        jdbcTemplate.update("INSERT INTO course_exercises (course_id, exercise_id) VALUES (?,?)",
                courseId, exerciseId);

        mockMvc.perform(get("/v1/courses/" + courseId + "/exercises"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].title").value("Ex5"))
                .andExpect(jsonPath("$[0].status").value("PUBLISHED"));
    }
```

- [ ] **Step 2: Run new tests — verify they pass**

The implementation is already in place from Task 3. Run just the new tests:

```bash
cd backend && mvn test -Dtest=CourseControllerTest -q 2>&1 | tail -10
```
Expected: all tests pass. Note: H2 supports `RETURNING id` in MySQL mode; if not, replace with `jdbcTemplate.update(...)` followed by `jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class)`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/platform/exercise/course/CourseControllerTest.java
git commit -m "test(f3-2): add exercise association tests"
```

---

## Task 5: Student enrollment endpoints — TDD

**Files:**
- Modify: `backend/src/test/java/com/platform/exercise/course/CourseControllerTest.java`

- [ ] **Step 1: Add student enrollment tests**

Add these methods inside the test class (after the exercise block):

```java
    // ---- student enrollment ----

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void enrollStudents_validStudents_returns200WithCount() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        mockMvc.perform(post("/v1/courses/" + courseId + "/students")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[" + student1Id + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrolled").value(1))
                .andExpect(jsonPath("$.errors").isEmpty());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void enrollStudents_nonStudentUser_returns200WithError() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        mockMvc.perform(post("/v1/courses/" + courseId + "/students")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[" + tutor2Id + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrolled").value(0))
                .andExpect(jsonPath("$.errors[0]").exists());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void enrollStudents_idempotent_returns200() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        jdbcTemplate.update("INSERT INTO course_students (course_id, user_id) VALUES (?,?)",
                courseId, student1Id);
        // enrol again — INSERT IGNORE, no error
        mockMvc.perform(post("/v1/courses/" + courseId + "/students")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[" + student1Id + "]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enrolled").value(1));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void unenrollStudent_returns204() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        jdbcTemplate.update("INSERT INTO course_students (course_id, user_id) VALUES (?,?)",
                courseId, student1Id);
        mockMvc.perform(delete("/v1/courses/" + courseId + "/students/" + student1Id))
                .andExpect(status().isNoContent());
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void getStudents_returnsEnrolledStudents() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        jdbcTemplate.update("INSERT INTO course_students (course_id, user_id) VALUES (?,?)",
                courseId, student1Id);
        mockMvc.perform(get("/v1/courses/" + courseId + "/students"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].username").value("student1"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void searchAvailableStudents_returnsNonEnrolledStudents() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        // student1 not yet enrolled — should appear in results
        mockMvc.perform(get("/v1/courses/" + courseId + "/students/available?q=student"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].username").value("student1"));
    }

    @Test
    @WithMockUser(username = "tutor1", roles = "TUTOR")
    void searchAvailableStudents_excludesAlreadyEnrolled() throws Exception {
        Long courseId = createCourseFor(tutor1Id, "CS101");
        jdbcTemplate.update("INSERT INTO course_students (course_id, user_id) VALUES (?,?)",
                courseId, student1Id);
        mockMvc.perform(get("/v1/courses/" + courseId + "/students/available?q=student"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
```

- [ ] **Step 2: Run all tests — verify they pass**

```bash
cd backend && mvn test -Dtest=CourseControllerTest -q 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 3: Run full test suite**

```bash
cd backend && mvn test -q 2>&1 | tail -5
```
Expected: BUILD SUCCESS — no regressions.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/platform/exercise/course/CourseControllerTest.java
git commit -m "test(f3-2): add student enrollment tests"
```

---

## Task 6: Frontend — courseApi.js + routing + nav link

**Files:**
- Create: `frontend/src/api/courseApi.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/tutor/TutorPage.jsx`

- [ ] **Step 1: Write courseApi.js**

```js
// frontend/src/api/courseApi.js
import axiosInstance from './axiosInstance';

export const courseApi = {
  list: (page = 0, size = 20) =>
    axiosInstance.get('/v1/courses', { params: { page, size } }).then(r => r.data),

  create: (data) =>
    axiosInstance.post('/v1/courses', data).then(r => r.data),

  getDetail: (id) =>
    axiosInstance.get(`/v1/courses/${id}`).then(r => r.data),

  update: (id, data) =>
    axiosInstance.put(`/v1/courses/${id}`, data).then(r => r.data),

  remove: (id) =>
    axiosInstance.delete(`/v1/courses/${id}`),

  addExercises: (courseId, exerciseIds) =>
    axiosInstance.post(`/v1/courses/${courseId}/exercises`, { exerciseIds }).then(r => r.data),

  removeExercise: (courseId, exerciseId) =>
    axiosInstance.delete(`/v1/courses/${courseId}/exercises/${exerciseId}`),

  getExercises: (courseId) =>
    axiosInstance.get(`/v1/courses/${courseId}/exercises`).then(r => r.data),

  enrollStudents: (courseId, userIds) =>
    axiosInstance.post(`/v1/courses/${courseId}/students`, { userIds }).then(r => r.data),

  unenrollStudent: (courseId, userId) =>
    axiosInstance.delete(`/v1/courses/${courseId}/students/${userId}`),

  getStudents: (courseId) =>
    axiosInstance.get(`/v1/courses/${courseId}/students`).then(r => r.data),

  searchAvailableStudents: (courseId, q = '') =>
    axiosInstance.get(`/v1/courses/${courseId}/students/available`, { params: { q } }).then(r => r.data),
};
```

- [ ] **Step 2: Add routes to App.jsx**

In `frontend/src/App.jsx`, add these imports at the top:
```js
import CourseManagementPage from './pages/tutor/CourseManagementPage';
import CourseFormPage from './pages/tutor/CourseFormPage';
import CourseDetailPage from './pages/tutor/CourseDetailPage';
```

Then add these routes inside `<Routes>`, after the existing `/tutor/categories` route:
```jsx
<Route path="/tutor/courses" element={
  <ProtectedRoute requiredRole="TUTOR"><CourseManagementPage /></ProtectedRoute>
} />
<Route path="/tutor/courses/new" element={
  <ProtectedRoute requiredRole="TUTOR"><CourseFormPage /></ProtectedRoute>
} />
<Route path="/tutor/courses/:id/edit" element={
  <ProtectedRoute requiredRole="TUTOR"><CourseFormPage /></ProtectedRoute>
} />
<Route path="/tutor/courses/:id" element={
  <ProtectedRoute requiredRole="TUTOR"><CourseDetailPage /></ProtectedRoute>
} />
```

- [ ] **Step 3: Add nav link to TutorPage.jsx**

Replace the contents of `frontend/src/pages/tutor/TutorPage.jsx`:
```jsx
import { Link } from 'react-router-dom';

export default function TutorPage() {
  return (
    <div style={{ padding: 32 }}>
      <h1>Tutor Dashboard</h1>
      <nav style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <Link to="/tutor/categories">Category Management</Link>
        <Link to="/tutor/courses">Course Management</Link>
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```
Expected: build completes without errors. (The three new page imports will fail until the page files exist — create empty placeholder exports first if needed, or create the pages in the next tasks before running the build.)

If build fails due to missing page files, create temporary stubs:
```jsx
// Temporary stub — replace in Tasks 7–9
export default function CourseManagementPage() { return <div>Coming soon</div>; }
```
Then re-run the build.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/courseApi.js frontend/src/App.jsx frontend/src/pages/tutor/TutorPage.jsx
git commit -m "feat(f3-2): add courseApi, routes, and nav link"
```

---

## Task 7: CourseManagementPage

**Files:**
- Create: `frontend/src/pages/tutor/CourseManagementPage.jsx`

- [ ] **Step 1: Write CourseManagementPage**

```jsx
// frontend/src/pages/tutor/CourseManagementPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';

export default function CourseManagementPage() {
  const [page, setPage] = useState({ content: [], totalPages: 0 });
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function load(p = 0) {
    setLoading(true);
    try {
      setPage(await courseApi.list(p, 20));
      setCurrentPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(course) {
    if (!confirm(`Delete course "${course.name}"? This cannot be undone.`)) return;
    try {
      await courseApi.remove(course.id);
      load(currentPage);
    } catch {
      alert('Failed to delete course.');
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Courses</h1>
        <button
          onClick={() => navigate('/tutor/courses/new')}
          style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 18px', cursor: 'pointer' }}>
          + New Course
        </button>
      </div>

      {loading ? <p style={{ marginTop: 24 }}>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Description</th>
              <th style={{ padding: 8, textAlign: 'center' }}>Exercises</th>
              <th style={{ padding: 8, textAlign: 'center' }}>Students</th>
              <th style={{ padding: 8 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {page.content.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>
                  <Link to={`/tutor/courses/${c.id}`} style={{ color: '#1976d2', textDecoration: 'none', fontWeight: 500 }}>
                    {c.name}
                  </Link>
                </td>
                <td style={{ padding: 8, color: '#555', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.description || '—'}
                </td>
                <td style={{ padding: 8, textAlign: 'center' }}>{c.exerciseCount}</td>
                <td style={{ padding: 8, textAlign: 'center' }}>{c.studentCount}</td>
                <td style={{ padding: 8, display: 'flex', gap: 8 }}>
                  <button onClick={() => navigate(`/tutor/courses/${c.id}/edit`)}
                    style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #bbb', borderRadius: 3, background: '#fff', cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(c)}
                    style={{ padding: '4px 10px', fontSize: 12, border: '1px solid #e57373', borderRadius: 3, background: '#fff', color: '#c62828', cursor: 'pointer' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {page.content.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#999' }}>No courses yet.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {page.totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button disabled={currentPage === 0} onClick={() => load(currentPage - 1)}>Prev</button>
          <span>Page {currentPage + 1} / {page.totalPages}</span>
          <button disabled={currentPage >= page.totalPages - 1} onClick={() => load(currentPage + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Start dev server and verify manually**

```bash
cd frontend && npm run dev
```
Log in as a tutor. Navigate to `/tutor` and click "Course Management". Verify:
- Empty state shows "No courses yet."
- "New Course" button is present and navigates to `/tutor/courses/new` (will 404 until Task 8).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/tutor/CourseManagementPage.jsx
git commit -m "feat(f3-2): implement CourseManagementPage"
```

---

## Task 8: CourseFormPage

**Files:**
- Create: `frontend/src/pages/tutor/CourseFormPage.jsx`

- [ ] **Step 1: Write CourseFormPage**

```jsx
// frontend/src/pages/tutor/CourseFormPage.jsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';

export default function CourseFormPage() {
  const { id } = useParams(); // defined for edit, undefined for new
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    courseApi.getDetail(id).then(c => {
      setName(c.name);
      setDescription(c.description || '');
    }).catch(() => navigate('/tutor/courses'));
  }, [id, isEdit, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Course name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await courseApi.update(id, { name: name.trim(), description: description.trim() || null });
      } else {
        await courseApi.create({ name: name.trim(), description: description.trim() || null });
      }
      navigate('/tutor/courses');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to save course.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 32, maxWidth: 520 }}>
      <h1>{isEdit ? 'Edit Course' : 'New Course'}</h1>
      <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>
            Course Name <span style={{ color: '#c62828' }}>*</span>
          </label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            maxLength={200}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={4}
            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>
        {error && <p style={{ color: '#c62828', margin: '0 0 12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" disabled={saving}
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '9px 20px', cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => navigate('/tutor/courses')}
            style={{ background: '#fff', border: '1px solid #bbb', borderRadius: 4, padding: '9px 20px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Test manually**

With dev server running:
- Navigate to `/tutor/courses/new`. Fill in name and description. Save → redirects to list with new course shown.
- Click Edit on a course → form pre-fills. Change name. Save → list shows updated name.
- Submit with blank name → inline error shown, no API call.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/tutor/CourseFormPage.jsx
git commit -m "feat(f3-2): implement CourseFormPage (create and edit)"
```

---

## Task 9: CourseDetailPage

**Files:**
- Create: `frontend/src/pages/tutor/CourseDetailPage.jsx`

- [ ] **Step 1: Write CourseDetailPage**

```jsx
// frontend/src/pages/tutor/CourseDetailPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';

const TABS = ['Overview', 'Exercises', 'Students'];

export default function CourseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchTimer, setSearchTimer] = useState(null);

  useEffect(() => {
    courseApi.getDetail(id).then(setCourse).catch(() => navigate('/tutor/courses'));
  }, [id, navigate]);

  const loadStudents = useCallback(() => {
    courseApi.getStudents(id).then(setStudents);
  }, [id]);

  useEffect(() => {
    if (tab === 'Students') loadStudents();
  }, [tab, loadStudents]);

  function handleSearchChange(q) {
    setSearchQuery(q);
    clearTimeout(searchTimer);
    setSearchTimer(setTimeout(() => {
      courseApi.searchAvailableStudents(id, q).then(setSearchResults);
    }, 300));
  }

  async function handleEnrol(userId) {
    await courseApi.enrollStudents(id, [userId]);
    loadStudents();
    courseApi.searchAvailableStudents(id, searchQuery).then(setSearchResults);
    courseApi.getDetail(id).then(setCourse);
  }

  async function handleUnenrol(userId) {
    if (!confirm('Unenrol this student?')) return;
    await courseApi.unenrollStudent(id, userId);
    loadStudents();
    courseApi.getDetail(id).then(setCourse);
  }

  async function handleDelete() {
    if (!confirm(`Delete course "${course.name}"?`)) return;
    await courseApi.remove(id);
    navigate('/tutor/courses');
  }

  if (!course) return <p style={{ padding: 32 }}>Loading…</p>;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <span style={{ color: '#1976d2', cursor: 'pointer' }} onClick={() => navigate('/tutor/courses')}>
          ← Courses
        </span>
        <h1 style={{ margin: '8px 0 0' }}>{course.name}</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e0e0e0', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '10px 20px', fontSize: 14, border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: tab === t ? 600 : 400,
              color: tab === t ? '#1976d2' : '#555',
              borderBottom: tab === t ? '2px solid #1976d2' : '2px solid transparent',
              marginBottom: -2,
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'Overview' && (
        <div>
          <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
            {[['Exercises', course.exerciseCount], ['Students', course.studentCount]].map(([label, val]) => (
              <div key={label} style={{ background: '#f5f5f5', borderRadius: 6, padding: '16px 28px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#1976d2' }}>{val}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
          {course.description && <p style={{ color: '#555', marginBottom: 20 }}>{course.description}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => navigate(`/tutor/courses/${id}/edit`)}
              style={{ padding: '7px 16px', border: '1px solid #bbb', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
              Edit Course
            </button>
            <button onClick={handleDelete}
              style={{ padding: '7px 16px', border: '1px solid #e57373', borderRadius: 4, background: '#fff', color: '#c62828', cursor: 'pointer' }}>
              Delete Course
            </button>
          </div>
        </div>
      )}

      {/* Exercises — placeholder until F4 */}
      {tab === 'Exercises' && (
        <div style={{ padding: '24px 0', color: '#888' }}>
          Exercise linking will be available once exercises are created.
        </div>
      )}

      {/* Students */}
      {tab === 'Students' && (
        <div>
          <h3 style={{ marginTop: 0 }}>Add Student</h3>
          <input
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by username or name…"
            style={{ padding: 8, width: 280, border: '1px solid #ccc', borderRadius: 4, marginBottom: 8 }}
          />
          {searchResults.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #eee', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Username</th>
                  <th style={{ padding: '6px 8px' }}>Display Name</th>
                  <th style={{ padding: '6px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {searchResults.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px 8px' }}>{u.username}</td>
                    <td style={{ padding: '6px 8px' }}>{u.displayName}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <button onClick={() => handleEnrol(u.id)}
                        style={{ padding: '3px 10px', fontSize: 12, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
                        Enrol
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {searchQuery && searchResults.length === 0 && (
            <p style={{ color: '#999', marginBottom: 16 }}>No available students match "{searchQuery}".</p>
          )}

          <h3>Enrolled Students ({students.length})</h3>
          {students.length === 0
            ? <p style={{ color: '#999' }}>No students enrolled yet.</p>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Username</th>
                    <th style={{ padding: 8 }}>Display Name</th>
                    <th style={{ padding: 8 }} />
                  </tr>
                </thead>
                <tbody>
                  {students.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 8 }}>{u.username}</td>
                      <td style={{ padding: 8 }}>{u.displayName}</td>
                      <td style={{ padding: 8 }}>
                        <button onClick={() => handleUnenrol(u.id)}
                          style={{ padding: '3px 10px', fontSize: 12, border: '1px solid #e57373', borderRadius: 3, background: '#fff', color: '#c62828', cursor: 'pointer' }}>
                          Unenrol
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Test manually**

With dev server running:
- Click a course name from the list → detail page loads with Overview tab.
- Stat cards show exerciseCount and studentCount.
- Click Exercises tab → placeholder text shown.
- Click Students tab → search input appears. Type a username → results appear after 300ms. Click Enrol → student moves to enrolled list. Click Unenrol → student removed.
- Click Delete Course → confirmation → redirects to list.
- Click Edit Course → navigates to edit form.

- [ ] **Step 3: Run full build + backend tests**

```bash
cd frontend && npm run build -q
cd ../backend && mvn test -q 2>&1 | tail -5
```
Expected: both succeed with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/tutor/CourseDetailPage.jsx
git commit -m "feat(f3-2): implement CourseDetailPage with Overview, Exercises placeholder, Students tabs"
```

---

## Self-Review Checklist

- [x] Course CRUD (create/list/get/update/soft-delete) — Tasks 3
- [x] Tutor sees only own courses — Task 3 `listCourses_tutorSeesOnlyOwnCourses`
- [x] Ownership guard returns 404 (not 403) — Task 3 `getCourse_notOwner_returns404`
- [x] Exercise association (add PUBLISHED only, remove, list) — Task 4
- [x] Student enrollment (batch, per-item validation, idempotent, unenrol, list, search) — Task 5
- [x] `searchAvailableStudents` excludes already-enrolled — Task 5
- [x] Frontend list page with counts + edit/delete — Task 7
- [x] Frontend create/edit form page — Task 8
- [x] Frontend detail tabs (Overview, Exercises placeholder, Students) — Task 9
- [x] `GET /v1/courses/{id}` endpoint — in CourseController `getById`
- [x] `GET /v1/courses/{id}/students/available` endpoint — in CourseController `searchAvailableStudents`
- [x] No `@ManyToMany` on Course — uses native queries throughout
