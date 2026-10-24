// Baixar YouTube - engine.ts
// One download: asks yt-dlp for the title and sizes, downloads in its own
// process and reports the progress to a listener (SDD 4.2, 4.3).
// Port of core/engine.py of YouTubeDownloaderNVDA.

import { execFile, spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

import { processOptions } from "./binaries";
import { DownloadError, classify, type ErrorCode } from "./errors";
import * as filenames from "./filenames";
import * as formats from "./formats";
import type { FormatKey } from "./formats";
import * as progress from "./progress";

export const PROBE_TIMEOUT_MS = 120000;
/** Lines of yt-dlp output kept to explain an error. */
export const LOG_LINES = 60;
/** Longest file name yt-dlp may write in a playlist (without the folder). */
export const PLAYLIST_NAME_LIMIT = 150;

export interface Info {
  id: string;
  title: string;
  channel: string;
  duration: number | null;
  parts: number;
  sizes: number[] | null;
}

export interface PlaylistEntry {
  index: number;
  title: string;
  id: string | null;
}

export interface PlaylistInfo {
  title: string;
  count: number;
  entries: PlaylistEntry[];
}

export function baseArguments(playlist = false): string[] {
  return ["--ignore-config", playlist ? "--yes-playlist" : "--no-playlist", "--color", "never", "--encoding", "utf-8"];
}

/** Asks for the video information (title, chosen formats, sizes) without downloading. */
export function probeCommand(prefix: readonly string[], url: string, key: FormatKey): string[] {
  return [...prefix, ...baseArguments(), "-J", "-f", formats.selector(key), "--", url];
}

/** The URL is always the last argument, after "--": it can never be read as an option (RS-02). */
export function downloadCommand(prefix: readonly string[], ffmpegDir: string, url: string, key: FormatKey, basePath: string): string[] {
  return [
    ...prefix,
    ...baseArguments(),
    ...formats.args(key),
    "--ffmpeg-location",
    ffmpegDir,
    "--newline",
    "--progress",
    "--no-simulate",
    "--no-mtime",
    "--progress-template",
    progress.DOWNLOAD_TEMPLATE,
    "--progress-template",
    progress.POSTPROCESS_TEMPLATE,
    "--print",
    progress.FILE_TEMPLATE,
    "-o",
    filenames.outputTemplate(basePath),
    "--",
    url,
  ];
}

/** Lists the videos of a playlist (title and position) without opening each one. */
export function playlistProbeCommand(prefix: readonly string[], url: string): string[] {
  return [...prefix, ...baseArguments(true), "--flat-playlist", "-J", "--", url];
}

/** Downloads every video of the playlist into `folder`, skipping the ones
 * that fail (-i). The URL is always the last argument, after "--" (RS-02). */
export function playlistDownloadCommand(
  prefix: readonly string[],
  ffmpegDir: string,
  url: string,
  key: FormatKey,
  folder: string,
  limit?: number | null,
): string[] {
  const cmd = [
    ...prefix,
    ...baseArguments(true),
    ...formats.args(key),
    "-i",
    "--ffmpeg-location",
    ffmpegDir,
    "--newline",
    "--progress",
    "--no-simulate",
    "--no-mtime",
    "--windows-filenames",
    "--trim-filenames",
    String(PLAYLIST_NAME_LIMIT),
    "--progress-template",
    progress.DOWNLOAD_TEMPLATE,
    "--progress-template",
    progress.POSTPROCESS_TEMPLATE,
    "--print",
    progress.ITEM_TEMPLATE,
    "--print",
    progress.FILE_TEMPLATE,
    "-o",
    filenames.playlistTemplate(folder),
  ];
  if (limit) cmd.push("--playlist-items", `1:${Math.trunc(limit)}`);
  return [...cmd, "--", url];
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function parsePlaylistProbe(text: string | null): PlaylistInfo {
  let data: unknown;
  try {
    data = JSON.parse(text ?? "");
  } catch {
    throw new DownloadError("extractor", "invalid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || (data as Record<string, unknown>)._type !== "playlist") {
    throw new DownloadError("unavailable", "not a playlist");
  }
  const d = data as Record<string, unknown>;
  const raw = Array.isArray(d.entries) ? d.entries : [];
  const entries = raw.filter((e): e is Record<string, unknown> => !!e && typeof e === "object" && !Array.isArray(e));
  if (!entries.length) throw new DownloadError("empty");
  const title = asText(d.title) || asText(d.id);
  return {
    title,
    count: entries.length,
    entries: entries.map((e, n) => {
      const id = asText(e.id);
      return { index: n + 1, title: asText(e.title) || id, id: VIDEO_ID.test(id) ? id : null };
    }),
  };
}

export function parseProbe(text: string | null): Info {
  let data: unknown;
  try {
    data = JSON.parse(text ?? "");
  } catch {
    throw new DownloadError("extractor", "invalid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || (data as Record<string, unknown>)._type === "playlist") {
    throw new DownloadError("unavailable", "not a video");
  }
  const d = data as Record<string, unknown>;
  if (d.is_live || d.live_status === "is_live" || d.live_status === "is_upcoming") throw new DownloadError("live");
  const title = asText(d.title) || asText(d.id);
  const requested = Array.isArray(d.requested_formats) && d.requested_formats.length ? d.requested_formats : [d];
  let sizes: number[] | null = requested
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => (f.filesize || f.filesize_approx) as number);
  if (!sizes.length || !sizes.every((s) => typeof s === "number" && s > 0)) sizes = null;
  const duration = typeof d.duration === "number" ? d.duration : null;
  return {
    id: asText(d.id),
    title,
    channel: asText(d.channel) || asText(d.uploader),
    duration,
    parts: requested.length,
    sizes,
  };
}

/** Receives the events of a Job. */
export interface Listener {
  onInfo?(job: Job, info: Info): void;
  onProgress?(job: Job, update: progress.Update, milestone: number | null): void;
  onStage?(job: Job, stage: progress.Stage): void;
  onDone?(job: Job, file: string): void;
  onError?(job: Job, code: ErrorCode): void;
  onCancelled?(job: Job): void;
  /** The list was read; the job waits for job.proceed() or job.cancel(). */
  onPlaylistInfo?(job: PlaylistJob, info: PlaylistInfo): void;
  onItem?(job: PlaylistJob, index: number, total: number, title: string, entry: PlaylistEntry | null): void;
  onPlaylistProgress?(job: PlaylistJob, index: number, total: number, update: progress.Update, percent: number): void;
  onPlaylistDone?(job: PlaylistJob, folder: string, done: number, total: number): void;
}

/** Ends yt-dlp and the ffmpeg it started. */
export function killTree(proc: ChildProcess): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null || !proc.pid) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      try {
        proc.kill();
      } catch {
        // already gone
      }
      resolve();
    };
    if (process.platform !== "win32") {
      finish();
      return;
    }
    const taskkill = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
    execFile(taskkill, ["/PID", String(proc.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 }, () => finish());
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface JobOptions {
  /** The yt-dlp command (list). */
  prefix: readonly string[];
  ffmpegDir: string;
  url: string;
  key: FormatKey;
  folder: string;
  listener: Listener;
  step?: number;
  /** Returns the problems of the shipped programs (empty list when they are fine). */
  preflight?: () => Promise<string[]> | string[];
  /** Information already read for this link and format (SDD 4.2 step 0). */
  info?: Info | null;
}

let nextId = 1;

/** Runs a process, sends every output line to onLine and resolves with the exit code. */
function runLines(proc: ChildProcess, onLine: (line: string) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    let open = 0;
    let exitCode: number | null = null;
    let exited = false;
    const done = () => {
      if (exited && open === 0) resolve(exitCode ?? -1);
    };
    for (const stream of [proc.stdout, proc.stderr]) {
      if (!stream) continue;
      open++;
      stream.setEncoding("utf8");
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      rl.on("line", onLine);
      rl.on("close", () => {
        open--;
        done();
      });
    }
    proc.on("error", reject);
    proc.on("close", (code) => {
      exitCode = code;
      exited = true;
      done();
    });
  });
}

export class Job {
  readonly id = nextId++;
  readonly prefix: string[];
  readonly ffmpegDir: string;
  readonly url: string;
  readonly key: FormatKey;
  readonly folder: string;
  readonly listener: Listener;
  readonly step: number;
  readonly preflight?: JobOptions["preflight"];
  info: Info | null;
  basePath: string | null = null;
  path: string | null = null;
  readonly log: string[] = [];
  cancelled = false;
  finished = false;
  protected proc: ChildProcess | null = null;
  private finishedPromise: Promise<void> | null = null;

  constructor(opts: JobOptions) {
    this.prefix = [...opts.prefix];
    this.ffmpegDir = opts.ffmpegDir;
    this.url = opts.url;
    this.key = formats.check(opts.key);
    this.folder = opts.folder;
    this.listener = opts.listener;
    this.step = opts.step ?? 10;
    this.preflight = opts.preflight;
    this.info = opts.info ?? null;
  }

  start(): this {
    this.finishedPromise = this.run();
    return this;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.proc) void killTree(this.proc);
  }

  /** True when the job finished within the time. */
  async wait(timeoutMs = 60000): Promise<boolean> {
    if (!this.finishedPromise) return this.finished;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((r) => (timer = setTimeout(() => r(false), timeoutMs)));
    const result = await Promise.race([this.finishedPromise.then(() => true), timeout]);
    clearTimeout(timer);
    return result;
  }

  protected addLog(line: string): void {
    this.log.push(line);
    if (this.log.length > LOG_LINES) this.log.splice(0, this.log.length - LOG_LINES);
  }

  private async run(): Promise<void> {
    try {
      await this.work();
    } catch (e) {
      if (e instanceof DownloadError) await this.fail(e.code);
      else {
        this.addLog("unexpected error");
        await this.fail("unknown");
      }
    } finally {
      this.proc = null;
      this.finished = true;
    }
  }

  protected async checkPreflight(): Promise<void> {
    if (this.preflight && (await this.preflight()).length) throw new DownloadError("missing");
  }

  protected async work(): Promise<void> {
    await this.checkPreflight();
    if (await this.stopIfCancelled()) return;
    if (!this.info) {
      const text = await this.probeJson(probeCommand(this.prefix, this.url, this.key));
      if (await this.stopIfCancelled()) return;
      this.info = parseProbe(text);
    }
    this.listener.onInfo?.(this, this.info);
    this.basePath = filenames.uniqueBase(this.folder, filenames.safeName(this.info.title));
    await this.download();
  }

  protected async stopIfCancelled(): Promise<boolean> {
    if (this.cancelled) {
      await this.cleanup();
      this.listener.onCancelled?.(this);
      return true;
    }
    return false;
  }

  protected spawn(cmd: string[]): ChildProcess | null {
    if (this.cancelled) return null;
    let proc: ChildProcess;
    try {
      proc = spawn(cmd[0], cmd.slice(1), processOptions());
    } catch {
      throw new DownloadError("missing");
    }
    this.proc = proc;
    return proc;
  }

  /** The JSON line printed by yt-dlp -J (null when cancelled). */
  protected async probeJson(cmd: string[]): Promise<string | null> {
    const proc = this.spawn(cmd);
    if (!proc) return null;
    const result = await readJson(proc).finally(() => (this.proc = null));
    if (this.cancelled) return null;
    for (const line of result.log) this.addLog(line);
    return checkJson(result);
  }

  private async download(): Promise<void> {
    const info = this.info!;
    const tracker = new progress.Tracker(info.parts, info.sizes, this.step);
    const proc = this.spawn(downloadCommand(this.prefix, this.ffmpegDir, this.url, this.key, this.basePath!));
    if (!proc) {
      await this.stopIfCancelled();
      return;
    }
    let announcedStage = false;
    let code: number;
    try {
      code = await runLines(proc, (line) => {
        const event = progress.parseLine(line);
        if (!event) {
          if (line.trim()) this.addLog(line);
          return;
        }
        if (event.kind === "download") {
          const update = tracker.feed(event)!;
          this.listener.onProgress?.(this, update, tracker.milestone());
        } else if (event.kind === "postprocess") {
          const stage = progress.STAGES[event.name];
          // One stage per download: after joining, yt-dlp also starts the
          // remuxer, which does nothing when the file is already MP4.
          if (stage && event.status === "started" && !announcedStage) {
            announcedStage = true;
            this.listener.onStage?.(this, stage);
          }
        } else if (event.kind === "file") {
          this.path = event.path;
        }
      });
    } catch {
      throw new DownloadError("missing");
    }
    this.proc = null;
    if (await this.stopIfCancelled()) return;
    const expected = this.basePath + "." + formats.extension(this.key);
    if (!this.path || !isFile(this.path)) this.path = isFile(expected) ? expected : null;
    if (code === 0 && this.path && filenames.isInside(this.folder, this.path)) {
      this.listener.onDone?.(this, this.path);
      return;
    }
    await this.cleanup();
    const classified = classify(this.log.join("\n"));
    throw new DownloadError(code !== 0 ? classified : "unknown");
  }

  protected async fail(code: ErrorCode): Promise<void> {
    if (this.cancelled) {
      await this.cleanup();
      this.listener.onCancelled?.(this);
      return;
    }
    this.listener.onError?.(this, code);
  }

  /** Deletes what a cancelled or failed download left (RF-08). Windows keeps
   * the files locked for a moment after the process ends: tries a few times. */
  protected async cleanup(): Promise<void> {
    if (!this.basePath) return;
    for (let attempt = 0; attempt < 10; attempt++) {
      const left: string[] = [];
      for (const file of filenames.partialFiles(this.basePath)) {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") left.push(file);
        }
      }
      if (!left.length) return;
      await sleep(300);
    }
  }
}

function isFile(file: string): boolean {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

interface JsonResult {
  code: number;
  timedOut: boolean;
  /** The JSON line: the last non-empty line of stdout (warnings come before it). */
  json: string;
  /** Every other line (stderr and stdout), the last LOG_LINES. */
  log: string[];
  all: string;
}

/** Waits for a yt-dlp -J process (killed after PROBE_TIMEOUT_MS). Throws
 * DownloadError("missing") when the program cannot be started. */
function readJson(proc: ChildProcess): Promise<JsonResult> {
  return new Promise((resolve, reject) => {
    let stdoutText = "";
    let stderrText = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      void killTree(proc);
    }, PROBE_TIMEOUT_MS);
    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    proc.stdout?.on("data", (d: string) => (stdoutText += d));
    proc.stderr?.on("data", (d: string) => (stderrText += d));
    proc.on("error", () => {
      clearTimeout(timer);
      reject(new DownloadError("missing"));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const out = stdoutText.split(/\r?\n/).filter((l) => l.trim());
      const json = out.length ? out[out.length - 1] : "";
      const others = [...stderrText.split(/\r?\n/).filter((l) => l.trim()), ...out.slice(0, -1)];
      resolve({ code: code ?? -1, timedOut, json, log: others.slice(-LOG_LINES), all: stderrText + "\n" + stdoutText });
    });
  });
}

function checkJson(result: JsonResult): string {
  if (result.timedOut) throw new DownloadError("network", "timeout");
  if (result.code !== 0) throw new DownloadError(classify(result.all));
  return result.json;
}

export interface PlaylistJobOptions extends Omit<JobOptions, "info"> {
  limit?: number | null;
  playlist?: PlaylistInfo | null;
}

/** Every video of a playlist, into a new folder named after it (RF-15..RF-20).
 * After reading the list it waits for proceed() (the user confirms) or cancel(). */
export class PlaylistJob extends Job {
  readonly limit: number | null;
  playlist: PlaylistInfo | null;
  targetFolder: string | null = null;
  readonly files: string[] = [];
  total = 0;
  private decide!: () => void;
  private readonly decision = new Promise<void>((r) => (this.decide = r));

  constructor(opts: PlaylistJobOptions) {
    super(opts);
    this.limit = opts.limit ?? null;
    this.playlist = opts.playlist ?? null;
  }

  proceed(): void {
    this.decide();
  }

  override cancel(): void {
    super.cancel();
    this.decide();
  }

  protected override async work(): Promise<void> {
    await this.checkPreflight();
    if (await this.stopIfCancelled()) return;
    if (!this.playlist) {
      const text = await this.probeJson(playlistProbeCommand(this.prefix, this.url));
      if (await this.stopIfCancelled()) return;
      this.playlist = parsePlaylistProbe(text);
    }
    this.total = this.limit ? Math.min(this.playlist.count, this.limit) : this.playlist.count;
    this.listener.onPlaylistInfo?.(this, this.playlist);
    await this.decision;
    if (await this.stopIfCancelled()) return;
    this.targetFolder = filenames.uniqueBase(this.folder, filenames.safeName(this.playlist.title, "playlist"));
    try {
      fs.mkdirSync(this.targetFolder);
    } catch {
      this.targetFolder = null;
      throw new DownloadError("permission");
    }
    await this.downloadAll();
  }

  private async downloadAll(): Promise<void> {
    const proc = this.spawn(playlistDownloadCommand(this.prefix, this.ffmpegDir, this.url, this.key, this.targetFolder!, this.limit));
    if (!proc) {
      await this.stopIfCancelled();
      return;
    }
    const parts = formats.isAudio(this.key) ? 1 : 2;
    let tracker = new progress.Tracker(parts, null, 0);
    let index = 0;
    try {
      await runLines(proc, (line) => {
        const event = progress.parseLine(line);
        if (!event) {
          if (line.trim()) this.addLog(line);
        } else if (event.kind === "item") {
          index = this.total ? Math.min(event.index, this.total) : event.index;
          tracker = new progress.Tracker(parts, null, 0);
          const entry = this.playlist?.entries[event.index - 1] ?? null;
          this.listener.onItem?.(this, index, this.total, event.title, entry);
        } else if (event.kind === "download" && index) {
          const update = tracker.feed(event)!;
          const overall = Math.floor((((index - 1) + update.percent / 100) / Math.max(1, this.total)) * 100);
          this.listener.onPlaylistProgress?.(this, index, this.total, update, Math.min(100, overall));
        } else if (event.kind === "file") {
          if (filenames.isInside(this.targetFolder!, event.path) && isFile(event.path)) this.files.push(event.path);
        }
      });
    } catch {
      throw new DownloadError("missing");
    }
    this.proc = null;
    if (await this.stopIfCancelled()) return;
    await this.cleanup();
    if (!this.files.length) throw new DownloadError(classify(this.log.join("\n")));
    this.listener.onPlaylistDone?.(this, this.targetFolder!, this.files.length, this.total);
  }

  /** Keeps the finished files and deletes everything else of the playlist
   * folder (it was created by this job); an empty folder is removed. */
  protected override async cleanup(): Promise<void> {
    const folder = this.targetFolder;
    if (!folder || !fs.existsSync(folder)) return;
    const norm = (p: string) => path.resolve(p).toLowerCase();
    const keep = new Set(this.files.map(norm));
    for (let attempt = 0; attempt < 10; attempt++) {
      const left: string[] = [];
      for (const name of fs.readdirSync(folder)) {
        const file = path.join(folder, name);
        if (keep.has(norm(file)) || !isFile(file)) continue;
        try {
          fs.unlinkSync(file);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") left.push(file);
        }
      }
      if (!left.length) break;
      await sleep(300);
    }
    try {
      fs.rmdirSync(folder); // only when empty
    } catch {
      // not empty: the finished files stay
    }
  }
}

/** Reads the information of a link without downloading (SDD 4.2 step 0). */
export class Probe {
  private proc: ChildProcess | null = null;
  cancelled = false;

  constructor(private readonly prefix: readonly string[]) {}

  cancel(): void {
    this.cancelled = true;
    if (this.proc) void killTree(this.proc);
  }

  async video(url: string, key: FormatKey): Promise<Info | null> {
    const text = await this.json(probeCommand(this.prefix, url, key));
    return text === null ? null : parseProbe(text);
  }

  async playlist(url: string): Promise<PlaylistInfo | null> {
    const text = await this.json(playlistProbeCommand(this.prefix, url));
    return text === null ? null : parsePlaylistProbe(text);
  }

  private async json(cmd: string[]): Promise<string | null> {
    if (this.cancelled) return null;
    const proc = spawn(cmd[0], cmd.slice(1), processOptions());
    this.proc = proc;
    const result = await readJson(proc).finally(() => (this.proc = null));
    if (this.cancelled) return null;
    return checkJson(result);
  }
}
