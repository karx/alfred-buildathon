# Interview script (short form)

Ask **one question at a time** unless the user pastes a full brief.

1. What should we call this adapter (human label + kebab `id`)?
2. What real-world signal are we capturing, in one sentence?
3. How does data arrive — poll API, webhook/ingest, file watch, OAuth/MCP, other?
4. How do we authenticate?
5. What is the main event type string and required payload fields?
6. How do we dedupe (unique id field + where we store seen ids)?
7. Should events enter the **LLM inbox** (todos/nudges), act as **control** (mode/ack), or **observe only**?
8. If inbox: also write a markdown note into the vault?
9. What Settings config fields does the user need to fill?
10. Any custom actions (poll-now, sync, test-channel)?
11. Any special LLM extract rules for this content?
12. Unit fixtures only, or live credentials for verification?

End by pasting the **Adapter Spec Card** (see main SKILL.md) for approval.
