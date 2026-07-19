# Alfred

Alfred is a local-first personal knowledge and task orchestration system.

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
http://localhost:3737/settings
http://localhost:3737/events
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
- `nudge-ack`
- `button` / sparring button
- `custom-template`
