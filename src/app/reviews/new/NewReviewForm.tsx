"use client";

import { useEffect, useRef, useState } from "react";
import ReviewLoading from "@/components/ReviewLoading";
import { useReviewRequest } from "@/components/useReviewRequest";
import { GOALS, GOAL_KEYS, PLATFORMS, PLATFORM_KEYS, type Goal, type Platform } from "@/lib/constants";
import { parseLink } from "@/lib/link-parse";

type ExtractResult = {
  sourceUrl: string;
  platform: Platform;
  format: string;
  hook: string;
  script: string;
  onScreenText: string;
  videoLengthSec: number | null;
  found: { title: boolean; caption: boolean; transcript: boolean; pageText: boolean };
  notes: string[];
};

type Offer = { id: string; name: string };

/** Field names and examples that fit what's being reviewed: a social post or a web page. */
const COPY = {
  post: {
    hookLabel: "Hook",
    hookHint: "(first line or first 3 seconds)",
    hookPlaceholder: "I made $4,200 in 30 days with 10 minutes a day…",
    scriptLabel: "Script / caption",
    scriptPlaceholder: "The full script or caption",
    formatLabel: "Format",
    missing: "Add your hook (the first line or first 3 seconds), or paste the post's link at the top and press Review.",
    linkPlaceholder: "https://www.youtube.com/shorts/… · tiktok.com/… · instagram.com/reel/…",
    submit: "Review this post",
  },
  page: {
    hookLabel: "Headline",
    hookHint: "(the first thing a visitor reads)",
    hookPlaceholder: "Get 10 qualified leads a week without cold DMs",
    scriptLabel: "Page copy",
    scriptPlaceholder: "The text of your page: sub-headline, benefits, proof, offer, price, button text…",
    formatLabel: "Page type",
    missing: "Add your page's headline, or paste the page link at the top and press Review: we'll read the page for you.",
    linkPlaceholder: "https://yoursite.com/offer",
    submit: "Review this page",
  },
} as const;

const MAX_SOURCE_URL = 2000; // the server's limit

/** A link typed into the box, as an http(s) URL the server accepts, or null (same rules as the link reader). */
function typedLink(text: string): string | null {
  const url = parseLink(text);
  return url && url.href.length <= MAX_SOURCE_URL ? url.href : null;
}

export default function NewReviewForm({ offers, defaultPlatform }: { offers: Offer[]; defaultPlatform: Platform }) {
  const [platform, setPlatform] = useState<Platform>(defaultPlatform);
  const [format, setFormat] = useState<string>(Object.keys(PLATFORMS[defaultPlatform].formats)[0]);
  const [goal, setGoal] = useState<Goal>("views");
  const [offerId, setOfferId] = useState<string>("");
  const [hook, setHook] = useState("");
  const [script, setScript] = useState("");
  const [onScreenText, setOnScreenText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const hookInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  // True once the user picks a page type/format themselves: a link's guess never overrides it.
  const formatChosen = useRef(false);
  // Where focus should go after the next render (once the fields are enabled again).
  const pendingFocus = useRef<"link" | "hook" | null>(null);
  const { run, running, error } = useReviewRequest();

  // "Start from a link": fills the fields from a social post or web page.
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkNotes, setLinkNotes] = useState<string[]>([]);
  const [source, setSource] = useState<{ url: string; videoLengthSec: number | null } | null>(null);

  const isPage = platform === "website";
  const copy = isPage ? COPY.page : COPY.post;
  const formats = PLATFORMS[platform].formats as Record<string, string>;

  /**
   * Reads the link and fills the form. Returns what was read (null on failure), with the
   * user's own headline/hook and chosen format kept when they already set them.
   */
  async function fetchLink(options: { keepHook?: string } = {}): Promise<ExtractResult | null> {
    if (!link.trim() || fetching) return null;
    setFetching(true);
    setLinkError(null);
    setFormError(null);
    setLinkNotes([]);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: link }),
      });
      const data = (await res.json().catch(() => null)) as (ExtractResult & { error?: string }) | null;
      if (!res.ok || !data || data.error) {
        setLinkError(data?.error ?? "Couldn't read that link. Paste the text instead.");
        return null;
      }
      const result: ExtractResult = {
        ...data,
        format: data.platform === platform && formatChosen.current ? format : data.format,
        hook: options.keepHook?.trim() ? options.keepHook : data.hook,
      };
      setPlatform(result.platform);
      setFormat(result.format);
      setHook(result.hook);
      setScript(result.script);
      setOnScreenText(result.onScreenText);
      setSource({ url: result.sourceUrl, videoLengthSec: result.videoLengthSec });
      setLinkNotes(result.notes);
      return result;
    } catch {
      setLinkError("Lost connection. Check your internet and try again.");
      return null;
    } finally {
      setFetching(false);
    }
  }

  function review(fields: {
    platform: Platform;
    format: string;
    hook: string;
    script: string;
    onScreenText: string;
    sourceUrl: string | null;
    videoLengthSec: number | null;
  }) {
    run(
      {
        ...fields,
        // Pages have no on-screen text; don't send a leftover value from a post.
        onScreenText: fields.platform === "website" ? "" : fields.onScreenText,
        // The source is only a reference: never let an over-long one fail the review.
        sourceUrl: fields.sourceUrl && fields.sourceUrl.length <= MAX_SOURCE_URL ? fields.sourceUrl : null,
        goal,
        offerId: offerId || null,
      },
      ({ reviewId }) => `/reviews/${reviewId}`,
    );
  }

  // Runs after every render; acts only when a focus move is pending and the fields are usable.
  useEffect(() => {
    if (!pendingFocus.current || fetching || running) return;
    const el = pendingFocus.current === "link" ? linkInput.current : hookInput.current;
    pendingFocus.current = null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus({ preventScroll: true });
  });

  /** Enough came from the link to review without asking the user anything? */
  function isComplete(data: ExtractResult): boolean {
    if (!data.hook.trim()) return false;
    if (data.platform === "website") return data.found.pageText && data.script.trim().length >= 300;
    // "[Music]"-only captions aren't a script.
    return data.found.transcript && data.script.replace(/\[[^\]]*\]/g, " ").trim().length > 0;
  }

  async function submit() {
    setFormError(null);
    const pendingLink = typedLink(link);
    // A link that hasn't been read yet, with no copy typed: read it (even if a headline/hook was typed).
    const needsRead = !!pendingLink && pendingLink !== source?.url && !script.trim();

    if (hook.trim() && !needsRead) {
      review({
        platform,
        format,
        hook,
        script,
        onScreenText,
        // A link typed but never read is still kept as the post's source.
        sourceUrl: source?.url ?? pendingLink,
        videoLengthSec: source?.videoLengthSec ?? null,
      });
      return;
    }
    if (!link.trim()) {
      setFormError(copy.missing);
      pendingFocus.current = "hook";
      return;
    }
    // Read the link first. Review straight away when it gave us everything (a page's text,
    // or a video's spoken transcript); otherwise let the user fill the gaps.
    const ownHook = hook.trim() ? hook : undefined;
    const data = await fetchLink({ keepHook: ownHook });
    if (!data) {
      setFormError("We couldn't read that link (the reason is under the link box). You can type the text below instead.");
      pendingFocus.current = "link";
      return;
    }
    if (isComplete(data)) {
      review({
        platform: data.platform,
        format: data.format,
        hook: data.hook,
        script: data.script,
        onScreenText: data.onScreenText,
        sourceUrl: data.sourceUrl,
        videoLengthSec: data.videoLengthSec,
      });
    } else {
      setFormError("We filled in what we could read. Check the notes above, add what's missing, then press Review.");
    }
  }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {running && <ReviewLoading title={isPage ? "Reviewing your page" : "Reviewing your post"} />}

      <section className="card space-y-3">
        <div>
          <label htmlFor="link" className="label">
            {isPage ? "Page link" : "Start from a link"} <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <p className="mb-2 text-xs text-zinc-500">
            {isPage
              ? "Paste your landing or sales page link and press Review: we read the headline and copy for you. Or type them in below."
              : "A YouTube, TikTok or Instagram post, or any web page. We fill in what we can read; you check it and add anything missing."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              ref={linkInput}
              id="link"
              // type="text", not "url": a half-typed link must never block submitting the review itself
              type="text"
              inputMode="url"
              autoComplete="off"
              className="input flex-1"
              placeholder={copy.linkPlaceholder}
              value={link}
              disabled={fetching || running}
              aria-invalid={linkError ? true : undefined}
              aria-describedby={linkError ? "link-error" : undefined}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // just read the link; don't start the review
                  void fetchLink();
                }
              }}
            />
            <button type="button" className="btn-secondary" disabled={fetching || running || !link.trim()} onClick={() => void fetchLink()}>
              {fetching ? "Reading…" : "Fill from link"}
            </button>
          </div>
        </div>
        {linkError && (
          <p id="link-error" className="text-sm text-red-600" role="alert">
            {linkError}
          </p>
        )}
        {linkNotes.length > 0 && (
          <ul className="list-disc space-y-1 rounded-lg bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900" role="status">
            {linkNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {source && (
          <p className="break-all text-xs text-zinc-500">
            Source: {source.url}{" "}
            <button
              type="button"
              className="text-violet-700 underline"
              onClick={() => {
                setSource(null);
                setLink(""); // otherwise the link still in the box would be sent as the source
              }}
            >
              remove
            </button>
          </p>
        )}
      </section>

      {/* Locked while a link is being read, so nothing typed or picked meanwhile is lost or ignored. */}
      <fieldset disabled={fetching || running} className="min-w-0 space-y-5">
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
              formatChosen.current = false;
              setFormError(null);
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
            {copy.formatLabel}
          </label>
          <select
            id="format"
            className="input"
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
              formatChosen.current = true;
            }}
          >
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
        {isPage && !hook && !script && !link.trim() && (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-900">
            Easiest way: paste your page link at the top and press <strong>Review this page</strong>. Or type the headline and
            copy below.
          </p>
        )}
        <div>
          <label htmlFor="hook" className="label">
            {copy.hookLabel} <span className="font-normal text-zinc-500">{copy.hookHint}</span>
          </label>
          <input
            ref={hookInput}
            id="hook"
            className="input"
            maxLength={500}
            value={hook}
            onChange={(e) => {
              setHook(e.target.value);
              if (e.target.value.trim()) setFormError(null);
            }}
            placeholder={copy.hookPlaceholder}
            aria-invalid={formError && !hook.trim() ? true : undefined}
            aria-describedby={formError ? "form-error" : undefined}
          />
        </div>
        <div>
          <label htmlFor="script" className="label">
            {copy.scriptLabel}
          </label>
          <textarea
            id="script"
            className="input min-h-40"
            maxLength={10000}
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={copy.scriptPlaceholder}
          />
        </div>
        {!isPage && (
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
        )}
      </section>
      </fieldset>

      {formError && (
        <p id="form-error" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          {formError}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <button className="btn-primary w-full py-3 text-base sm:w-auto" disabled={running || fetching}>
        {running ? "Reviewing…" : fetching ? "Reading the link…" : copy.submit}
      </button>
    </form>
  );
}
