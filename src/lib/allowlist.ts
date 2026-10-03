/**
 * ALLOWED_EMAILS: comma-separated list of emails that may use the app.
 * Empty = anyone may sign in locally, but NOBODY on any Vercel deployment
 * (production or preview), so a forgotten setting can't let strangers spend your Claude credits.
 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return !process.env.VERCEL; // Vercel sets VERCEL=1 on every deployment
  return Boolean(email) && allowed.includes(email!.trim().toLowerCase());
}
