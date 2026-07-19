# New Alfred Input Adapter — Implementation Checklist

## Spec

- [ ] Interview complete; Adapter Spec Card approved
- [ ] `id` kebab-case, unique vs registry
- [ ] Transport + auth decided
- [ ] Routing: inbox | control | observe
- [ ] Event type string(s) frozen
- [ ] Required payload fields listed
- [ ] Dedup strategy defined

## Code

- [ ] `src/core/eventContract.js` — `VALID_SOURCES`
- [ ] `src/inputs/adapters/<name>Adapter.js` — class
- [ ] `src/inputs/adapterRegistry.js` — register
- [ ] `src/app.js` — INBOX_SOURCES and/or control branch and/or KB write
- [ ] `src/processing/skillRunner.js` — classify / extract (if inbox)
- [ ] `src/processing/knowledgeBase.js` — writer (if vault notes)
- [ ] Settings: `configExample` / actions / templates sufficient
- [ ] `ingest` if HTTP push
- [ ] Tests + fixtures

## Verify

- [ ] `npm test`
- [ ] Visible in `/settings` and `GET /api/adapters`
- [ ] Connect succeeds
- [ ] Event → Input Hits + SSE
- [ ] Inbox path produces todos/nudges **or** control path mutates state
- [ ] No secrets in git
- [ ] CURRENT_STATE / README updated if user-facing
