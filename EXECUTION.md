# Alfred — Execution Plan (Agent-First, TDD)

> Tracking file for the next 5 build items. Written to be executed by an agent (or human) one item at a time.
> Created: 2026-07-19 · Goal for this stretch: **product depth** (per operator decision).
>
> Companion docs: [CURRENT_STATE.md](CURRENT_STATE.md) · [SKILLS_DESIGN.md](SKILLS_DESIGN.md) · [TODO.md](TODO.md)

---

## Agent protocol (read before executing)

1. **One item `in_progress` at a time.** Items are ordered by dependency: `1 → 2 → 3 → 4 → 5`. Do not start an item whose `Depends on` is not `done`.
2. **TDD discipline — every step is Red → Green → Refactor:**
   - **Red:** write the failing test first. Run `npm test` and confirm it **fails for the expected reason** (assertion, not a crash/typo). Paste nothing; just confirm.
   - **Green:** write the minimum implementation to pass. Run `npm test` — full suite green (61 baseline tests + new).
   - **Refactor:** clean up while green. Run `npm test` again.
   - Never mark a checkbox done while any test fails.
3. **Test runner gotcha:** `package.json` `test` script is an explicit glob list. A new test **directory** (e.g. `test/processing/`) is invisible until added to the script. Adding it is always the first Red step of any item that needs it.
4. **Contract stability:** `GET /api/state` field shapes and SSE event names are consumed by the desk companion (Arduino + external clients). Item 2 freezes them; after Item 2 lands, any change to those shapes must update the contract tests deliberately — never as a side effect.
5. **On completing an item:** tick its boxes, set Status to `done` with date, update [CURRENT_STATE.md](CURRENT_STATE.md) §6/§7 if architecture or milestones changed, and commit with a message describing the behavior change (see repo commit style in `git log`).
6. **Scope discipline:** anything discovered mid-item that isn't on this list goes into **Discovered work** at the bottom — do not chase it.

---

## Item 1 — `starts[]`: feed content auto-moves todos → `in_progress`

**Status:** `done` · **Depends on:** — · **Size:** S · **Completed:** 2026-07-20

Validates the taste hypothesis (`.commandcode/taste/taste.md`, confidence 0.75) by mirroring the existing `closes[]` machinery. Conservative by design: direct evidence only, never demotes, never resurrects `done`, manual status always wins later.

### Red
- [x] Add `test/processing/` to the `test` glob in `package.json` (new dir; see protocol §3).
- [x] `test/processing/skillRunnerStarts.test.js` — failing tests:
  - [x] extract-result normalizer returns `starts: []` when LLM omits the field (mirror of `closes` handling at `src/processing/skillRunner.js:160-164`).
  - [x] applying `starts` moves a `todo` todo to `in_progress`.
  - [x] applying `starts` does **not** demote an `in_progress` or `done` todo, and ignores unknown IDs (mirror of closes-apply rules at `src/processing/skillRunner.js:306-310`).

### Green
- [x] Extend `hopExtract` prompt (`src/processing/skillRunner.js:138-156`): emit `"starts": ["t_xxxxxxxx"]` with the same conservative wording as `closes` — only on direct evidence ("started drafting X", "working on it now"); empty array when unsure.
- [x] Normalize `starts` in the extract result (alongside `closes`, `skillRunner.js:160-164`).
- [x] Apply `starts` next to the closes block (`skillRunner.js:306-310`): valid IDs only, only todos currently at status `todo`.

### Refactor / close-out
- [x] Full `npm test` green.
- [x] Update `.commandcode/taste/taste.md`: note the hypothesis is now implemented (closes → done, starts → in_progress); adjust confidence note.
- [x] Update CURRENT_STATE.md §4 pipeline table (Extract row: "actions + closes + starts").

---

## Item 2 — Desk-companion endpoint contract + simulated Arduino e2e

**Status:** `done` · **Depends on:** — (do before Items 3–4 refactor `app.js`/`skillRunner.js`) · **Size:** M · **Completed:** 2026-07-20

Freezes the surfaces the desk companion depends on, so the registry/scheduler refactor cannot silently break hardware. Simulation-first per operator decision; the sim pass doubles as the future physical-verification checklist (`TODO.md` open item).

### Red
- [x] `test/contract/stateApiContract.test.js` — failing tests locking `GET /api/state` projection fields exactly: `led`, `display`, `buzzer`, `nudgeId`, `nudgeText`, `nudgeCount`, `processingStatus` (source: `src/server/localServer.js` state projection; documented CURRENT_STATE.md §5).
- [x] `test/contract/sseContract.test.js` — failing tests locking SSE event names: `alfred.state.updated`, `alfred.input.hit`, `pipeline.*` (source: `src/outputs/outputHub.js`, `src/state/stateStore.js` wiring in `src/app.js`).
- [x] `test/inputs/arduinoSimE2e.test.js` — failing end-to-end simulation, one case per ingest template (`audio-in`, `mode-toggle`, `nudge-ack` with and without `nudgeId`, `button`, `nudge-fabricate`, `custom-template`): POST `/api/adapters/arduino-in/ingest` → assert resulting `/api/state` projection, including the `pendingBuzzer` edge-trigger firing on new nudge (`src/state/stateStore.js:142`) and clearing after read (`stateStore.js:255-256`).

### Green
- [x] Implement only what the tests reveal is missing (expected: mostly test-harness plumbing — the behavior exists; the contract does not). Await `clearBuzzer()` on `/api/state` read so the edge-clear is deterministic.

### Refactor / close-out
- [x] Full `npm test` green.
- [x] Add a **Physical verification checklist** section to `ARDUINO_FIRMWARE.md` that replays the sim cases via `curl` against real hardware (fulfills TODO.md "Arduino physical device verification" as a ready-to-run doc; execution deferred until hardware is on the desk).
- [x] Tick CURRENT_STATE.md §7 note re: acceptance criteria covered by automated contract.

---

## Item 3 — Skills registry (SKILLS_DESIGN Phase 1)

**Status:** `done` · **Depends on:** Item 2 · **Size:** M · **Completed:** 2026-07-20

Named skill registry with settings toggles and run-now — SKILLS_DESIGN.md Phase 1, exactly as scoped there.

### Red
- [x] `test/processing/skillRegistry.test.js` — failing tests:
  - [x] `SKILL_REGISTRY` exposes the embedded hops as named skills (`garden-kb`, `create-todos`, `reprioritize`, `generate-nudges`, `daily-notes`) each with `id`, `label`, `description`, `trigger`, `defaultEnabled`.
  - [x] ADHD-pack skills present but marked stub/not-runnable.
  - [x] settings `skills` block round-trips: disabled skill reports `enabled: false`; unknown ids rejected.
- [x] `test/server/skillsApi.test.js` — failing tests: `GET /api/skills` lists registry + enabled state + lastRan; `POST /api/skills/:id/run-now` fires the skill (assert via state/log effect), 404 on unknown id, 409/skip while pipeline busy.

### Green
- [x] `src/processing/skillRegistry.js` — `SKILL_REGISTRY` constant per SKILLS_DESIGN.md §Skill Registry.
- [x] Extend settings storage with `skills` block (`config/settings.local.json` shape per SKILLS_DESIGN.md §Settings Storage).
- [x] `GET /api/skills` + `POST /api/skills/:id/run-now` in `src/server/localServer.js`.
- [x] Skills section on `/settings` (`src/server/settingsPage.js`) — collapsible cards, same pattern as adapter cards: toggle, badge, last-ran, Run Now.

### Refactor / close-out
- [x] Full `npm test` green; contract tests from Item 2 untouched.
- [x] Update CURRENT_STATE.md §6 implementation map + §7 milestone ("Full named skills registry" → partial: Phase 1 done).

---

## Item 4 — Skill scheduler (SKILLS_DESIGN Phase 2)

**Status:** `done` · **Depends on:** Item 3 · **Size:** M · **Completed:** 2026-07-20

Replace ad-hoc timers with a scheduler driven by the registry + settings. **Adopted defaults** (operator may veto): garden-kb **skips when no vault adapter is connected** (extends its existing skip-if-pipeline-busy guard); scheduler **serializes skill runs** (skip-if-processing), which retires SKILLS_DESIGN open question 4 (write collisions).

### Red
- [x] `test/processing/skillScheduler.test.js` — failing tests (inject fake timers/clock):
  - [x] scheduler reads `settings.skills` and arms one timer per enabled scheduled skill.
  - [x] disabling a skill in settings disarms its timer without restart (hot-reload).
  - [x] a due skill is **skipped, not queued**, while another skill/pipeline run is in flight (serialization).
  - [x] garden-kb does not fire when no vault is connected.

### Green
- [x] `src/processing/skillScheduler.js` — timers from registry + settings, hot-reload on settings change.
- [x] Remove the ad-hoc `ALFRED_GARDEN_MS` `setInterval` from `skillRunner.startPeriodic`; garden becomes a scheduled registry skill wired from `app.js`.

### Refactor / close-out
- [x] Full `npm test` green; Item 2 contract tests still green (scheduler must not change `/api/state` or SSE shapes).
- [x] Update CURRENT_STATE.md §4 (Garden row → scheduler-driven) and §6.

---

## Item 5 — Background-skill surfacing (SSE + /live panel + hardware label)

**Status:** `todo` · **Depends on:** Items 3–4 · **Size:** S/M

SKILLS_DESIGN mandate: "All background skill runs MUST be visible."

### Red
- [ ] `test/outputs/skillEvents.test.js` — failing tests: scheduler/run-now emits `alfred.skill.started` / `alfred.skill.done` / `alfred.skill.error` on the output hub with `{ skillId, trigger, timestamp }` (+ `summary`/`error`).
- [ ] Extend `test/contract/sseContract.test.js` (Item 2) **deliberately** to admit the new `alfred.skill.*` names (per protocol §4).
- [ ] `test/server/stateApiSkillLabel.test.js` — failing test: while a skill runs, `/api/state` `display` shows the skill label truncated to 20 chars instead of generic `Processing...`.

### Green
- [ ] Emit skill events from scheduler + run-now path (flows to `/settings` live feed automatically via existing `pushEvent()`).
- [ ] Background Activity panel on `/live` (`src/server/livePage.js`): current run indicator + last 5 completed runs.
- [ ] Hardware display label in the `/api/state` projection.

### Refactor / close-out
- [ ] Full `npm test` green.
- [ ] Update CURRENT_STATE.md §5 hardware projection table + §6.

---

## Deliberately cut this round

CI workflow (GitHub Actions `npm ci && npm test` — repo has remote `github.com:karx/alfred-buildathon`), `dev-secret` hardening (`src/inputs/adapters/arduinoInAdapter.js:13`), ack delight loop (buzzer chirp + Discord embed on ack), Slack adapter/actuator. Real, but not product depth. CI is the first candidate to sneak alongside Item 2.

## Discovered work

(Agent: append here instead of expanding scope. `- [ ] <what> — found during Item N`)

---

## Progress log

| Date | Item | Event |
|------|------|-------|
| 2026-07-19 | — | Plan created. Baseline: 61/61 tests green. |
| 2026-07-20 | 1 | `starts[]` shipped. Normalizer + applyStarts pure helpers; hopExtract prompt; suite 66/66 green. |
| 2026-07-20 | 2 | Desk-companion contract + Arduino sim e2e frozen; physical checklist in ARDUINO_FIRMWARE.md; await clearBuzzer on /api/state. |
| 2026-07-20 | 3 | Skills registry Phase 1: SKILL_REGISTRY, settings.skills, GET/POST /api/skills, Settings cards. |
| 2026-07-20 | 4 | Skill scheduler Phase 2: fake-timer tests; garden-kb vault-gated; serialize skip-if-busy; garden interval removed from skillRunner. |
