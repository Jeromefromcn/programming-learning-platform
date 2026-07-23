# Final Presentation Outline — Programming Learning Platform Capstone

**Target length:** ~15 minutes talk + Q&A (Q&A separate, not counted in the 15)
**Status:** Draft v2 — reworked to put **system features first**, engineering process trimmed. Follows COMP 8960SEF's five-part structure but no longer bound by the strict 40%-non-technical rule.

---

## What Changed From v1
- Total talk time: **23 min → 15 min**.
- **More** on what the system does (student, tutor, import/export grading, admin, monitoring).
- **Less** on how it was built (the AI-agent pipeline is now compact, not the main body).
- Course five-part structure kept, but weakened: Parts 1+2 stay plain-language, no hard 40% cap.
- **Writing style rule:** every slide bullet and every spoken line uses **short, simple sentences**. No long sentences. No sub-clauses.

---

## Course Structure (kept, weakened)
Five parts from "Topic 9 — Effective Oral Presentation":
1. The problem and its value
2. Analysis and the approach
3. The methodology (the solution in detail) — **now mostly system features**
4. Results and implications
5. Q&A

**Slide rules still applied:** font ≥ 20pt · more graphics, less text · short text only · ~1 min per slide baseline · keep a connective thread slide to slide · vary intensity (dense slide → lighter slide).

---

## Time Budget (15 min talk)
| Part | Content | Slides | Time |
|------|---------|--------|------|
| 1 | Problem & value | 2 | ~2 min |
| 2 | Solution at a glance + why a process was needed | 2 | ~2 min |
| 3A | **System features (main body)** | 6 | ~7 min |
| 3B | How it was built (compact) | 2 | ~2 min |
| 4 | Results & lessons | 1 | ~1.5 min |
| 5 | Q&A / thank you | 1 | (separate) |

Total core slides: ~14 + title. ~15 min.

---

## Part 1 — The Problem and Its Value
**2 slides, ~2 min · plain language**

### Slide 1 — Title
- Project name. Your name. Capstone course. Date.
- Visual: text only.

### Slide 2 — The Problem
- The old platform is called OLE.
- It keeps every exercise in one big XML file.
- One bad edit can break the whole file.
- So nobody dares to touch it.
- Content is stale. Tutors cannot add or fix exercises on their own.
- **The value:** tutors get a platform they can run and manage themselves.
- Visual: simple "one file, one mistake, everything breaks" sketch.

---

## Part 2 — The Solution and the Approach
**2 slides, ~2 min · plain language**

### Slide 3 — The Solution at a Glance
- A new, standalone platform. It runs on its own, apart from OLE.
- Three roles: Student, Tutor, Super Admin.
- Exercises use Blockly. Students drag blocks to write code.
- Block-based coding is a proven way to teach programming [4][8][11].
- Blockly is a well-known library for this [5][6][9].
- Grading is decoupled. Students export answers. Tutors import and grade.
- Visual: simple role diagram (Student / Tutor / Admin).
- *(Speaker note: this is the "references to literature" beat for Part 2.)*

### Slide 4 — Why We Needed a Real Process (short)
- The first attempt was pure "vibe coding" over chat. No plan. No review.
- It worked for small changes. It broke as the project grew.
- One fix often caused new bugs. Progress stalled.
- The lesson: the AI can write code. It needs a process to be reliable.
- Good software still needs human judgment, not just output [12].
- So the project was rebuilt on a disciplined pipeline. (Details later, kept short.)
- Visual: two-phase sketch — messy chat coding vs. a clean pipeline.

---

## Part 3A — System Features (Main Body)
**6 slides, ~7 min · this is the core of the talk**

### Slide 5 — System Overview
- Nginx serves the site. Spring Boot runs the API. MySQL stores the data.
- Blockly answers are graded on the server, safely.
- All of it runs on one server with Docker [10].
- Visual: simple architecture diagram (browser → nginx → API → MySQL).

### Slide 6 — Student: Practice an Exercise
- The student opens a published exercise.
- They drag blocks to build a solution.
- They click Run. The code runs in the browser, safely.
- They see the result right away.
- When done, they export their answer to a file.
- Visual: screenshot of the Blockly workspace + run result. *(needs capture)*

### Slide 7 — Tutor: Create and Publish Exercises
- The tutor creates a new exercise. They set the task and the blocks.
- They can edit and publish it.
- Every edit saves a new version. Old versions are never lost.
- Rollback is easy: just point back to an old version.
- Visual: screenshot of the exercise editor + a version list. *(needs capture)*

### Slide 8 — Tutor: Organize Courses and Categories
- The tutor groups exercises into courses.
- Categories keep exercises tidy.
- Tutors assign exercises to a course. They pick which students see them.
- Visual: screenshot of the course / category view. *(needs capture)*

### Slide 9 — The Core: Export / Import Grading
- This replaces the old OLE workflow.
- Student exports an answer file. The tutor imports it.
- The system grades Blockly answers automatically, on the server.
- It flags duplicates. It flags version mismatches.
- Tutors can export results to CSV.
- Visual: flow diagram — student export → tutor import → auto-grade → CSV.

### Slide 10 — Admin and Monitoring (light)
- Super Admin creates and manages user accounts.
- Admin can disable a user. That user is locked out at once.
- Grafana shows live health of the system [1].
- Alerts fire if something breaks.
- Visual: screenshot of the admin user list + a small Grafana panel. *(needs capture)*

---

## Part 3B — How It Was Built (Compact)
**2 slides, ~2 min · engineering, kept short**

### Slide 11 — A Spec-Driven AI Pipeline
- Every feature followed the same steps.
- Brainstorm → design doc → plan → code with tests → review → deploy.
- Each step leaves a record you can check.
- Every agent decision has a checkpoint and a review gate.
- Visual: simple pipeline flow diagram.

### Slide 12 — What I Did vs. What the AI Did
- The AI wrote almost all the code. It followed my specs and my tests.
- I found the real OLE problems. I wrote the requirements.
- I made the hard, permanent calls: one server, no hard deletes, safe versions.
- I reviewed and approved every merge. I owned what shipped.
- The point: writing code is easy now. Deciding and being accountable is the real work.
- Visual: two-column table (Me / AI).

---

## Part 4 — Results and Lessons
**1 slide, ~1.5 min**

### Slide 13 — Results and Lessons
- A working, deployed platform. It replaces the OLE pain points.
- Real numbers: 457 commits. 330+ backend tests. 280+ frontend tests. All green.
- Lesson: the process has a cost, but it catches bugs before they ship.
- Future work: likes, profiles, and Python exercises [2][7].
- Visual: a few stat cards.

---

## Part 5 — Q&A
**Separate, after the 15 min**

### Slide 14 — Thank You / Q&A
- Visual: text only.

### Slide 15 — References (appendix)
- Full list of the 12 citations, shown at the end.
- Not spoken. Available if a marker asks.

---

## References (for the appendix slide)
1. Baeldung. (2024, May 20). *Monitor a Spring Boot app using Prometheus.*
2. Codecademy. (2024). *Learn Python 3.*
3. DZone. (2021, June 22). *JGit library examples in Java.*
4. EduBlocks. (2024). *EduBlocks: Block-based coding to text-based Python.*
5. Google for Developers. (2025, Sept 19). *Save and load* (Blockly serialization).
6. Google for Developers. (2025, Nov 10). *Using Blockly APIs.*
7. freeCodeCamp. (2024). *Scientific computing with Python.*
8. Hermans, F. (2020). *Hedy: A gradual language for programming education.* ICER '20, 259-270.
9. ignatandrei. (2024). *BlocklyAutomation* [software]. GitHub.
10. Merkel, D. (2014). *Docker: Lightweight Linux containers.* Linux Journal, 2014(239).
11. Open Roberta. (2024). *Open Roberta Lab* [software]. GitHub.
12. Petre, M. (2004). *How expert software engineers understand and use UML.* Journal of Systems and Software, 71(3), 183-194.

---

## Screenshots to Capture (you)
1. Student Blockly workspace + run result — Slide 6
2. Tutor exercise editor + version list — Slide 7
3. Course / category view — Slide 8
4. Admin user list — Slide 10
5. Grafana dashboard panel — Slide 10

## Assets Claude Can Generate
- Problem sketch (Slide 2)
- Role diagram (Slide 3)
- Two-phase vibe-vs-pipeline sketch (Slide 4)
- Architecture diagram (Slide 5)
- Export/import grading flow (Slide 9)
- Pipeline flow diagram (Slide 11)
- Me/AI two-column table (Slide 12)
- Stat cards (Slide 13)

---

## Decisions (settled)
- [x] Literature references — 12 citations supplied. Woven into Slides 3, 4, 5, 10, 13; full list on appendix Slide 15.
- [x] Screenshots — placeholders left in Slides 6, 7, 8, 10. User captures them.
- [x] Features — no changes to Part 3A.
- [x] Slide language — English.
