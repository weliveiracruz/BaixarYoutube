import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Job, PlaylistJob, type Info, type Listener, type PlaylistInfo } from "../../src/core/engine";
import type { ErrorCode } from "../../src/core/errors";
import type { FormatKey } from "../../src/core/formats";
import type { Update } from "../../src/core/progress";

export const ROOT = path.resolve(__dirname, "..", "..");
export const FAKE = path.join(ROOT, "tests", "fake", "fake-ytdlp.mjs");
/** The fake yt-dlp runs on the Node of the test runner. */
export const FAKE_PREFIX = [process.execPath, FAKE];
export const VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
export const LIST_ID = "PLzCxunOM5WFI6sgbAppnSgLQxxNg_d10L";
export const PLAYLIST = "https://www.youtube.com/playlist?list=" + LIST_ID;

export function tempFolder(prefix = "baixar-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Configures the fake for the next calls; returns the path of its call log. */
export function configureFake(conf: Record<string, unknown> = {}): string {
  const log = path.join(tempFolder("baixar-log-"), "calls.jsonl");
  process.env.FAKE_YTDLP = JSON.stringify(conf);
  process.env.FAKE_YTDLP_LOG = log;
  return log;
}

export function fakeCalls(log: string): string[][] {
  try {
    return fs
      .readFileSync(log, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

export type Ev =
  | ["info", Info]
  | ["progress", Update, number | null]
  | ["stage", string]
  | ["done", string]
  | ["error", ErrorCode]
  | ["cancelled"]
  | ["playlistInfo", PlaylistInfo]
  | ["item", number, number, string]
  | ["playlistProgress", number, number]
  | ["playlistDone", string, number, number];

export class Recorder implements Listener {
  events: Ev[] = [];
  /** What the user answers to the playlist confirmation. */
  confirm = true;
  onInfo(_j: Job, info: Info) {
    this.events.push(["info", info]);
  }
  onProgress(_j: Job, update: Update, milestone: number | null) {
    this.events.push(["progress", update, milestone]);
  }
  onStage(_j: Job, stage: string) {
    this.events.push(["stage", stage]);
  }
  onDone(_j: Job, file: string) {
    this.events.push(["done", file]);
  }
  onError(_j: Job, code: ErrorCode) {
    this.events.push(["error", code]);
  }
  onCancelled() {
    this.events.push(["cancelled"]);
  }
  onPlaylistInfo(job: PlaylistJob, info: PlaylistInfo) {
    this.events.push(["playlistInfo", info]);
    if (this.confirm) job.proceed();
    else job.cancel();
  }
  onItem(_j: PlaylistJob, index: number, total: number, title: string) {
    this.events.push(["item", index, total, title]);
  }
  onPlaylistProgress(_j: PlaylistJob, index: number, _t: number, _u: Update, percent: number) {
    this.events.push(["playlistProgress", index, percent]);
  }
  onPlaylistDone(_j: PlaylistJob, folder: string, done: number, total: number) {
    this.events.push(["playlistDone", folder, done, total]);
  }
  kinds(): string[] {
    return this.events.map((e) => e[0]);
  }
  last(): Ev | undefined {
    return this.events[this.events.length - 1];
  }
}

export async function runJob(
  key: FormatKey = "mp4best",
  opts: { folder?: string; step?: number; preflight?: () => string[]; fake?: Record<string, unknown> } = {},
) {
  const log = configureFake(opts.fake);
  const folder = opts.folder ?? tempFolder();
  const rec = new Recorder();
  const job = new Job({ prefix: FAKE_PREFIX, ffmpegDir: "C:\\ffmpeg", url: VIDEO, key, folder, listener: rec, step: opts.step ?? 10, preflight: opts.preflight });
  job.start();
  if (!(await job.wait(60000))) throw new Error("job did not finish");
  return { job, rec, folder, log };
}

export async function runPlaylist(
  key: FormatKey = "mp3",
  opts: { folder?: string; confirm?: boolean; limit?: number; fake?: Record<string, unknown> } = {},
) {
  const log = configureFake(opts.fake);
  const folder = opts.folder ?? tempFolder();
  const rec = new Recorder();
  rec.confirm = opts.confirm ?? true;
  const job = new PlaylistJob({ prefix: FAKE_PREFIX, ffmpegDir: "C:\\ffmpeg", url: PLAYLIST, key, folder, listener: rec, limit: opts.limit });
  job.start();
  if (!(await job.wait(60000))) throw new Error("job did not finish");
  return { job, rec, folder, log };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until(cond: () => boolean, timeoutMs = 30000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (!cond() && Date.now() < end) await sleep(50);
  return cond();
}
