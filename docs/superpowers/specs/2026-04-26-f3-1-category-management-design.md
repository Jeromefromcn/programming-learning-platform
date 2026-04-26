# F-3.1 Category Management — Design Spec

**Date:** 2026-04-26
**Feature:** F-3.1 Category Management
**Status:** Approved, ready for implementation

---

## Context

Categories are knowledge topic tags (e.g. "Loops", "Variables") used to organise exercises. Tutors manage them; no IT involvement needed. Categories appear in the exercise authoring dropdown and student filter controls. A category cannot be deleted if it has linked non-deleted exercises.

---

## Approach

Native SQL projection for `exerciseCount` — the `Exercise` JPA entity does not exist yet (created in F-4). A single `LEFT JOIN` query on the `exercises` table computes counts without requiring the entity. No N+1 queries. All error codes (`CATEGORY_DUPLICATE`, `CATEGORY_HAS_EXERCISES`, `CATEGORY_NOT_FOUND`) are already defined in `ErrorCode.java`. The `categories` table already exists from V1 migration — no new migration needed.

---

## Backend

### `domain/Category.java`

JPA entity mapping the `categories` table: `id` (BIGINT PK), `name` (VARCHAR 100, unique), `createdAt`. Use `@Getter` + `@NoArgsConstructor` (no `@Data` — entity is simple and largely immutable after creation).

### `repository/CategoryRepository.java`

Extends `JpaRepository<Category, Long>`. Two native queries:

```java
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
```

### `repository/CategoryView.java` (Spring Data projection)

Interface projection returned by `findAllWithExerciseCount()`:

```java
public interface CategoryView {
    Long getId();
    String getName();
    Long getExerciseCount();
}
```

### `category/CategoryDto.java`

Record: `Long id, String name, long exerciseCount`. Two static factories:

```java
// Used by listAll() — maps from native projection
public static CategoryDto from(CategoryView v) {
    return new CategoryDto(v.getId(), v.getName(),
        v.getExerciseCount() != null ? v.getExerciseCount() : 0L);
}

// Used by create() — newly created category always has exerciseCount 0
public static CategoryDto from(Category c) {
    return new CategoryDto(c.getId(), c.getName(), 0L);
}
```

### `category/CreateCategoryRequest.java`

Record: `@NotBlank String name`.

### `category/CategoryService.java`

```
listAll()         → findAllWithExerciseCount() mapped to List<CategoryDto>
create(request)   → new Category(name), save; DB constraint surfaces as DataIntegrityViolationException
delete(id)        → find or CATEGORY_NOT_FOUND; count > 0 → CATEGORY_HAS_EXERCISES; delete
```

`create` does NOT pre-check uniqueness — the DB unique index is the single source of truth. `DataIntegrityViolationException` is caught at the exception handler level.

### `category/CategoryController.java`

`@RequestMapping("/v1/categories")`, `@RequiredArgsConstructor`:

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/v1/categories` | `isAuthenticated()` | `200 List<CategoryDto>` |
| POST | `/v1/categories` | `hasRole('TUTOR')` | `201 CategoryDto` |
| DELETE | `/v1/categories/{id}` | `hasRole('TUTOR')` | `204 No Content` |

### `common/GlobalExceptionHandler.java` — addition

Add handler for `DataIntegrityViolationException`. Detect `uk_category_name` constraint violation by checking the message for `uk_category_name` and return `409 CATEGORY_DUPLICATE`. Falls back to `500` for unrecognised constraint violations.

```java
@ExceptionHandler(DataIntegrityViolationException.class)
public ResponseEntity<ErrorResponse> handleDataIntegrity(DataIntegrityViolationException ex) {
    String msg = ex.getMostSpecificCause().getMessage();
    if (msg != null && msg.contains("uk_category_name")) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(ErrorResponse.of(ErrorCode.CATEGORY_DUPLICATE, "This category already exists"));
    }
    // Unrecognised constraint — surface as 500
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ErrorResponse.of(ErrorCode.VALIDATION_ERROR, "Unexpected database constraint violation"));
}
```

---

## Frontend

### `src/api/categoryApi.js`

```js
export const categoryApi = {
  list: () => axiosInstance.get('/v1/categories').then(r => r.data),
  create: (name) => axiosInstance.post('/v1/categories', { name }).then(r => r.data),
  delete: (id) => axiosInstance.delete(`/v1/categories/${id}`).then(r => r.data),
};
```

### `src/pages/tutor/CategoryManagementPage.jsx`

- Inline add form (input + button) at the top — no modal (single field doesn't warrant one)
- Table: Name | Exercise Count | Actions
- Delete button disabled if `exerciseCount > 0` (client-side guard from list data; tooltip: "Has exercises — remove associations first"); still handles 409 defensively in case of race condition
- Duplicate name → inline error below input field, cleared on next input change
- No pagination — categories are a short flat list
- Same inline-style visual language as `UserManagementPage.jsx`

### `src/pages/tutor/TutorPage.jsx`

Upgraded to a basic dashboard (matching `AdminDashboardPage` pattern): heading "Tutor Dashboard" + nav link to `/tutor/categories` ("Category Management"). Future tutor features (F-4 etc.) will add more links.

### `src/App.jsx`

Add route:
```jsx
<Route path="/tutor/categories" element={
  <ProtectedRoute requiredRole="TUTOR">
    <CategoryManagementPage />
  </ProtectedRoute>
} />
```

### `src/pages/admin/AdminDashboardPage.jsx`

Update existing hardcoded `/admin/categories` link → `/tutor/categories`.

---

## Testing

### `CategoryControllerTest.java`

`@SpringBootTest`, `@AutoConfigureMockMvc`, `@ActiveProfiles("test")`, `@Transactional`. Tests:

| Test | Expected |
|------|----------|
| `GET /v1/categories` as TUTOR | 200, array with `exerciseCount` |
| `GET /v1/categories` unauthenticated | 401 |
| `POST /v1/categories` as TUTOR, valid name | 201, `exerciseCount: 0` |
| `POST /v1/categories` as STUDENT | 403 |
| `POST /v1/categories` duplicate name | 409 `CATEGORY_DUPLICATE` |
| `DELETE /v1/categories/{id}` as TUTOR, no exercises | 204 |
| `DELETE /v1/categories/{id}` as STUDENT | 403 |
| `DELETE /v1/categories/{id}` non-existent | 404 `CATEGORY_NOT_FOUND` |
| `DELETE /v1/categories/{id}` with linked exercise | 409 `CATEGORY_HAS_EXERCISES` |

The "linked exercise" test inserts a raw row into `exercises` via `JdbcTemplate` to avoid requiring the Exercise entity.

---

## Files Created / Modified

| Action | Path |
|--------|------|
| Create | `backend/src/main/java/com/platform/exercise/domain/Category.java` |
| Create | `backend/src/main/java/com/platform/exercise/repository/CategoryRepository.java` |
| Create | `backend/src/main/java/com/platform/exercise/repository/CategoryView.java` |
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

## Out of Scope

- Category hierarchy / parent-child relationships
- Category reordering
- Category descriptions
- Pagination on category list
