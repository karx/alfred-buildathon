# Alfred

Alfred is a local-first personal knowledge and task orchestration system.

For architecture, data flow, and a living implementation snapshot, see **[CURRENT_STATE.md](CURRENT_STATE.md)**.

To add a new **input** adapter: **`/alfred-input-stream`** ([skill](.grok/skills/alfred-input-stream/)).  
To add a new **output / actuator**: **`/alfred-output-actuator`** ([skill](.grok/skills/alfred-output-actuator/)).

**Discord** (Bot Gateway in + webhook out): see **[DISCORD_INTEGRATION.md](DISCORD_INTEGRATION.md)** for tokens, intents, invite/code-grant gotchas, and debug checklist.

## First build slice

Input adapters:
- Local Obsidian-style Vault, configured through the Settings UI and initialized as Alfred's PARA knowledge base
- Discord, as the preferred open ecosystem/community adapter path
- Slack, kept as a later workplace adapter path
- Custom Open Hardware / Arduino In over HTTP POST

Core loop:

```txt
Input Adapter -> Normalized Event -> Pipeline -> Output Hub -> Local SSE Tap/UI
```

## Run

```bash
cd ~/kaaro/src/alfred-buildathon
npm start
```

Open:

```txt
http://localhost:3737/demo       # backstage — full working demo packs + input hit log
http://localhost:3737/live       # audience / projector dashboard
http://localhost:3737/settings
http://localhost:3737/events
```

Input hits (every adapter event + failed HTTP ingest):

```bash
curl http://localhost:3737/api/alfred/input-hits
```

## Test

```bash
npm test
npm run test:adapter -- vault
npm run test:adapter -- arduino-in
npm run test:adapter -- discord
npm run test:adapter -- slack
```

## Arduino HTTP input

After connecting the Arduino adapter in Settings, POST JSON to:

```txt
POST http://localhost:3737/api/adapters/arduino-in/ingest
```

Example:

```bash
curl -X POST http://localhost:3737/api/adapters/arduino-in/ingest \
  -H 'Content-Type: application/json' \
  -H 'x-alfred-secret: dev-secret' \
  -d '{"eventType":"mode-toggle","mode":"sparring","enabled":true}'
```

Supported first hardware templates:
- `audio-in`
- `mode-toggle`
- `nudge-ack` — acks the active nudge from `GET /api/state` (omit `nudgeId`, or pass `nudgeId` from state)
- `button` / `nudge-ack` button — same as `nudge-ack`
- `button` / sparring button
- `custom-template`

### Demo backstage (`/demo`)

Full working demo control room — stage packs, nudge fabricator, mode switches, hardware preview.

```txt
http://localhost:3737/demo
```

**One-click full stage:**

```bash
curl -X POST http://localhost:3737/api/alfred/demo/stage \
  -H 'Content-Type: application/json' \
  -d '{"pack":"full"}'
```

Packs: `full` | `hardware` | `meeting` | `focus` | `board` | `reset`

### Fabricate demo nudges (on demand)

```bash
# Named scenario packs: critical | buildathon | meeting | focus | queue | buzzer
curl -X POST http://localhost:3737/api/alfred/nudge/fabricate \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"buzzer","replace":true}'

# Custom text (max 40 chars — hardware display)
curl -X POST http://localhost:3737/api/alfred/nudge/fabricate \
  -H 'Content-Type: application/json' \
  -d '{"text":"Ship the demo!","priority":"high"}'

# Clear only fabricated/demo nudges
curl -X POST http://localhost:3737/api/alfred/nudge/clear-demo
```

Arduino path:

```bash
curl -X POST http://localhost:3737/api/adapters/arduino-in/ingest \
  -H 'Content-Type: application/json' \
  -H 'x-alfred-secret: dev-secret' \
  -d '{"eventType":"nudge-fabricate","scenario":"buzzer","replace":true}'
```

### Hardware nudge ack

`GET /api/state` includes the active nudge:

```json
{
  "led": "red",
  "display": "Do the thing",
  "buzzer": true,
  "nudgeId": "n_abc123",
  "nudgeText": "Do the thing",
  "nudgeCount": 1
}
```

Ack it from hardware (no id needed — clears the displayed nudge):

```bash
curl -X POST http://localhost:3737/api/adapters/arduino-in/ingest \
  -H 'Content-Type: application/json' \
  -H 'x-alfred-secret: dev-secret' \
  -d '{"eventType":"nudge-ack","response":"acknowledged"}'
```

Or with an explicit id from `/api/state`:

```bash
curl -X POST http://localhost:3737/api/adapters/arduino-in/ingest \
  -H 'Content-Type: application/json' \
  -H 'x-alfred-secret: dev-secret' \
  -d '{"eventType":"nudge-ack","nudgeId":"n_abc123"}'
```
