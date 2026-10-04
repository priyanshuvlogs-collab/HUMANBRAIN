"use client";

import ActionForm from "@/components/ActionForm";
import { PLATFORMS, PLATFORM_KEYS, type Platform } from "@/lib/constants";
import { METRIC_KEYS, averageKey, type MetricKey } from "@/lib/performance";
import { saveBrand } from "./actions";

type Averages = Partial<Record<string, number | null>>;

const AVERAGE_LABELS: Record<MetricKey, string> = {
  views: "Views / reach",
  hold_3s_pct: "3-sec hold (%)",
  avg_watch_pct: "Avg watch (%)",
  likes: "Likes",
  comments: "Comments",
  saves: "Saves",
  shares: "Shares",
  dms: "DMs",
  link_clicks: "Link clicks",
  leads: "Leads",
  sales: "Sales",
};

const AVERAGE_FIELDS = METRIC_KEYS.map((key) => ({ key: averageKey(key), label: AVERAGE_LABELS[key] }));

export default function BrandForm(props: {
  handle: string;
  niche: string;
  platforms: string[];
  averages: Partial<Record<Platform, Averages>>;
}) {
  return (
    <ActionForm action={saveBrand} className="space-y-6">
      {(pending) => (
        <>
          <section className="card space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="handle" className="label">
                  Creator handle
                </label>
                <input id="handle" name="handle" defaultValue={props.handle} placeholder="@yourhandle" className="input" />
              </div>
              <div>
                <label htmlFor="niche" className="label">
                  Niche
                </label>
                <input
                  id="niche"
                  name="niche"
                  defaultValue={props.niche}
                  placeholder="e.g. side-income tips for busy parents"
                  className="input"
                />
              </div>
            </div>
            <fieldset>
              <legend className="label">Platforms you post on</legend>
              <div className="flex flex-wrap gap-3">
                {PLATFORM_KEYS.map((p) => (
                  <label key={p} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                    <input type="checkbox" name="platforms" value={p} defaultChecked={props.platforms.includes(p)} />
                    {PLATFORMS[p].label}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="card space-y-4">
            <div>
              <h2 className="font-semibold">My average performance</h2>
              <p className="text-sm text-zinc-600">
                What a typical post gets on each platform. The brain compares predictions against these, and each
                post&apos;s Performance Index is measured against them (1.0 = a typical post). Fill in what you know — blanks
                are skipped.
              </p>
            </div>
            {PLATFORM_KEYS.map((p) => (
              <fieldset key={p} className="rounded-lg border border-zinc-200 p-3">
                <legend className="px-1 text-sm font-semibold text-zinc-800">{PLATFORMS[p].label}</legend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {AVERAGE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label htmlFor={`${p}.${f.key}`} className="mb-1 block text-xs font-medium text-zinc-600">
                        {f.label}
                      </label>
                      <input
                        id={`${p}.${f.key}`}
                        name={`${p}.${f.key}`}
                        inputMode="decimal"
                        defaultValue={props.averages[p]?.[f.key] ?? ""}
                        className="input"
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
          </section>

          <button className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save brand settings"}
          </button>
        </>
      )}
    </ActionForm>
  );
}
