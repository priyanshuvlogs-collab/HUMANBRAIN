import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  // Signed in with Supabase, but not on the ALLOWED_EMAILS list.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const blockedEmail = data?.claims ? String(data.claims.email ?? "this account") : null;

  return (
    <div className="mx-auto mt-8 max-w-sm sm:mt-16">
      <h1 className="text-center text-3xl font-bold tracking-tight text-violet-700">Offer Brain</h1>
      <p className="mt-2 text-center text-sm text-zinc-600">Test your post on a simulated audience before you post it.</p>
      <div className="card mt-8">
        {blockedEmail ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-700">
              {blockedEmail} isn&apos;t allowed to use this Offer Brain. Ask the owner to add it to ALLOWED_EMAILS.
            </p>
            <form action={signOut}>
              <button className="btn-secondary w-full">Sign out</button>
            </form>
          </div>
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  );
}
