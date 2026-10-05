// A realistic reply in the provisional format. Used by tests and by mock mode
// (OFFER_BRAIN_MOCK_AI=true) so the UI can be tried without spending API credits.
export const SAMPLE_REVIEW_REPLY = `## Audience panel

**THE SKEPTIC** — Stopped at "$4,200". "Another income screenshot? Show me what you actually did, not the number." Felt: suspicious. Would not finish. Action: scroll. Would have kept me: proof that isn't a screenshot.

**THE BUSY BEGINNER** — Stopped at "10 minutes a day". "Okay, that's me. But I don't know what a 'funnel' is." Felt: hopeful, a little lost. Would finish. Action: save.

**THE READY BUYER** — Stopped at "first sale". "I want this. Who are you, though?" Felt: interested. Would finish. Action: DM.

**THE SCROLLER** — Did not stop. "Looks like every other money video." Felt: nothing. Action: scroll.

**THE EXPERT PEER** — Stopped at second 2. "The 3-post method is decent but not new." Felt: mildly impressed. Would finish. Action: like.

## Step 1: the 1.5-second test
A stranger thinks this is about making money online in little time. The tension is "how did a beginner do $4,200?". It uses a specific number and a callout of who it's for, so it mostly stops the scroll, but it reads like a familiar income claim.

## Step 2: scorecard
Hook 7/10, clarity 8/10, curiosity 6/10, story 4/10, proof 5/10, value 6/10, offer fit 7/10, CTA 5/10. Weakest: story — no real moment or turn.

## Step 3: conversion path
Hook ✅ → "This is for me" ✅ → "This is possible" ⚠️ → "This person knows what they're talking about" ❌ (breaks here: no credibility moment) → "I'll take the next step" ⚠️.

## Prediction
ABOVE average reach, LOW confidence (no proof library yet). Most likely outcome: saves and shares from beginners.

\`\`\`json
{
  "first_impression": {
    "stranger_thinks": "A beginner made $4,200 online in 10 minutes a day and will show how.",
    "promise_or_tension": "How can a beginner earn that much with so little time?",
    "stops_scroll": true,
    "devices": ["specific number/result", "callout of who it's for"],
    "verdict": "Stops the right people, but sounds like a familiar income claim."
  },
  "personas": [
    { "name": "The Skeptic", "stopped": true, "stopped_at": "$4,200", "felt": "Suspicious", "would_finish": false, "action": "scroll", "scroll_away_trigger": "Income number with no receipts", "quote": "Another income screenshot? Show me what you actually did, not the number." },
    { "name": "The Busy Beginner", "stopped": true, "stopped_at": "10 minutes a day", "felt": "Hopeful but a bit lost", "would_finish": true, "action": "save", "scroll_away_trigger": "The word 'funnel' with no explanation", "quote": "Okay, that's me. But I don't know what a 'funnel' is." },
    { "name": "The Ready Buyer", "stopped": true, "stopped_at": "first sale", "felt": "Interested", "would_finish": true, "action": "DM", "scroll_away_trigger": "Not knowing who this person is", "quote": "I want this. Who are you, though? Tell me why I should trust you." },
    { "name": "The Scroller", "stopped": false, "stopped_at": null, "felt": "Nothing", "would_finish": false, "action": "scroll", "scroll_away_trigger": "Looks like every other money video", "quote": "Looks like every other money video." },
    { "name": "The Expert Peer", "stopped": true, "stopped_at": "second 2", "felt": "Mildly impressed", "would_finish": true, "action": "like", "scroll_away_trigger": "Recycled advice", "quote": "The 3-post method is decent but not new. The structure is clean, though." }
  ],
  "scores": {
    "hook": { "score": 7, "evidence": "\\"$4,200 in 30 days with 10 minutes a day\\"" },
    "clarity": { "score": 8, "evidence": "One method: 3 posts a week" },
    "curiosity": { "score": 6, "evidence": "\\"Here's the part nobody tells you\\"" },
    "story": { "score": 4, "evidence": "No moment, stakes or turn — just the result" },
    "proof": { "score": 5, "evidence": "Only an income number, no receipts" },
    "value": { "score": 6, "evidence": "The 3-post method is usable" },
    "offer_fit": { "score": 7, "evidence": "\\"Comment PLAN\\" leads into the course" },
    "cta": { "score": 5, "evidence": "Two asks: follow AND comment" }
  },
  "conversion_chain": [
    { "step": "Hook", "status": "pass", "note": "Specific number + who it's for" },
    { "step": "This is for me", "status": "pass", "note": "Busy beginners feel called out" },
    { "step": "This is possible", "status": "weak", "note": "Feels too good without a story" },
    { "step": "This person knows what they're talking about", "status": "break", "note": "No credibility moment or receipts" },
    { "step": "I'll take the next step", "status": "weak", "note": "Two competing CTAs" }
  ],
  "break_point": "This person knows what they're talking about",
  "prediction": {
    "tier": "ABOVE",
    "confidence": "LOW",
    "outcome": "SAVES_SHARES",
    "summary": "Strong, specific hook that reaches beginners, but missing story and proof cap conversions. Confidence is low because the proof library is empty.",
    "similar_posts": []
  },
  "alternative_hooks": [
    "I almost quit at $0 — here's the 10-minute habit that got me to $4,200",
    "Stop posting every day. I posted 3 times a week and made $4,200.",
    "If you only have 10 minutes a day, this is the only content plan you need",
    "My first $4,200 online came from one boring post format",
    "Beginners: don't buy a course until you've tried this 3-post method"
  ],
  "rewritten_section": {
    "section": "script",
    "original": "I made $4,200 in 30 days. Here's how.",
    "rewrite": "Day 1 I had 312 followers and zero sales. Day 30: $4,200. The only thing I changed was posting 3 specific videos a week — here they are.",
    "why": "Adds a real starting point and a turn, which fixes the broken credibility step."
  },
  "improved_cta": "Comment PLAN and I'll send you the exact 3-post template I used.",
  "full_rewrite": {
    "hook": "I was making $0 from content. 30 days later: $4,200 — here's the screenshot.",
    "script": "I was making $0 from content. 30 days later: $4,200. Here's the screenshot.\\n\\nI didn't post more. I posted less: 3 times a week, 10 minutes each, using one format.\\n\\nStep 1: open with the result your viewer wants.\\nStep 2: show one proof — a screenshot, a DM, a number.\\nStep 3: teach one small step they can try today.\\n\\nThe first week I made $180. By week four, my DMs were doing the selling.\\n\\nComment PLAN and I'll send you the exact 3-post template I used.",
    "on_screen_text": "$0 → $4,200 in 30 days | 3 posts a week | 10 min each",
    "changes": [
      "Hook now opens with a before/after and promises proof, so skeptics stay",
      "Added a real proof beat (screenshot + week-one number) where the original only claimed a result",
      "Turned the method into 3 numbered steps so it's easy to follow and save",
      "One CTA instead of two (follow + comment), tied to a specific lead magnet"
    ]
  }
}
\`\`\`
`;
