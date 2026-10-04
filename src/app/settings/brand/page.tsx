import { requireUser } from "@/lib/auth";
import type { Platform } from "@/lib/constants";
import { METRIC_KEYS, averageKey } from "@/lib/performance";
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
      Object.fromEntries(METRIC_KEYS.map((k) => [averageKey(k), a[averageKey(k) as keyof typeof a] as number | null])),
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
