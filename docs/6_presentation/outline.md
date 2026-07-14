# Final Presentation Outline — Programming Learning Platform Capstone

**Target length:** ~23 minutes talk + ~7 min Q&A
**Status:** Draft — follows COMP 8960SEF's mandated presentation structure (see below); literature citation for Part 2 deliberately left open, see "Open item"

---

## Course Requirements This Outline Follows

Source: "Topic 9 — Effective Oral Presentation" (COMP 8960SEF).

**Mandated content structure** (this doc's five Parts map 1:1 to it):
1. The problem and its significance (the value)
2. Analysis of the problem (incl. references to literature) and your approach/solution
3. The methodology (details of your solution)
4. The results and implication of the project
5. Question and answer time

**Time allocation rule:** Parts 1+2 combined should be **~40% of talk time** and **must be understandable to a non-technical audience** (audience knowledge ≈ average computing student, not necessarily an AI-agent specialist) — unless this were a "perfect research project," which it isn't. Parts 3+4 can go technical.
**Important nuance:** this caps *speaking time*, not slide count or visual density. Parts 1+2 can stay on simple, keyword-heavy slides while I talk longer over them (the course's recommended "outline-based" delivery style — keywords + graphics on the slide, improvised explanation out loud).

**Audience:** Supervisor, other Academic Staff/Second Examiner, Peers/Younger Peers, External Participants. The Second Examiner may ask repeated questions until stumped — Methodology and Results need to hold up under follow-up, not just read well.

**Assessment framing:** the presentation doesn't score directly but influences markers and helps the Second Examiner assess the FYP — it should *supplement* the Final Report with a distilled main storyline, not restate it. The audience can't flip back, so recurring technical terms (TDD, SDD, RED/GREEN, task brief) need a one-line reintroduction wherever they reappear.

**Slide design rules to apply when building the pptx:**
- Font ≥ 20pt
- More graphics, less text; short text, not long text
- ~1 minute per slide as a baseline; simplest slide gets ~30 sec; a graphics-heavy slide can run 2-3 min
- Recommended delivery style: **outline-based** (keywords/diagrams on slide, speak from understanding, not a script)
- Attention management: something to catch attention every few minutes, keep an explicit connective thread slide-to-slide, remind the audience what topic area a new slide is in, vary intensity (dense technical slide → lighter slide)
- Delivery mechanics: eye contact across the room, state the talk's theme up front, state any expectation of the audience up front, dress professionally

**Open item — literature reference:** deliberately parked. Part 2 needs "references to the literature" and nothing is sourced yet — pending your input on what's acceptable (class reading, a specific paper, or "anything that supports the agentic-coding-reliability approach"). Not fabricating one in the meantime.

---

## Part 1 — The Problem and Its Significance
*(with Part 2, ~40% of talk time / ~9 min total; keep plain-language, general computing audience)*
**2 slides, ~3 min**

### Slide 1 — Title
- Project name, your name, capstone course, date
- Visual: text only

### Slide 2 — The Problem & Why It Matters
- University's legacy exercise platform "OLE" stores every exercise in one monolithic XML file
- One bad edit risks corrupting the whole file → nobody dares touch it anymore
- Maintainers are scarce; small changes take disproportionate coordination
- Consequence: exercise content has gone stale, no way to introduce new exercise types, tutors have no independent way to author or fix content
- The value: tutors get an independently-manageable platform; a real, currently-painful workflow gets fixed
- Visual: simple before/after sketch, or "one file, one mistake, everything breaks"

---

## Part 2 — Analysis of the Problem and the Approach/Solution
*(still plain-language; this is where the AI-agent thesis is introduced conceptually, not technically)*
**3 slides, ~6 min**

### Slide 3 — The Solution, at a Glance
- A standalone platform tutors run independently of OLE
- Three roles (Student / Tutor / Super Admin), Blockly (visual block-based) exercises, export/import grading decoupled from OLE
- Visual: simple role/relationship diagram (self-generated)

### Slide 4 — Failed First Attempt: Pure "Vibe Coding"
- Before any structured process existed, development started over a **Telegram channel** — chat-only, no code visibility, judged only by watching the final result demo
- Worked fine at first, for small isolated changes
- No global constraints yet, no design docs, no enforced review — every decision left entirely to the agent
- Symptom as scope grew: new features started introducing regressions elsewhere; fixing one bug routinely introduced more than one new bug; the codebase stopped converging — progress stalled
- Visual: simple two-phase sketch — unconstrained chat-driven coding (diverging) vs. a disciplined pipeline (converging), second phase greyed out as "coming up"

### Slide 5 — The Real Analysis: What Was Actually Broken
- The agent is right most of the time, not all the time; with no human decision-checkpoints and no review gate, small per-decision errors don't get caught — they compound across a multi-step feature instead
- **The real finding:** the bottleneck wasn't the agent's ability to write code — it was the absence of a human-reviewed decision process
- **This reframes the FYP's actual question:** not "can an AI agent write code" (yes, trivially) but "what process makes AI-agent-built software reliable enough to run in production" — that's what the rest of this talk demonstrates
- Visual: text only, this is the thesis statement slide

---

## Part 3 — The Methodology
*(technical depth expected here — this is the FYP's real substance)*
**10 slides, ~11 min**

### Slide 6 — System Architecture
- Nginx → Spring Boot API → MySQL; server-side Blockly grading via an embedded Rhino (JS engine) sandbox
- Prometheus + Grafana monitoring
- Visual: architecture diagram (self-generated from CLAUDE.md architecture description)

### Slide 7 — Runtime Containers (Docker Compose)
- Single-server deployment, 7 containers via `docker compose up -d`:
  - `nginx` — reverse proxy + static frontend files (public port 80)
  - `api-server` — Spring Boot REST API
  - `mysql` — MySQL 8.0, schema/seed via Flyway on first boot
  - `sandbox` — Python code execution environment (nsjail: no network, 128MB mem cap, PID limit); present in the stack for the platform's code-execution path, not covered as a student-facing feature in this talk
  - `prometheus` — metrics scraping every 15s
  - `grafana` — dashboards + Telegram alerting
  - `backup` — automated daily MySQL dump, 30-day retention
- Visual: container topology diagram (self-generated from README service table)

### Slide 8 — Tech Stack & Safety Design
- Frontend: React 18 / Vite / Blockly
- Backend: Java 25 / Spring Boot 3.5 / Spring Security+JWT / Flyway / Rhino
- Design principles: immutable exercise versions, soft deletes only, no hard deletes
- Visual: text / icon layout

### Slide 9 — Transition: How Was This Actually Built?
- Bridges back to Slide 5's thesis: the rest of this section is the disciplined process that fixed the vibe-coding failure
- Visual: text only, short breathing-room slide

### Slide 10 — The Fix: a Spec-Driven Agentic Pipeline
- Brainstorm → PRD/Design doc → Implementation Plan → Task Briefs → TDD Implementation → Code Review → Deploy
- Every step leaves a durable, checkable artifact (design docs, plans, task briefs/reports, review diffs)
- Directly answers Slide 5's failure mode: every agent decision now has a checkpoint, a spec to be judged against, and a review gate before merge
- Visual: pipeline flow diagram (self-generated)

### Slide 11 — Case Study: One Bug, Start to Finish
- Real example: submission source-filter bug
  (`@RequestParam(defaultValue = "IMPORT")` silently rewrote empty/omitted `source` param, breaking the "All sources" view)
- Chain actually followed: design doc → implementation plan → RED failing test → GREEN fix → commit
- Visual: excerpts from the real design/plan pair in `docs/5_new_feature/` and the actual RED/GREEN test output

### Slide 12 — Subagent Task Dispatch + Enforced TDD
- Each implementation task gets an independent brief: files to touch, interfaces, step-by-step TDD instructions
- Implementer subagent returns a report with RED (failing test) → GREEN (passing test) evidence + commit hash
- Visual: task-brief → task-report side-by-side diagram

### Slide 13 — Automated Code Review + Self-Correction
- Every task's diff goes through review (Critical / Important / Minor severity)
- Full-branch final review (a stronger model) gates every merge
- Real example: the agent re-reviewed its own concurrency fix, caught a Critical flush-ordering race condition nobody had asked about, fixed it, and added a regression test
- Visual: quote from the SDD progress ledger (real log entries)

### Slide 14 — Division of Labor: What I Did vs. What the Agent Did
- Agent: wrote effectively all the implementation code (every commit `Co-Authored-By: Claude`), drafted design docs/plans from my specs, executed TDD steps, ran automated code review
- Me: identified the real OLE pain points firsthand (not something an agent could know or invent); authored the PRD — personas, user stories, acceptance criteria, edge cases; made the irreversible architecture/scope calls (single-server, no Redis/Kafka, immutable versioning, soft-delete-only, security thresholds) encoded permanently in `CLAUDE.md`; designed and enforced the pipeline itself; resolved judgment calls the agent flagged but couldn't decide alone; owned final verification and deployment
- Concrete example: mid-implementation, the agent caught that an old test assumed a field gets nulled on delete — no longer valid once deletion became soft-delete. It could surface the conflict, not resolve it. **I decided** to keep the field intact; the spec was corrected accordingly (commit `efd8854`)
- Why it matters: code generation isn't the scarce resource — defining the problem, making irreversible calls, resolving ambiguity the agent can't, and being accountable for what ships is. That's the individual contribution this FYP demonstrates.
- Visual: two-column comparison table + the example as a callout

### Slide 15 — Why This Development Model Worked
Synthesis, tying Slide 4/5's failure directly to what fixed it:
1. **Deep involvement in decisions, not just accepting output** — every ambiguous call resolved by me, scope/architecture decided upfront, every branch reviewed before merge
2. **`CLAUDE.md` actively maintained as living governance, not written once and left stale** — e.g., the Rhino sandbox instruction limit was corrected from 500K to 5M bytecode ops after real testing proved the original number wrong (commit `7b47312`)
3. **Explicit "Red Lines" removing entire risk categories from the agent's decision space** — no hard deletes, no localStorage tokens, no skipping ZIP validation, no skipping the workflow itself
4. **Large features decomposed into small, independently reviewable tasks** — a wrong call's blast radius stays local, never compounds silently
5. **TDD evidence required at every task**, not a trusted "done" claim
6. **Layered code review** — per-task diff review + full-branch final review by a stronger model
7. **A durable audit trail** (progress ledger, design docs, plans, reports) — decisions stay traceable across a long-running project
8. **Verification against the real, deployed system** — not just green tests
- Visual: 8-point checklist, cross-referenced back to Slide 4's failure symptoms

---

## Part 4 — Results and Implications
**3 slides, ~3 min**

### Slide 16 — Results in Numbers
- 457 commits across the project
- 330+ backend tests / 280+ frontend tests, all green at every merge gate
- Multiple feature branches, each independently reviewed "READY TO MERGE"
- Visual: stat cards / bar chart from real repo metrics

### Slide 17 — Challenges & Lessons Learned
- Even under the disciplined process, mistakes still happened (Slide 13's concurrency bug) — the process didn't prevent every mistake, it caught them before they shipped
- The process has real overhead: review gates and TDD discipline slow down small changes; the human is a deliberate bottleneck, not an accident
- Some decisions genuinely can't be delegated (the field-nulling example) — knowing which ones is itself a skill
- Visual: text only

### Slide 18 — Future Work
- P1 features: Exercise Likes, Profile management (Python-related P1 items dropped from scope per this talk's Blockly-only focus)
- Broader implication: this pattern (deep human involvement + a disciplined agentic pipeline) generalizes beyond this one project — it's a candidate template for making AI-agent-built software viable in other real, deployed systems
- Visual: text only

---

## Part 5 — Question and Answer
**~7 min, separate from the 23**

### Slide 19 — Q&A / Thank You
- Visual: text only

---

## Screenshot Requests (user to capture; cannot be generated automatically)
1. Student solving a Blockly exercise (block workspace + code view panel) — for Slide 3
2. Tutor submission grading page (auto-grade breakdown) — for Slide 8 or appendix
3. Grafana monitoring dashboard — for Slide 6/7 or appendix

## Assets Claude can generate directly
- Before/after problem sketch (Slide 2)
- Role/relationship diagram (Slide 3)
- Diverging-vs-converging two-phase sketch (Slide 4)
- Architecture diagram (Slide 6), container topology diagram (Slide 7)
- Pipeline flow diagram (Slide 10)
- Task-brief/report diagram (Slide 12)
- Two-column comparison + callout (Slide 14)
- 8-point checklist cross-referenced to Slide 4/5 (Slide 15)
- Stat cards / bar chart from real repo metrics (Slide 16)
- Any excerpted quotes/tables pulled from actual project docs (Slides 11, 13, 14)

---

## Open Questions for Discussion
- [ ] Literature reference for Part 2 — see "Open item" above
- [ ] Confirm which screenshots you can capture before pptx generation
- [ ] Any content to add/cut
- [ ] Visual theme/branding for the pptx (university colors? plain professional?)
- [ ] Do a timed dry-run once the pptx exists, to check the ~40%-on-Parts-1-2 pacing and the overall 23+7 min budget actually land given your speaking style
