// Baixar YouTube - progress.ts
// Reads the progress lines printed by yt-dlp (--progress-template) and turns
// them into one percentage for the whole download (video + audio) (RF-06, RA-04).
// Port of core/progress.py of YouTubeDownloaderNVDA.

export const PREFIX = "BAIXARYT";
/** Templates passed to yt-dlp. Fields that yt-dlp does not know are printed as NA. */
export const DOWNLOAD_TEMPLATE =
  "download:" +
  PREFIX +
  "|D|%(progress.status)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.eta)s|%(progress.speed)s";
export const POSTPROCESS_TEMPLATE = "postprocess:" + PREFIX + "|P|%(progress.status)s|%(progress.postprocessor)s";
/** Printed after the final file is in place: its full path. */
export const FILE_TEMPLATE = "after_move:" + PREFIX + "|F|%(filepath)s";
/** Printed before each video of a playlist: its position and title. */
export const ITEM_TEMPLATE = "before_dl:" + PREFIX + "|I|%(playlist_index)s|%(title)s";

export interface Download {
  kind: "download";
  status: string;
  downloaded: number | null;
  total: number | null;
  eta: number | null;
  speed: number | null;
}
export interface Postprocess {
  kind: "postprocess";
  status: string;
  name: string;
}
export interface FinalFile {
  kind: "file";
  path: string;
}
export interface Item {
  kind: "item";
  index: number;
  title: string;
}
export type Event = Download | Postprocess | FinalFile | Item;

export interface Update {
  percent: number;
  downloaded: number;
  total: number | null;
  eta: number | null;
  speed: number | null;
  part: number;
  parts: number;
}

export type Stage = "merging" | "converting";
/** yt-dlp post-processors that the user hears about, as yt-dlp 2026.10.21
 * prints them in %(progress.postprocessor)s. */
export const STAGES: Readonly<Record<string, Stage>> = { Merger: "merging", ExtractAudio: "converting", VideoRemuxer: "converting" };

function num(text: string | undefined): number | null {
  if (text === undefined || text.trim() === "") return null;
  const value = Number(text);
  if (Number.isNaN(value) || value < 0 || !Number.isFinite(value)) return null;
  return value;
}

/** Download, Postprocess, FinalFile, Item or null (any other output of yt-dlp). */
export function parseLine(raw: string): Event | null {
  const line = raw.replace(/[\r\n]+$/, "");
  if (!line.startsWith(PREFIX + "|")) return null;
  const parts = line.split("|");
  const kind = parts[1] ?? "";
  if (kind === "D" && parts.length === 8) {
    let total = num(parts[4]);
    if (total === null) total = num(parts[5]);
    return { kind: "download", status: parts[2], downloaded: num(parts[3]), total, eta: num(parts[6]), speed: num(parts[7]) };
  }
  if (kind === "P" && parts.length === 4) return { kind: "postprocess", status: parts[2], name: parts[3] };
  // A path never has "|" on Windows, but keep everything after the prefix.
  if (kind === "F" && parts.length >= 3) return { kind: "file", path: parts.slice(2).join("|") };
  // The title may contain "|": everything after the position.
  if (kind === "I" && parts.length >= 4 && /^\d+$/.test(parts[2])) {
    return { kind: "item", index: Number(parts[2]), title: parts.slice(3).join("|") };
  }
  return null;
}

/** One growing percentage for a download made of `parts` files (video and
 * audio are two downloads in yt-dlp), and the milestones to announce. */
export class Tracker {
  readonly parts: number;
  readonly sizes: number[] | null;
  readonly step: number;
  part = 0;
  doneBytes = 0;
  percent = 0;
  announced = 0;

  constructor(parts = 1, sizes: number[] | null = null, step = 10) {
    this.parts = Math.max(1, Math.trunc(parts || 1));
    this.sizes = sizes && sizes.length === this.parts && sizes.every((s) => s > 0) ? [...sizes] : null;
    this.step = Math.trunc(step || 0);
  }

  /** An Update for a Download event (null for other events). */
  feed(event: Event): Update | null {
    if (event.kind !== "download") return null;
    const downloaded = event.downloaded ?? 0;
    const total = event.total;
    let fraction: number;
    if (event.status === "finished") fraction = 1;
    else if (total) fraction = Math.min(1, downloaded / total);
    else fraction = 0;
    let overall: number;
    if (this.sizes) {
      const current = total || this.sizes[this.part];
      const later = this.sizes.slice(this.part + 1).reduce((a, b) => a + b, 0);
      const whole = this.doneBytes + current + later;
      overall = whole ? (this.doneBytes + current * fraction) / whole : 0;
    } else {
      overall = (this.part + fraction) / this.parts;
    }
    this.percent = Math.max(this.percent, Math.min(100, Math.floor(overall * 100)));
    const update: Update = { percent: this.percent, downloaded, total, eta: event.eta, speed: event.speed, part: this.part + 1, parts: this.parts };
    if (event.status === "finished") {
      this.doneBytes += total || downloaded;
      if (this.part + 1 < this.parts) this.part += 1;
    }
    return update;
  }

  /** Percentage to announce now (10, 20... with step 10), or null.
   * Never repeats a value and never announces 0 or 100 (the end has its own message). */
  milestone(): number | null {
    if (this.step <= 0) return null;
    const value = Math.floor(this.percent / this.step) * this.step;
    if (value > 0 && value < 100 && value > this.announced) {
      this.announced = value;
      return value;
    }
    return null;
  }
}
