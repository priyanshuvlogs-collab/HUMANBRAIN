import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PLATFORM_KEYS, type Platform } from "@/lib/constants";
import NewReviewForm from "./NewReviewForm";

export default async function NewReviewPage() {
  const { supabase, userId } = await requireUser();
  const [{ data: offers }, { data: brand }, { count: activePersonas }] = await Promise.all([
    supabase.from("offers").select("id, name").eq("user_id", userId).order("created_at"),
    supabase.from("brand_settings").select("handle, niche, platforms").eq("user_id", userId).maybeSingle(),
    supabase.from("personas").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("active", true),
  ]);

  const firstPlatform = brand?.platforms.find((p): p is Platform => (PLATFORM_KEYS as string[]).includes(p));
  const brandMissing = !brand?.handle && !brand?.niche;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New review</h1>
        <p className="text-sm text-zinc-600">Paste your post. Your audience panel reacts before you hit publish.</p>
      </div>
      {(brandMissing || activePersonas === 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {brandMissing && (
            <p>
              Tip: fill in your <Link href="/settings/brand" className="font-semibold underline">brand settings</Link> so
              the brain knows your niche and your usual numbers.
            </p>
          )}
          {activePersonas === 0 && (
            <p>
              No personas are switched on, so the brain will use its 5 defaults.{" "}
              <Link href="/settings/personas" className="font-semibold underline">Manage personas</Link>
            </p>
          )}
        </div>
      )}
      <NewReviewForm offers={offers ?? []} defaultPlatform={firstPlatform ?? "instagram"} />
    </div>
  );
}
