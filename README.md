# Offer Brain

Review your social media posts **before** you post them. Offer Brain shows your post to a simulated audience, scores the hook, story and conversion potential, predicts how it will perform, and rewrites the weak parts.

**Status:** Phase 1 (review engine) is done. Coming next: results + proof library + learning (Phase 2), accuracy dashboard (Phase 3), Instagram auto-pull (Phase 4).

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
   | `{{PROOF_LIBRARY}}` | Your best/worst past posts (Phase 2; empty for now) |
   | `{{CALIBRATION_NOTES}}` | Lessons from past misses (Phase 2; empty for now) |

   You can edit the brain file any time. Each review records a short "brain version" so you can tell which version scored it.
2. **Claude** reads the brain plus your post, writes its analysis, and ends with a JSON block.
3. **Validation:** the JSON is checked with zod. If it's missing or broken, Claude is asked **once** to send just the corrected JSON.
4. **Scoring:** the total /100 is calculated in code, not by the AI:
   hook 25% · clarity 10% · curiosity 15% · story 15% · proof 10% · value 10% · offer fit 10% · CTA 5%.
5. **Re-review:** on the results page, pick an alternative hook (or write your own). The same post is reviewed again with that hook, and the two versions open side by side.

**Why does every review say "Low confidence" right now?** The brain is told to use LOW confidence when your proof library (past posts with real results) is empty. That changes in Phase 2, once you log results.

> **Temporary output format:** the brain file was received without its final section (the JSON output spec). Until it's added, the app appends `prompts/provisional-output-format.md`, and the results page shows a small notice. Once the full brain file is in place, that file gets deleted and `src/lib/schema.ts` updated.

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
prompts/                     the brain (system prompt) + temporary output format
supabase/migrations/         database tables, security rules, persona limit, signup trigger
supabase/templates/          login email templates (6-digit code)
src/app/                     pages: login, reviews, compare, settings, /api/review
src/components/              UI pieces (score bars, persona cards, loading screen, …)
src/lib/brain.ts             loads the brain, fills placeholders
src/lib/claude.ts            calls Claude, one JSON retry, friendly errors
src/lib/schema.ts            the JSON shape we expect (zod)
src/lib/scoring.ts           weighted total score
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
npm test              # scoring, JSON parsing/validation, brain placeholders, Claude retry/errors, persona limit
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
