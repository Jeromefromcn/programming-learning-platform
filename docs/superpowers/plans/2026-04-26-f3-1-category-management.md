# F-3.1 Category Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement CRUD category management — backend REST API + tutor frontend page with exerciseCount display and guarded delete.

**Architecture:** Native SQL projection computes `exerciseCount` per category via a single LEFT JOIN (no Exercise JPA entity yet). `DataIntegrityViolationException` in `GlobalExceptionHandler` maps DB unique constraint violations to `CATEGORY_DUPLICATE`. All error codes pre-exist in `ErrorCode.java`; categories table pre-exists in V1 migration.

**Tech Stack:** Spring Boot 3.2.5 · Spring Data JPA · H2 (test) · React 18 · Axios · React Router 6

---

## File Map

| Action | Path |
|--------|------|
| Modify | `backend/src/main/java/com/platform/exercise/domain/User.java` *(pending)* |
| Create | `backend/src/main/resources/db/migration/V2__seed_admin.sql` *(pending)* |
| Modify | `docs/4_feature_specs/p0.md` *(pending)* |
| Modify | `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java` |
| Create | `backend/src/main/java/com/platform/exercise/domain/Category.java` |
| Create | `backend/src/main/java/com/platform/exercise/repository/CategoryView.java` |
| Create | `backend/src/main/java/com/platform/exercise/repository/CategoryRepository.java` |
| Create | `backend/src/main/java/com/platform/exercise/category/CategoryDto.java` |
| Create | `backend/src/main/java/com/platform/exercise/category/CreateCategoryRequest.java` |
| Create | `backend/src/main/java/com/platform/exercise/category/CategoryService.java` |
| Create | `backend/src/main/java/com/platform/exercise/category/CategoryController.java` |
| Modify | `backend/src/main/java/com/platform/exercise/common/GlobalExceptionHandler.java` |
| Create | `backend/src/test/java/com/platform/exercise/category/CategoryControllerTest.java` |
| Create | `frontend/src/api/categoryApi.js` |
| Create | `frontend/src/pages/tutor/CategoryManagementPage.jsx` |
| Modify | `frontend/src/pages/tutor/TutorPage.jsx` |
| Modify | `frontend/src/App.jsx` |
| Modify | `frontend/src/pages/admin/AdminDashboardPage.jsx` |

---

## Task 0: Commit pending F-2.2/F-8 changes + fix seed conflict

**Context:** Three files are uncommitted from the previous feature branch. V2__seed_admin.sql inserts a user with `username = 'admin'`. Flyway runs in the H2 test profile, so this seed executes before tests. `UserControllerTest.@BeforeEach` also inserts `username = 'admin'` → unique constraint violation. Fix by changing the test username to `admin_test`.

**Files:**
- Modify: `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`
- Commit: `backend/src/main/java/com/platform/exercise/domain/User.java`
- Commit: `backend/src/main/resources/db/migration/V2__seed_admin.sql`
- Commit: `docs/4_feature_specs/p0.md`

- [ ] **Step 1: Fix UserControllerTest — rename seeded admin username**

  Replace `admin` with `admin_test` in the `seed()` method so it no longer collides with the V2 Flyway seed:

  In `backend/src/test/java/com/platform/exercise/user/UserControllerTest.java`, change `@BeforeEach void seed()`:

  ```java
  @BeforeEach
  void seed() {
      User admin = new User();
      admin.setUsername("admin_test");          // was "admin" — conflicts with V2 Flyway seed
      admin.setDisplayName("Admin User");
      admin.setPasswordHash(passwordEncoder.encode("password123"));
      admin.setRole(Role.SUPER_ADMIN);
      admin.setStatus(UserStatus.ACTIVE);
      adminId = userRepository.save(admin).getId();

      User student = new User();
      student.setUsername("student1");
      student.setDisplayName("Student One");
      student.setPasswordHash(passwordEncoder.encode("password123"));
      student.setRole(Role.STUDENT);
      student.setStatus(UserStatus.ACTIVE);
      userRepository.save(student);
  }
  ```

  Also update the `@WithMockUser` annotation on `patchStatus_disableSelf_returns400`:

  ```java
  @Test
  @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
  void patchStatus_disableSelf_returns400() throws Exception {
      mockMvc.perform(patch("/v1/users/" + adminId + "/status")
              .contentType(MediaType.APPLICATION_JSON)
              .content("{\"status\":\"DISABLED\"}"))
          .andExpect(status().isBadRequest());
  }
  ```

  And update `listUsers_asAdmin_returns200WithPage` and `createUser_validRequest_returns201` and `createUser_duplicateUsername_returns409` and `patchRole_validRequest_returns200`:

  ```java
  @Test
  @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
  void listUsers_asAdmin_returns200WithPage() throws Exception { ... }

  @Test
  @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
  void createUser_validRequest_returns201() throws Exception { ... }

  @Test
  @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
  void createUser_duplicateUsername_returns409() throws Exception { ... }

  @Test
  @WithMockUser(username = "admin_test", roles = "SUPER_ADMIN")
  void patchRole_validRequest_returns200() throws Exception { ... }
  ```

- [ ] **Step 2: Run existing tests to verify fix**

  ```bash
  cd backend && mvn test -pl . -Dtest=UserControllerTest -q
  ```

  Expected: `BUILD SUCCESS`, 5 tests pass.

- [ ] **Step 3: Commit pending changes**

  ```bash
  git add backend/src/main/java/com/platform/exercise/domain/User.java \
          backend/src/main/resources/db/migration/V2__seed_admin.sql \
          backend/src/test/java/com/platform/exercise/user/UserControllerTest.java \
          docs/4_feature_specs/p0.md
  git commit -m "feat(auth,user): fix User column def, seed admin account, update progress tracker"
  ```

---

## Task 1: Backend — TDD (write test first, then implement)

**Files:**
- Create: `backend/src/test/java/com/platform/exercise/category/CategoryControllerTest.java`
- Create: `backend/src/main/java/com/platform/exercise/domain/Category.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/CategoryView.java`
- Create: `backend/src/main/java/com/platform/exercise/repository/CategoryRepository.java`
- Create: `backend/src/main/java/com/platform/exercise/category/CategoryDto.java`
- Create: `backend/src/main/java/com/platform/exercise/category/CreateCategoryRequest.java`
- Create: `backend/src/main/java/com/platform/exercise/category/CategoryService.java`
- Create: `backend/src/main/java/com/platform/exercise/category/CategoryController.java`
- Modify: `backend/src/main/java/com/platform/exercise/common/GlobalExceptionHandler.java`

- [ ] **Step 1: Write the failing test**

  Create `backend/src/test/java/com/platform/exercise/category/CategoryControllerTest.java`:

  ```java
  package com.platform.exercise.category;

  import com.platform.exercise.domain.Category;
  import com.platform.exercise.domain.User;
  import com.platform.exercise.domain.User.Role;
  import com.platform.exercise.domain.User.UserStatus;
  import com.platform.exercise.repository.CategoryRepository;
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
  class CategoryControllerTest {

      @Autowired private MockMvc mockMvc;
      @Autowired private CategoryRepository categoryRepository;
      @Autowired private UserRepository userRepository;
      @Autowired private PasswordEncoder passwordEncoder;
      @Autowired private JdbcTemplate jdbcTemplate;

      private Long tutorId;

      @BeforeEach
      void seed() {
          User tutor = new User();
          tutor.setUsername("tutor1");
          tutor.setDisplayName("Tutor One");
          tutor.setPasswordHash(passwordEncoder.encode("password123"));
          tutor.setRole(Role.TUTOR);
          tutor.setStatus(UserStatus.ACTIVE);
          tutorId = userRepository.save(tutor).getId();
      }

      @Test
      @WithMockUser(username = "tutor1", roles = "TUTOR")
      void listCategories_asTutor_returns200WithExerciseCount() throws Exception {
          categoryRepository.save(new Category("Loops"));
          mockMvc.perform(get("/v1/categories"))
                  .andExpect(status().isOk())
                  .andExpect(jsonPath("$").isArray())
                  .andExpect(jsonPath("$[0].name").value("Loops"))
                  .andExpect(jsonPath("$[0].exerciseCount").value(0));
      }

      @Test
      void listCategories_unauthenticated_returns401() throws Exception {
          mockMvc.perform(get("/v1/categories"))
                  .andExpect(status().isUnauthorized());
      }

      @Test
      @WithMockUser(username = "tutor1", roles = "TUTOR")
      void createCategory_validName_returns201WithZeroCount() throws Exception {
          mockMvc.perform(post("/v1/categories")
                          .contentType(MediaType.APPLICATION_JSON)
                          .content("{\"name\":\"Recursion\"}"))
                  .andExpect(status().isCreated())
                  .andExpect(jsonPath("$.name").value("Recursion"))
                  .andExpect(jsonPath("$.exerciseCount").value(0));
      }

      @Test
      @WithMockUser(username = "student1", roles = "STUDENT")
      void createCategory_asStudent_returns403() throws Exception {
          mockMvc.perform(post("/v1/categories")
                          .contentType(MediaType.APPLICATION_JSON)
                          .content("{\"name\":\"Recursion\"}"))
                  .andExpect(status().isForbidden());
      }

      @Test
      @WithMockUser(username = "tutor1", roles = "TUTOR")
      void createCategory_duplicateName_returns409() throws Exception {
          categoryRepository.save(new Category("Loops"));
          mockMvc.perform(post("/v1/categories")
                          .contentType(MediaType.APPLICATION_JSON)
                          .content("{\"name\":\"Loops\"}"))
                  .andExpect(status().isConflict())
                  .andExpect(jsonPath("$.error.code").value("CATEGORY_DUPLICATE"));
      }

      @Test
      @WithMockUser(username = "tutor1", roles = "TUTOR")
      void deleteCategory_noLinkedExercises_returns204() throws Exception {
          Category cat = categoryRepository.save(new Category("Variables"));
          mockMvc.perform(delete("/v1/categories/" + cat.getId()))
                  .andExpect(status().isNoContent());
      }

      @Test
      @WithMockUser(username = "student1", roles = "STUDENT")
      void deleteCategory_asStudent_returns403() throws Exception {
          Category cat = categoryRepository.save(new Category("Variables"));
          mockMvc.perform(delete("/v1/categories/" + cat.getId()))
                  .andExpect(status().isForbidden());
      }

      @Test
      @WithMockUser(username = "tutor1", roles = "TUTOR")
      void deleteCategory_notFound_returns404() throws Exception {
          mockMvc.perform(delete("/v1/categories/999999"))
                  .andExpect(status().isNotFound())
                  .andExpect(jsonPath("$.error.code").value("CATEGORY_NOT_FOUND"));
      }

      @Test
      @WithMockUser(username = "tutor1", roles = "TUTOR")
      void deleteCategory_withLinkedExercise_returns409() throws Exception {
          Category cat = categoryRepository.save(new Category("Functions"));
          // Insert a minimal exercise row directly — Exercise JPA entity does not exist yet
          jdbcTemplate.update(
                  "INSERT INTO exercises (title, description, type, difficulty, " +
                  "category_id, status, is_deleted, like_count, created_by) " +
                  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                  "Ex1", "Desc", "PYTHON", "EASY",
                  cat.getId(), "DRAFT", false, 0, tutorId);
          mockMvc.perform(delete("/v1/categories/" + cat.getId()))
                  .andExpect(status().isConflict())
                  .andExpect(jsonPath("$.error.code").value("CATEGORY_HAS_EXERCISES"));
      }
  }
  ```

- [ ] **Step 2: Run test — verify it fails to compile**

  ```bash
  cd backend && mvn test -pl . -Dtest=CategoryControllerTest -q 2>&1 | head -30
  ```

  Expected: compilation error — `Category`, `CategoryRepository` not found.

- [ ] **Step 3: Create Category entity**

  Create `backend/src/main/java/com/platform/exercise/domain/Category.java`:

  ```java
  package com.platform.exercise.domain;

  import jakarta.persistence.*;
  import lombok.Getter;
  import lombok.NoArgsConstructor;
  import java.time.LocalDateTime;

  @Entity
  @Table(name = "categories")
  @Getter
  @NoArgsConstructor
  public class Category {

      @Id
      @GeneratedValue(strategy = GenerationType.IDENTITY)
      private Long id;

      @Column(nullable = false, unique = true, length = 100)
      private String name;

      @Column(name = "created_at", nullable = false, updatable = false)
      private LocalDateTime createdAt = LocalDateTime.now();

      public Category(String name) {
          this.name = name;
      }
  }
  ```

- [ ] **Step 4: Create CategoryView projection**

  Create `backend/src/main/java/com/platform/exercise/repository/CategoryView.java`:

  ```java
  package com.platform.exercise.repository;

  public interface CategoryView {
      Long getId();
      String getName();
      Long getExerciseCount();
  }
  ```

- [ ] **Step 5: Create CategoryRepository**

  Create `backend/src/main/java/com/platform/exercise/repository/CategoryRepository.java`:

  ```java
  package com.platform.exercise.repository;

  import com.platform.exercise.domain.Category;
  import org.springframework.data.jpa.repository.JpaRepository;
  import org.springframework.data.jpa.repository.Query;
  import org.springframework.data.repository.query.Param;

  import java.util.List;

  public interface CategoryRepository extends JpaRepository<Category, Long> {

      @Query(value = """
              SELECT c.id, c.name,
                     COUNT(e.id) AS exercise_count
              FROM categories c
              LEFT JOIN exercises e
                     ON e.category_id = c.id AND e.is_deleted = false
              GROUP BY c.id, c.name
              ORDER BY c.name
              """, nativeQuery = true)
      List<CategoryView> findAllWithExerciseCount();

      @Query(value = "SELECT COUNT(*) FROM exercises WHERE category_id = :id AND is_deleted = false",
             nativeQuery = true)
      long countNonDeletedByCategory(@Param("id") Long id);
  }
  ```

- [ ] **Step 6: Create CategoryDto**

  Create `backend/src/main/java/com/platform/exercise/category/CategoryDto.java`:

  ```java
  package com.platform.exercise.category;

  import com.platform.exercise.domain.Category;
  import com.platform.exercise.repository.CategoryView;

  public record CategoryDto(Long id, String name, long exerciseCount) {

      public static CategoryDto from(CategoryView v) {
          return new CategoryDto(v.getId(), v.getName(),
                  v.getExerciseCount() != null ? v.getExerciseCount() : 0L);
      }

      public static CategoryDto from(Category c) {
          return new CategoryDto(c.getId(), c.getName(), 0L);
      }
  }
  ```

- [ ] **Step 7: Create CreateCategoryRequest**

  Create `backend/src/main/java/com/platform/exercise/category/CreateCategoryRequest.java`:

  ```java
  package com.platform.exercise.category;

  import jakarta.validation.constraints.NotBlank;
  import jakarta.validation.constraints.Size;

  public record CreateCategoryRequest(
          @NotBlank(message = "name must not be blank")
          @Size(max = 100, message = "name must not exceed 100 characters")
          String name) {
  }
  ```

- [ ] **Step 8: Create CategoryService**

  Create `backend/src/main/java/com/platform/exercise/category/CategoryService.java`:

  ```java
  package com.platform.exercise.category;

  import com.platform.exercise.common.ErrorCode;
  import com.platform.exercise.common.PlatformException;
  import com.platform.exercise.domain.Category;
  import com.platform.exercise.repository.CategoryRepository;
  import lombok.RequiredArgsConstructor;
  import org.springframework.stereotype.Service;
  import org.springframework.transaction.annotation.Transactional;

  import java.util.List;

  @Service
  @RequiredArgsConstructor
  public class CategoryService {

      private final CategoryRepository categoryRepository;

      @Transactional(readOnly = true)
      public List<CategoryDto> listAll() {
          return categoryRepository.findAllWithExerciseCount().stream()
                  .map(CategoryDto::from)
                  .toList();
      }

      @Transactional
      public CategoryDto create(CreateCategoryRequest request) {
          Category category = new Category(request.name());
          return CategoryDto.from(categoryRepository.save(category));
      }

      @Transactional
      public void delete(Long id) {
          Category category = categoryRepository.findById(id)
                  .orElseThrow(() -> new PlatformException(ErrorCode.CATEGORY_NOT_FOUND));
          if (categoryRepository.countNonDeletedByCategory(id) > 0) {
              throw new PlatformException(ErrorCode.CATEGORY_HAS_EXERCISES,
                      "This category has exercises — please remove associations first");
          }
          categoryRepository.delete(category);
      }
  }
  ```

- [ ] **Step 9: Create CategoryController**

  Create `backend/src/main/java/com/platform/exercise/category/CategoryController.java`:

  ```java
  package com.platform.exercise.category;

  import jakarta.validation.Valid;
  import lombok.RequiredArgsConstructor;
  import org.springframework.http.HttpStatus;
  import org.springframework.http.ResponseEntity;
  import org.springframework.security.access.prepost.PreAuthorize;
  import org.springframework.web.bind.annotation.*;

  import java.util.List;

  @RestController
  @RequestMapping("/v1/categories")
  @RequiredArgsConstructor
  public class CategoryController {

      private final CategoryService categoryService;

      @GetMapping
      @PreAuthorize("isAuthenticated()")
      public ResponseEntity<List<CategoryDto>> listCategories() {
          return ResponseEntity.ok(categoryService.listAll());
      }

      @PostMapping
      @PreAuthorize("hasRole('TUTOR')")
      public ResponseEntity<CategoryDto> createCategory(@Valid @RequestBody CreateCategoryRequest request) {
          return ResponseEntity.status(HttpStatus.CREATED).body(categoryService.create(request));
      }

      @DeleteMapping("/{id}")
      @PreAuthorize("hasRole('TUTOR')")
      public ResponseEntity<Void> deleteCategory(@PathVariable Long id) {
          categoryService.delete(id);
          return ResponseEntity.noContent().build();
      }
  }
  ```

- [ ] **Step 10: Update GlobalExceptionHandler — add DataIntegrityViolationException handler**

  In `backend/src/main/java/com/platform/exercise/common/GlobalExceptionHandler.java`, add two imports and one handler method. The full updated file:

  ```java
  package com.platform.exercise.common;

  import org.springframework.dao.DataIntegrityViolationException;
  import org.springframework.http.HttpStatus;
  import org.springframework.http.ResponseEntity;
  import org.springframework.web.bind.MethodArgumentNotValidException;
  import org.springframework.web.bind.annotation.ExceptionHandler;
  import org.springframework.web.bind.annotation.RestControllerAdvice;

  import java.util.stream.Collectors;

  @RestControllerAdvice
  public class GlobalExceptionHandler {

      @ExceptionHandler(PlatformException.class)
      public ResponseEntity<ErrorResponse> handlePlatformException(PlatformException ex) {
          return ResponseEntity
              .status(ex.getErrorCode().getHttpStatus())
              .body(ErrorResponse.of(ex.getErrorCode(), ex.getMessage()));
      }

      @ExceptionHandler(MethodArgumentNotValidException.class)
      public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
          String message = ex.getBindingResult().getFieldErrors().stream()
              .map(e -> e.getField() + ": " + e.getDefaultMessage())
              .collect(Collectors.joining("; "));
          return ResponseEntity
              .status(ErrorCode.VALIDATION_ERROR.getHttpStatus())
              .body(ErrorResponse.of(ErrorCode.VALIDATION_ERROR, message));
      }

      @ExceptionHandler(DataIntegrityViolationException.class)
      public ResponseEntity<ErrorResponse> handleDataIntegrity(DataIntegrityViolationException ex) {
          String msg = ex.getMostSpecificCause().getMessage();
          if (msg != null && msg.contains("uk_category_name")) {
              return ResponseEntity
                  .status(HttpStatus.CONFLICT)
                  .body(ErrorResponse.of(ErrorCode.CATEGORY_DUPLICATE, "This category already exists"));
          }
          return ResponseEntity
              .status(HttpStatus.INTERNAL_SERVER_ERROR)
              .body(ErrorResponse.of(ErrorCode.VALIDATION_ERROR,
                  "Unexpected database constraint violation"));
      }
  }
  ```

- [ ] **Step 11: Run all backend tests — verify they pass**

  ```bash
  cd backend && mvn test -q
  ```

  Expected: `BUILD SUCCESS`. All tests including the 9 new `CategoryControllerTest` cases pass.

- [ ] **Step 12: Commit**

  ```bash
  git add backend/src/main/java/com/platform/exercise/domain/Category.java \
          backend/src/main/java/com/platform/exercise/repository/CategoryView.java \
          backend/src/main/java/com/platform/exercise/repository/CategoryRepository.java \
          backend/src/main/java/com/platform/exercise/category/CategoryDto.java \
          backend/src/main/java/com/platform/exercise/category/CreateCategoryRequest.java \
          backend/src/main/java/com/platform/exercise/category/CategoryService.java \
          backend/src/main/java/com/platform/exercise/category/CategoryController.java \
          backend/src/main/java/com/platform/exercise/common/GlobalExceptionHandler.java \
          backend/src/test/java/com/platform/exercise/category/CategoryControllerTest.java
  git commit -m "feat(f3-1): implement category management API (TDD)"
  ```

---

## Task 2: Frontend — category API, page, routing

**Files:**
- Create: `frontend/src/api/categoryApi.js`
- Create: `frontend/src/pages/tutor/CategoryManagementPage.jsx`
- Modify: `frontend/src/pages/tutor/TutorPage.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/admin/AdminDashboardPage.jsx`

- [ ] **Step 1: Create categoryApi.js**

  Create `frontend/src/api/categoryApi.js`:

  ```js
  import axiosInstance from './axiosInstance';

  export const categoryApi = {
    list: () => axiosInstance.get('/v1/categories').then(r => r.data),
    create: (name) => axiosInstance.post('/v1/categories', { name }).then(r => r.data),
    delete: (id) => axiosInstance.delete(`/v1/categories/${id}`),
  };
  ```

- [ ] **Step 2: Create CategoryManagementPage.jsx**

  Create `frontend/src/pages/tutor/CategoryManagementPage.jsx`:

  ```jsx
  import { useEffect, useState } from 'react';
  import { categoryApi } from '../../api/categoryApi';

  export default function CategoryManagementPage() {
    const [categories, setCategories] = useState([]);
    const [newName, setNewName] = useState('');
    const [addError, setAddError] = useState('');
    const [loading, setLoading] = useState(false);

    async function load() {
      setLoading(true);
      try {
        const data = await categoryApi.list();
        setCategories(data);
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => { load(); }, []);

    async function handleAdd(e) {
      e.preventDefault();
      if (!newName.trim()) return;
      setAddError('');
      try {
        await categoryApi.create(newName.trim());
        setNewName('');
        load();
      } catch (err) {
        const code = err.response?.data?.error?.code;
        setAddError(code === 'CATEGORY_DUPLICATE'
          ? 'This category already exists.'
          : 'Failed to create category.');
      }
    }

    async function handleDelete(cat) {
      if (!confirm(`Delete category "${cat.name}"?`)) return;
      try {
        await categoryApi.delete(cat.id);
        load();
      } catch (err) {
        const code = err.response?.data?.error?.code;
        alert(code === 'CATEGORY_HAS_EXERCISES'
          ? 'This category has exercises — please remove associations first.'
          : 'Failed to delete category.');
      }
    }

    return (
      <div style={{ padding: 32 }}>
        <h1>Category Management</h1>

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginTop: 24, marginBottom: 4 }}>
          <input
            value={newName}
            onChange={e => { setNewName(e.target.value); setAddError(''); }}
            placeholder="New category name"
            style={{ padding: 8, width: 240, border: '1px solid #ccc', borderRadius: 4 }}
          />
          <button type="submit"
            style={{ background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer' }}>
            + Add
          </button>
        </form>
        {addError && <p style={{ color: '#c62828', margin: '4px 0 0' }}>{addError}</p>}

        {loading ? <p style={{ marginTop: 16 }}>Loading…</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>Name</th>
                <th style={{ padding: 8 }}>Exercise Count</th>
                <th style={{ padding: 8 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => (
                <tr key={cat.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 8 }}>{cat.name}</td>
                  <td style={{ padding: 8 }}>{cat.exerciseCount}</td>
                  <td style={{ padding: 8 }}>
                    <button
                      onClick={() => handleDelete(cat)}
                      disabled={cat.exerciseCount > 0}
                      title={cat.exerciseCount > 0 ? 'Has exercises — remove associations first' : ''}
                      style={{
                        padding: '4px 10px',
                        cursor: cat.exerciseCount > 0 ? 'not-allowed' : 'pointer',
                        opacity: cat.exerciseCount > 0 ? 0.4 : 1,
                      }}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: 16, color: '#999', textAlign: 'center' }}>
                    No categories yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: Update TutorPage.jsx — add dashboard navigation**

  Replace `frontend/src/pages/tutor/TutorPage.jsx` with:

  ```jsx
  import { Link } from 'react-router-dom';

  export default function TutorPage() {
    return (
      <div style={{ padding: 32 }}>
        <h1>Tutor Dashboard</h1>
        <nav style={{ display: 'flex', gap: 16, marginTop: 24 }}>
          <Link to="/tutor/categories">Category Management</Link>
        </nav>
      </div>
    );
  }
  ```

- [ ] **Step 4: Update App.jsx — add /tutor/categories route**

  Add the import and route to `frontend/src/App.jsx`. Full updated file:

  ```jsx
  import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
  import { AuthProvider } from './contexts/AuthContext';
  import ProtectedRoute from './components/ProtectedRoute';
  import LoginPage from './pages/login/LoginPage';
  import StudentPage from './pages/student/StudentPage';
  import TutorPage from './pages/tutor/TutorPage';
  import CategoryManagementPage from './pages/tutor/CategoryManagementPage';
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
            <Route path="/tutor/categories" element={
              <ProtectedRoute requiredRole="TUTOR"><CategoryManagementPage /></ProtectedRoute>
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

- [ ] **Step 5: Update AdminDashboardPage.jsx — fix categories link**

  Replace `/admin/categories` with `/tutor/categories`. Full updated file:

  ```jsx
  import { Link } from 'react-router-dom';

  export default function AdminDashboardPage() {
    return (
      <div style={{ padding: 32 }}>
        <h1>Admin Dashboard</h1>
        <nav style={{ display: 'flex', gap: 16, marginTop: 24 }}>
          <Link to="/admin/users">User Management</Link>
          <Link to="/admin/settings">Global Settings</Link>
          <Link to="/tutor/categories">Category Management</Link>
        </nav>
      </div>
    );
  }
  ```

- [ ] **Step 6: Verify frontend build**

  ```bash
  cd frontend && npm run build 2>&1 | tail -10
  ```

  Expected: `built in Xs` with no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/api/categoryApi.js \
          frontend/src/pages/tutor/CategoryManagementPage.jsx \
          frontend/src/pages/tutor/TutorPage.jsx \
          frontend/src/App.jsx \
          frontend/src/pages/admin/AdminDashboardPage.jsx
  git commit -m "feat(f3-1): implement category management frontend page and routing"
  ```

---

## Task 3: Mark F-3.1 complete

- [ ] **Step 1: Update progress tracker**

  In `docs/4_feature_specs/p0.md`, change the F-3.1 row:

  ```markdown
  | F-3.1 Category Management | [x] |
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/4_feature_specs/p0.md
  git commit -m "docs: mark F-3.1 category management complete"
  ```
