/**
 * Fetching a URL the user pasted, safely. The server must never be tricked into calling
 * internal addresses (localhost, the cloud metadata service, private networks), so every
 * hop — including each redirect — is checked: http(s) only, normal ports, public IPs only.
 * Responses are capped in time and size.
 */
import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class FetchBlockedError extends Error {}

export const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;

/** True for loopback, private, link-local, carrier-grade NAT, multicast and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mapped) return isPrivateAddress(mapped);
    return (
      lower === "::" || lower === "::1" ||
      /^f[cd]/.test(lower) || // unique local fc00::/7
      /^fe[89ab]/.test(lower) || // link-local fe80::/10
      lower.startsWith("ff") // multicast
    );
  }
  return true; // not an IP at all
}

/** Throws FetchBlockedError unless the URL is http(s) on a normal port and resolves only to public IPs. */
export async function assertPublicUrl(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new FetchBlockedError("Only http and https links work.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new FetchBlockedError("That link uses an unusual port.");
  if (url.username || url.password) throw new FetchBlockedError("Links with a username or password aren't allowed.");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new FetchBlockedError("That website couldn't be found. Check the link.");
  if (addresses.some(isPrivateAddress)) throw new FetchBlockedError("That link points to a private address.");
}

export type SafeResponse = { url: URL; status: number; contentType: string; body: string };

/** GET a public URL (following up to 4 redirects, each re-checked). The body is read as text, up to MAX_BYTES. */
export async function safeFetch(
  input: URL,
  options: { timeoutMs?: number; headers?: Record<string, string>; accept?: RegExp } = {},
): Promise<SafeResponse> {
  const signal = AbortSignal.timeout(options.timeoutMs ?? 10_000);
  let url = input;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; OfferBrain/1.0; +https://offer-brain-amber.vercel.app)",
        "accept-language": "en-US,en;q=0.9",
        ...options.headers,
      },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      await res.body?.cancel();
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (options.accept && !options.accept.test(contentType)) {
      await res.body?.cancel();
      throw new FetchBlockedError("That link isn't a web page we can read.");
    }
    return { url, status: res.status, contentType, body: await readCapped(res) };
  }
  throw new FetchBlockedError("That link redirects too many times.");
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break; // keep what we have: the start of a page holds the useful parts
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}
