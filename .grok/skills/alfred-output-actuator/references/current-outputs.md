# Alfred outputs — current map

```txt
                    stateStore ─────────────────────────────┐
                         │                                  │
                         │ onChange                         │ get()
                         ▼                                  ▼
              ┌──────────────────┐              ┌────────────────────┐
              │ vaultStateSync   │              │ GET /api/state     │
              │ (builtin file)   │              │ hardware pull      │
              └──────────────────┘              └────────────────────┘

                    outputHub.publish(channel, …)
                         │
          ┌──────────────┼──────────────────┐
          ▼              ▼                  ▼
     SSE /events   ActuatorManager     getRecent()
     (browsers)    (registry fan-out)  Settings feed
                         │
                         ├─ actuator A (e.g. webhook)
                         ├─ actuator B (e.g. discord)
                         └─ …
```

## Builtins (not in registry; always on)

| id | Role |
|----|------|
| sse | Browser EventSource |
| hardware-state | Arduino poll projection |
| vault-sync | Markdown mirror |
| kb-meeting | Granola → inbox notes |

## Registry actuators

See `src/outputs/actuatorRegistry.js` — start empty; skill adds entries.

## API

```txt
GET  /api/actuators
POST /api/actuators/:id/test|connect|disconnect
POST /api/actuators/:id/actions/:actionId
```
