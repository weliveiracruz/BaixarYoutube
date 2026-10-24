// Baixar YouTube - errors.ts
// Turns the error output of yt-dlp into a short code; the window says it to the user (SDD 6.3).
// Port of core/errors.py of YouTubeDownloaderNVDA.

export const CODES = [
  "network",
  "unavailable",
  "private",
  "age",
  "members",
  "live",
  "blocked",
  "permission",
  "diskfull",
  "extractor",
  "ffmpeg",
  "missing",
  "empty",
  "unknown",
] as const;
export type ErrorCode = (typeof CODES)[number];

export function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === "string" && (CODES as readonly string[]).includes(code);
}

export class DownloadError extends Error {
  readonly code: ErrorCode;
  constructor(code: string, readonly detail = "") {
    super(code);
    this.name = "DownloadError";
    this.code = isErrorCode(code) ? code : "unknown";
  }
}

// Checked in order: the first match wins.
const RULES: ReadonlyArray<[ErrorCode, RegExp]> = [
  ["private", /private video|video is private/i],
  ["age", /confirm your age|age[- ]restricted|inappropriate for some users/i],
  ["members", /members[- ]only|join this channel/i],
  ["blocked", /not a bot|confirm you.re not a bot|HTTP Error 429|too many requests/i],
  ["live", /live event will begin|is live|premieres in|this live stream recording is not available/i],
  ["diskfull", /no space left|errno 28|disk (is )?full|not enough space/i],
  ["permission", /permission denied|errno 13|access is denied|winerror 5\b/i],
  [
    "network",
    /getaddrinfo|failed to resolve|name resolution|timed out|connection (refused|reset|aborted)|network is unreachable|urlopen error|no route to host|winerror 1000[56]|ssl/i,
  ],
  ["ffmpeg", /ffmpeg|ffprobe|postprocessing|conversion failed/i],
  [
    "unavailable",
    /video unavailable|has been removed|not available|no longer available|does not exist|copyright|terminated|unsupported url|requested format is not available/i,
  ],
  ["extractor", /unable to extract|extractorerror|nsig|signature|http error 403|please report this issue|javascript runtime/i],
];

/** Error code for the text printed by a failed yt-dlp (stdout + stderr). */
export function classify(output: string | null | undefined): ErrorCode {
  const text = output ?? "";
  const errorLines = text.split(/\r?\n/).filter((line) => line.includes("ERROR"));
  const haystack = errorLines.length ? errorLines.join("\n") : text;
  for (const [code, pattern] of RULES) {
    if (pattern.test(haystack)) return code;
  }
  return "unknown";
}
