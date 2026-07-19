---
name: alfred-input-stream
description: >
  Scaffold and wire a new Alfred input adapter (input stream) end-to-end: discovery
  interview, AdapterContract implementation, registry/event-source registration, Settings
  UI surfaces, optional HTTP ingest, inbox vs control-plane routing, skill-runner classify
  and extract refinements, tests, and verification. Use when the user says "add input
  adapter", "new input stream", "connect a new source to Alfred", "wire another adapter",
  "add Granola-like integration", "new hardware input", or runs /alfred-input-stream.
metadata:
  short-description: "Create a new Alfred input adapter"
---

# Alfred Input Stream — Create Adapter Skill

Use this skill to add a **new input adapter** to Alfred (`alfred-buildathon`) without
guessing requirements. Run an **interactive interview**, then implement, wire, refine the
LLM pipeline if needed, test, and verify.

**Project root:** workspace of `alfred-buildathon` (typically `~/kaaro/src/alfred-buildathon`).

**Related docs:** [CURRENT_STATE.md](../../../CURRENT_STATE.md), [README.md](../../../README.md),
existing adapters under `src/inputs/adapters/`.

---

## When invoked

1. Confirm you are in the Alfred repo (`package.json` name `alfred-buildathon`).
2. Read this skill fully, then start **Phase 0 — Interview** (do not code yet).
3. Use `ask_user_question` for multiple-choice decisions; ask free-text as normal chat
   questions **one at a time** when answers are open-ended.
4. Only after the **Adapter Spec Card** is approved, implement.

---

## Phase 0 — Discovery interview (mandatory)

Do **not** write adapter code until the user has answered enough to fill the Adapter Spec Card.

Ask in this order. Skip only if the user already answered clearly in the original request.

### 0.1 Identity

1. **Working name** — human label (e.g. "Linear", "Gmail", "Desk Button 2").
2. **Adapter id** — kebab-case, stable API id (e.g. `linear`, `gmail`, `desk-btn-2`).  
   Must match `[a-z][a-z0-9-]*` and not collide with existing registry ids.
3. **One-sentence purpose** — what signal enters Alfred and why it matters.

### 0.2 Source & transport

4. **Where does data come from?**  
   Options: local filesystem · HTTP webhook/ingest · polling HTTP/API · OAuth + MCP ·
   WebSocket/gateway · other (describe).
5. **Push or pull?**  
   - Pull: Alfred polls on an interval or action.  
   - Push: external system POSTs to Alfred or opens a long-lived connection.  
   - Hybrid: both.
6. **Auth model** — none · shared secret · API key · OAuth · bot token · other.
7. **Credentials storage** — settings.config only (local JSON, gitignored) is default.  
   Confirm no secrets committed.

### 0.3 Event model

8. **Primary event type(s)** — propose `source.domain.action`  
   Examples: `granola.meeting.new`, `vault.file.changed`, `arduino-in.hardware.nudge-ack`.
9. **Payload fields** — list required + optional JSON keys (with types).
10. **Idempotency / dedup** — what unique key prevents double-processing  
    (meeting id, path, message id, …)? Where stored (`stateStore`, adapter memory, vault)?

### 0.4 Routing into Alfred brain

11. **Inbox or control plane?**  
    - **Inbox** → item enters skill runner (todos / nudges / brief). Only if knowledge-like.  
    - **Control** → immediate state mutation (mode, ack, fabricate) without LLM.  
    - **Observe only** → pipeline + SSE + hit log; no inbox.
12. If inbox: should events also **write vault notes** (like Granola → `0 Inbox`)?
13. If control: which state fields change (`nowState`, `nudges`, `todos`, other)?

### 0.5 Settings UX

14. **Config fields** for Settings UI (`configExample` keys + human labels).
15. **Custom actions** needed? (e.g. `poll-now`, `initialize-*`, `reconnect`).
16. **Event templates** for Settings simulate/ingest (demo payloads)?

### 0.6 LLM pipeline impact

17. Does `classifyItem` need a new kind (`meeting`, `email`, `issue`, …)?
18. Should extract treat this source as producing **actions**, **closes**, or both?
19. Special prompt rules (ignore spam folders, only open issues, language, …)?
20. Priority defaults when source is this adapter?

### 0.7 Ops & quality

21. **Test strategy** — unit fixture only · harness · live credentialed test?
22. **Failure modes** — offline, 401, rate limit: log only vs surface to UI?
23. **Demo pack** — should `/demo` get a fabricate/stage shortcut for this source?

### 0.8 Adapter Spec Card (output of interview)

Present this filled card to the user and get explicit approval before coding:

```md
## Adapter Spec Card

| Field | Value |
|-------|--------|
| id | … |
| label | … |
| purpose | … |
| transport | poll \| http-ingest \| watch \| oauth-mcp \| … |
| auth | … |
| event types | … |
| payload (required) | … |
| dedup key | … |
| routing | inbox \| control \| observe |
| vault write-through | yes/no — path pattern |
| configExample | { … } |
| actions | […] |
| eventTemplates | […] |
| INBOX_SOURCES | add id? yes/no |
| classify kind | … |
| extract notes | … |
| tests | unit / fixture paths |
```

If anything is still ambiguous, ask — do not invent product requirements.

---

## Phase 1 — Implementation checklist

Work in this order. Mark todos as you go for multi-file work.

### 1.1 Event source registration

File: [`src/core/eventContract.js`](../../../src/core/eventContract.js)

- Add adapter `id` to `VALID_SOURCES`.
- Without this, pipeline validation rejects events (`unsupported event.source`).

### 1.2 Adapter class

File: `src/inputs/adapters/<camelCase>Adapter.js`  
Pattern: extend `AdapterContract` (see vault / granola / arduino-in).

Required:

| Method | Behavior |
|--------|----------|
| `constructor` | `id`, `label`, `description`, `configExample`, optional `actions`, `eventTemplates` |
| `test(config)` | Validate config without side effects; return `{ ok, message, metadata? }` |
| `connect(config)` | Persist runtime `this.config`; return `{ ok, message }` or `{ ok, pending: true }` for OAuth |
| `start(publish)` | Call `super.start(publish)` then start watchers/timers; use `this.publish` for events |
| `stop()` | Clear timers/watchers; `super.stop()` |
| `disconnect()` | Default contract is fine if stop clears resources |

Optional:

| Method | When |
|--------|------|
| `ingest(payload, { headers })` | HTTP push: `POST /api/adapters/<id>/ingest` |
| `runAction(actionId, body)` | Settings custom actions (`poll-now`, etc.) |

**Always emit via:**

```js
const { createNormalizedEvent } = require("../../core/eventContract");

const event = createNormalizedEvent({
  source: this.id,                    // must match VALID_SOURCES
  type: `${this.id}.domain.action`, // stable type string
  payload: { /* required fields */ },
});
if (this.publish) await this.publish(event);
```

**Logging:** InputHub already logs every publish to the hit log. Prefer clear `console.log` prefixes `[AdapterId]`.

**Reference adapters:**

| Pattern | Study |
|---------|--------|
| Filesystem watch | `vaultAdapter.js` |
| OAuth + poll + tool calls | `granolaAdapter.js` |
| HTTP ingest + secret | `arduinoInAdapter.js` |
| Config-only scaffold | `discordAdapter.js`, `slackAdapter.js` |

Copy structure from the closest pattern; do not invent a parallel framework.

### 1.3 Registry

File: [`src/inputs/adapterRegistry.js`](../../../src/inputs/adapterRegistry.js)

```js
const { MyAdapter } = require("./adapters/myAdapter");
// …
new MyAdapter({ stateStore, settingsStore }), // only if deps needed
```

Pass `stateStore` / `settingsStore` only when the adapter needs them (Granola pattern).

### 1.4 App routing (`src/app.js`)

| Routing | Changes |
|---------|---------|
| **Inbox** | Add `id` to `INBOX_SOURCES`. Events auto: inbox + `processNewItems`. |
| **Vault write-through** | In subscriber, if `event.type === '…'`, call knowledgeBase helper (new or existing). |
| **Control** | Add `isXEvent(event)` helper + early branch (see nudge-ack / fabricate). Mutate `stateStore`, publish output channel, `return` before inbox. |
| **Observe only** | No app.js change beyond registry + VALID_SOURCES; pipeline + hits still fire. |

### 1.5 Skill-runner / LLM refinements (if inbox)

File: [`src/processing/skillRunner.js`](../../../src/processing/skillRunner.js)

1. **`classifyItem(item)`** — return a new kind string for this source (or reuse `meeting` / `vault-note` only if semantics truly match).
2. **`hopExtract`** — ensure prompts understand the new payload shape; include field names from the Spec Card.
3. **Meta-task filters** — extend `META_TASK_PATTERNS` only if this source spams process-y text.
4. **Skip rules** — e.g. ignore noise paths/labels like vault Templates.
5. **Do not** force control-plane events into extract.

If vault notes needed: extend [`src/processing/knowledgeBase.js`](../../../src/processing/knowledgeBase.js) with a focused writer (mirror `writeMeetingNote`).

### 1.6 Settings UI

Settings builds adapter cards from `GET /api/adapters` (`configExample`, `actions`, `eventTemplates`).

- Usually **no page change** if `configExample` keys are plain strings/numbers/bools.
- Nested objects / OAuth / special buttons may need Settings HTML/JS updates (`src/server/settingsPage.js`) — only if the generic form cannot express the config.
- Prefer adapter-side `actions` + event templates over custom UI when possible.

### 1.7 HTTP ingest (if push)

Already generic:

```txt
POST /api/adapters/<id>/ingest
```

Implement `ingest` on the adapter. Failed ingest is hit-logged when `ok: false`.

Document secret headers the same way as Arduino (`x-alfred-secret` or adapter-specific).

### 1.8 Tests

| File | Purpose |
|------|---------|
| `test/adapters/<id>.test.js` | test/connect/ingest or emit fixture |
| `test/fixtures/<id>.*.json` | sample payloads |

Use `node:test` + `node:assert/strict` like existing adapters.

Run:

```bash
npm test
npm run test:adapter -- <id>   # if harness supports it
```

### 1.9 Docs touchpoints

Update when behavior is user-visible:

- [README.md](../../../README.md) — one line under inputs if user-facing  
- [CURRENT_STATE.md](../../../CURRENT_STATE.md) — adapter table + any pipeline note  
- Optional: fixture curl examples in adapter file header comment  

Do not create new top-level docs unless the user asks.

### 1.10 Demo (optional)

If Spec Card says demo support:

- Add scenario in `src/demo/nudgeFabricator.js` only if fabricating **nudges**.  
- For full stage seed with this source’s todos, extend `src/demo/demoStage.js`.  
- Input hits already work automatically once events publish.

---

## Phase 2 — Verification gate

Do not claim done until:

1. `npm test` passes (including new tests).  
2. Adapter appears in `GET /api/adapters` (app running).  
3. Connect from `/settings` (or document manual config).  
4. Emit at least one event; confirm:  
   - console `[Input] <id> → <type>`  
   - `/demo` Input Hits or `GET /api/alfred/input-hits`  
   - `/events` SSE `pipeline.event`  
5. If inbox: item appears in state inbox → processing → todos/nudges change.  
6. If control: state field changes without processingStatus stuck on `processing`.  
7. If vault write: file exists under expected PARA path.

---

## Phase 3 — Handoff summary

After implementation, report to the user:

```md
### Adapter added: <id>

- Transport: …
- Routing: inbox | control | observe
- Event types: …
- Config keys: …
- Files touched: …
- Pipeline changes: … (or "none")
- How to try: curl / Settings steps
- Follow-ups / not in scope: …
```

---

## Decision tree (quick)

```txt
New signal for Alfred?
├─ Needs todos/nudges/brief from content?  → INBOX (+ classify + extract)
├─ Immediate mode/ack/hardware/demo?       → CONTROL (app.js branch)
└─ Just visibility for now?                → OBSERVE (registry + VALID_SOURCES only)

Transport?
├─ Local files change                      → fs.watch (vault pattern)
├─ External POSTs to Alfred                → ingest() + shared secret
├─ Alfred must call API on interval        → poll in start() + poll-now action
└─ OAuth / MCP tools                       → granola pattern (async connect, session)
```

---

## Anti-patterns (do not)

- Skip interview and invent OAuth or event shapes.  
- Add source to inbox without extract/classify support (silent junk todos).  
- Use free-form `source` strings not in `VALID_SOURCES`.  
- Put secrets in repo or README.  
- Block `start()` on long network calls without timeout.  
- Publish non-normalized objects (always `createNormalizedEvent`).  
- Duplicate hit logging manually for every success path (hub already logs publishes).  
- Large Settings UI rewrites for one text field — use `configExample`.

---

## Reference files in this skill

- [references/adapter-checklist.md](references/adapter-checklist.md) — printable checklist  
- [references/interview-script.md](references/interview-script.md) — short Q list for chat  
- [references/adapter-skeleton.js](references/adapter-skeleton.js) — copy-paste starter class  

When scaffolding, prefer **reading a real adapter** over blind skeleton copy; use the skeleton only as a structure reminder.

---

## Slash command

`/alfred-input-stream` — start the interview for a new Alfred input adapter.
