# User Manual — Programming Learning Platform

This platform supports two exercise types — **Blockly** (drag-and-drop visual blocks) and **Python** (text-based code editor) — and three user roles with different responsibilities.

Jump to your role:
- [1. Student](#1-student)
- [2. Tutor](#2-tutor)
- [3. Super Admin](#3-super-admin)

---

## Getting Started

### Logging In

Navigate to the platform URL in your web browser. Enter your username and password on the login page and click **Login**.

- If your credentials are incorrect, a generic error is shown (no detail is given about which field is wrong).
- If your account has been disabled by an administrator, a specific message is shown and you cannot log in until the account is re-enabled.

### Logging Out

Click the **Logout** button in the navigation bar. Your session is immediately invalidated on the server — no one can reuse your session after you log out.

---

## 1. Student

As a student, you can browse exercises, practice them in the editor, export your answers, and track your progress.

### 1.1 Browse Exercises

After logging in you land on the **Exercise List** page. Exercises available to you are shown here.

**Course filter:** A Super Admin can enable a global course filter. When it is on, you only see exercises from courses you are enrolled in. If you are not enrolled in any course and the filter is on, you will see the message *"No Exercises Available — Please Contact Your Tutor"*. Contact your tutor to be added to a course.

**Filters:** Use the filter controls at the top of the list to narrow results by:
- **Course** — show exercises from one specific course
- **Type** — Blockly or Python
- **Category** — subject area (e.g., Loops, Functions)
- **Difficulty** — Easy / Medium / Hard

**Pagination:** Use the page size selector (10 / 25 / 50 / 100 per page) and the page controls at the bottom to navigate.

Click any exercise title to open it in the practice editor.

---

### 1.2 Practice a Blockly Exercise

The Blockly editor opens in two panels:

| Panel | Content |
|---|---|
| Left | Exercise description and instructions |
| Right | Blockly workspace with the allowed blocks in the toolbox |

If the tutor enabled the **code view**, a read-only panel below the workspace shows the JavaScript code equivalent of your current blocks, updating in real time as you drag blocks.

**Building your solution:**
- Drag blocks from the toolbox on the left into the workspace.
- Connect blocks together to form your program.
- Use the **trash can** icon to delete blocks.

**Running your code:**
- Click **Run** to execute your block program in the browser.
- Output and any error messages appear in the output panel below.
- If your code hangs (e.g., an infinite loop), it is automatically stopped after a few seconds and a timeout message is shown.

**Hints:**
- Click **Hint** to reveal the next available hint. The button shows a counter (e.g., *1/3*).
- Once all hints are shown the button is disabled.

**Clearing the workspace:**
- Click **Clear** to reset the workspace to its initial state. A confirmation dialog appears before the reset — click **Cancel** to keep your current work.

**Importing a previous answer:**
- Click **Import** to load a previously exported JSON answer file.
- If the file is for a different exercise type (e.g., a Python answer on a Blockly exercise), the import is rejected with an error.
- If the file is for a different exercise ID, you are asked whether to import anyway. The editor state and your name are restored from the file.

---

### 1.3 Practice a Python Exercise

The Python editor opens in two panels:

| Panel | Content |
|---|---|
| Left | Exercise description, instructions, and the visible test cases (inputs and expected outputs) |
| Right | Monaco code editor with starter code, syntax highlighting, and autocomplete |

**Writing your solution:**
- Edit the code in the right panel.
- The editor supports standard Python syntax highlighting and basic autocomplete.

**Running your code:**
- Click **Run** to execute your code against the visible test cases.
- Results appear below the editor, showing **Pass** or **Fail** for each test case.
- If execution takes too long (exceeds the time limit), a *Time Limit Exceeded* message is shown.

> Note: The visible test cases shown on the left are a subset. The tutor may have hidden additional test cases that are used during auto-grading after you submit.

**Hints:** Work the same as in Blockly exercises (see [1.2 Practice a Blockly Exercise](#12-practice-a-blockly-exercise)).

**Importing a previous answer:** Work the same as in Blockly exercises.

---

### 1.4 Export Your Answer

Exporting packages your current editor state into a JSON file that you submit to your tutor for grading.

1. Click **Export** in the practice editor.
2. If you have not entered your name yet, a prompt asks for it. Enter your full name as required by your tutor.
3. A file named `yourName_exerciseTitle.json` is downloaded to your device.
4. Submit this file to your tutor through OLE or whatever submission channel your tutor specifies.

> Keep a copy of your exported file. If you need to continue working on the exercise later, you can re-import it using the **Import** button.

---

### 1.5 View Your Progress

Click **My Progress** in the navigation bar.

**Summary row** at the top shows:
- Total exercises available to you
- Number you have attempted (exported or imported at least once)
- Number that have been graded
- Your average score across graded exercises
- Your pass rate (score ≥ 60 counts as a pass)

**Exercise list** below shows each exercise with its status:

| Status | Meaning |
|---|---|
| Not Attempted | You have not exported or imported any answer for this exercise |
| Attempted | You have exported or imported an answer but it has not been graded yet |
| Graded | Your tutor has graded your submission |

For graded exercises, your score is shown. If you have multiple submissions, the highest score is displayed. Tutor-assigned scores take priority over auto-graded scores.

---

## 2. Tutor

As a tutor, you manage the content (exercises, courses, categories) and the grading workflow (import submissions, review results, export grades).

### 2.1 Manage Categories

Categories are tags that group exercises by topic (e.g., *Loops*, *Functions*, *Recursion*). They appear as filter options for students.

**Navigate to:** Tutor Dashboard → **Category Management**

**Add a category:**
1. Click **Add Category**.
2. Enter a name. Names must be unique — a duplicate will be rejected with an error.
3. Click **Save**. The category is immediately available in the exercise authoring form.

**Delete a category:**
1. Click the delete icon next to the category name.
2. If any exercises are linked to this category, deletion is blocked. Remove the category association from those exercises first, then retry the deletion.

---

### 2.2 Manage Courses

Courses group exercises together and control which students can see them (when the course filter is enabled).

**Navigate to:** Tutor Dashboard → **Course Management**

**Create a course:**
1. Click **New Course**.
2. Fill in the **Name** and **Description**.
3. Click **Save**.

**Edit a course:**
1. Click the edit icon next to the course.
2. Update the name or description. Changes take effect immediately.

**Delete a course:**
- Click the delete icon and confirm. The course is soft-deleted (hidden from students) but all linked data is retained.

**Link exercises to a course:**
1. Open the course.
2. Click **Add Exercises**.
3. Select exercises from the list and confirm. Enrolled students can now see these exercises (subject to the global course filter).

**Remove an exercise from a course:**
- Click the unlink icon next to the exercise in the course view. This only removes the association — the exercise itself and any existing submissions are not affected.

**Enroll students:**
1. Open the course.
2. Click **Enroll Students**.
3. Select students from the list and confirm.

**Remove a student from a course:**
- Click the remove icon next to the student. Historical data for that student is retained.

---

### 2.3 Create / Edit an Exercise

**Navigate to:** Tutor Dashboard → **Exercise Management** → **New Exercise** (or click the edit icon on an existing exercise)

#### Step 1: Choose the exercise type

Select **Blockly** or **Python**. This cannot be changed after the exercise is created.

#### Blockly exercise configuration

| Field | Description |
|---|---|
| Block palette | Select which block categories are available to students in the toolbox |
| Initial workspace | Optionally pre-place blocks in the workspace for students to start from |
| Code view | Toggle whether students can see the generated JavaScript equivalent of their blocks |
| Grading: Output match | The expected output string the student's code must produce |
| Grading: Required blocks | Block types that must appear in the student's solution |
| Grading: Forbidden blocks | Block types that must not appear in the student's solution |
| Grading: Block count limit | Maximum number of blocks allowed in the solution |

#### Python exercise configuration

| Field | Description |
|---|---|
| Starter code | Pre-filled code shown in the editor when a student opens the exercise |
| Test cases | List of input/expected-output pairs; each test case can be marked **Visible** (shown to students) or **Hidden** (used in grading only) |
| Time limit | Maximum execution time per test case (seconds) |

#### Common fields (both types)

| Field | Description |
|---|---|
| Title | Exercise name shown in the exercise list |
| Description | Problem statement shown to students — supports Markdown formatting |
| Difficulty | Easy / Medium / Hard |
| Category | Select from the available categories |
| Hints | Add zero or more hint strings; revealed one at a time to students |

#### Saving

Click **Save** to save a draft. If this is an edit to an existing exercise, a **new immutable version** is created automatically — the previous version is not overwritten. Students who have already exported their answers against the old version will be flagged with a version mismatch notice when their submission is imported.

> **Editing is non-destructive.** You can always roll back to a previous version (see [Version History](#version-history) below).

---

### 2.4 Version History and Rollback

Every saved change creates a new version. You can view and restore old versions.

1. In Exercise Management, click the **History** icon on an exercise.
2. A list of all versions is shown with timestamps.
3. Click a version to preview it as students would see it.
4. Click **Rollback to this version** and confirm. The exercise now serves this version to students. No versions are ever deleted.

---

### 2.5 Publish / Unpublish an Exercise

New exercises are saved as **Draft** and are not visible to students.

**Publish:** In Exercise Management, click **Publish** on a draft exercise. The exercise status changes to **Published** and appears in the student exercise list.

**Unpublish:** Click **Unpublish** on a published exercise. The exercise is hidden from students immediately. Existing submissions and grades are not affected.

**Delete:** Click **Delete** and confirm. The exercise is soft-deleted (hidden everywhere) but all submission history is retained.

---

### 2.6 Import Student Submissions

Students export their answers as JSON files and submit them to you. You import these files for auto-grading.

**Navigate to:** Tutor Dashboard → **Submission Import**

**Uploading files:**

You can upload:
- **Individual JSON files** — select one or more `.json` answer files
- **A ZIP archive** — a zip containing multiple JSON files (max 50 MB compressed, 200 MB decompressed, 500 files)

Click **Upload** to start the import.

**What happens during import:**

For each file, the system:
1. Parses the answer file and identifies the exercise.
2. Checks for duplicate submissions (same student name + exercise + export timestamp). If a duplicate is found, you are asked whether to skip it or import it anyway.
3. Creates a submission record.
4. Checks whether the exercise version has changed since the student exported. If so, the submission is flagged with a **Version Mismatch** warning — the grading may not reflect the current exercise configuration.
5. Runs auto-grading:
   - **Blockly:** executes the student's generated JS against the grading rules (output match, required/forbidden blocks, block count). Score is 0–100.
   - **Python:** runs the student's code against all test cases (including hidden ones). Each passing test contributes to the score proportionally.

An import summary is shown after the upload completes, listing successes, skipped duplicates, and any files that failed (with reasons).

---

### 2.7 Review Grading Results

**Navigate to:** Tutor Dashboard → **Submissions**

The submissions list shows all imported submissions with their auto-graded scores.

**Filter and search:**
- Filter by exercise, student name, or grading status.

**View a submission:**
1. Click a submission row to open the detail view.
2. You can see the student's answer, the auto-grade breakdown, and any version mismatch flag.

**Add a manual score:**
1. In the submission detail view, enter a **Tutor Score** (0–100).
2. Optionally add a **Comment** to give the student feedback.
3. Click **Save**. The tutor score overrides the auto score for progress tracking and CSV export.

---

### 2.8 Export Grades as CSV

**Navigate to:** Tutor Dashboard → **Submissions** → **Export CSV**

Downloads a CSV file containing one row per submission:

| Column | Description |
|---|---|
| Student Name | The name the student entered when exporting |
| Exercise Title | Name of the exercise |
| Exercise Type | Blockly or Python |
| Auto Score | Score assigned by the auto-grader (0–100) |
| Tutor Score | Score assigned manually by the tutor (blank if not set) |
| Comment | Tutor's feedback comment |
| Submitted At | Timestamp of when the submission was imported |

---

## 3. Super Admin

As a Super Admin, you manage user accounts, global platform settings, and categories. You also have access to all Tutor functions.

### 3.1 Manage User Accounts

**Navigate to:** Admin Dashboard → **User Management**

**View users:**
- The user list shows all accounts with their role, status, and creation date.
- Filter by **Role** (Student / Tutor / Super Admin) or **Status** (Active / Disabled).

**Create a user:**
1. Click **New User**.
2. Enter a **Username** (must be unique) and assign a **Role**.
3. Click **Save**. The user is created with a default password. Share the credentials with the user and instruct them to change their password on first login.

**Import users in bulk:**
1. Click **Import Users**.
2. Upload a CSV file with columns: `username`, `role`.
3. The system creates accounts for all valid rows and reports any failures.

**Change a user's role:**
1. Find the user in the list.
2. Select a new role from the role dropdown on their row.
3. The change takes effect immediately on the user's next request (or next login if the role affects their navigation).

**Disable a user:**
1. Click the status toggle on the user's row.
2. Confirm the action. The user's account is immediately disabled and **all active sessions are invalidated** — they are logged out instantly and cannot log back in until re-enabled.

**Re-enable a user:**
- Click the status toggle again. The user can log in immediately.

**Reset a user's password:**
1. Click **Reset Password** on the user's row.
2. Confirm. The password is reset to `12345678`. Inform the user and ask them to change it on their next login.

---

### 3.2 Configure Global Settings

**Navigate to:** Admin Dashboard → **Global Settings**

#### Course Filter

The course filter controls whether students see all published exercises or only exercises from courses they are enrolled in.

| State | Student experience |
|---|---|
| **Disabled** (default) | All published exercises are visible to all students |
| **Enabled** | Students only see exercises from courses they are enrolled in |

**Enable the course filter:**
1. Click the **Course Filter** toggle.
2. If any students have no course enrollment, a warning is shown: *"N student(s) have no course enrollment and will see no exercises."* Review the number and decide whether to proceed.
3. Confirm to enable. Students with no enrollments will see an empty exercise list until a tutor enrolls them in a course.

**Disable the course filter:**
- Click the toggle to disable it. All published exercises become visible to all students immediately.

#### Navigation Menu Configuration

Super Admins can configure which navigation sections are visible to each role. The **Exercises** section is always visible to all roles and cannot be hidden. The **Users** and **Settings** sections are always restricted to Super Admin only.

For other sections, use the role toggle matrix to control visibility per role. Changes take effect for users on their next page load.
