# Alfred TODO

> Active execution plan for the current stretch (5 items, TDD, agent-first): **[EXECUTION.md](EXECUTION.md)**

## Milestone 1: Input substrate

- [x] Fresh project in `~/kaaro/src/alfred-buildathon`
- [x] App renamed to Alfred
- [x] Adapter contract
- [x] Adapter manager/registry
- [x] Settings UI connect/test/disconnect
- [x] SSE local output tap
- [x] Human verification audit log
- [x] Vault adapter scaffold
- [x] Vault path configured through Settings UI
- [x] Vault PARA knowledge-base initializer action
- [x] Discord adapter scaffold
- [x] Slack adapter scaffold
- [x] Arduino In adapter scaffold
- [x] Arduino HTTP templates: audio-in, mode-toggle, nudge-ack, sparring button, custom-template
- [ ] Real Vault filesystem event verification with user's chosen vault
- [x] Discord bot/gateway vs interactions/webhook decision — **Gateway in + webhook out** (see `DISCORD_INTEGRATION.md`)
- [ ] Arduino physical device verification over HTTP

## First acceptance criteria

- [ ] Settings UI loads adapters
- [ ] Vault path can be entered, tested, initialized as PARA, and connected from UI
- [ ] Vault file changes emit `vault.file.changed`
- [ ] Arduino HTTP POST emits `arduino-in.hardware.audio-in`
- [ ] Arduino HTTP POST emits `arduino-in.hardware.mode-toggle`
- [ ] Arduino HTTP POST emits `arduino-in.hardware.nudge-ack`
- [ ] Events appear at `/events`
- [ ] Human can record adapter verification from UI

## Questions to resolve

1. ~~Discord first: bot gateway vs interactions/webhooks?~~ **Decided:** Bot Gateway (mentions → inbox) + separate webhook actuator out. Details: `DISCORD_INTEGRATION.md`.
2. Which real vault path should the user initialize as Alfred's PARA knowledge base?
3. Which exact hardware payload fields should be required for audio-in, mode-toggle, and nudge-ack?
