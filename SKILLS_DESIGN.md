# Alfred Skills System — Design Spec

## Overview

## Evolution (why multi-hop beats v0.0.1)

| Era | How it worked | Failure mode |
|-----|----------------|--------------|
| **Alfred v0.0.1** | One cheap-model call + **one large composed skill file** (extract + rank + nudge + summary in one megaprompt) | Vague meta-todos like *"Plan a team outing"* — sounds useful, not executable; model pads JSON to satisfy many goals at once |
| **Alfred now (`skillRunner.js`)** | **Multi-hop pipeline**: deterministic `classifyItem` → `hopExtract` → meta-task filter → `hopReprioritize` → `hopNudges` → `hopSummary` → periodic `hopGarden` | Extract is narrow (≤2 concrete actions, explicit only); `/^plan /` and siblings are dropped; hops fail independently |

Living example on the board: todo `t_a9db946c` (*Plan a team outing*) carries a `rationale` field documenting the singular-skill artifact. Under current rules that title is a **meta-task** and would not be merged from extract.

This spec further extends multi-hop into a **named skill registry** where each skill is a discrete unit with its own schedule, trigger conditions, and opt-in toggle on the Settings page.

Skills come from two sources:
- Alfred's existing embedded hops (extract / reprioritize / nudges / summary / garden in `skillRunner.js`)
- ADHD Chief-of-Staff pack (`github.com/akashbhargava1992-sudo/adhd-chief-of-staff`)

---

## Skill Registry

Each skill has: `id`, `label`, `description`, `trigger` (schedule | event | intent), `defaultEnabled`.

### Background Skills (run automatically, no user initiation)

| ID | Label | Source | Schedule / Trigger | Default |
|----|-------|--------|--------------------|---------|
| `garden-kb` | Garden Knowledgebase | Alfred | Twice daily (08:00, 20:00) | on |
| `daily-triage` | Daily Triage | ADHD CoS | Once daily (08:30) + on inbox drain | on |
| `create-todos` | Create TODOs | Alfred | On new inbox item | on |
| `reprioritize` | Reprioritize | Alfred + ADHD daily-triage | On new inbox item, after `create-todos` | on |
| `gtd` | Get Things Done | Alfred | Every 30 min if todos exist | on |
| `generate-nudges` | Generate Nudges | Alfred + ADHD nudge-loop | On new inbox item + after `gtd` | on |
| `interruption-recovery` | Interruption Recovery | ADHD CoS | On `granola.meeting.new` or `arduino-in.hardware.mode-toggle` | on |
| `daily-notes` | Daily Notes | Alfred | Once daily (21:00) | on |

### Intent-Triggered Skills (require explicit input to fire)

| ID | Label | Source | Trigger Input | Default |
|----|-------|--------|---------------|---------|
| `task-activation` | Task Activation | ADHD CoS | User selects a todo on /live dashboard, or GTD emits `suggest.activate` | on |
| `sparring-mode` | Sparring Mode | ADHD CoS | Arduino sparring button (`arduino-in.hardware.sparring`) or `/sparring` UI action | on |
| `focus-companion` | Focus Companion | ADHD CoS | After `task-activation` accepts, or mode set to `focus` | off |
| `delegation-router` | Delegation Router | ADHD CoS | GTD emits a `Delegate:` suggestion on a high-priority todo | on |
| `shutdown-review` | Shutdown Review | ADHD CoS | Arduino mode-toggle to `shutdown`, or `/shutdown` UI action | off |
| `evidence-coping` | Evidence-Guided Coping | ADHD CoS | User sends `coping` intent from /live or hardware | off |
| `ethical-gamification` | Ethical Gamification | ADHD CoS | On `todo.done` event (todo marked complete) | off |

---

## Trigger Types

### 1. Scheduled (cron-like)
Runs on a fixed time cadence regardless of inbox. Stored in `settings.skills.<id>.schedule`.

```
garden-kb:      "0 8,20 * * *"   (08:00 and 20:00)
daily-triage:   "30 8 * * *"     (08:30)
daily-notes:    "0 21 * * *"     (21:00)
gtd:            every 30 min if state.todos has items with status != done
```

### 2. Event-Triggered
Fires when a specific normalized event arrives in the input pipeline.

```
create-todos + reprioritize + generate-nudges:
  → on any INBOX_SOURCES event (granola, vault)

interruption-recovery:
  → on granola.meeting.new
  → on arduino-in.hardware.mode-toggle { mode: "meeting" }

ethical-gamification:
  → on alfred.todo.done (internal event emitted when todo status → done)
```

### 3. Intent-Triggered (explicit user/hardware input)
The user or hardware sends a specific signal. These create a **session** — a back-and-forth exchange surfaced on /live.

```
sparring-mode:        arduino-in.hardware.sparring  |  POST /api/alfred/skill/sparring-mode/start
task-activation:      POST /api/alfred/skill/task-activation/start  { todoId }
focus-companion:      auto-chained after task-activation accepts
delegation-router:    auto-chained when GTD emits a Delegate suggestion
shutdown-review:      arduino mode-toggle { mode: "shutdown" }  |  POST /api/alfred/skill/shutdown-review/start
evidence-coping:      POST /api/alfred/skill/evidence-coping/start
```

### 4. Processing-Run Triggered (chaining)
Background skills can emit **intents** as part of their output JSON. Downstream skills subscribe to these.

```json
// GTD output → task-activation chain
{ "chainSkill": "task-activation", "todoId": "t_3" }

// GTD output → delegation chain
{ "chainSkill": "delegation-router", "todoId": "t_5", "delegateTo": "..." }
```

The skill runner checks `result.chainSkill` after every run and fires the downstream skill automatically if it's enabled.

---

## Settings Page Changes

Add a new **Skills** section to `/settings`, below Input Adapters.

### Per-Skill Card

Each skill renders as a collapsible card (same pattern as adapter cards) with:

```
[toggle on/off]  Skill Label          [SCHEDULED | EVENT | INTENT] badge
                 Description (1 line)
                 Last ran: 3 min ago  |  Next run: 08:30
                 [Run Now]  [View Last Output]
```

### Settings Storage (`config/settings.local.json`)

```json
{
  "skills": {
    "garden-kb":   { "enabled": true,  "schedule": "0 8,20 * * *" },
    "daily-triage":{ "enabled": true,  "schedule": "30 8 * * *" },
    "gtd":         { "enabled": true,  "intervalMs": 1800000 },
    "sparring-mode":{ "enabled": true },
    "focus-companion": { "enabled": false },
    "shutdown-review": { "enabled": false },
    "ethical-gamification": { "enabled": false },
    "evidence-coping": { "enabled": false }
  }
}
```

Disabling a skill prevents it from running in all trigger modes (scheduled, event, intent, chained).

---

## Background Task Surfacing

All background skill runs MUST be visible. Every run emits SSE events consumed by /live and /settings dashboards.

### SSE Events Emitted

```
alfred.skill.started   { skillId, trigger, timestamp }
alfred.skill.done      { skillId, trigger, timestamp, summary }
alfred.skill.error     { skillId, trigger, timestamp, error }
alfred.skill.chained   { fromSkillId, toSkillId, reason, timestamp }
```

### /live Dashboard

Add a **Background Activity** panel (below nudges) showing:
- Currently running skill (pulsing indicator)
- Last 5 completed skill runs: `[skill label] · [trigger] · [N todos, M nudges] · timestamp`
- Any chain events: `GTD → Task Activation (t_3)`

### /settings Dashboard

Existing "Live Events" feed already shows SSE — skill events will appear there automatically via the existing `pushEvent()` path, colour-coded with a new `alfred-skill` source class.

### Hardware (Arduino)
- Yellow LED + "Processing..." display: already fires on `processingStatus: processing`
- Extend: when a skill is running, display `[skill label truncated to 20 chars]` instead of generic "Processing..."

---

## Implementation Phases

### Phase 1 — Skill Registry + Settings UI
- [ ] Define `SKILL_REGISTRY` constant in `src/processing/skillRegistry.js`
- [ ] Extend `settingsStore` to read/write `skills` block
- [ ] Add Skills section to `settingsPage.js` (toggle cards, last-ran, next-run)
- [ ] Add `GET /api/skills` and `POST /api/skills/:id/run-now` endpoints to `localServer.js`

### Phase 2 — Scheduler
- [ ] Replace ad-hoc `setInterval` in `app.js` with a `SkillScheduler` in `src/processing/skillScheduler.js`
- [ ] Scheduler reads `settings.skills`, sets up cron/interval timers per skill
- [ ] On settings change, scheduler hot-reloads timers (no restart needed)
- [ ] `garden-kb` and `daily-notes` move from inside `buildPrompt` to standalone scheduled calls

### Phase 3 — Skill Runner Decomposition
- [ ] Extract each embedded skill from `buildPrompt` into a named builder function
- [ ] Each background skill run calls only its relevant subset of skill steps
- [ ] `daily-triage` replaces `reprioritize` logic with ADHD CoS lane assignment (top-3, 70% cap)
- [ ] `generate-nudges` adopts ADHD nudge-loop gating rules (consent, recency, single-purpose)
- [ ] `interruption-recovery` added as a new skill triggered on meeting events

### Phase 4 — Intent Skills + Chaining
- [ ] Add `POST /api/alfred/skill/:id/start` endpoint for intent-triggered skills
- [ ] Skill runner emits `chainSkill` in output; runner checks and fires downstream
- [ ] `task-activation`: takes `todoId`, returns 3 micro-steps + first 30s action, patches todo
- [ ] `sparring-mode`: stateful session stored in `state.sparringSession`, SSE streams back each exchange
- [ ] `delegation-router`: produces delegation candidates list, requires user approval before acting

### Phase 5 — /live Dashboard Updates
- [ ] Add Background Activity panel to `livePage.js`
- [ ] Wire `alfred.skill.*` SSE events to panel
- [ ] Add "Activate" button on each high-priority todo (fires `task-activation`)
- [ ] Add "Start Sparring" button (fires `sparring-mode`)

---

## Open Questions

1. **Sparring session UX**: SSE stream back multi-turn exchanges, or poll `/api/alfred/state` for `state.sparringSession`?
2. **Garden-KB schedule**: Should it respect the vault adapter being connected? Skip if vault not configured?
3. **Daily Triage at 08:30**: Should it only fire if there are inbox items, or always run to produce a fresh top-3?
4. **Skill output conflicts**: If two background skills both want to update `todos` simultaneously (queue collision), last-write wins today — acceptable?
5. **Hardware display for intent skills**: Sparring mode running — show on Arduino LCD? Needs a new LED colour or display mode.
