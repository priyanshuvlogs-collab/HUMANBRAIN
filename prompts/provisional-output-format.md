=== TEMPORARY OUTPUT FORMAT (added by the app until the full brain file is in place) ===
Finish the conversion path trace, then give:
- PREDICTION: performance tier (BELOW / AVERAGE / ABOVE / BREAKOUT), confidence (LOW / MEDIUM / HIGH), the outcome this post is most likely to drive (VIEWS / ENGAGEMENT / SAVES_SHARES / LEADS / SALES), and a short explanation.
- 5 ALTERNATIVE HOOKS that would stop the scroll harder.
- REWRITE of the weakest section (quote the original, then the rewrite).
- IMPROVED CTA.

End your reply with ONE fenced ```json block that matches this shape exactly (scores are numbers 0–10; keep every key):

```json
{
  "first_impression": {
    "stranger_thinks": "what a stranger thinks this post is about",
    "promise_or_tension": "the promise, tension or question it creates",
    "stops_scroll": true,
    "devices": ["curiosity gap"],
    "verdict": "one sentence"
  },
  "personas": [
    {
      "name": "persona name",
      "stopped": true,
      "stopped_at": "exact word or second, or null",
      "felt": "what I felt",
      "would_finish": false,
      "action": "scroll | like | comment | save | share | dm | click",
      "scroll_away_trigger": "what would have made me scroll away",
      "quote": "1–3 sentence first-person gut reaction"
    }
  ],
  "scores": {
    "hook": { "score": 0, "evidence": "exact words from the post" },
    "clarity": { "score": 0, "evidence": "" },
    "curiosity": { "score": 0, "evidence": "" },
    "story": { "score": 0, "evidence": "" },
    "proof": { "score": 0, "evidence": "" },
    "value": { "score": 0, "evidence": "" },
    "offer_fit": { "score": 0, "evidence": "" },
    "cta": { "score": 0, "evidence": "" }
  },
  "conversion_chain": [
    { "step": "Hook", "status": "pass | weak | break", "note": "why" }
  ],
  "break_point": "the step where the chain breaks, or null",
  "prediction": {
    "tier": "BELOW | AVERAGE | ABOVE | BREAKOUT",
    "confidence": "LOW | MEDIUM | HIGH",
    "outcome": "VIEWS | ENGAGEMENT | SAVES_SHARES | LEADS | SALES",
    "summary": "short explanation",
    "similar_posts": ["hook of a similar past post, if any"]
  },
  "alternative_hooks": ["hook 1", "hook 2", "hook 3", "hook 4", "hook 5"],
  "rewritten_section": {
    "section": "which part (hook / script / on-screen text / CTA)",
    "original": "the original text",
    "rewrite": "the rewritten text",
    "why": "why it is stronger"
  },
  "improved_cta": "the improved call to action"
}
```
