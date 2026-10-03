import { requireUser } from "@/lib/auth";
import type { Platform } from "@/lib/constants";
import BrandForm from "./BrandForm";

export default async function BrandSettingsPage() {
  const { supabase, userId } = await requireUser();
  const [{ data: brand }, { data: averages }] = await Promise.all([
    supabase.from("brand_settings").select("handle, niche, platforms").eq("user_id", userId).maybeSingle(),
    supabase.from("platform_averages").select("*").eq("user_id", userId),
  ]);

  const byPlatform = Object.fromEntries(
    (averages ?? []).map((a) => [
      a.platform,
      {
        avg_views: a.avg_views,
        avg_hold_3s_pct: a.avg_hold_3s_pct,
        avg_watch_pct: a.avg_watch_pct,
        avg_saves: a.avg_saves,
        avg_shares: a.avg_shares,
        avg_dms: a.avg_dms,
      },
    ]),
  ) as Partial<Record<Platform, Record<string, number | null>>>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Brand</h1>
        <p className="text-sm text-zinc-600">Who you are and how your posts usually perform.</p>
      </div>
      <BrandForm
        handle={brand?.handle ?? ""}
        niche={brand?.niche ?? ""}
        platforms={brand?.platforms ?? []}
        averages={byPlatform}
      />
    </div>
  );
}
