# F-7 Student Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/v1/student/progress` and a frontend ProgressPage showing per-exercise status and grade summary for the authenticated student.

**Architecture:** Two-query + Java merge: fetch visible exercises via existing `StudentExerciseService` (reuses course-filter logic), bulk-fetch submissions by `student_name`, merge in `StudentProgressService` to derive NOT_ATTEMPTED / ATTEMPTED / GRADED status and compute summary stats. One new controller, one service, two DTO records. Frontend: `progressApi.js` + `ProgressPage.jsx` + route + nav link.

**Tech Stack:** Java 17 · Spring Boot 3.2.5 · Spring Data JPA · H2 (tests) · React 18 · Axios

---

## File Map

**Backend — new:**
- `student/StudentProgressDto.java`
- `student/ProgressExerciseDto.java`
- `student/StudentProgressService.java`
- `student/StudentProgressController.java`

**Backend — modified:**
- `repository/SubmissionRepository.java` — add `findByStudentName`

**Backend — tests:**
- `student/StudentProgressControllerTest.java`

**Frontend — new:**
- `src/api/progressApi.js`
- `src/pages/student/ProgressPage.jsx`

**Frontend — modified:**
- `src/pages/student/StudentPage.jsx` — add My Progress nav link
- `src/App.jsx` — add `/student/progress` route

All backend paths are relative to `backend/src/main/java/com/platform/exercise/`.
All test paths are relative to `backend/src/test/java/com/platform/exercise/`.

---

## Task 1: DTOs and Repository Query

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/student/StudentProgressDto.java`
- Create: `backend/src/main/java/com/platform/exercise/student/ProgressExerciseDto.java`
- Modify: `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`

- [ ] **Step 1: Create `StudentProgressDto.java`**

```java
package com.platform.exercise.student;

import java.util.List;

public record StudentProgressDto(
        SummaryDto summary,
        List<ProgressExerciseDto> exercises) {

    public record SummaryDto(
            int totalExercises,
            int attemptedCount,
            int gradedCount,
            double averageScore,
            double passRate) {}
}
```

- [ ] **Step 2: Create `ProgressExerciseDto.java`**

```java
package com.platform.exercise.student;

public record ProgressExerciseDto(
        Long exerciseId,
        String exerciseTitle,
        String exerciseType,
        String status,       // NOT_ATTEMPTED | ATTEMPTED | GRADED
        Double score,        // null if not graded
        String scoreSource)  // TUTOR | AUTO | null
{}
```

- [ ] **Step 3: Add `findByStudentName` to `SubmissionRepository`**

In `backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java`, add after the existing `findAllForExport` method:

```java
List<Submission> findByStudentName(String studentName);
```

- [ ] **Step 4: Compile check**

```bash
cd backend && mvn compile -q
```

Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentProgressDto.java \
        backend/src/main/java/com/platform/exercise/student/ProgressExerciseDto.java \
        backend/src/main/java/com/platform/exercise/repository/SubmissionRepository.java
git commit -m "feat(f7): add StudentProgressDto, ProgressExerciseDto, and findByStudentName query"
```

---

## Task 2: Service, Controller, and Integration Tests (TDD)

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/student/StudentProgressService.java`
- Create: `backend/src/main/java/com/platform/exercise/student/StudentProgressController.java`
- Create: `backend/src/test/java/com/platform/exercise/student/StudentProgressControllerTest.java`

- [ ] **Step 1: Write stub service (compile-only skeleton)**

Create `backend/src/main/java/com/platform/exercise/student/StudentProgressService.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class StudentProgressService {

    private final StudentExerciseService studentExerciseService;
    private final SubmissionRepository submissionRepository;

    public StudentProgressDto getProgress(Long userId, String displayName) {
        throw new UnsupportedOperationException("not yet implemented");
    }
}
```

- [ ] **Step 2: Write stub controller (compile-only skeleton)**

Create `backend/src/main/java/com/platform/exercise/student/StudentProgressController.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.common.ErrorCode;
import com.platform.exercise.common.PlatformException;
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
    public ResponseEntity<StudentProgressDto> getProgress(Authentication authentication) {
        throw new UnsupportedOperationException("not yet implemented");
    }
}
```

- [ ] **Step 3: Write `StudentProgressControllerTest`**

Create `backend/src/test/java/com/platform/exercise/student/StudentProgressControllerTest.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.domain.Exercise;
import com.platform.exercise.domain.ExerciseVersion;
import com.platform.exercise.domain.Submission;
import com.platform.exercise.domain.User;
import com.platform.exercise.repository.CourseRepository;
import com.platform.exercise.repository.ExerciseRepository;
import com.platform.exercise.repository.ExerciseVersionRepository;
import com.platform.exercise.repository.SubmissionRepository;
import com.platform.exercise.repository.UserRepository;
import com.platform.exercise.settings.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentProgressControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ExerciseRepository exerciseRepository;
    @Autowired ExerciseVersionRepository versionRepository;
    @Autowired SubmissionRepository submissionRepository;
    @Autowired UserRepository userRepository;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired SettingsService settingsService;

    private Exercise exercise1;
    private Exercise exercise2;

    @BeforeEach
    void seed() {
        // Tutor needed as createdBy for exercises
        User tutor = new User();
        tutor.setUsername("tutor7");
        tutor.setDisplayName("Tutor Seven");
        tutor.setPasswordHash(passwordEncoder.encode("pw"));
        tutor.setRole(User.Role.TUTOR);
        tutor.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(tutor);

        // Student — displayName "Alex Chen" matched against submission.student_name
        User student = new User();
        student.setUsername("alex01");
        student.setDisplayName("Alex Chen");
        student.setPasswordHash(passwordEncoder.encode("pw"));
        student.setRole(User.Role.STUDENT);
        student.setStatus(User.UserStatus.ACTIVE);
        userRepository.save(student);

        exercise1 = savedPublishedExercise("Hello World", Exercise.ExerciseType.BLOCKLY, tutor.getId());
        exercise2 = savedPublishedExercise("FizzBuzz", Exercise.ExerciseType.PYTHON, tutor.getId());

        // Ensure course filter is off for most tests (Flyway seeds it false, but reset to be safe)
        settingsService.updateCourseFilter(false);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Exercise savedPublishedExercise(String title, Exercise.ExerciseType type, Long tutorId) {
        Exercise ex = new Exercise();
        ex.setTitle(title);
        ex.setDescription("desc");
        ex.setType(type);
        ex.setDifficulty(Exercise.Difficulty.EASY);
        ex.setStatus(Exercise.Status.PUBLISHED);
        ex.setCreatedBy(tutorId);
        ex = exerciseRepository.save(ex);

        ExerciseVersion ver = new ExerciseVersion();
        ver.setExerciseId(ex.getId());
        ver.setVersionNumber(1);
        ver.setTitle(title);
        ver.setDescription("desc");
        ver.setDifficulty("EASY");
        ver.setHints("[]");
        ver.setConfig("{\"gradingRules\":{}}");
        ver = versionRepository.save(ver);

        ex.setCurrentVersionId(ver.getId());
        return exerciseRepository.save(ex);
    }

    private Submission savedSubmission(Long exerciseId, String studentName,
                                       BigDecimal autoScore, BigDecimal tutorScore) {
        Submission s = new Submission();
        s.setExerciseId(exerciseId);
        s.setGradedVersionId(1L);
        s.setStudentName(studentName);
        s.setExerciseType("BLOCKLY");
        s.setAnswerData("{}");
        s.setExportTimestamp(LocalDateTime.now().minusMinutes(1));
        s.setAutoScore(autoScore);
        s.setTutorScore(tutorScore);
        return submissionRepository.save(s);
    }

    // ── tests ─────────────────────────────────────────────────────────────────

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void noSubmissions_allNotAttempted_summaryZeros() throws Exception {
        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.totalExercises").value(2))
            .andExpect(jsonPath("$.summary.attemptedCount").value(0))
            .andExpect(jsonPath("$.summary.gradedCount").value(0))
            .andExpect(jsonPath("$.summary.averageScore").value(0.0))
            .andExpect(jsonPath("$.summary.passRate").value(0.0))
            .andExpect(jsonPath("$.exercises[0].status").value("NOT_ATTEMPTED"))
            .andExpect(jsonPath("$.exercises[1].status").value("NOT_ATTEMPTED"));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void submissionWithNullScore_statusAttempted() throws Exception {
        savedSubmission(exercise1.getId(), "Alex Chen", null, null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.attemptedCount").value(1))
            .andExpect(jsonPath("$.summary.gradedCount").value(0))
            .andExpect(jsonPath("$.exercises[?(@.exerciseId == " + exercise1.getId() + ")].status")
                .value("ATTEMPTED"))
            .andExpect(jsonPath("$.exercises[?(@.exerciseId == " + exercise1.getId() + ")].score")
                .isEmpty());
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void submissionWithAutoScore_statusGraded_sourceAuto() throws Exception {
        savedSubmission(exercise1.getId(), "Alex Chen", new BigDecimal("80.00"), null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.gradedCount").value(1))
            .andExpect(jsonPath("$.exercises[?(@.exerciseId == " + exercise1.getId() + ")].status")
                .value("GRADED"))
            .andExpect(jsonPath("$.exercises[?(@.exerciseId == " + exercise1.getId() + ")].score")
                .value(80.0))
            .andExpect(jsonPath("$.exercises[?(@.exerciseId == " + exercise1.getId() + ")].scoreSource")
                .value("AUTO"));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void submissionWithTutorScore_tutorWins_sourceTutor() throws Exception {
        savedSubmission(exercise1.getId(), "Alex Chen", new BigDecimal("60.00"), new BigDecimal("90.00"));

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.exercises[?(@.exerciseId == " + exercise1.getId() + ")].score")
                .value(90.0))
            .andExpect(jsonPath("$.exercises[?(@.exerciseId == " + exercise1.getId() + ")].scoreSource")
                .value("TUTOR"));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void multipleSubmissionsSameExercise_highestScoreReturned() throws Exception {
        savedSubmission(exercise1.getId(), "Alex Chen", new BigDecimal("40.00"), null);
        savedSubmission(exercise1.getId(), "Alex Chen", new BigDecimal("95.00"), null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.exercises[?(@.exerciseId == " + exercise1.getId() + ")].score")
                .value(95.0));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void passRateComputation_onePassOneFail() throws Exception {
        savedSubmission(exercise1.getId(), "Alex Chen", new BigDecimal("80.00"), null); // pass
        savedSubmission(exercise2.getId(), "Alex Chen", new BigDecimal("50.00"), null); // fail

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.gradedCount").value(2))
            .andExpect(jsonPath("$.summary.passRate").value(50.0));
    }

    @Test
    @WithMockUser(username = "alex01", roles = "STUDENT")
    void courseFilterEnabled_studentNotEnrolled_allNotAttempted() throws Exception {
        // Enable the course filter — student is enrolled in no courses
        settingsService.updateCourseFilter(true);
        savedSubmission(exercise1.getId(), "Alex Chen", new BigDecimal("80.00"), null);

        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.totalExercises").value(0))
            .andExpect(jsonPath("$.exercises").isEmpty());
    }

    @Test
    @WithMockUser(username = "tutor7", roles = "TUTOR")
    void tutorRole_forbidden() throws Exception {
        mockMvc.perform(get("/v1/student/progress"))
            .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd backend && mvn test -Dtest=StudentProgressControllerTest -q 2>&1 | tail -15
```

Expected: Tests run with failures — `UnsupportedOperationException` from stubs.

- [ ] **Step 5: Implement `StudentProgressService`**

Replace the entire file `backend/src/main/java/com/platform/exercise/student/StudentProgressService.java`:

```java
package com.platform.exercise.student;

import com.platform.exercise.domain.Submission;
import com.platform.exercise.repository.SubmissionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class StudentProgressService {

    private final StudentExerciseService studentExerciseService;
    private final SubmissionRepository submissionRepository;

    public StudentProgressDto getProgress(Long userId, String displayName) {
        List<StudentExerciseListDto> exercises =
                studentExerciseService.listExercises(null, null, null, 0, 1000, userId).content();

        List<Submission> submissions = submissionRepository.findByStudentName(displayName);

        // Group submissions by exerciseId, keeping the one with the highest effective score
        Map<Long, Submission> bestByExercise = new HashMap<>();
        for (Submission s : submissions) {
            bestByExercise.merge(s.getExerciseId(), s, (existing, candidate) -> {
                BigDecimal ex = effectiveScore(existing);
                BigDecimal ca = effectiveScore(candidate);
                if (ca != null && (ex == null || ca.compareTo(ex) > 0)) return candidate;
                return existing;
            });
        }

        List<ProgressExerciseDto> result = new ArrayList<>();
        int attemptedCount = 0, gradedCount = 0, passCount = 0;
        double scoreSum = 0.0;

        for (StudentExerciseListDto ex : exercises) {
            Submission best = bestByExercise.get(ex.id());
            ProgressExerciseDto dto;
            if (best == null) {
                dto = new ProgressExerciseDto(ex.id(), ex.title(), ex.type(), "NOT_ATTEMPTED", null, null);
            } else {
                BigDecimal eff = effectiveScore(best);
                if (eff == null) {
                    attemptedCount++;
                    dto = new ProgressExerciseDto(ex.id(), ex.title(), ex.type(), "ATTEMPTED", null, null);
                } else {
                    gradedCount++;
                    double score = eff.doubleValue();
                    scoreSum += score;
                    if (score >= 60.0) passCount++;
                    String source = best.getTutorScore() != null ? "TUTOR" : "AUTO";
                    dto = new ProgressExerciseDto(ex.id(), ex.title(), ex.type(), "GRADED", score, source);
                }
            }
            result.add(dto);
        }

        double averageScore = gradedCount > 0
                ? Math.round((scoreSum / gradedCount) * 10.0) / 10.0 : 0.0;
        double passRate = gradedCount > 0
                ? Math.round(((double) passCount / gradedCount * 100) * 10.0) / 10.0 : 0.0;

        return new StudentProgressDto(
                new StudentProgressDto.SummaryDto(
                        exercises.size(), attemptedCount, gradedCount, averageScore, passRate),
                result);
    }

    private BigDecimal effectiveScore(Submission s) {
        return s.getTutorScore() != null ? s.getTutorScore() : s.getAutoScore();
    }
}
```

- [ ] **Step 6: Implement `StudentProgressController`**

Replace the entire file `backend/src/main/java/com/platform/exercise/student/StudentProgressController.java`:

```java
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
    public ResponseEntity<StudentProgressDto> getProgress(Authentication authentication) {
        User user = userRepository.findByUsername(authentication.getName())
                .orElseThrow(() -> new PlatformException(ErrorCode.USER_NOT_FOUND));
        return ResponseEntity.ok(
                studentProgressService.getProgress(user.getId(), user.getDisplayName()));
    }
}
```

- [ ] **Step 7: Run tests and verify they pass**

```bash
cd backend && mvn test -Dtest=StudentProgressControllerTest -q
```

Expected: Tests run: 8, Failures: 0, Errors: 0, Skipped: 0

- [ ] **Step 8: Run full test suite to check for regressions**

```bash
cd backend && mvn test -q
```

Expected: BUILD SUCCESS

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/student/StudentProgressService.java \
        backend/src/main/java/com/platform/exercise/student/StudentProgressController.java \
        backend/src/test/java/com/platform/exercise/student/StudentProgressControllerTest.java
git commit -m "feat(f7): add StudentProgressService, StudentProgressController, and integration tests"
```

---

## Task 3: Frontend — API Client and ProgressPage

**Files:**
- Create: `frontend/src/api/progressApi.js`
- Create: `frontend/src/pages/student/ProgressPage.jsx`

- [ ] **Step 1: Create `progressApi.js`**

```js
import axiosInstance from './axiosInstance';

export const progressApi = {
  getProgress: () => axiosInstance.get('/v1/student/progress').then(r => r.data),
};
```

- [ ] **Step 2: Create `ProgressPage.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { progressApi } from '../../api/progressApi';

function chipStyle(status, score) {
  if (status === 'GRADED') {
    return score >= 60
      ? { label: 'Graded', bg: '#16a34a', color: '#fff' }
      : { label: 'Graded', bg: '#dc2626', color: '#fff' };
  }
  if (status === 'ATTEMPTED') return { label: 'Attempted', bg: '#f59e0b', color: '#fff' };
  return { label: 'Not Attempted', bg: '#9e9e9e', color: '#fff' };
}

function SummaryCard({ label, value }) {
  return (
    <div style={{
      flex: 1, minWidth: 140, border: '1px solid #e0e0e0', borderRadius: 8,
      padding: '16px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#1976d2' }}>{value}</div>
      <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function ProgressPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    progressApi.getProgress()
      .then(setData)
      .catch(() => setError('Failed to load progress.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;
  if (error)   return <div style={{ padding: 32, color: 'red' }}>{error}</div>;

  const { summary, exercises } = data;

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 24 }}>My Progress</h2>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
        <SummaryCard label="Total Exercises" value={summary.totalExercises} />
        <SummaryCard label="Attempted" value={summary.attemptedCount} />
        <SummaryCard label="Graded" value={summary.gradedCount} />
        <SummaryCard
          label="Avg Score / Pass Rate"
          value={`${summary.averageScore.toFixed(1)} / ${summary.passRate.toFixed(1)}%`}
        />
      </div>

      {exercises.length === 0 ? (
        <p style={{ color: '#888' }}>No exercises available.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px' }}>Exercise</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {exercises.map(ex => {
              const chip = chipStyle(ex.status, ex.score);
              return (
                <tr key={ex.exerciseId} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{ex.exerciseTitle}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: ex.exerciseType === 'BLOCKLY' ? '#ede9fe' : '#dbeafe',
                      color: ex.exerciseType === 'BLOCKLY' ? '#7c3aed' : '#1d4ed8',
                      borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                    }}>
                      {ex.exerciseType}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: chip.bg, color: chip.color,
                      borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600,
                    }}>
                      {chip.label}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {ex.score != null ? (
                      <>
                        <span style={{ fontWeight: 600 }}>{ex.score.toFixed(1)} / 100</span>
                        <div style={{ fontSize: 11, color: '#888' }}>
                          {ex.scoreSource === 'TUTOR' ? 'Tutor Score' : 'Auto Score'}
                        </div>
                      </>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/progressApi.js frontend/src/pages/student/ProgressPage.jsx
git commit -m "feat(f7): add progressApi and ProgressPage"
```

---

## Task 4: Routing and Nav Link

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/student/StudentPage.jsx`

- [ ] **Step 1: Add import and route in `App.jsx`**

Add the import near the top with the other student page imports:

```js
import ProgressPage from './pages/student/ProgressPage';
```

Add the route inside the `/student` nested `<Route>` block, after the `exercises/:id/practice` route:

```jsx
<Route path="progress" element={<ProgressPage />} />
```

The full `/student` block should read:

```jsx
<Route path="/student" element={
  <ProtectedRoute requiredRole="STUDENT"><StudentPage /></ProtectedRoute>
}>
  <Route path="exercises" element={<ExerciseListPage />} />
  <Route path="exercises/:id/practice" element={<ExercisePracticeRouter />} />
  <Route path="progress" element={<ProgressPage />} />
</Route>
```

- [ ] **Step 2: Add nav link in `StudentPage.jsx`**

Replace the entire file:

```jsx
import { Link, Outlet } from 'react-router-dom';

export default function StudentPage() {
  return (
    <div>
      <nav style={{ background: '#1976d2', padding: '0 32px', display: 'flex', gap: 24, alignItems: 'center' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, padding: '14px 0' }}>Student Portal</span>
        <Link to="/student/exercises"
          style={{ color: '#fff', textDecoration: 'none', padding: '14px 0', opacity: 0.9 }}>
          Exercises
        </Link>
        <Link to="/student/progress"
          style={{ color: '#fff', textDecoration: 'none', padding: '14px 0', opacity: 0.9 }}>
          My Progress
        </Link>
      </nav>
      <Outlet />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/student/StudentPage.jsx
git commit -m "feat(f7): add /student/progress route and My Progress nav link"
```

---

## Task 5: Mark F-7 Complete

**Files:**
- Modify: `docs/4_feature_specs/p0.md`

- [ ] **Step 1: Update p0.md**

In `docs/4_feature_specs/p0.md`, change:

```
| F-7 Student Progress | [ ] |
```

to:

```
| F-7 Student Progress | [x] |
```

- [ ] **Step 2: Commit**

```bash
git add docs/4_feature_specs/p0.md
git commit -m "chore: mark F-7 Student Progress as complete in p0.md"
```
