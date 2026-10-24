// Baixar YouTube - urls.ts
// Accepts only links to a YouTube video or playlist and rewrites them to a single, safe form (RS-01).
// Port of core/urls.py of YouTubeDownloaderNVDA.

export const HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);
export const MAX_LENGTH = 2048;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// Playlist ids: PL..., OLAK5uy_... (albums), RD... (mixes), UU... Short private
// lists (LL liked videos, WL watch later, LM liked music) need an account.
const LIST_ID = /^[A-Za-z0-9_-]{12,80}$/;
const PATH_ID = /^\/(?:shorts|live|embed|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/;
const IN_TEXT = /(?:https?:\/\/)?(?:[\w-]+\.)*(?:youtube\.com|youtu\.be)\/[^\s<>"']+/gi;

/** video: 11-character id or null; playlist: list id or null (never both null). */
export interface Link {
  video: string | null;
  playlist: string | null;
}

export type InvalidReason = "empty" | "host" | "video";

/** reason: 'empty', 'host' (not YouTube) or 'video' (YouTube, but neither a video nor a playlist). */
export class InvalidUrl extends Error {
  constructor(public readonly reason: InvalidReason) {
    super(reason);
    this.name = "InvalidUrl";
  }
}

function split(input: string | null | undefined): { host: string; url: URL } {
  let text = (input ?? "").trim();
  if (!text) throw new InvalidUrl("empty");
  if (text.length > MAX_LENGTH || /[\s\\]/u.test(text) || [...text].some((c) => c.charCodeAt(0) < 32)) {
    throw new InvalidUrl("host");
  }
  if (!text.includes("://")) text = "https://" + text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new InvalidUrl("host");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new InvalidUrl("host");
  if (url.username || url.password || !["", "80", "443"].includes(url.port)) throw new InvalidUrl("host");
  // "user@" with an empty user name is not visible in URL.username.
  if (/^[a-z]+:\/\/[^/?#]*@/i.test(text)) throw new InvalidUrl("host");
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!HOSTS.has(host)) throw new InvalidUrl("host");
  return { host, url };
}

function single(url: URL, name: string, pattern: RegExp): string | null {
  const values = url.searchParams.getAll(name).filter((v) => v !== "");
  return values.length === 1 && pattern.test(values[0]) ? values[0] : null;
}

/** Link(video, playlist) of a YouTube link, or throws InvalidUrl. */
export function parse(input: string | null | undefined): Link {
  const { host, url } = split(input);
  const path = url.pathname.replace(/\/+$/, "");
  let playlist = single(url, "list", LIST_ID);
  let video: string | null = null;
  if (host.endsWith("youtu.be")) {
    const candidate = url.pathname.replace(/^\/+|\/+$/g, "");
    video = VIDEO_ID.test(candidate) ? candidate : null;
  } else if (path === "/watch") {
    video = single(url, "v", VIDEO_ID);
  } else if (path === "/playlist") {
    video = null;
  } else {
    const m = PATH_ID.exec(url.pathname);
    video = m ? m[1] : null;
    playlist = null; // shorts, live, embed: one video only
  }
  if (video === null && playlist === null) throw new InvalidUrl("video");
  return { video, playlist };
}

/** The 11-character id of the video, or throws InvalidUrl. */
export function videoId(input: string): string {
  const link = parse(input);
  if (link.video === null) throw new InvalidUrl("video");
  return link.video;
}

/** The form passed to yt-dlp for one video. Playlist, time and tracking parameters are dropped. */
export function normalize(input: string): string {
  return videoUrl(parse(input));
}

export function videoUrl(link: Link): string {
  if (!link.video) throw new InvalidUrl("video");
  return "https://www.youtube.com/watch?v=" + link.video;
}

/** The form passed to yt-dlp for a whole playlist. A mix (RD...) only exists
 * from one of its videos, so it keeps the video. */
export function playlistUrl(link: Link): string {
  if (!link.playlist) throw new InvalidUrl("video");
  if (link.playlist.startsWith("RD") && link.video) {
    return `https://www.youtube.com/watch?v=${link.video}&list=${link.playlist}`;
  }
  return "https://www.youtube.com/playlist?list=" + link.playlist;
}

/** The link shown in the window: the video, the playlist, or both. */
export function canonical(link: Link): string {
  if (link.video && link.playlist) return `https://www.youtube.com/watch?v=${link.video}&list=${link.playlist}`;
  if (link.video) return videoUrl(link);
  return "https://www.youtube.com/playlist?list=" + link.playlist;
}

/** First valid YouTube video or playlist link in a text (the clipboard), in canonical form, or null. */
export function findInText(text: string | null | undefined): string | null {
  if (!text || text.length > 100000) return null;
  for (const m of text.matchAll(IN_TEXT)) {
    try {
      return canonical(parse(m[0].replace(/[.,;)\]}]+$/, "")));
    } catch (e) {
      if (!(e instanceof InvalidUrl)) throw e;
    }
  }
  return null;
}
