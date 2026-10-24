// Baixar YouTube - thumbnails.ts
// The picture of the video shown in the media card (RF-25), fetched under the rules of RS-11:
// only from i.ytimg.com, built from a validated id, no cookies, no redirects, small and real images.

export const HOST = "https://i.ytimg.com";
export const MAX_BYTES = 2 * 1024 * 1024;
export const TIMEOUT_MS = 10000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const NAMES = ["maxresdefault.jpg", "hqdefault.jpg"] as const;

/** The addresses tried for a video, best first. The id is validated again here. */
export function thumbnailUrls(id: string, base: string = HOST): string[] {
  if (!VIDEO_ID.test(id)) return [];
  return NAMES.map((name) => `${base}/vi/${id}/${name}`);
}

/** The image type of the first bytes, or null when they are not JPEG, PNG or WebP. */
export function sniff(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function readLimited(response: Response, limit: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** A data: URL with the picture of the video, or null (no picture: the card shows "No thumbnail"). */
export async function fetchThumbnail(id: string, fetcher: Fetcher, base: string = HOST, signal?: AbortSignal): Promise<string | null> {
  for (const url of thumbnailUrls(id, base)) {
    if (signal?.aborted) return null;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetcher(url, { redirect: "manual", credentials: "omit", cache: "no-store", signal: controller.signal });
      // A redirect (3xx, or an opaque redirect) is never followed (RS-11).
      if (response.status !== 200 || response.type === "opaqueredirect" || (response.url && !response.url.startsWith(base + "/"))) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }
      const bytes = await readLimited(response, MAX_BYTES);
      if (!bytes) continue;
      const type = sniff(bytes);
      // YouTube answers maxresdefault with a tiny grey picture (120 x 90) when there is none: skip it.
      if (!type || bytes.length < 2000) continue;
      return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
    } catch {
      // network error, timeout or cancelled: try the next one
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  return null;
}

/** Thumbnails kept only in memory (RS-11): the last `max` pictures. */
export class ThumbnailCache {
  private readonly map = new Map<string, string | null>();
  constructor(private readonly max = 20) {}

  get(id: string): string | null | undefined {
    return this.map.get(id);
  }

  set(id: string, value: string | null): void {
    this.map.delete(id);
    this.map.set(id, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }

  get size(): number {
    return this.map.size;
  }
}
