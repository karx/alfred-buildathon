# New Alfred Actuator — Checklist

## Spec

- [ ] Interview done; Spec Card approved
- [ ] Concrete **verify signal** written
- [ ] ≤3 required config fields
- [ ] Triggers: state / channel / manual
- [ ] Compose with builtins (no replacements)

## Code

- [ ] `src/outputs/actuators/<name>Actuator.js` extends ActuatorContract
- [ ] Registered in `actuatorRegistry.js`
- [ ] `test` / `connect` / `start` / `stop` (track unsubs)
- [ ] `runAction('send-test')`
- [ ] Errors isolated; optional `alfred.actuator.sent`
- [ ] Unit tests with mocked outbound call

## Automated verify

- [ ] `npm test`
- [ ] `GET /api/actuators` lists id
- [ ] connect + send-test API ok

## Human verify loop

- [ ] User confirms send-test observed
- [ ] User confirms primary trigger path (if any)
- [ ] User confirms /live or /api/state still fine
- [ ] Fine-tune if chatty/unclear
- [ ] Status: **user verified**
