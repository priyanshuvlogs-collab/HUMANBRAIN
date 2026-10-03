// Creates a login for the LOCAL Supabase (npm run db:start), since sign-ups are switched off.
// Usage: npm run db:add-user -- you@example.com
// (For your real Supabase project, use the dashboard: Authentication → Users → Add user.)
import { execSync } from "node:child_process";

const email = process.argv[2];
if (!email || !email.includes("@")) {
  console.error("Usage: npm run db:add-user -- you@example.com");
  process.exit(1);
}

const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const res = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
  method: "POST",
  headers: { apikey: status.SECRET_KEY, "content-type": "application/json" },
  body: JSON.stringify({ email, email_confirm: true }),
});
const body = await res.json().catch(() => ({}));
if (res.ok) console.log(`✓ Created ${email}. Log in at http://localhost:3000 with a code (read it at ${status.MAILPIT_URL}).`);
else if (res.status === 422) console.log(`${email} already exists — just log in.`);
else {
  console.error("Couldn't create the user:", res.status, body.msg ?? body.message ?? body);
  process.exit(1);
}
