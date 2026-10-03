"use client";

import ActionForm from "@/components/ActionForm";
import { PLATFORMS, PLATFORM_KEYS, type Platform } from "@/lib/constants";
import { saveBrand } from "./actions";

type Averages = Partial<Record<string, number | null>>;

const AVERAGE_FIELDS = [
  { key: "avg_views", label: "Views / reach", suffix: "" },
  { key: "avg_hold_3s_pct", label: "3-sec hold", suffix: "%" },
  { key: "avg_watch_pct", label: "Avg watch", suffix: "%" },
  { key: "avg_saves", label: "Saves", suffix: "" },
  { key: "avg_shares", label: "Shares", suffix: "" },
  { key: "avg_dms", label: "DMs", suffix: "" },
] as const;

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
                What a typical post gets on each platform. The brain compares predictions against these. Leave blank if
                you don&apos;t know.
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
                        {f.suffix && ` (${f.suffix})`}
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
