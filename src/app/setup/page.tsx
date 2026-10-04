import { connection } from "next/server";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";

// Shown until the Supabase settings are added. Shows only "set / missing", never values.
export default async function SetupPage() {
  await connection(); // check settings at request time
  if (hasSupabaseEnv()) redirect("/");

  const items = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase project URL", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    {
      name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      label: "Supabase publishable key",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    },
    { name: "ANTHROPIC_API_KEY", label: "Claude API key", ok: Boolean(process.env.ANTHROPIC_API_KEY) },
  ];

  return (
    <div className="mx-auto mt-8 max-w-lg sm:mt-16">
      <h1 className="text-3xl font-bold tracking-tight text-violet-700">Offer Brain</h1>
      <p className="mt-2 text-zinc-600">Almost there: the app is live, but it isn&apos;t connected to its database yet.</p>

      <div className="card mt-6 space-y-4">
        <h2 className="font-semibold">Setup checklist</h2>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.name} className="flex items-start gap-3 text-sm">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                  item.ok ? "bg-emerald-500" : "bg-zinc-300"
                }`}
                aria-hidden
              >
                {item.ok ? "✓" : ""}
              </span>
              <span>
                <span className="font-medium">{item.label}</span>{" "}
                <span className={item.ok ? "text-emerald-700" : "text-zinc-500"}>{item.ok ? "set" : "missing"}</span>
                <br />
                <code className="break-all text-xs text-zinc-500">{item.name}</code>
              </span>
            </li>
          ))}
        </ul>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>Create a Supabase project and run the database SQL (README, steps 2–5).</li>
          <li>Add the values above in Vercel → Project → Settings → Environment Variables.</li>
          <li>Redeploy. This page disappears once Supabase is connected.</li>
        </ol>
      </div>
    </div>
  );
}
