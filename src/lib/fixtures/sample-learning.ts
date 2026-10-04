// A realistic learning-mode reply. Used by tests and by mock mode (OFFER_BRAIN_MOCK_AI=true).
export const SAMPLE_LEARNING_REPLY = `The review predicted ABOVE average with a 7/10 hook, but the post landed BELOW average (Performance Index 0.45).

The hook's income number stopped the right people, but the skeptic reaction was the real signal: with no proof beyond a screenshot, viewers didn't trust it enough to DM. The prediction over-weighted the hook and under-weighted proof, which matters more for a leads goal on this account.

\`\`\`json
{
  "gap_summary": "Predicted ABOVE (61/100) but actual Performance Index was 0.45 (BELOW): the income-claim hook got attention but missing proof killed DMs.",
  "what_was_right": ["Correctly flagged the credibility break point", "Weak story score was accurate"],
  "what_was_missed": ["Over-rated the hook — income claims stop scrolls but don't convert on this account", "Under-weighted how much a leads post depends on proof"],
  "weigh_differently": [
    { "category": "proof", "direction": "more", "why": "Leads posts without receipts underperform for this creator" },
    { "category": "hook", "direction": "less", "why": "Big income numbers attract attention but not buyers here" }
  ],
  "lesson": "For leads posts, cap the predicted tier at AVERAGE unless the post shows concrete proof (receipts, a named result, a real moment)."
}
\`\`\`
`;
