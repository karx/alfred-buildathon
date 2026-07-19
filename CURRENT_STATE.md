# Alfred — Current State Log

> Living document of how Alfred works **today**, what is implemented, and how data moves.  
> Last updated: **2026-07-19** (runtime snapshot while app was live).

---

## 1. One-line model

**Alfred is a local-first loop:** external signals become normalized events → durable state (todos, nudges, mode) → surfaces on UI, Obsidian vault, and hardware.

```txt
WORLD                          BRAIN                         YOU / THINGS
─────                          ─────                         ────────────
Vault watch  ─┐
Granola poll ─┼─► InputHub ─► State + Skills ─► StateStore ─► /live
Arduino HTTP ─┘      │              │                │        /settings
                     │              │                │        /demo
                     ▼              ▼                ▼        Arduino GET /api/state
                Hit log       KnowledgeBase     Vault sync
                Pipeline      (meeting notes)   (Alfred/*.md)
                SSE taps
```

---

## 2. Project identity

| | |
|---|---|
| **Name** | Alfred (`alfred-buildathon`) |
| **Version** | `0.1.0` |
| **Run** | `npm start` → `http://localhost:3737` |
| **Stack** | Node.js, no framework; local HTTP server; Claude or Gemini LLM |
| **Repo focus** | Buildathon slice: inputs + processing + local UX + hardware path |

### Primary surfaces

| URL | Role |
|-----|------|
| `/live` | Audience / daily dashboard (mobile-friendly CRT UI) |
| `/settings` | Adapter connect, vault path, verification |
| `/demo` | Backstage: stage packs, fabricate nudges, input hits, operator controls |
| `/events` | SSE stream of pipeline + Alfred channels |
| `GET /api/state` | Hardware projection (LED, display, buzzer, nudgeId) |

---

## 3. Data flow

### Normalized event

Every external signal becomes:

```js
{ id, source, type, timestamp, payload }
```

**Sources:** `vault` | `granola` | `arduino-in` | (scaffolds: `discord`, `slack`).

### Path A — Knowledge / inbox (Vault, Granola)

```txt
Adapter event
  → InputHub.publish
      → InputHitLog (+ console + SSE alfred.input.hit)
      → Pipeline (validate → SSE pipeline.event)
      → App subscriber
          → [granola.meeting.new] KnowledgeBase → vault/0 Inbox/*.md
          → stateStore.addInboxItem
          → skillRunner.processNewItems
              → multi-hop LLM
              → stateStore.patch(todos, nudges, dailySummary, …)
                  → SSE alfred.state.updated
                  → vaultStateSync → vault/Alfred/*.md
```

Only **`granola`** and **`vault`** are inbox sources (`INBOX_SOURCES` in `src/app.js`).

### Path B — Hardware / control (Arduino)

```txt
POST /api/adapters/arduino-in/ingest
  → secret check → normalized event → InputHub
  → App branches (no LLM for control):
      nudge-ack / button ack  → stateStore.ackNudge
      nudge-fabricate         → demo nudges
      other hardware events   → pipeline/SSE only (not inbox)
```

Hardware is a **control plane**, not a knowledge source (today).

### Path C — Human HTTP API

```txt
POST /api/alfred/*
  set-mode | todo-status | nudge-ack | process | garden
  nudge/fabricate | demo/stage | …
  → stateStore / skillRunner
  → same state broadcast + vault sync
```

### State schema (source of truth)

Persisted at `config/state.json` (gitignored) via `src/state/stateStore.js`.

| Field | Role |
|-------|------|
| `inbox` | Queued events waiting for / mid processing |
| `todos` | Working set: status, priority, suggestion, vaultHint |
| `nudges` | Short hardware prompts (`acked` flag) |
| `nowState` | `{ mode, context }` — focus / meeting / sparring |
| `dailySummary` | Rolling brief |
| `processingStatus` / `processingLog` | Agent busy signal |
| `seenMeetingIds` / `seenVaultPaths` | Dedup / progress |
| `pendingBuzzer` | Edge-trigger for hardware buzz |

**Rule:** adapters *emit* · skill runner *interprets* · state *holds truth* · outputs *project* truth.

---

## 4. Knowledge pipeline

### Capture (write-through)

| Trigger | Effect |
|---------|--------|
| New Granola meeting | `knowledgeBase.writeMeetingNote` → `0 Inbox/YYYY-MM-DD Title.md` |
| Vault PARA init | Folders + templates under configured vault |
| Garden hop | Assigns `vaultHint` (`1 Projects/…`, etc.) onto todos in state |
| Vault state sync | Mirrors todos / daily / seen-meetings into `vault/Alfred/` |

Meeting notes land in the vault **before** the LLM finishes processing.

### Cognitive pipeline (skill runner)

**Triggers:** new inbox items · periodic drain · `POST /api/alfred/process`.

```txt
Stage 1  classify (deterministic) → hopExtract (LLM)
           actions[] + closes[] + starts[] → mergeTodos (stable content-hash IDs)
           apply starts → status=in_progress (todo only); apply closes → status=done
Stage 2  hopReprioritize → priority + suggestion
Stage 3  hopNudges → 1–3 lines ≤40 chars (hardware display)
Stage 4  hopSummary → daily brief string
         patch state · drain inbox · SSE done
```

**Garden / scheduled skills (skillScheduler):**

```txt
skillScheduler arms interval timers from registry + settings.skills
  garden-kb: ALFRED_GARDEN_MS (default 15m) · skips if busy or no vault connected
  daily-notes: default 24h interval when enabled
  POST /api/alfred/garden · POST /api/skills/:id/run-now
  → hopGarden fills missing vaultHint on open todos
  → runs serialize (skip-if-processing), not queue
```

| Hop | Job | Independent fail? |
|-----|-----|-------------------|
| Classify | vault-note / meeting / skip | Yes (no LLM) |
| Extract | actions + closes + starts | Yes — item still drained |
| Merge | stable IDs; preserve human status | Deterministic |
| Reprioritize | focus ranking | Yes |
| Nudges | display lines | Yes |
| Summary | day narrative | Yes |
| Garden | PARA filing | Yes (own timer) |

**LLM:** `ALFRED_LLM` / keys → Claude or Gemini.

**Future:** `SKILLS_DESIGN.md` describes a named skill registry (schedules, ADHD pack, intent sessions). Not fully implemented as discrete toggles yet — still one orchestrated pipeline + garden + hardware handlers.

---

## 5. Human interaction & interfaces

```txt
         /settings          configure adapters, secrets, vault
              │
    /demo ◄───┼───► /live
  BACKSTAGE   │    AUDIENCE / DAILY
  stage packs │    mood bot, nudges, tasks
  fabricate   │    ACK, cycle todos
  input hits  │
              │
         GET /api/state     hardware LED / display / buzzer
         POST …/ingest      hardware ACK / buttons
              │
         Obsidian vault     0 Inbox · PARA · Alfred/*
```

### Interaction loops

1. **Configure** — `/settings` connect Vault, Granola OAuth, Arduino secret.  
2. **Observe** — `/live` SSE + poll; mood from mode / processing / nudges.  
3. **Act (software)** — ACK, cycle todos, set mode, process, garden, fabricate.  
4. **Act (hardware)** — poll `/api/state`; POST `nudge-ack` (optional `nudgeId`).  
5. **Notes** — human edits vault → events → todos; Alfred writes meetings + sync files.  
6. **Stage** — `/demo` operator console without polluting `/live`.

### Hardware state projection (`GET /api/state`)

| Condition | LED | Display |
|-----------|-----|---------|
| Processing | red | `Processing...` |
| Active nudge | red | nudge text (≤20) |
| Meeting mode | blue | context or `In meeting` |
| Idle | green | `Good Morning/Day/Evening - <minified>` (sticky ~5 min) |

Also returns: `buzzer`, `nudgeId`, `nudgeText`, `nudgeCount`, `processingStatus`.

### Real-time plumbing

```txt
stateStore.onChange  → SSE  alfred.state.updated { state }
outputHub.publish    → SSE  pipeline.* / alfred.*
inputHitLog          → SSE  alfred.input.hit
```

Browsers use SSE (`/events`). Hardware uses **pull** (`/api/state`).

---

## 6. Implementation map

| Concern | Location |
|---------|----------|
| App wiring | `src/app.js` |
| Event contract | `src/core/eventContract.js` |
| Adapters | `src/inputs/adapters/*` |
| Input hits | `src/inputs/inputHitLog.js` |
| Pipeline | `src/pipeline/pipeline.js` |
| Skill hops | `src/processing/skillRunner.js` |
| Skills registry (Phase 1) | `src/processing/skillRegistry.js` · `GET/POST /api/skills` · Settings cards |
| Skill scheduler (Phase 2) | `src/processing/skillScheduler.js` · replaces ad-hoc garden interval |
| Meeting notes | `src/processing/knowledgeBase.js` |
| State | `src/state/stateStore.js` |
| Vault mirror | `src/state/vaultStateSync.js` |
| HTTP + pages | `src/server/localServer.js`, `*Page.js` |
| Idle greetings | `src/server/idleGreeting.js` |
| Demo packs | `src/demo/demoStage.js`, `nudgeFabricator.js` |
| Skills design (future) | `SKILLS_DESIGN.md` |
| Hardware notes | `ARDUINO_FIRMWARE.md` |
| **Discord bot learnings** | `DISCORD_INTEGRATION.md` — tokens, intents 4014, invite/code-grant, in vs out |
| **Add a new input adapter** | Grok skill: `.grok/skills/alfred-input-stream/` → `/alfred-input-stream` |
| **Add a new output / actuator** | Grok skill: `.grok/skills/alfred-output-actuator/` → `/alfred-output-actuator` |
| Output bus | `src/outputs/outputHub.js` |
| Actuator contract / manager | `src/outputs/actuatorContract.js`, `actuatorManager.js`, `actuatorRegistry.js` |
| List actuators | `GET /api/actuators` (includes builtin projections) |

### Adapters (status)

| Adapter | Status |
|---------|--------|
| **Vault** | Working — watch, PARA init, file-change events |
| **Granola** | Working — OAuth, poll, XML meeting parse, KB write |
| **Arduino In** | Working — HTTP ingest, templates, ack/fabricate wiring |
| **Discord** | Working — Bot Gateway, @mention → inbox + vault note; separate from `discord-webhook` out |
| Slack | Scaffold only |

### Outputs / actuators (status)

| Mechanism | Kind | Status |
|-----------|------|--------|
| SSE `/events` | builtin push | Working — browsers |
| `GET /api/state` | builtin pull | Working — hardware LED/display/buzzer |
| Vault state sync | builtin push | Working — `Alfred/*.md` |
| KB meeting notes | builtin write-through | Working — Granola → Inbox |
| **Actuator registry** | composable fan-out | Working — `src/outputs/actuatorRegistry.js` |
| **Discord Webhook** (`discord-webhook`) | registry actuator | Working — state-change rich embeds + `send-test`; config `webhookUrl` |
| Slack / other webhooks out | registry actuators | Not yet — add via `/alfred-output-actuator` |

### Demo / operator

| Pack / API | Purpose |
|------------|---------|
| `POST /api/alfred/demo/stage` | `full` · `hardware` · `meeting` · `focus` · `board` · `reset` |
| `POST /api/alfred/nudge/fabricate` | Scenario or custom ≤40-char nudges |
| `GET /api/alfred/input-hits` | Ring buffer of every input hit + failed ingest |

---

## 7. Milestone checklist (from TODO.md)

### Done

- [x] Project scaffold, Alfred rename  
- [x] Adapter contract / manager / registry  
- [x] Settings UI connect/test/disconnect  
- [x] SSE local tap + human verification audit log  
- [x] Vault, Discord, Slack, Arduino scaffolds  
- [x] Vault path + PARA initializer  
- [x] Arduino templates (audio-in, mode-toggle, nudge-ack, button, custom, fabricate)  
- [x] Multi-hop skill runner + garden  
- [x] Live / settings / demo UIs  
- [x] Hardware state API + idle greetings  
- [x] Input hit log  

### Open / partial

- [ ] Real vault FS verification as formal acceptance  
- [x] Discord bot vs interactions decision — Gateway in + webhook out (`DISCORD_INTEGRATION.md`)
- [x] Arduino desk-companion **automated** contract + sim e2e (`test/contract/*`, `test/inputs/arduinoSimE2e.test.js`); physical curl checklist in `ARDUINO_FIRMWARE.md` (run when hardware is on desk)
- [x] Named skills registry **Phase 1** (registry + settings toggles + run-now); Phase 2+ scheduler/ADHD still open (`SKILLS_DESIGN.md`)
- [ ] Several first-acceptance UI checkboxes still open in `TODO.md` (functionality largely exists; formal sign-off pending)

---

## 8. Runtime snapshot (2026-07-19)

Captured while Alfred was running locally after a garden pass:

| Metric | Value |
|--------|--------|
| App name | Finalizing Alfred |
| Processing | `idle` |
| Last log | `[Garden] Filed 2 todo(s) into PARA.` |
| Todos | 6 total · 5 active |
| Nudges | 3 active |
| Inbox | 0 |
| Mode | `focus` — “Final phase of Build” |
| Last processed | `2026-07-19T13:09:11.594Z` |

Garden had assigned PARA `vaultHint` paths on todos (e.g. Granola product / hardware / demo prep projects).

> Snapshot is ephemeral — re-check with:
>
> ```bash
> curl -s http://localhost:3737/api/alfred/state | jq '.state | {processingStatus, processingLog, mode: .nowState, todos: (.todos|length), nudges: ([.nudges[]|select(.acked|not)]|length)}'
> ```

---

## 9. Lifecycle example

```txt
Meeting (Granola)
  → poll → event → hit log
  → markdown in 0 Inbox
  → inbox + skill runner
      → extract actions → todos
      → maybe close todos
      → reprioritize
      → nudge "Ship demo now"
      → daily brief
  → /live red mood + nudge
  → Arduino red LED + buzzer
  → human ACK (desk or Live)
  → green + "Good Day - focus"
  → later: Garden files todos into PARA
```

---

## 10. How to operate (cheat sheet)

```bash
npm start

# Full demo world
curl -X POST http://localhost:3737/api/alfred/demo/stage \
  -H 'Content-Type: application/json' -d '{"pack":"full"}'

# Garden
curl -X POST http://localhost:3737/api/alfred/garden

# Hardware ack
curl -X POST http://localhost:3737/api/adapters/arduino-in/ingest \
  -H 'Content-Type: application/json' \
  -H 'x-alfred-secret: dev-secret' \
  -d '{"eventType":"nudge-ack","response":"acknowledged"}'

# Input hits
curl http://localhost:3737/api/alfred/input-hits?limit=20
```

| Open | Use |
|------|-----|
| http://localhost:3737/demo | Backstage |
| http://localhost:3737/live | Dashboard |
| http://localhost:3737/settings | Adapters |

---

## 11. Mental model (four sentences)

1. **Inputs** normalize the world into events; only vault + granola feed the **inbox**.  
2. **Skill runner** turns inbox into **todos / nudges / brief**; **garden** files todos into PARA.  
3. **State** is the single truth; **SSE + vault sync + /api/state** are three projections of it.  
4. **Humans** configure on `/settings`, operate on `/demo`, live on `/live`, and feel Alfred on **hardware** and in **Obsidian**.

---

*Update this file when architecture, surfaces, or milestone status changes materially.*
