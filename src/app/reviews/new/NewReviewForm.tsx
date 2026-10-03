"use client";

import { useState } from "react";
import ReviewLoading from "@/components/ReviewLoading";
import { useReviewRequest } from "@/components/useReviewRequest";
import { GOALS, GOAL_KEYS, PLATFORMS, PLATFORM_KEYS, type Goal, type Platform } from "@/lib/constants";

type Offer = { id: string; name: string };

export default function NewReviewForm({ offers, defaultPlatform }: { offers: Offer[]; defaultPlatform: Platform }) {
  const [platform, setPlatform] = useState<Platform>(defaultPlatform);
  const [format, setFormat] = useState<string>(Object.keys(PLATFORMS[defaultPlatform].formats)[0]);
  const [goal, setGoal] = useState<Goal>("views");
  const [offerId, setOfferId] = useState<string>("");
  const [hook, setHook] = useState("");
  const [script, setScript] = useState("");
  const [onScreenText, setOnScreenText] = useState("");
  const { run, running, error } = useReviewRequest();

  const formats = PLATFORMS[platform].formats as Record<string, string>;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          { platform, format, goal, offerId: offerId || null, hook, script, onScreenText },
          ({ reviewId }) => `/reviews/${reviewId}`,
        );
      }}
    >
      {running && <ReviewLoading />}

      <section className="card grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="platform" className="label">
            Platform
          </label>
          <select
            id="platform"
            className="input"
            value={platform}
            onChange={(e) => {
              const p = e.target.value as Platform;
              setPlatform(p);
              setFormat(Object.keys(PLATFORMS[p].formats)[0]);
            }}
          >
            {PLATFORM_KEYS.map((p) => (
              <option key={p} value={p}>
                {PLATFORMS[p].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="format" className="label">
            Format
          </label>
          <select id="format" className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
            {Object.entries(formats).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="offer" className="label">
            Offer
          </label>
          <select id="offer" className="input" value={offerId} onChange={(e) => setOfferId(e.target.value)}>
            <option value="">No offer (audience building)</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="sm:col-span-3">
          <legend className="label">Goal</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GOAL_KEYS.map((g) => (
              <label
                key={g}
                className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium ${
                  goal === g ? "border-violet-500 bg-violet-50 text-violet-800" : "border-zinc-200 text-zinc-700"
                }`}
              >
                <input type="radio" name="goal" value={g} checked={goal === g} onChange={() => setGoal(g)} className="sr-only" />
                {GOALS[g]}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card space-y-4">
        <div>
          <label htmlFor="hook" className="label">
            Hook <span className="font-normal text-zinc-500">(first line or first 3 seconds)</span>
          </label>
          <input
            id="hook"
            className="input"
            required
            maxLength={500}
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="I made $4,200 in 30 days with 10 minutes a day…"
          />
        </div>
        <div>
          <label htmlFor="script" className="label">
            Script / caption
          </label>
          <textarea
            id="script"
            className="input min-h-40"
            maxLength={10000}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="The full script or caption"
          />
        </div>
        <div>
          <label htmlFor="onScreenText" className="label">
            On-screen text
          </label>
          <textarea
            id="onScreenText"
            className="input min-h-20"
            maxLength={2000}
            value={onScreenText}
            onChange={(e) => setOnScreenText(e.target.value)}
            placeholder="Text overlays, in order"
          />
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <button className="btn-primary w-full py-3 text-base sm:w-auto" disabled={running}>
        {running ? "Reviewing…" : "Review this post"}
      </button>
    </form>
  );
}
