/**
 * "Review from a link": turns a pasted social post or web page link into the fields of the
 * review form. Claude can't watch video, so for videos we pull the words that exist as text
 * (title, caption, and a YouTube transcript when one is published) and tell the user what's missing.
 */
import "server-only";
import type { Platform } from "./constants";
import {
  detectLink,
  extractYoutubePlayerResponse,
  firstSentence,
  htmlToText,
  instagramCaption,
  metaContent,
  parseLink,
  pickCaptionTrack,
  youtubeJson3ToText,
} from "./link-parse";
import { FetchBlockedError, safeFetch } from "./safe-fetch";

export type ExtractResult = {
  sourceUrl: string;
  platform: Platform;
  format: string;
  hook: string;
  script: string;
  onScreenText: string;
  videoLengthSec: number | null;
  /** What was found automatically, for the form to show. */
  found: { title: boolean; caption: boolean; transcript: boolean; pageText: boolean };
  /** Plain-English notes: what's missing and what to do about it. */
  notes: string[];
};

export class ExtractError extends Error {}

const SCRIPT_MAX = 10_000;
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
const HTML = /text\/html|application\/xhtml/i;

export async function extractFromLink(input: string): Promise<ExtractResult> {
  const url = parseLink(input);
  if (!url) throw new ExtractError("That doesn't look like a link. Paste the full address, e.g. https://…");
  const link = detectLink(url);
  try {
    switch (link.kind) {
      case "youtube":
        return await fromYoutube(url, link.videoId);
      case "tiktok":
        return await fromTiktok(url, link.format);
      case "instagram":
        return await fromInstagram(url, link.format);
      default:
        return await fromWebsite(url, link.format);
    }
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    if (err instanceof FetchBlockedError) throw new ExtractError(err.message);
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new ExtractError("That page took too long to load. Try again, or paste the text instead.");
    }
    console.error("[link] extract failed:", err);
    throw new ExtractError("Couldn't read that link. Paste the text into the form instead.");
  }
}

async function fromYoutube(url: URL, videoId: string): Promise<ExtractResult> {
  const notes: string[] = [];
  let title = "";
  let description = "";
  let transcript = "";
  let lengthSec: number | null = null;

  const page = await safeFetch(new URL(`https://www.youtube.com/watch?v=${videoId}`), { accept: HTML });
  const player = extractYoutubePlayerResponse(page.body);
  if (player) {
    const details = (player.videoDetails ?? {}) as { title?: string; shortDescription?: string; lengthSeconds?: string };
    title = details.title ?? "";
    description = details.shortDescription ?? "";
    const n = Number(details.lengthSeconds);
    lengthSec = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    const track = pickCaptionTrack(player);
    if (track?.baseUrl) {
      try {
        const captionUrl = new URL(track.baseUrl);
        captionUrl.searchParams.set("fmt", "json3");
        const res = await safeFetch(captionUrl, { timeoutMs: 8000 });
        transcript = youtubeJson3ToText(JSON.parse(res.body || "null"));
      } catch {
        transcript = "";
      }
    }
  } else {
    title = metaContent(page.body, "og:title") || metaContent(page.body, "title");
    description = metaContent(page.body, "og:description");
  }
  if (!title && !description) throw new ExtractError("Couldn't read that YouTube video. Is it public?");

  if (transcript) notes.push("Transcript found: the script below is what's said in the video. Check it reads right.");
  else notes.push("No transcript was available, so the script box has the description. Paste what you actually say in the video for a proper review.");
  notes.push("Add any text overlays to On-screen text, since they can't be read from a link.");

  return {
    sourceUrl: url.toString(),
    platform: "youtube",
    format: "short",
    hook: transcript ? firstSentence(transcript) : cut(title, 500),
    script: cut(transcript || [title, description].filter(Boolean).join("\n\n"), SCRIPT_MAX),
    onScreenText: "",
    videoLengthSec: lengthSec,
    found: { title: !!title, caption: !!description, transcript: !!transcript, pageText: false },
    notes,
  };
}

async function fromTiktok(url: URL, format: string): Promise<ExtractResult> {
  const oembed = new URL("https://www.tiktok.com/oembed");
  oembed.searchParams.set("url", url.toString());
  const res = await safeFetch(oembed, { accept: /json/i });
  let caption = "";
  try {
    caption = (JSON.parse(res.body) as { title?: string }).title?.trim() ?? "";
  } catch {
    caption = "";
  }
  if (res.status >= 400 || !caption) {
    throw new ExtractError("Couldn't read that TikTok. Is it public? You can paste the caption and script instead.");
  }
  return {
    sourceUrl: url.toString(),
    platform: "tiktok",
    format,
    hook: firstSentence(caption),
    script: cut(caption, SCRIPT_MAX),
    onScreenText: "",
    videoLengthSec: null,
    found: { title: false, caption: true, transcript: false, pageText: false },
    notes: [
      "Caption found. TikTok doesn't share what's said in the video: paste your spoken script under the caption for a full review.",
      "Change the hook to the first words you say (or show) in the video if they differ from the caption.",
    ],
  };
}

async function fromInstagram(url: URL, format: string): Promise<ExtractResult> {
  // Instagram shows its preview tags (og:*) to link-preview bots.
  const res = await safeFetch(url, { accept: HTML, headers: { "user-agent": "facebookexternalhit/1.1" } });
  const caption = instagramCaption(metaContent(res.body, "og:description"), metaContent(res.body, "og:title"));
  if (!caption) {
    throw new ExtractError("Instagram didn't share this post's caption (private, or it asked for a login). Paste the caption instead.");
  }
  return {
    sourceUrl: url.toString(),
    platform: "instagram",
    format,
    hook: firstSentence(caption),
    script: cut(caption, SCRIPT_MAX),
    onScreenText: "",
    videoLengthSec: null,
    found: { title: false, caption: true, transcript: false, pageText: false },
    notes: [
      "Caption found. Instagram doesn't share what's said in the video: paste your spoken script under the caption for a full review.",
      "Change the hook to the first words you say (or show) if they differ from the caption.",
    ],
  };
}

async function fromWebsite(url: URL, format: string): Promise<ExtractResult> {
  const res = await safeFetch(url, { accept: HTML });
  if (res.status >= 400) throw new ExtractError(`That page answered with an error (${res.status}). Check the link.`);
  const page = htmlToText(res.body);
  if (!page.text && !page.headline && !page.title) {
    throw new ExtractError("That page has no readable text (it may be built entirely in JavaScript). Paste the copy instead.");
  }
  const hook = page.headline || page.title;
  const notes = ["Page copy loaded: the headline is the hook and the page text is the script. Trim anything that isn't part of the page's pitch."];
  if (page.text.length < 300) notes.push("Very little text was found. If the page loads its content with JavaScript, paste the copy instead.");
  if (page.text.length > SCRIPT_MAX) notes.push("The page is long, so only the first 10,000 characters were kept.");
  return {
    sourceUrl: res.url.toString(),
    platform: "website",
    format,
    hook: cut(hook, 500),
    script: cut([page.description, page.text].filter(Boolean).join("\n\n"), SCRIPT_MAX),
    onScreenText: "",
    videoLengthSec: null,
    found: { title: !!page.title, caption: false, transcript: false, pageText: !!page.text },
    notes,
  };
}
