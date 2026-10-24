// Baixar YouTube - formats.ts
// The formats of the window (RF-04) and the yt-dlp arguments of each one.
// Port of core/formats.py of YouTubeDownloaderNVDA.

export const MP4_BEST = "mp4best";
export const MP4_720 = "mp4_720";
export const MP4_360 = "mp4_360";
export const MP3 = "mp3";
export const M4A = "m4a";
export type FormatKey = typeof MP4_BEST | typeof MP4_720 | typeof MP4_360 | typeof MP3 | typeof M4A;
/** Order shown in the Format list. */
export const FORMATS: readonly FormatKey[] = [MP4_BEST, MP4_720, MP4_360, MP3, M4A];
export const DEFAULT: FormatKey = MP4_BEST;
/** yt-dlp format sort of the video formats (see args()). */
export const VIDEO_SORT = "res,fps,vcodec:h264,acodec:aac";

const EXTENSIONS: Record<FormatKey, string> = { mp4best: "mp4", mp4_720: "mp4", mp4_360: "mp4", mp3: "mp3", m4a: "m4a" };

function video(height?: number): string {
  const h = height ? `[height<=${height}]` : "";
  return [`bv*${h}[ext=mp4]+ba[ext=m4a]`, `b${h}[ext=mp4]`, `bv*${h}+ba`, `b${h}`, "b"].join("/");
}

const SELECTORS: Record<FormatKey, string> = {
  mp4best: video(),
  mp4_720: video(720),
  mp4_360: video(360),
  mp3: "ba/b",
  m4a: "ba[ext=m4a]/ba/b",
};

export function isFormat(key: unknown): key is FormatKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(EXTENSIONS, key);
}

export function check(key: unknown): FormatKey {
  if (!isFormat(key)) throw new Error(`unknown format ${JSON.stringify(key)}`);
  return key;
}

export function extension(key: FormatKey): string {
  return EXTENSIONS[check(key)];
}

export function isAudio(key: FormatKey): boolean {
  const k = check(key);
  return k === MP3 || k === M4A;
}

export function selector(key: FormatKey): string {
  return SELECTORS[check(key)];
}

/** yt-dlp arguments that choose and convert the format. */
export function args(key: FormatKey): string[] {
  const out = ["-f", selector(key)];
  if (isAudio(key)) {
    out.push("-x", "--audio-format", extension(key));
    if (key === MP3) out.push("--audio-quality", "0");
  } else {
    // Highest resolution first; at the same resolution H.264/AAC, which every
    // Windows player plays (AV1 needs an extra Windows extension).
    out.push("-S", VIDEO_SORT, "--merge-output-format", "mp4", "--remux-video", "mp4");
  }
  return out;
}
