# Offer Brain

Review your social media posts **before** you post them. Offer Brain shows your post to a simulated audience, scores the hook, story and conversion potential, predicts how it will perform, and rewrites the weak parts.

**Status:** Phase 1 (review engine), Phase 2 (real results, Performance Index, proof library, learning mode, CSV import) and Phase 3 (accuracy dashboard) are done. Coming next: Instagram auto-pull (Phase 4).

---

## What you need

| | Why | Cost |
|---|---|---|
| [Node.js 22](https://nodejs.org) | Runs the app | Free |
| [Supabase](https://supabase.com) account | Database + login | Free tier is fine |
| [Claude API key](https://platform.claude.com) | The AI reviewer | Pay per use, about $0.05–0.10 per review |
| [Vercel](https://vercel.com) account (optional) | Hosting it online | Free (Hobby) for personal use |

---

## Setup (about 15 minutes)

### 1. Get the code and install

```bash
git clone https://github.com/priyanshuvlogs-collab/HUMANBRAIN.git offer-brain
cd offer-brain
npm install
```

### 2. Create your Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**. Pick any name and a strong database password (save it).
2. Wait about a minute for it to finish setting up.

### 3. Create the database tables

Pick **one** option.

**Option A: copy and paste (easiest)**
1. In Supabase, open **SQL Editor** → **New query**.
2. Open `supabase/migrations/20261003000000_init.sql` from this project, copy **everything**, paste it in, and click **Run**.
3. Do the same with every other file in `supabase/migrations/`, **in name order** (the date in the name): `20261004000000_results_learning.sql`, then `20261004120000_phase2_hardening.sql`, then `20261005000000_links_website.sql`. When you update the app later, run only the new files.

**Option B: command line**
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF   # the ref is in your project URL
npx supabase db push
```

### 4. Create your account and lock sign-ups

Do this **before** your first login, so nobody else can ever claim your email.

1. In Supabase: **Authentication → Users → Add user → Create new user**. Enter your email, leave the password empty if allowed (or use any long random one; you won't need it), and tick **Auto Confirm User**. Your 5 default personas are created automatically.
2. Then go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". Save.

The login page never creates accounts. It only sends codes to accounts that already exist.

### 5. Make login emails show a 6-digit code

Offer Brain logs you in with a code from your email. No password needed.

1. In Supabase: **Authentication → Emails → Templates**.
2. Open **Confirm signup** and replace the message body with the contents of `supabase/templates/confirmation.html`. Save.
3. Do the same for **Magic Link** with `supabase/templates/magic_link.html`. Save.

> Supabase's built-in email only sends to the members of your Supabase team (that's you), and only a few per hour. That's fine for personal use.

### 6. Copy your keys into `.env.local`

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: in Supabase, **Project Settings → API Keys**. Use the **publishable** key (starts with `sb_publishable_`), **not** the secret key.
- `ANTHROPIC_API_KEY`: create one at [platform.claude.com](https://platform.claude.com) → API keys.
- `ALLOWED_EMAILS`: your email address. Only these emails can use the app.

### 7. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter your email, and type in the code you receive.

**First steps:** fill in **Brand** (your niche and usual numbers), add an **Offer**, then click **New review**.

---

## Try it without spending credits

Set `OFFER_BRAIN_MOCK_AI=true` in `.env.local` and restart. Every review then returns a recorded sample reply in about 2 seconds, so you can click through the whole app for free. Every review gets the same sample, so a re-review shows identical scores. (This setting is ignored on Vercel.)

---

## Put it online (Vercel)

1. Push this repo to GitHub, then on [vercel.com/new](https://vercel.com/new) import it.
2. Under **Environment Variables**, add the same values as `.env.local`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `CLAUDE_EFFORT`, `ALLOWED_EMAILS`.
   **`ALLOWED_EMAILS` is required on Vercel.** If it's empty, nobody can use any Vercel deployment (production or preview), so strangers can't spend your Claude credits.
3. Click **Deploy**. Node 22 is picked up automatically from `package.json`.

> Vercel's free Hobby plan is for personal, non-commercial use. If you start selling access, switch to Pro.

---

## How it works

```
New Review form ──► /api/review ──► Claude ──► JSON check (zod) ──► score in code ──► save ──► results page
                        │                           │
          brain file + your data              invalid? retry once
```

1. **The brain** is `prompts/offer-brain-system.md`, the reviewer's instructions. The app loads it for every review and fills its placeholders from your database:

   | Placeholder | Filled from |
   |---|---|
   | `{{BRAND_CONTEXT}}` | Brand settings (handle, niche, platforms) |
   | `{{OFFER_CONTEXT}}` | The offer you picked |
   | `{{AVERAGE_METRICS}}` | Your averages for the post's platform |
   | `{{ACTIVE_PERSONAS}}` | Your active personas (max 10) |
   | `{{PROOF_LIBRARY}}` | Your 5 best and 5 worst past posts on the same platform, with real numbers (never the post being reviewed or its other versions) |
   | `{{CALIBRATION_NOTES}}` | The 5 newest lessons from learning mode (one per post) |

   You can edit the brain file any time. Each review records a short "brain version" so you can tell which version scored it.
2. **Claude** reads the brain plus your post, writes its analysis, and ends with a JSON block.
3. **Validation:** the JSON is checked with zod. If it's missing or broken, Claude is asked **once** to send just the corrected JSON.
4. **Scoring:** the total /100 is calculated in code, not by the AI:
   hook 25% · clarity 10% · curiosity 15% · story 15% · proof 10% · value 10% · offer fit 10% · CTA 5%.
5. **Re-review:** on the results page, pick an alternative hook (or write your own). The same post is reviewed again with that hook, and the two versions open side by side.

**Why does a review say "Low confidence"?** The brain is told to use LOW confidence when your proof library (past posts with real results) is empty or thin. Log results or import past posts and it improves.

### Review from a link, and full rewrites

- **Start from a link** (New review): paste a YouTube, TikTok or Instagram post, or any web page.
  - **YouTube:** title, description and, when the video has captions, the full transcript.
  - **TikTok / Instagram:** the caption only. Neither shares what's said in the video, so paste your spoken script under it.
  - **Websites** (landing or sales pages): the headline becomes the hook and the page copy the script. They're reviewed as a "Website" platform.
- Claude can't watch or hear video, so the review is only as good as the words you give it. Check the filled-in fields before you review.
- The server only fetches public addresses (never localhost or private networks), follows at most 4 redirects, and reads at most 3 MB.
- **Full rewrite:** every review now ends with the whole script (or page) rewritten with every fix applied, plus a list of what changed and why. **Re-review this rewrite** scores it and opens it side by side with the original. This comes from `prompts/full-rewrite.md`, which the app appends after the brain. The brain file itself is unchanged.

### Real results, Performance Index and learning

6. **Log real results:** after posting, open the post (**Posts**, or "Posted it? Log real results" on a review) and type in the numbers from your insights. Blank fields are fine. Each save adds a row to the post's results history; the newest row counts.
7. **Performance Index (PI)** compares a post with *your* averages on that platform (Brand settings): **1.00 = a typical post, 2.00 = double, 0.50 = half.** Each metric becomes actual ÷ your average (capped at 10× so one viral outlier can't dominate), then they're combined with weights that depend on the post's goal:

   | Goal | What counts |
   |---|---|
   | Views | views 60% · avg watch % 40% |
   | Engagement | comments 30% · saves 25% · shares 25% · likes 20% |
   | Leads | DMs 50% · link clicks 30% · leads 20% |
   | Sales | sales 50% · leads 20% · DMs 15% · link clicks 15% |

   Metrics you didn't record (or have no average for) are skipped and the rest re-weighted. No usable metric → no PI (add your averages). When you change your averages, every past PI is recalculated. PI bands: under 0.8 below average, 0.8–1.2 average, 1.2–2 above average, 2+ breakout.
8. **Learning mode:** when you save results for a reviewed post, Claude compares its prediction with what happened (`prompts/learning-mode.md`) and writes a lesson. It runs in the background; the post page shows "Comparing…" and updates by itself, usually within a minute. If it fails, press **Try again**. The 5 newest lessons go into every future review.
9. **CSV import (Import page):** bring in past posts with their numbers. Download the template, fill one row per post, upload, check the preview (rows with problems are listed and skipped), then import. Imported posts fill the proof library (they have no review, so no learning note). Importing the same file twice is safe: posts with the same platform, hook and date are skipped. Each batch of rows is saved all-or-nothing. Semicolon-separated files with decimal commas (1.234,5) and Excel's Windows CSVs work too.

> **Temporary output format:** the brain file was received without its final section (the JSON output spec). Until it's added, the app appends `prompts/provisional-output-format.md`, and the results page shows a small notice. Once the full brain file is in place, that file gets deleted and `src/lib/schema.ts` updated.

### Accuracy dashboard (Accuracy page)

10. **Brain accuracy** is the Spearman rank correlation between each reviewed post's predicted score and its real Performance Index. It asks "do the posts the brain scores higher actually do better?" 1.00 = perfect order, 0 = no link, negative = backwards. Labels: below 0.3 weak, 0.3–0.6 decent, above 0.6 strong. It stays hidden until 5 reviewed posts have results (fewer is mostly luck).
11. **The chart** plots every reviewed post with results: predicted score across, Performance Index up, coloured by whether the predicted tier was right, too high or too low. Hover or Tab to a dot for details; click or press Enter to open the post. "Show the data" lists the same numbers as a table.
12. **Which scores predict your results** runs the same correlation for each of the 8 score categories, so you can see which parts of the scorecard to trust.
13. **Biggest misses** lists posts whose real tier was furthest from the predicted tier, both ways.
14. Imported posts (no review) and posts without a Performance Index aren't included; the page says how many.

### Settings you can change (`.env.local`)

| Variable | Default | What it does |
|---|---|---|
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Which Claude model reviews posts |
| `CLAUDE_EFFORT` | `medium` | How hard it thinks: `low`, `medium`, `high`, `xhigh`, `max`. Higher = slower and pricier. `off` = use the model's own default (`high` for Sonnet 5.5). |
| `ALLOWED_EMAILS` | (empty) | Who can log in (comma-separated) |
| `OFFER_BRAIN_MOCK_AI` | `false` | `true` = recorded sample reply, no API cost |

If Claude declines to review a post (rare), the app asks the API to retry on Anthropic's recommended fallback model automatically.

---

## Project layout

```
prompts/                     the brain (system prompt), temporary output format, learning-mode prompt
supabase/migrations/         database tables, security rules, persona limit, signup trigger
supabase/templates/          login email templates (6-digit code)
src/app/                     pages: login, reviews, compare, posts, import, settings, /api/review
src/components/              UI pieces (score bars, persona cards, loading screen, …)
src/lib/brain.ts             loads the brain, fills placeholders
src/lib/claude.ts            calls Claude, one JSON retry, friendly errors
src/lib/schema.ts            the JSON shape we expect (zod)
src/lib/scoring.ts           weighted total score
src/lib/performance.ts       Performance Index
src/lib/proof-library.ts     picks best/worst past posts for {{PROOF_LIBRARY}}
src/lib/learning.ts          learning mode (calibration notes)
src/lib/csv.ts               CSV import checks (used in the browser and on the server)
src/lib/accuracy.ts          Brain accuracy maths (Spearman, tiers, misses)
tests/                       automated tests
```

**Security:** every table has Row Level Security, so each account only sees its own data. API keys stay on the server. Only the Supabase *publishable* key reaches the browser, and that's safe by design.

---

## Developing locally with a local database (optional)

Needs [Docker](https://www.docker.com/products/docker-desktop/).

```bash
npm run db:start      # starts Supabase on your machine and prints its URL + publishable key
```

Put the printed `API_URL` and `PUBLISHABLE_KEY` into `.env.local`, then create your login (sign-ups are off locally too):

```bash
npm run db:add-user -- you@example.com
```

Login emails don't really get sent; read them at [http://127.0.0.1:54324](http://127.0.0.1:54324) (Mailpit).

Other commands:

```bash
npm run db:reset      # wipe the local database and re-run migrations
npm run db:types      # regenerate src/lib/database.types.ts after changing the database
npm run db:stop
```

## Tests

```bash
npm test              # scoring, Performance Index, JSON parsing/validation, brain placeholders, Claude retry/errors,
                      # persona limit, proof library, learning mode, CSV import, dates, accuracy
npm run test:db       # database rules against the local database (run `npm run db:start` first)
npm run lint
npm run typecheck
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Missing NEXT_PUBLIC_SUPABASE_URL…" | You haven't created `.env.local` yet (step 6). Restart `npm run dev` after editing it. |
| "There's no account for this email yet" | Create your user in Supabase (step 4). |
| The email has a link but no code | Update both email templates (step 5). |
| "This email isn't allowed" | Add your email to `ALLOWED_EMAILS` and restart. |
| "ANTHROPIC_API_KEY is not set" / "API key is invalid" | Check the key in `.env.local` (or in Vercel's environment variables). |
| "Model not found" | Check `CLAUDE_MODEL`. |
| "Out of credit" | Add credit in the Claude Console billing page. |
| A review is slow | Normal: 20–60 seconds. Set `CLAUDE_EFFORT=low` for faster, lighter reviews. |
| "Claude used its whole answer budget on thinking" | Lower `CLAUDE_EFFORT` (e.g. `medium` or `low`). |
| "permission denied" errors in the logs | The database tables weren't created; redo step 3. |
| Posts page errors / "relation results does not exist" | Run the newer migration files too (step 3). |
| No Performance Index on a post | Add your averages for that platform in Brand settings (for the metrics its goal uses). |
| Learning note says it was cut off | Press **Try again**. |
| CSV dates look wrong in the preview | Use YYYY-MM-DD. For dates like 03/09/2026 the order (day/month or month/day) is worked out from the whole file and shown above the preview. |
| Odd characters (Don�t) in imported text | Save the file as "CSV UTF-8" in Excel. (Plain Excel CSVs are also understood.) |
