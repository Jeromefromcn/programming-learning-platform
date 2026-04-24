# Product Requirements Document
# Multi-Type Programming Exercise Platform

**Version:** 2.0  
**Date:** 2026-04-12  
**Status:** Draft  
**Target Launch:** Before July 2026

---

## 1. Background & Problem Statement

### Current Situation

The university currently uses a self-built platform called OLE for all programming exercises. Exercises are authored in Blockly (a block-based visual programming language) and all exercise definitions are stored in a single large XML file.

### Pain Points

1. **Fragile exercise data** — All exercises live in one monolithic XML file. Any edit risks corrupting the entire file, and when it breaks, no one can easily fix it. As a result, no one dares to modify it.
2. **Understaffed maintenance** — The OLE platform has very few maintainers. Even small changes require significant coordination and turnaround time.
3. **Difficult to extend** — Adding new exercise types (e.g., Python text-based coding) or updating existing exercises is impractical within the current architecture.
4. **Stale content** — Exercises have not been meaningfully updated due to the above constraints, leading to outdated practice material.
5. **No independent exercise management** — Exercise authoring, practice, and grading are tightly coupled to OLE, making it impossible to iterate on the exercise experience without touching the core platform.

### Opportunity

Build a standalone exercise platform that tutors can manage independently — without relying on OLE's maintenance team. The platform should make it easy to create, update, and organize exercises, support both Blockly and Python exercise types, and interface with OLE through simple file import/export for grading.

---

## 2. User Personas

### Persona 1: Student — "Alex"

- **Profile:** University student, beginner with zero programming background
- **Goals:** Complete assigned exercises, get feedback on performance, track personal progress
- **Context:** Accesses the platform via desktop browser during lab sessions or self-study. Receives exercise assignments through OLE or directly from tutors. Exports answers as files and submits them to OLE.
- **Frustrations with current system:** Exercises feel outdated; the practice interface is clunky and tightly embedded in OLE; no way to practice Python-style coding as the curriculum evolves
- **Technical comfort:** Low — needs a simple, intuitive UI. Cannot be expected to troubleshoot file format issues or navigate complex workflows.

### Persona 2: Tutor — "Dr. Lee"

- **Profile:** Programming education instructor with general (not advanced) technical skills
- **Goals:** Author exercises aligned to course curriculum, grade student work efficiently, track class progress
- **Context:** Manages 1–3 courses per semester, each with dozens to low hundreds of students. Collects student submissions from OLE, imports them into the exercise platform for grading, then exports grades back.
- **Frustrations with current system:** Cannot create or modify exercises without risking XML corruption; has to coordinate with scarce OLE maintainers for any change; no way to introduce Python exercises; grading workflow is manual and slow
- **Technical comfort:** Moderate — comfortable with web-based tools but not a developer. Should not need to write code, edit config files, or understand system internals to author exercises.

### Persona 3: Super Admin — "IT Admin"

- **Profile:** IT staff or platform administrator responsible for system-level configuration
- **Goals:** Manage user accounts, control platform-wide settings, ensure smooth operation
- **Context:** Handles initial setup, user provisioning, and global configuration. Not involved in day-to-day teaching.

---

## 3. Product Goals & Success Metrics

### Primary Goal

Replace the fragile, hard-to-maintain exercise system in OLE with a standalone platform that tutors can independently manage.

### Success Criteria

| Metric | Target | How to Measure |
|---|---|---|
| Tutor can create/edit exercises without external help | 100% of exercise operations self-service | No support tickets to OLE team for exercise changes |
| Exercise data stability | Zero data corruption incidents | No XML-style "one edit breaks everything" failures |
| Support for new exercise types | Blockly + Python both functional | Both types can be authored, practiced, and graded end-to-end |
| Grading turnaround time | Significantly reduced vs. current manual process | Tutor feedback — compare time spent per grading batch before and after |
| Student adoption | Students successfully complete practice-export-submit cycle | Track export activity counts |
| Launch on time | MVP live before July 2026 | Deployment date |

---

## 4. User Journeys

### Journey 1: Tutor Authors a Blockly Exercise

1. Tutor logs in → lands on exercise management dashboard
2. Clicks "New Exercise" → selects type "Blockly"
3. Fills in: title, description, difficulty, category, hints
4. Configures Blockly-specific settings: which blocks are available, initial workspace state, whether to show the Python code view panel, grading rules
5. Previews the exercise as a student would see it
6. Saves as draft → exercise is version 1, not visible to students
7. Links the exercise to one or more courses
8. Publishes → students in those courses can now see and practice the exercise

**Key design consideration:** Dr. Lee is not technical. The authoring interface must use visual configuration (drag-and-drop block palette selection, toggle switches) rather than requiring any code or config file editing.

### Journey 2: Tutor Authors a Python Exercise

1. Same flow as Journey 1, but selects type "Python"
2. Instead of Blockly configuration, fills in: starter code (using a code editor), test cases (input/expected output pairs, with visible/hidden toggle), time limit
3. Can run test cases against a sample solution to verify correctness before publishing

**Key design consideration:** The test case authoring experience should be similar to LeetCode's problem creation — structured, not free-form.

### Journey 3: Student Completes an Exercise

1. Student logs in → sees exercise list (filterable by course, type, category, difficulty)
2. Opens an exercise → editor loads (Blockly workspace or Python code editor depending on type)
3. Reads the problem description and works on a solution
4. Clicks "Run" to test locally → sees output and pass/fail per test case
5. If stuck, clicks "Hint" for progressive hints
6. When satisfied, clicks "Export" → enters name → downloads a JSON answer file
7. Submits the file to OLE through the existing OLE submission workflow

**Key design consideration:** Alex is a zero-experience beginner. The interface must clearly separate "Run (test locally)" from "Export (submit)". Error messages must be human-readable, not stack traces.

### Journey 4: Tutor Grades Submissions

1. Tutor collects student answer files from OLE
2. Goes to the submission import page → uploads files (multiple JSON or one ZIP)
3. System validates, imports, and auto-grades each submission
4. Tutor reviews the submission list → opens individual submissions to see:
   - For Blockly: read-only block workspace + auto-grade breakdown
   - For Python: read-only code + test case pass/fail details
5. Tutor optionally adds a manual score and comment (overrides auto-grade)
6. Exports grades as CSV → uploads to OLE

**Key design consideration:** The import must handle real-world messiness — duplicate files, mismatched exercise IDs, mixed file types in one batch. Clear error reporting per file is essential so Dr. Lee knows exactly which files failed and why.

### Journey 5: Student Tracks Progress

1. Student opens "My Progress" page
2. Sees summary: total exercises available, how many attempted, how many graded, average score, pass rate
3. Each exercise shows status: not attempted / attempted / graded with score
4. "Attempted" = student has exported or imported an answer for that exercise

---

## 5. Feature List

### P0 Features (MVP — Must Have)

These are the minimum features required to replace the current OLE exercise workflow and unblock the Blockly + Python teaching curriculum. Without any of these, the platform cannot serve its core purpose.

---

#### 5.1 Authentication & Role Management

##### 5.1.1 Login / Logout

**User Story:** As a platform user, I want to log in with my credentials, so that I can access features corresponding to my role.

**Acceptance Criteria:**

- Given the user enters valid credentials
  When the login request is submitted
  Then the system authenticates the user and redirects to the role-appropriate home page within 1 second

- Given the user enters incorrect credentials
  When the login request is submitted
  Then the system displays a generic error message without revealing which field is wrong

- Given the user's account has been disabled
  When the login request is submitted
  Then the system displays "Account disabled — please contact an administrator"

- Given the user is logged in
  When they click Logout
  Then the session is invalidated and the user is redirected to the login page

##### 5.1.2 User Management (SUPER_ADMIN)

**User Story:** As a super admin, I want to create and manage user accounts, so that students and tutors can access the system.

**Acceptance Criteria:**

- Given SUPER_ADMIN is on the user management page
  When creating a new user with an assigned role
  Then the account is created and the user can log in

- Given SUPER_ADMIN disables a user account
  When the disabled user attempts any operation
  Then all of their active sessions are immediately invalidated

- Given SUPER_ADMIN changes a user's role
  When the user next logs in
  Then the user has the updated permissions

---

#### 5.2 Course Management

Courses are the organizational layer between exercises and students. They allow tutors to group exercises by teaching plan and control which students see which exercises.

##### 5.2.1 Course CRUD (TUTOR+)

**User Story:** As a tutor, I want to create and manage courses, so that I can organize exercises by my teaching plan.

**Acceptance Criteria:**

- Given the tutor fills in course name and description
  When the creation request is submitted
  Then the course is created and appears in the course list

- Given the tutor edits an existing course
  When changes are saved
  Then the updated information is reflected immediately on the student side

- Given the tutor deletes a course
  When the deletion is confirmed
  Then the course is soft-deleted and hidden from students; linked exercises, submissions, and grades are retained

##### 5.2.2 Course–Exercise Association (TUTOR+)

**User Story:** As a tutor, I want to link exercises to a course, so that students see exercises organized by course structure.

**Acceptance Criteria:**

- Given the tutor is on the course detail page
  When they select exercises and add them to the course
  Then the exercises are linked and visible to enrolled students

- Given an exercise is already linked to Course A
  When the tutor links it to Course B
  Then the exercise belongs to both courses

- Given the tutor removes an exercise from a course
  When the operation completes
  Then the link is removed but the exercise itself, and any existing submissions and grades, are unaffected

##### 5.2.3 Student–Course Enrollment (TUTOR+)

**User Story:** As a tutor, I want to enroll students in a course, so that when course filtering is enabled, students only see their course's exercises.

**Acceptance Criteria:**

- Given the tutor is on the course management page
  When they batch-select students and enroll them
  Then the students are linked to the course

- Given the tutor removes a student from a course
  When the operation completes
  Then the student no longer sees that course's exercises (when filtering is on), but historical data is retained

##### 5.2.4 Global Course Filter Toggle (SUPER_ADMIN)

**User Story:** As a super admin, I want to toggle course-based exercise filtering on or off, so that the platform can flexibly operate in either open-access or course-restricted mode.

**Acceptance Criteria:**

- Given the toggle is off
  When any student browses exercises
  Then all published exercises are visible regardless of enrollment

- Given the toggle is on
  When a student browses exercises
  Then only exercises from their enrolled courses are visible

- Given the toggle is on and a student is not enrolled in any course
  When they browse exercises
  Then an empty list is shown with the message "No exercises available — please contact your tutor"

---

#### 5.3 Exercise Management (TUTOR+)

This is the core value proposition of the platform: tutors can independently author, edit, and manage exercises without touching any XML files or coordinating with IT staff.

##### 5.3.1 Exercise Creation

**User Story:** As a tutor, I want to create different types of exercises through a guided interface, so that I can build practice material without needing technical help.

**Acceptance Criteria:**

- Given the tutor selects type BLOCKLY
  When the authoring page loads
  Then it displays Blockly-specific configuration: block palette settings (visual selection), initial workspace state, code view panel toggle, grading rules (output matching, required/forbidden blocks, block count limits)

- Given the tutor selects type PYTHON
  When the authoring page loads
  Then it displays Python-specific configuration: starter code editor, test case list (input / expected output, visible/hidden toggle), time limit

- Given the tutor completes all required fields
  When the exercise is saved
  Then it is created in DRAFT status (version 1), not visible to students

##### 5.3.2 Exercise Versioning

**User Story:** As a tutor, I want each edit to be saved as a new version, so that I can review history and roll back if something goes wrong.

**Acceptance Criteria:**

- Given the tutor modifies an existing exercise
  When saving
  Then a new immutable version is created and the exercise points to the latest version

- Given the tutor views version history
  When selecting a past version
  Then a full preview of that version is displayed

- Given the tutor rolls back to a previous version
  When the rollback is confirmed
  Then the exercise points to the selected version and students see that version's content

**Why this matters:** The single biggest pain point today is that one bad edit can corrupt the entire exercise file. Immutable versioning with rollback ensures that no edit is ever destructive.

##### 5.3.3 Publish / Unpublish

**User Story:** As a tutor, I want to control exercise visibility, so that work-in-progress exercises don't appear to students.

**Acceptance Criteria:**

- Given the exercise is in DRAFT status with at least one version
  When the tutor publishes it
  Then it becomes visible to students (subject to course filter rules)

- Given the exercise is PUBLISHED
  When the tutor unpublishes it
  Then it reverts to DRAFT and is hidden from students; existing submissions and grades are unaffected

##### 5.3.4 Exercise Deletion

**User Story:** As a tutor, I want to delete exercises I no longer need, so that the exercise list stays clean.

**Acceptance Criteria:**

- Given the tutor deletes an exercise
  When the deletion is confirmed
  Then the exercise is soft-deleted and hidden; all associated submissions and grades are retained for record-keeping

---

#### 5.4 Student Practice

##### 5.4.1 Exercise Browser

**User Story:** As a student, I want to browse and filter exercises, so that I can find the ones I need to practice.

**Acceptance Criteria:**

- Given the student opens the exercise list
  When the page loads
  Then all visible published exercises are shown, each displaying: title, type badge (Blockly / Python), category, difficulty, like count

- Given the student applies filters (course, type, category, difficulty)
  When filters are applied
  Then the list updates immediately

- Given the list exceeds one page
  When the student navigates pages
  Then pagination works correctly with options for 10 / 25 / 50 / 100 items per page

##### 5.4.2 Blockly Editor

**User Story:** As a student, I want to use the block editor to solve Blockly exercises, so that I can learn programming logic through visual block manipulation.

**Acceptance Criteria:**

- Given the student opens a Blockly exercise
  When the editor loads
  Then the left side shows the problem description; the right side shows the Blockly workspace with only the allowed block types

- Given the exercise has code view enabled
  When the student manipulates blocks
  Then a read-only panel shows the corresponding Python code in real time

- Given the student clicks "Run"
  When execution completes
  Then output or error messages are displayed; execution auto-terminates after 3 seconds if it hangs

- Given the student clicks "Clear Workspace"
  When confirmed
  Then the workspace resets to the exercise's initial state

##### 5.4.3 Python Editor

**User Story:** As a student, I want to use a code editor to solve Python exercises, so that I can practice real text-based programming.

**Acceptance Criteria:**

- Given the student opens a Python exercise
  When the editor loads
  Then the left side shows the problem description and sample test cases; the right side shows a code editor pre-filled with starter code, with syntax highlighting and autocomplete

- Given the student clicks "Run"
  When execution completes
  Then results are compared against visible test cases, showing pass/fail for each

- Given the code runs too long
  When execution exceeds the time limit
  Then it is terminated with a "Time Limit Exceeded" message

##### 5.4.4 Answer Export

**User Story:** As a student, I want to export my answer as a file, so that I can submit it to OLE.

**Acceptance Criteria:**

- Given the student completes an answer (Blockly or Python)
  When they click "Export" and enter their name
  Then a JSON file is downloaded with the answer data; filename format: `{studentName}_{exerciseTitle}.json`

- Given the student has not entered their name
  When they click Export
  Then the system prompts "Please enter your name before exporting" and blocks the export

##### 5.4.5 Answer Import (Restore)

**User Story:** As a student, I want to import a previously exported answer, so that I can continue editing where I left off.

**Acceptance Criteria:**

- Given the student imports a compatible answer file
  When the import succeeds
  Then the editor restores to the saved state and the student name is auto-filled

- Given the student imports a file whose type does not match the current exercise
  When the import is attempted
  Then the system displays "File format does not match the current exercise type"

- Given the imported file's exercise ID does not match the current exercise
  When the import is attempted
  Then the system prompts "This file belongs to a different exercise. Import anyway?" and proceeds only after confirmation

##### 5.4.6 Hint System

**User Story:** As a student, I want progressive hints when I'm stuck, so that I can try to solve the problem myself before seeing the answer.

**Acceptance Criteria:**

- Given the exercise has hints configured
  When the student clicks "Get Hint"
  Then the first hint is revealed, with a counter showing "(1/N)"

- Given the student has viewed all hints
  When the button updates
  Then it is disabled and displays "No more hints"

---

#### 5.5 Submission Import & Grading (TUTOR+)

##### 5.5.1 Batch Import

**User Story:** As a tutor, I want to batch-import student answer files collected from OLE, so that I can grade them centrally.

**Acceptance Criteria:**

- Given the tutor selects multiple JSON files
  When uploading
  Then the system parses each file, creates a submission record for each valid file, and links it to the exercise's current version

- Given the tutor uploads a ZIP file
  When the import is submitted
  Then the system extracts and processes each JSON file inside, ignoring folder structure

- Given a file references a non-existent or deleted exercise
  When it is processed
  Then that file fails with a clear error message; other files continue processing

- Given one import batch contains files for both Blockly and Python exercises
  When the import is submitted
  Then the system routes each file to the correct processing logic based on the referenced exercise's type

##### 5.5.2 Auto-Grading — Blockly

**User Story:** As a tutor, I want Blockly submissions to be auto-graded on import, so that I don't have to manually run each student's code.

**Acceptance Criteria:**

- Given a Blockly submission is imported
  When auto-grading runs
  Then the system evaluates each configured grading aspect (output matching, required/forbidden blocks, block count) and calculates a score (0–100) based on the proportion of aspects passed

- Given grading includes output matching
  When student code is executed
  Then execution happens server-side in a sandbox with a 3-second timeout

##### 5.5.3 Auto-Grading — Python

**User Story:** As a tutor, I want Python submissions to be auto-graded on import, so that the system can automatically determine code correctness.

**Acceptance Criteria:**

- Given a Python submission is imported
  When auto-grading runs
  Then the system runs all test cases (visible + hidden) in a server-side sandbox and calculates a score (0–100) based on the proportion of test cases passed

- Given the code runs too long
  When execution exceeds the time limit
  Then that test case is marked as timeout; remaining test cases continue

- Given the code throws a runtime error
  When a test case fails
  Then the error is recorded, the test case is marked as failed, and remaining test cases continue

##### 5.5.4 Tutor Grading

**User Story:** As a tutor, I want to review submissions and assign manual grades, so that I can apply judgment that auto-grading cannot cover.

**Acceptance Criteria:**

- Given the tutor opens a Blockly submission
  When the detail page loads
  Then it shows: read-only block workspace, auto-grade breakdown, and fields for tutor score (0–100) and comment

- Given the tutor opens a Python submission
  When the detail page loads
  Then it shows: read-only code view, test case pass/fail details with actual outputs, and fields for tutor score and comment

- Given the tutor saves a score and comment
  When saved
  Then the tutor score is recorded and takes priority over the auto score in all displays

##### 5.5.5 Grade Export

**User Story:** As a tutor, I want to export grades as CSV, so that I can upload them to OLE.

**Acceptance Criteria:**

- Given the tutor is on the submission list
  When they click "Export CSV" (optionally filtered by exercise)
  Then a CSV file is downloaded with columns: Student Name, Exercise Title, Exercise Type, Auto Score, Tutor Score, Tutor Comment, Submitted At

---

#### 5.6 Student Progress

##### 5.6.1 Personal Progress Page

**User Story:** As a student, I want to see my practice progress and grades, so that I know what I've done and how I'm performing.

**Acceptance Criteria:**

- Given the student opens "My Progress"
  When the page loads
  Then the top shows: total exercises, attempted count, graded count, average score, pass rate (≥60 is passing)

- Given the student has attempted an exercise (has an export or import record)
  When viewing the list
  Then that exercise is marked "Attempted"; if graded, the score is shown (tutor score preferred, otherwise auto score)

- Given an exercise has multiple submissions
  When the score is displayed
  Then the highest score is shown

---

#### 5.7 Category Management (TUTOR+)

Categories represent knowledge topics (e.g., "Loops", "Variables", "Conditionals") and are used to tag exercises so students can filter by concept. Tutors manage categories directly — no need to involve IT staff — consistent with the platform's core principle of tutor self-service.

**User Story:** As a tutor, I want to manage the exercise category list, so that I can organize exercises by programming concept and keep the category options relevant to my curriculum.

**Acceptance Criteria:**

- Given the tutor is on the category management page
  When they add a new category
  Then the category appears in the exercise authoring page dropdown immediately

- Given a category has exercises linked to it
  When attempting to delete it
  Then the system prompts "This category has N exercises — please remove associations first"

- Given the tutor adds a category with a name that already exists
  When the request is submitted
  Then the system displays "This category already exists" and blocks the creation

---

### P1 Features (Phase 2)

These features improve the experience but are not required to replace the current OLE workflow. They can be shipped after the July launch if time permits.

---

#### 5.8 Exercise Likes

**User Story:** As a student, I want to like exercises I find helpful, so that other students can discover good exercises.

**Acceptance Criteria:**

- Given the student clicks the Like button
  When clicked
  Then the like count increments and the button shows "Liked"

- Given the student has already liked the exercise
  When they click again
  Then the like is removed and the count decrements

- Given the user is not logged in
  When they like
  Then the action is tracked via a browser-level identifier to prevent duplicate likes

#### 5.9 PythonTutor Integration

**User Story:** As a student, I want to visualize Python code execution step by step, so that I can understand how variables and the call stack change.

**Acceptance Criteria:**

- Given the student is in the Python editor
  When they click "Visualize Execution"
  Then the code is rendered step-by-step in an embedded PythonTutor visualization

#### 5.10 Profile Management

**User Story:** As a user, I want to update my display name and password, so that I can maintain my account.

**Acceptance Criteria:**

- Given the user updates their display name
  When saved
  Then the new name is reflected across the platform immediately

- Given the user changes their password
  When the correct current password and new password are entered
  Then the password is updated and all other sessions are invalidated

---

## 6. Permission Matrix

| Feature | STUDENT | TUTOR | SUPER_ADMIN |
|---|---|---|---|
| Browse published exercises | ✓ | ✓ | ✓ |
| Practice online (editors) | ✓ | ✓ | ✓ |
| Export / import own answers | ✓ | ✓ | ✓ |
| View "My Progress" | ✓ | — | — |
| Like exercises | ✓ | ✓ | ✓ |
| Create / edit / delete exercises | — | ✓ | ✓ |
| Publish / unpublish exercises | — | ✓ | ✓ |
| Manage courses (CRUD) | — | ✓ | ✓ |
| Manage course–exercise associations | — | ✓ | ✓ |
| Manage student–course enrollment | — | ✓ | ✓ |
| Import student submissions | — | ✓ | ✓ |
| Grade (view / manual scoring) | — | ✓ | ✓ |
| Export grade CSV | — | ✓ | ✓ |
| User account management | — | — | ✓ |
| Global settings management | — | — | ✓ |
| Category management | — | ✓ | ✓ |

---

## 7. Edge Cases (Easily Overlooked)

1. **Exercise version mismatch with submission** — A tutor modifies an exercise (changing test cases or allowed blocks) after a student has already exported their answer. When the student's file is imported, the system grades against the current version, not the version the student worked on. The grade result should annotate this discrepancy so the tutor can make an informed judgment.

2. **Duplicate submission import** — A tutor accidentally imports the same student's file twice. The system should detect duplicates (based on student name + exercise ID + export timestamp) and prompt "This submission already exists — skip?" rather than silently creating duplicates.

3. **Course filter toggle mid-semester** — A super admin enables course filtering while some students are not enrolled in any course. Those students suddenly see zero exercises. The system should display an impact warning before the switch: "N students are not enrolled in any course and will see no exercises."

4. **Malicious code in Python submissions** — Student Python code may attempt filesystem access, network requests, or infinite memory allocation. Server-side grading must run in a sandboxed environment with network disabled, filesystem restricted to read-only, and hard memory/time limits enforced. Client-side execution is naturally sandboxed by the browser but must handle worker crashes gracefully.

5. **ZIP import path traversal** — An uploaded ZIP may contain malicious paths like `../../etc/passwd`. The system must validate that all extracted file paths stay within the designated directory, reject paths containing `..`, and enforce limits on total decompressed size and file count.

---

## 8. Out of Scope (Not in This Release)

- **Student online submission (turn-in)** — Submission collection stays in OLE; this platform handles practice and grading only
- **Course content management** — No videos, reading materials, or courseware
- **Student self-enrollment** — Tutors manage enrollment manually; no invite codes or self-service registration
- **Real-time messaging** — No tutor–student chat
- **Analytics & reports** — No difficulty analysis, performance trends, or dashboards
- **Notifications** — No SMS or email alerts
- **Internationalization** — English UI only for this release
- **Student collaboration** — No code sharing or pair programming
- **Plagiarism detection** — Not in scope
- **LTI integration** — This release uses CSV import/export with OLE, not a standardized protocol
- **Mobile support** — Desktop browsers only
- **Python third-party libraries** — Standard library only
- **Student-side version history** — Students manage their own history via exported files
