import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (host: string) => {
    if (host === "internal.example") return [{ address: "10.0.0.5", family: 4 }];
    if (host === "nowhere.example") throw new Error("ENOTFOUND");
    return [{ address: "93.184.216.34", family: 4 }];
  }),
}));

import {
  decodeEntities,
  detectLink,
  extractYoutubePlayerResponse,
  firstSentence,
  htmlToText,
  instagramCaption,
  metaContent,
  parseLink,
  pickCaptionTrack,
  youtubeJson3ToText,
} from "@/lib/link-parse";
import { FetchBlockedError, assertPublicUrl, isPrivateAddress, safeFetch } from "@/lib/safe-fetch";
import { ExtractError, extractFromLink } from "@/lib/link-extract";

const kind = (s: string) => {
  const u = parseLink(s);
  return u ? detectLink(u) : null;
};

describe("parseLink + detectLink", () => {
  it("recognises social links and their formats", () => {
    expect(kind("https://www.youtube.com/shorts/AbCdEf12345")).toMatchObject({ kind: "youtube", videoId: "AbCdEf12345" });
    expect(kind("youtu.be/AbCdEf12345?t=3")).toMatchObject({ kind: "youtube", videoId: "AbCdEf12345" });
    expect(kind("https://m.youtube.com/watch?v=AbCdEf12345&feature=x")).toMatchObject({ kind: "youtube", platform: "youtube", format: "short" });
    expect(kind("https://www.tiktok.com/@me/video/123")).toMatchObject({ kind: "tiktok", platform: "tiktok", format: "video" });
    expect(kind("https://www.tiktok.com/@me/photo/123")).toMatchObject({ format: "carousel" });
    expect(kind("https://www.instagram.com/reel/Cx1/")).toMatchObject({ kind: "instagram", format: "reel" });
    expect(kind("https://instagram.com/p/Cx1/")).toMatchObject({ kind: "instagram", format: "post" });
  });

  it("treats anything else as a website (sales pages detected by path)", () => {
    expect(kind("mysite.com/free-guide")).toMatchObject({ kind: "website", platform: "website", format: "landing_page" });
    expect(kind("https://mysite.com/offer/checkout")).toMatchObject({ format: "sales_page" });
    expect(kind("https://youtube.com/@channel")).toMatchObject({ kind: "website" }); // no video id
  });

  it("rejects things that aren't usable links", () => {
    expect(parseLink("")).toBeNull();
    expect(parseLink("hello")).toBeNull();
    expect(parseLink("javascript:alert(1)")).toBeNull();
    expect(parseLink("ftp://example.com/x")).toBeNull();
    expect(parseLink("https://user:pw@example.com")).toBeNull();
    expect(parseLink("https://example.com/#frag")?.toString()).toBe("https://example.com/");
  });
});

describe("HTML helpers", () => {
  const html = `<!doctype html><html><head><title>Fallback &amp; Title</title>
    <meta content="Short pitch" name="description"><meta property='og:title' content='OG title'>
    <style>.x{}</style><script>var junk = "<h1>no</h1>";</script></head>
    <body><nav><a>Home</a><a>Pricing</a></nav><header>Logo</header>
    <main><h1>Make <b>$4k</b> a month</h1><p>Step one&nbsp;is easy.</p><p>Step one&nbsp;is easy.</p>
    <ul><li>Proof: 300 students</li></ul><form><button>Buy</button></form></main><footer>© 2026</footer></body></html>`;

  it("pulls title, description, headline and readable text", () => {
    const page = htmlToText(html);
    expect(page.title).toBe("Fallback & Title");
    expect(page.description).toBe("Short pitch");
    expect(page.headline).toBe("Make $4k a month");
    expect(page.text).toBe("Make $4k a month\nStep one is easy.\nProof: 300 students");
  });

  it("reads meta tags in any attribute order and decodes entities", () => {
    expect(metaContent(html, "og:title")).toBe("OG title");
    expect(metaContent(html, "missing")).toBe("");
    expect(decodeEntities("&#8217;&#x2019;&hellip;&unknown;")).toBe("’’…&unknown;");
  });

  it("finds the first sentence for a hook", () => {
    expect(firstSentence("I made $4,200 in 30 days. Here's how.")).toBe("I made $4,200 in 30 days.");
    expect(firstSentence("\n  Stop scrolling\nsecond line")).toBe("Stop scrolling");
    expect(firstSentence("x".repeat(400)).length).toBe(300);
  });
});

describe("YouTube helpers", () => {
  const player = {
    videoDetails: { title: "My short", shortDescription: "desc", lengthSeconds: "42" },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { baseUrl: "https://www.youtube.com/api/timedtext?a=1", languageCode: "en", kind: "asr" },
          { baseUrl: "https://www.youtube.com/api/timedtext?a=2", languageCode: "en" },
          { baseUrl: "https://www.youtube.com/api/timedtext?a=3", languageCode: "hi" },
        ],
      },
    },
  };

  it("extracts the player JSON even with braces inside strings", () => {
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify({ ...player, note: "a } b {" })};var other = {};</script>`;
    expect(extractYoutubePlayerResponse(html)).toMatchObject({ videoDetails: { title: "My short" }, note: "a } b {" });
    expect(extractYoutubePlayerResponse("<html>nothing</html>")).toBeNull();
  });

  it("prefers human-written English captions", () => {
    expect(pickCaptionTrack(player)?.baseUrl).toContain("a=2");
    expect(pickCaptionTrack({})).toBeNull();
  });

  it("joins json3 caption segments", () => {
    expect(youtubeJson3ToText({ events: [{ segs: [{ utf8: "I made " }, { utf8: "$4k" }] }, {}, { segs: [{ utf8: "\nin 30 days" }] }] })).toBe(
      "I made $4k in 30 days",
    );
    expect(youtubeJson3ToText(null)).toBe("");
  });
});

describe("instagramCaption", () => {
  it("pulls the quoted caption out of the preview description", () => {
    expect(instagramCaption('120 likes, 4 comments - maya on May 1, 2026: "Stop posting at 9am. Here\'s why."', "")).toBe(
      "Stop posting at 9am. Here's why.",
    );
    expect(instagramCaption("Log in to see photos", "")).toBe("");
  });
});

describe("private address blocking", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "%s is private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );
  it.each(["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:4700::1111"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));

  it("checks the scheme, port and every resolved address", async () => {
    await expect(assertPublicUrl(new URL("http://127.0.0.1/"))).rejects.toBeInstanceOf(FetchBlockedError);
    await expect(assertPublicUrl(new URL("http://[::1]/"))).rejects.toBeInstanceOf(FetchBlockedError);
    await expect(assertPublicUrl(new URL("https://internal.example/"))).rejects.toThrow(/private/);
    await expect(assertPublicUrl(new URL("https://nowhere.example/"))).rejects.toThrow(/couldn't be found/);
    await expect(assertPublicUrl(new URL("https://example.com:8080/"))).rejects.toThrow(/port/);
    await expect(assertPublicUrl(new URL("https://example.com/"))).resolves.toBeUndefined();
  });
});

describe("safeFetch + extractFromLink (network mocked)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  const html = (body: string, status = 200) =>
    new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

  it("re-checks redirects and refuses one that points inside", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }));
    await expect(safeFetch(new URL("https://example.com/"))).rejects.toThrow(/private/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads a website as headline + page copy", async () => {
    fetchMock.mockResolvedValueOnce(
      html(`<title>T</title><body><h1>Get 10 leads a week</h1><p>${"Real copy. ".repeat(40)}</p></body>`),
    );
    const r = await extractFromLink("mysite.com/offer");
    expect(r).toMatchObject({ platform: "website", format: "sales_page", hook: "Get 10 leads a week", found: { pageText: true } });
    expect(r.script).toContain("Real copy.");
  });

  it("uses a YouTube transcript when one exists", async () => {
    const player = {
      videoDetails: { title: "Title", shortDescription: "Desc", lengthSeconds: "38" },
      captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: "https://www.youtube.com/api/timedtext?v=1", languageCode: "en" }] } },
    };
    fetchMock
      .mockResolvedValueOnce(html(`<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`))
      .mockResolvedValueOnce(new Response(JSON.stringify({ events: [{ segs: [{ utf8: "Stop posting at 9am. Here is why it fails." }] }] })));
    const r = await extractFromLink("https://youtube.com/shorts/AbCdEf12345");
    expect(r).toMatchObject({
      platform: "youtube",
      hook: "Stop posting at 9am.",
      script: "Stop posting at 9am. Here is why it fails.",
      videoLengthSec: 38,
      found: { transcript: true },
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain("fmt=json3");
  });

  it("falls back to title + description and says so when there's no transcript", async () => {
    fetchMock.mockResolvedValueOnce(
      html(`<script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { title: "My title", shortDescription: "My desc" } })};</script>`),
    );
    const r = await extractFromLink("https://youtu.be/AbCdEf12345");
    expect(r.script).toBe("My title\n\nMy desc");
    expect(r.notes[0]).toMatch(/No transcript/);
  });

  it("reads a TikTok caption via oEmbed", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ title: "3 hooks that work. #tips" }), { headers: { "content-type": "application/json" } }));
    const r = await extractFromLink("https://www.tiktok.com/@me/video/123");
    expect(r).toMatchObject({ platform: "tiktok", hook: "3 hooks that work.", script: "3 hooks that work. #tips" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("tiktok.com/oembed");
  });

  it("explains when Instagram hides the caption", async () => {
    fetchMock.mockResolvedValueOnce(html(`<meta property="og:description" content="Log in to Instagram">`));
    await expect(extractFromLink("https://www.instagram.com/reel/Cx1/")).rejects.toThrow(/didn't share/);
  });

  it("friendly errors for bad links and blocked targets", async () => {
    await expect(extractFromLink("not a link")).rejects.toBeInstanceOf(ExtractError);
    await expect(extractFromLink("http://internal.example/admin")).rejects.toThrow(/private/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
