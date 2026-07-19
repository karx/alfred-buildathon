---
name: alfred-output-actuator
description: >
  Scaffold and wire a new Alfred output / actuator / interface end-to-end: discovery
  interview to cut cognitive load, ActuatorContract implementation, registry registration,
  channel and state subscriptions, Settings connect, composable fan-out with existing
  projections (SSE, /api/state, vault sync), tests, and a verification loop that continues
  until the user confirms the actuator works. Use when the user says "add output adapter",
  "new actuator", "output mechanism", "notify Discord", "webhook out", "hardware out",
  "push to Slack", "new interface", "output stream", or runs /alfred-output-actuator.
metadata:
  short-description: "Create a new Alfred output actuator"
---

# Alfred Output / Actuator — Create Skill

Use this skill to add a **new output mechanism** (actuator / interface) that projects
Alfred outward — chat, webhooks, hardware push, email, dashboard widgets, etc.

**Design goals**

1. **Reduce cognitive load** — few config fields, safe defaults, clear verify steps.  
2. **Composable** — new actuator plugs in beside SSE, vault sync, hardware state; never
   replaces them.  
3. **Verify with the human** — do not stop until the user confirms they saw the effect.

**Project root:** `alfred-buildathon`  
**Sister skill (inputs):** `/alfred-input-stream`  
**Docs:** [CURRENT_STATE.md](../../../CURRENT_STATE.md), [DISCORD_INTEGRATION.md](../../../DISCORD_INTEGRATION.md) (webhook out vs Gateway in)

---

## Current state of outputs (read this first)

Alfred historically had **no ActuatorContract**. Outputs were **implicit projections**:

| Built-in | How it works | Transport |
|----------|--------------|-----------|
| **SSE** `/events` | `outputHub.onPublish` → browsers | push stream |
| **Hardware** `GET /api/state` | Computes LED/display/buzzer from state | pull |
| **Vault sync** | `stateStore.onChange` → `Alfred/*.md` | push file |
| **KB meetings** | On granola event → `0 Inbox/*.md` | write-through |
| **Live / Settings / Demo** | Poll/SSE consume state | UI |

**Bus:** `src/outputs/outputHub.js` — pub/sub + recent ring buffer. Channels are free-form
strings (`alfred.processing.done`, `alfred.nudge.acked`, `pipeline.event`, …).

**Composable layer (now):**

| File | Role |
|------|------|
| `src/outputs/actuatorContract.js` | Base class |
| `src/outputs/actuatorRegistry.js` | List of actuators |
| `src/outputs/actuatorManager.js` | connect / start / stop fan-out |
| `settings.actuators` | Persisted config |
| `GET /api/actuators` | List + builtins |
| `POST /api/actuators/:id/{test,connect,disconnect}` | Lifecycle |
| `POST /api/actuators/:id/actions/:actionId` | Custom actions |

New work **registers an ActuatorContract** — do not fork a second bus.

---

## When invoked

1. Confirm repo is Alfred (`package.json` name `alfred-buildathon`).  
2. Start **Phase 0 — Interview**. **Do not code** until Spec Card approved.  
3. Use `ask_user_question` for multi-choice; free-text **one question at a time**.  
4. Prefer defaults that minimize choices (see Cognitive load rules).  
5. Implement → automated tests → **human verification loop** until user says verified.

---

## Cognitive load rules (always apply)

When the user is unsure, **choose the simpler default** and say so:

| Decision | Default |
|----------|---------|
| Auth | Shared secret or none for local; OAuth only if required |
| Config fields | ≤ 3 required fields |
| Trigger | Prefer **state change** (one mental model: “when Alfred changes”) over many channels |
| Channel filter | Subscribe to **one** primary channel or `state` only |
| Failure mode | Log + optional `alfred.actuator.error` channel; never throw into hub |
| Debounce | 1–2s for flaky externals; 0 for explicit user actions |
| Settings UI | `configExample` only — no custom HTML unless unavoidable |
| Dual input+output | If same system (e.g. Discord), keep **input adapter** and **output actuator** separate modules that share config keys |

Ask fewer questions when the destination is obvious (e.g. “Discord webhook URL” implies push + URL + optional secret).

---

## Phase 0 — Discovery interview

### 0.1 Identity

1. **Working name** — human label (e.g. “Discord Notify”, “Ntfy”, “Home Assistant”).  
2. **Actuator id** — kebab-case (`discord-notify`, `ntfy`, `ha-webhook`).  
3. **One-sentence purpose** — what the human should notice in the world.

### 0.2 Destination & transport

4. **Where does Alfred act?**  
   Options: chat (Discord/Slack) · mobile push · HTTP webhook · local file/vault ·
   hardware push (MQTT/WS) · email · browser-only (already SSE) · other.  
5. **Push vs pull**  
   - **Push:** Alfred calls out on change (webhook, bot message).  
   - **Pull:** external system reads Alfred (like `GET /api/state`) — may only need a
     new projection endpoint, not a full actuator.  
   - **Hybrid.**  
6. If pull-only: stop and propose extending `/api/state` or a dedicated `project()` endpoint
   instead of a chatty actuator — confirm with user.  
7. **Auth** — none · shared secret · bot token · OAuth · API key.

### 0.3 Trigger model (composable subscription)

8. **What should fire this actuator?** (multi-select)  
   - Any state change  
   - New / unacked nudge  
   - Todo created or completed  
   - Mode change  
   - Processing done  
   - Specific `outputHub` channel list  
   - Manual action only (`runAction`)  
9. **Primary channel list** (if channel-triggered) — pick from known catalog or new names:

```txt
alfred.processing.started | alfred.processing.done
alfred.garden.started | alfred.garden.done
alfred.nudge.acked | alfred.nudge.fabricated
alfred.state.updated | alfred.demo.stage
alfred.input.hit | pipeline.event | pipeline.error
```

10. **Noise control** — debounce ms? rate limit? only when `pendingBuzzer`? only high priority?

### 0.4 Message / payload (reduce cognitive load)

11. **What should the external system receive?**  
    Prefer a **template** with 1–3 fields, not full state dump.  
    Example: `"[Alfred] {{nudgeText}}"` or `{ led, display, buzzer }`.  
12. **Quiet hours / mode filters?** (optional; default none)  
13. **Idempotency** — can we send twice safely? If not, what key dedupes?

### 0.5 Config & ops

14. **Config fields** (names + required?) — enforce ≤3 required.  
15. **Actions** — e.g. `send-test`, `flush`. Always add **`send-test`** for verification.  
16. **Failure UX** — console only vs SSE error event vs Settings status.  
17. **Demo** — should `/demo` expose a “test actuator” button? (default: use `send-test` API)

### 0.6 Composition

18. **Must this coexist with** SSE, vault sync, hardware? (Always yes — confirm no
    exclusive takeover.)  
19. **Shared secrets with an input adapter?** (e.g. same Discord bot) — document shared
    settings path; do not merge classes.

### 0.7 Spec Card (approve before code)

```md
## Actuator Spec Card

| Field | Value |
|-------|--------|
| id | … |
| label | … |
| purpose | … |
| transport | push \| pull \| hybrid |
| destination | … |
| auth | … |
| triggers | state \| channel \| manual |
| channels (if any) | … |
| filter / debounce | … |
| outbound payload shape | … |
| configExample (≤3 required) | { … } |
| actions | [send-test, …] |
| compose with builtins | yes (always) |
| verify signal | what user will see/hear |
| tests | unit + dry-run |
```

**Verify signal** must be concrete: “I get a Discord message in #alfred”, “HA turns on light”, etc.

---

## Phase 1 — Implementation (composable)

### 1.1 Class

File: `src/outputs/actuators/<name>Actuator.js`

```js
const { ActuatorContract } = require("../actuatorContract");

class ExampleActuator extends ActuatorContract {
  constructor() {
    super({
      id: "example",
      label: "Example Out",
      description: "…",
      configExample: { url: "", enabled: true },
      actions: [{ id: "send-test", label: "Send test", description: "Fire a sample payload" }],
      channels: ["alfred.processing.done"],
      triggers: ["channel", "manual"],
    });
  }

  async test(config = {}) { /* validate url, etc. */ }
  async connect(config = {}) { /* this.config = … */ }

  async start(ctx) {
    await super.start(ctx);
    // State-driven:
    // this.track(ctx.onStateChange((state) => this.onState(state).catch(log)));
    // Channel-driven:
    // this.track(ctx.onChannel((evt) => this.onChannel(evt).catch(log)));
  }

  async onState(state) { /* map → deliver */ }
  async onChannel(evt) {
    if (!this.channels.includes(evt.channel)) return;
    await this.deliver(this.mapEvent(evt));
  }

  async deliver(payload) {
    // HTTP / SDK call — never throw to hub
    // await ctx.publish({ channel: "alfred.actuator.sent", actuatorId: this.id, … })
  }

  async runAction(actionId) {
    if (actionId === "send-test") {
      await this.deliver({ text: "Alfred test — ignore" });
      return { ok: true, message: "Test sent" };
    }
    return { ok: false, message: `Unknown action ${actionId}` };
  }
}

module.exports = { ExampleActuator };
```

Use [references/actuator-skeleton.js](references/actuator-skeleton.js).

### 1.2 Register

`src/outputs/actuatorRegistry.js` — `require` + `new …` in the array.

### 1.3 Do **not** special-case in app.js

Manager already starts all registered actuators. Only touch `app.js` if you need a new
global dependency (rare).

### 1.4 Settings persistence

`settingsStore.updateActuator` / `actuators` key — used by manager connect.  
Generic Settings UI may not list actuators yet; verification can use API:

```bash
curl -X POST http://localhost:3737/api/actuators/<id>/connect \
  -H 'Content-Type: application/json' \
  -d '{"config":{…}}'
curl -X POST http://localhost:3737/api/actuators/<id>/actions/send-test \
  -H 'Content-Type: application/json' -d '{}'
```

If user needs Settings UI cards for actuators, extend `settingsPage.js` only after core works.

### 1.5 Tests

`test/outputs/<id>.test.js`:

- `test()` rejects bad config  
- `connect` + `runAction('send-test')` with mocked fetch  
- channel filter ignores unrelated events  

### 1.6 Docs

- One line in CURRENT_STATE.md actuators table  
- README only if user-facing  

### 1.7 Composability checks

- [ ] Does not remove/replace SSE or `/api/state`  
- [ ] Errors isolated (try/catch in handlers)  
- [ ] Multiple actuators can run on same channel  
- [ ] `stop()` unsubscribes (use `this.track`)  
- [ ] No full state dumps to third parties by default  

---

## Phase 2 — Automated verification

1. `npm test` green.  
2. App starts; `GET /api/actuators` lists the new id (and builtins).  
3. `POST …/test` with sample config → ok.  
4. `POST …/connect` → ok.  
5. `POST …/actions/send-test` → ok (mock or real).  
6. Trigger real path (fabricate nudge / process / set-mode) and assert deliver called
   (unit) or log line appears.

---

## Phase 3 — Human verification loop (mandatory)

**Do not claim complete until the user confirms the verify signal.**

### 3.1 Prepare

1. Restate the Spec Card **verify signal** in plain language.  
2. Ensure Alfred is running (`npm start`).  
3. Connect actuator with user’s real config (they paste secrets locally — never commit).

### 3.2 Scripted checks (walk the user)

Run through in order; after each step, ask: **“Did you see/hear X?”**

| Step | Action | Expected |
|------|--------|----------|
| A | `send-test` action | User observes destination sample |
| B | Trigger primary path (e.g. fabricate nudge if nudge-driven) | Real content arrives |
| C | Confirm builtins still work (open /live, check SSE; or /api/state) | No regression |
| D | Optional: disconnect actuator, confirm silence | Clean stop |

Use `ask_user_question` for A–D with options: **Yes, verified** / **No, something wrong** / **Partial**.

### 3.3 If No or Partial — fine-tune loop

Diagnose with the user (one issue at a time):

1. Config wrong? (URL, token, channel id)  
2. Trigger too narrow/wide? (adjust filters)  
3. Payload too noisy/empty? (simplify template)  
4. Rate limit / debounce?  
5. Auth scope?

Implement the smallest fix → re-run the failed step → ask again.

**Stop only when** user selects **Yes, verified** for the primary verify signal (step A or B as defined in Spec Card).

### 3.4 Cognitive fine-tuning after success

Ask one closing question:

> “Anything annoying about this output (too chatty, unclear text, extra config)?”

If yes, apply one simplification (defaults, better template, fewer fields). Re-verify only if behavior changed.

---

## Phase 4 — Handoff

```md
### Actuator added: <id>

- Destination: …
- Triggers: …
- Config (required): …
- Verify signal: … — **user confirmed**
- Files: …
- Compose: coexists with SSE, /api/state, vault sync
- How to re-test: curl send-test …
- Follow-ups: …
```

---

## Decision tree

```txt
Need something outside Alfred to change?
├─ External system will POLL us
│    → prefer projection endpoint (extend /api/state or /api/actuators/:id/project)
├─ Alfred should PUSH on change
│    → ActuatorContract + onStateChange and/or onChannel
├─ Only browsers need updates
│    → already have SSE — do not add actuator
└─ Same system also sends data IN
     → separate input adapter (/alfred-input-stream) + this actuator; share config keys only
```

---

## Anti-patterns

- Skip interview / invent Discord guild structure.  
- Dump entire `state` JSON to webhooks (privacy + noise).  
- Block the event loop on slow HTTP without timeout.  
- Throw inside `onChannel` / `onState` (breaks other actuators).  
- Replace vault sync or SSE “because we have Discord now.”  
- Merge input+output into one god-adapter.  
- Mark done without user verification.  
- >3 required config fields without strong reason.  

---

## Known channel catalog (for filters)

| Channel | When |
|---------|------|
| `alfred.processing.started` / `.done` | Skill runner batch |
| `alfred.garden.started` / `.done` | PARA filing |
| `alfred.nudge.acked` / `.fabricated` | Nudge lifecycle |
| `alfred.state.updated` | Often from API + SSE state embed |
| `alfred.demo.stage` | Demo pack loaded |
| `alfred.input.hit` | Input hit log mirror |
| `pipeline.event` / `pipeline.error` | Validated inputs |
| `alfred.actuator.sent` / `.error` | **Convention for new actuators** |

Prefer publishing `alfred.actuator.sent` after successful deliver for /demo Input Hits–style
visibility (optional but recommended).

---

## Reference files

- [references/interview-script.md](references/interview-script.md)  
- [references/actuator-checklist.md](references/actuator-checklist.md)  
- [references/actuator-skeleton.js](references/actuator-skeleton.js)  
- [references/current-outputs.md](references/current-outputs.md)  
- [DISCORD_INTEGRATION.md](../../../DISCORD_INTEGRATION.md) — Discord webhook out + dual in/out lessons

---

## Slash command

`/alfred-output-actuator` — interview → implement → verify until the user confirms.
