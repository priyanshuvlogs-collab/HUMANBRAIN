/**
 * Pure helpers for "review from a link": recognise the kind of link, and turn fetched
 * HTML / JSON into plain text. No network here (see link-extract.ts), so it's easy to test.
 */
import type { Platform } from "./constants";

export type LinkKind =
  | { kind: "youtube"; platform: Platform; format: string; videoId: string }
  | { kind: "tiktok"; platform: Platform; format: string }
  | { kind: "instagram"; platform: Platform; format: string }
  | { kind: "website"; platform: Platform; format: string };

/** Parses and normalises a pasted link. Null when it isn't a usable http(s) URL. */
export function parseLink(input: string): URL | null {
  const raw = input.trim();
  if (!raw || raw.length > 2000) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

const host = (url: URL) => url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");

/** Which platform a link belongs to (anything unrecognised is a website). */
export function detectLink(url: URL): LinkKind {
  const h = host(url);
  const path = url.pathname;
  if (h === "youtube.com" || h === "youtu.be" || h === "music.youtube.com") {
    const id =
      h === "youtu.be"
        ? path.slice(1).split("/")[0]
        : (path.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,20})/)?.[1] ?? url.searchParams.get("v") ?? "");
    if (/^[\w-]{6,20}$/.test(id)) return { kind: "youtube", platform: "youtube", format: "short", videoId: id };
  }
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) {
    return { kind: "tiktok", platform: "tiktok", format: /\/photo\//.test(path) ? "carousel" : "video" };
  }
  if (h === "instagram.com") {
    const format = /^\/(reel|reels|tv)\//.test(path) ? "reel" : /^\/stories\//.test(path) ? "story" : "post";
    return { kind: "instagram", platform: "instagram", format };
  }
  return { kind: "website", platform: "website", format: /sales|checkout|buy|offer|pricing/i.test(path) ? "sales_page" : "landing_page" };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", bull: "•",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** A <meta property|name="…" content="…"> value (attribute order doesn't matter). */
export function metaContent(html: string, key: string): string {
  const re = /<meta\b[^>]*>/gi;
  for (const tag of html.match(re) ?? []) {
    const name = tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (name?.toLowerCase() !== key.toLowerCase()) continue;
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (content != null) return decodeEntities(content).trim();
  }
  return "";
}

export type PageText = { title: string; description: string; headline: string; text: string };

/**
 * Readable text of a web page: drops scripts, styles, navigation, headers and footers,
 * keeps headings / paragraphs / list items as separate lines.
 */
export function htmlToText(html: string): PageText {
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || metaContent(html, "og:title");
  const description = metaContent(html, "description") || metaContent(html, "og:description");
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|nav|header|footer|form|select|button)\b[\s\S]*?<\/\1>/gi, " ");
  const headline = clean(body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const text = decodeEntities(
    body
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/?(p|div|section|article|li|ul|ol|h[1-6]|tr|blockquote|figcaption|main)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    // drop repeated lines (menus, cookie bars repeated in layouts)
    .filter((line, i, all) => all.indexOf(line) === i)
    .join("\n");
  return { title, description, headline, text };
}

/** The JSON object assigned to `ytInitialPlayerResponse` on a YouTube watch page. */
export function extractYoutubePlayerResponse(html: string): Record<string, unknown> | null {
  const start = html.search(/ytInitialPlayerResponse\s*=\s*\{/);
  if (start < 0) return null;
  const open = html.indexOf("{", start);
  let depth = 0;
  let inString = false;
  for (let i = open; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(open, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

type CaptionTrack = { baseUrl?: string; languageCode?: string; kind?: string };

/** Best caption track: English written by a person, then any English, then anything. */
export function pickCaptionTrack(player: Record<string, unknown>): CaptionTrack | null {
  const captions = player.captions as { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } } | undefined;
  const tracks = (captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []).filter((t) => t.baseUrl);
  const en = tracks.filter((t) => t.languageCode?.startsWith("en"));
  return en.find((t) => t.kind !== "asr") ?? en[0] ?? tracks.find((t) => t.kind !== "asr") ?? tracks[0] ?? null;
}

/** Text of a YouTube "json3" caption file. */
export function youtubeJson3ToText(json: unknown): string {
  const events = (json as { events?: { segs?: { utf8?: string }[] }[] } | null)?.events ?? [];
  return events
    .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? "").join(""))
    .join(" ")
    .replace(/\[[^\]]*\]/g, " ") // non-speech markers like [Music] or [Applause]
    .replace(/\s+/g, " ")
    .trim();
}

/** Instagram's og:description looks like `12 likes, 3 comments - name on May 1, 2026: "caption"`. */
export function instagramCaption(ogDescription: string, ogTitle: string): string {
  const quoted = ogDescription.match(/:\s*["“]([\s\S]+)["”]\s*\.?\s*$/)?.[1] ?? ogTitle.match(/:\s*["“]([\s\S]+)["”]\s*$/)?.[1];
  return (quoted ?? "").trim();
}

/** The first sentence (or line) of some text, to use as a hook. Max 300 characters. */
export function firstSentence(text: string): string {
  const firstLine = text.split(/\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const sentence = firstLine.match(/^(.{12,}?[.!?…])(\s|$)/)?.[1] ?? firstLine;
  return sentence.length > 300 ? `${sentence.slice(0, 299).trimEnd()}…` : sentence;
}
