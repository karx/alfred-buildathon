# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# processing
- LLM meeting notes processing should automatically transition TODO statuses (todo → in_progress → done) based on input feed content, rather than requiring only manual status changes. **Implemented:** hopExtract emits `closes[]` (→ done) and `starts[]` (→ in_progress) on direct evidence only; never demotes, never resurrects done, manual status wins on later merge. Confidence: 0.9 (shipped)

