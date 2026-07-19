# Output actuator — short interview

Ask one at a time; apply cognitive-load defaults when user is unsure.

1. Name + kebab `id` for this output?
2. What should a human notice in the real world when it works? (**verify signal**)
3. Push (Alfred calls out) or pull (they call Alfred)?
4. Destination (Discord, webhook URL, MQTT, email, …)?
5. Fire on: state change · specific channels · manual test only?
6. If channels: which ones? (default: one of `alfred.processing.done` or nudge events)
7. Outbound message shape (one short template preferred)?
8. Auth + ≤3 config fields?
9. Always include `send-test` action — confirm.
10. Must keep SSE + /api/state + vault sync working (yes).

Fill **Actuator Spec Card** → get approval → implement → human verify loop.
