# F3.2 — Course Management Design Spec

**Date:** 2026-04-26
**Feature:** F-3.2 Course Management
**Status:** Approved
**Backlog Tasks:** T3.2.1, T3.2.2, T3.2.3, T3.3.2

---

## Context

Courses are the organisational layer between exercises and students. Tutors create courses, link published exercises to them, and enrol students. The global course filter (F-8) uses `course_students` to decide which exercises students can see. This feature implements the full backend API and the tutor-facing management UI.

Course management is **TUTOR-only** — SUPER_ADMIN does not have a course management UI in this release.

---

## Decisions Made

| Question | Decision |
|---|---|
| JPA join table mapping | Approach C — no `@ManyToMany`; join tables managed via `@Modifying @Query` native SQL |
| Create/edit course UI | Separate form page (`/tutor/courses/new`, `/tutor/courses/:id/edit`) |
| Exercises tab (F4 not yet built) | Scaffold with placeholder — real UI deferred to F4 |
| SUPER_ADMIN course access | Not implemented in this release |

---

## Backend Design

### Domain Entity

**`com.platform.exercise.domain.Course`**

```java
@Entity @Table(name = "courses")
fields: id, name (VARCHAR 200), description (TEXT), isDeleted (BOOLEAN),
        createdBy (Long — not a JPA relation), createdAt, updatedAt
```

- Soft-delete via `isDeleted` flag; all list queries filter `is_deleted = false`
- `createdBy` stored as plain `Long` (user ID) — no `@ManyToOne` to avoid lazy-load coupling
- No `@ManyToMany` on `Course` — join tables managed via repository queries

### Repository

**`com.platform.exercise.repository.CourseRepository`** extends `JpaRepository<Course, Long>`

**Projection — `CourseWithCountsView`** (interface projection, same pattern as `CategoryView`):
- `getId()`, `getName()`, `getDescription()`, `getCreatedAt()`
- `getExerciseCount()`, `getStudentCount()`

**Custom JPQL/native queries:**
```
findAllWithCountsByCreatedBy(Long createdBy, Pageable) → Page<CourseWithCountsView>
insertCourseExercise(Long courseId, Long exerciseId)   — INSERT IGNORE native
deleteCourseExercise(Long courseId, Long exerciseId)   — native DELETE
isExercisePublished(Long exerciseId)                   — checks exercises.status = 'PUBLISHED' and is_deleted = false
findExercisesInCourse(Long courseId)                   → List<ExerciseSummaryView>
insertCourseStudent(Long courseId, Long userId)        — INSERT IGNORE native
deleteCourseStudent(Long courseId, Long userId)        — native DELETE
isUserStudent(Long userId)                             — checks users.role = 'STUDENT'
findStudentsInCourse(Long courseId)                    → List<UserSummaryView>
findAvailableStudents(Long courseId, String q)         — STUDENT-role users not enrolled, username/displayName LIKE %q%, LIMIT 20
```

**`ExerciseSummaryView`** projection: `getId()`, `getTitle()`, `getType()`, `getDifficulty()`, `getStatus()`

**`UserSummaryView`** projection: `getId()`, `getUsername()`, `getDisplayName()`

### Service

**`com.platform.exercise.course.CourseService`**

| Method | Notes |
|---|---|
| `list(Long userId, Pageable)` | Returns `Page<CourseDto>` filtered by `createdBy = userId` |
| `create(CreateCourseRequest, Long userId)` | Sets `createdBy = userId` |
| `update(Long courseId, UpdateCourseRequest, Long userId)` | Verifies ownership (`createdBy = userId`); 404 if not found or not owner |
| `softDelete(Long courseId, Long userId)` | Sets `isDeleted = true`; verifies ownership |
| `addExercises(Long courseId, Long userId, List<Long> exerciseIds)` | Verifies course ownership; for each ID: checks exercise exists + PUBLISHED, then INSERT IGNORE; returns `{ linked: N }` |
| `removeExercise(Long courseId, Long exerciseId, Long userId)` | Verifies course ownership; native DELETE (idempotent — no error if not linked) |
| `getExercises(Long courseId, Long userId)` | Verifies course ownership; returns exercise summary list |
| `enrollStudents(Long courseId, Long userId, List<Long> userIds)` | Max 200 IDs; verifies course ownership; for each: checks user exists + role STUDENT, then INSERT IGNORE; returns `{ enrolled: N }` |
| `unenrollStudent(Long courseId, Long userId, Long studentId)` | Verifies course ownership; native DELETE (idempotent) |
| `getStudents(Long courseId, Long userId)` | Verifies course ownership; returns user summary list |
| `searchAvailableStudents(Long courseId, Long userId, String q)` | Verifies course ownership; returns STUDENT users not yet enrolled, matching query |

**Ownership check:** `course.createdBy != userId` → throw `PlatformException(COURSE_NOT_FOUND)` (same 404 — do not reveal existence to non-owners).

### Controller

**`com.platform.exercise.course.CourseController`**

All endpoints: `@PreAuthorize("hasRole('TUTOR')")`

```
GET    /v1/courses?page=0&size=20               → Page<CourseDto>
POST   /v1/courses                              → 201 CourseDto
GET    /v1/courses/{id}                         → 200 CourseDto  (ownership check)
PUT    /v1/courses/{id}                         → 200 CourseDto
DELETE /v1/courses/{id}                         → 204

POST   /v1/courses/{id}/exercises               { "exerciseIds": [1,2,3] } → 200 { linked: N }
DELETE /v1/courses/{id}/exercises/{eid}         → 204
GET    /v1/courses/{id}/exercises               → 200 List<ExerciseSummaryDto>

POST   /v1/courses/{id}/students                { "userIds": [1,2,3] }     → 200 { enrolled: N }
DELETE /v1/courses/{id}/students/{uid}          → 204
GET    /v1/courses/{id}/students                → 200 List<UserSummaryDto>
GET    /v1/courses/{id}/students/available?q=   → 200 List<UserSummaryDto>
```

`GET /v1/courses/{id}/students/available?q=username` returns STUDENT-role users whose `username` or `displayName` contains `q`, excluding users already enrolled in this course. `q` is optional — omitting it returns up to 20 matches. This endpoint is TUTOR-only and avoids calling the SUPER_ADMIN-restricted `/v1/users`.

**`CourseDto`**: id, name, description, exerciseCount, studentCount, createdAt

### DTOs / Request Objects

- `CreateCourseRequest`: `name` (NotBlank, max 200), `description` (nullable)
- `UpdateCourseRequest`: same fields
- `AddExercisesRequest`: `exerciseIds` (NotEmpty, max size 200)
- `EnrollStudentsRequest`: `userIds` (NotEmpty, max size 200)

### Error Codes Used

- `COURSE_NOT_FOUND` (404) — course not found or caller is not the owner
- `EXERCISE_NOT_FOUND` (400 per-item) — exercise ID does not exist or is not PUBLISHED
- `USER_NOT_FOUND` (400 per-item) — user ID does not exist or is not a STUDENT
- `VALIDATION_ERROR` (400) — blank name, batch size > 200

### Tests

**`CourseControllerTest`** (`@SpringBootTest`, `@Transactional`, H2):
- CRUD: create, list (tutor sees own only), update, soft-delete
- Auth: unauthenticated → 401, STUDENT role → 403
- Exercise endpoints: add exercises (published check), remove, list
- Student endpoints: enrol, unenrol, list; non-student user → 400
- Ownership: tutor A cannot modify tutor B's course → 404

---

## Frontend Design

### New Files

| Path | Purpose |
|---|---|
| `src/api/courseApi.js` | Axios calls for all course endpoints |
| `src/pages/tutor/CourseManagementPage.jsx` | Course list at `/tutor/courses` |
| `src/pages/tutor/CourseFormPage.jsx` | Create/edit form at `/tutor/courses/new` and `/tutor/courses/:id/edit` |
| `src/pages/tutor/CourseDetailPage.jsx` | Detail + tabs at `/tutor/courses/:id` |

### Modified Files

| Path | Change |
|---|---|
| `src/App.jsx` | Add 3 new TUTOR-protected routes |
| `src/pages/tutor/TutorPage.jsx` | Add "Course Management" nav link |

### Page Descriptions

**`CourseManagementPage`** (`/tutor/courses`)
- Table: Name (link → detail) | Description | Exercises | Students | Edit button | Delete button
- "New Course" button → navigate to `/tutor/courses/new`
- Edit button → navigate to `/tutor/courses/:id/edit`
- Delete button → confirmation dialog → soft-delete API → refresh list
- Pagination: 20 per page

**`CourseFormPage`** (`/tutor/courses/new`, `/tutor/courses/:id/edit`)
- Fields: Name (required, max 200), Description (textarea, optional)
- On load for edit: fetches course data by ID and pre-fills form
- Save → POST or PUT → navigate to `/tutor/courses` on success
- Cancel → navigate back to `/tutor/courses`
- Inline validation error on blank name

**`CourseDetailPage`** (`/tutor/courses/:id`)
- Three tabs: **Overview** | **Exercises** | **Students**
- **Overview tab**: stat cards (exercise count, student count), description, "Edit Course" button (→ edit form), "Delete Course" button (confirmation dialog → soft-delete → redirect to list)
- **Exercises tab**: placeholder — `<p>Exercise linking will be available once exercises are created.</p>`
- **Students tab**:
  - Search input (debounced 300ms) — queries STUDENT-role users not yet enrolled in this course
  - Search results list: each row shows username + displayName + "Enrol" button
  - Enrolled students list below: each row shows username + displayName + "Unenrol" button
  - Enrol/Unenrol calls the API and refreshes both lists

### `courseApi.js` Methods

```js
list(page, size)
create(data)                            // { name, description }
update(id, data)
remove(id)
getDetail(id)                           // GET /v1/courses/{id}
addExercises(courseId, exerciseIds)
removeExercise(courseId, exerciseId)
getExercises(courseId)
enrollStudents(courseId, userIds)
unenrollStudent(courseId, userId)
getStudents(courseId)
searchAvailableStudents(courseId, q)    // GET /v1/courses/{id}/students/available?q=
```

---

## Data Flow — Student Enrolment in UI

1. Detail page loads → `courseApi.getStudents(courseId)` → enrolled list rendered
2. User types in search box → debounce 300ms → `courseApi.searchAvailableStudents(courseId, q)` → render results (already excludes enrolled)
3. "Enrol" clicked → `courseApi.enrollStudents(courseId, [userId])` → refresh enrolled list + re-run search
4. "Unenrol" clicked → `courseApi.unenrollStudent(courseId, userId)` → refresh enrolled list

---

## Out of Scope (this release)

- SUPER_ADMIN course management UI
- Exercise tab real implementation (deferred to F4)
- Student self-enrolment
- Course duplication
- Course archive vs soft-delete distinction
