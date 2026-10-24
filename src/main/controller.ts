// Baixar YouTube - controller.ts
// Downloads, previews and thumbnails of the window (SDD 4.2, 4.3, RF-25). Knows nothing
// about BrowserWindow: it talks to the window through `send`.

import * as path from "node:path";

import type { Binaries } from "../core/binaries";
import { DownloadError, type ErrorCode } from "../core/errors";
import { Job, PlaylistJob, Probe, type Info, type Listener, type PlaylistInfo } from "../core/engine";
import { isWritable } from "../core/folders";
import type { FormatKey } from "../core/formats";
import { ThumbnailCache, fetchThumbnail, type Fetcher } from "../core/thumbnails";
import * as urls from "../core/urls";
import type { CheckResult, EventName, Events, StartRequest, StartResult } from "../shared/types";

/** Pause after the last change of the URL before reading its information (D-12). */
export const PREVIEW_DELAY_MS = 600;
/** At most 4 progress events per second reach the window (SDD 4.2 step 6). */
export const PROGRESS_INTERVAL_MS = 250;

export interface ControllerOptions {
  binaries: Binaries;
  /** The yt-dlp command; a fake one in the tests. */
  ytdlpCommand: () => string[];
  ffmpegDir: string;
  /** Problems of the shipped programs (RS-03); empty when they are fine. */
  preflight: () => Promise<string[]>;
  fetcher: Fetcher;
  thumbnailBase?: string;
  settings: () => { folder: string; announce: number; thumbnails: boolean };
  send: <E extends EventName>(event: E, payload: Events[E]) => void;
  /** The job finished (done, error or cancel), for the notification and the tray. */
  onFinished?: (kind: "done" | "error" | "cancelled", title: string, text: { code?: ErrorCode; folder?: string }) => void;
  onProgress?: (percent: number) => void;
}

interface PreviewCache {
  canonical: string;
  format: FormatKey;
  info?: Info;
  playlist?: PlaylistInfo;
}

export function check(url: unknown): CheckResult {
  if (typeof url !== "string" || url.length > urls.MAX_LENGTH * 2) return { ok: false, reason: "host" };
  try {
    const link = urls.parse(url);
    const kind = link.video && link.playlist ? "both" : link.video ? "video" : "playlist";
    return { ok: true, kind, canonical: urls.canonical(link), video: link.video };
  } catch (e) {
    if (e instanceof urls.InvalidUrl) return { ok: false, reason: e.reason };
    throw e;
  }
}

export class Controller {
  job: Job | null = null;
  private title = "";
  private cache: PreviewCache | null = null;
  private probe: Probe | null = null;
  private previewTimer: NodeJS.Timeout | null = null;
  private previewAbort: AbortController | null = null;
  private token = 0;
  private readonly thumbs = new ThumbnailCache(20);
  private lastProgress = 0;
  /** Files and folders this app wrote, by job: the only ones Open file / Open folder accept (RS-08). */
  private readonly results = new Map<number, { file: string | null; folder: string }>();

  constructor(private readonly o: ControllerOptions) {}

  get busy(): boolean {
    return !!this.job && !this.job.finished;
  }

  // -- preview (RF-25, D-11, D-12) ---------------------------------------------------------

  /** token: chosen by the window, always growing; an older preview is dropped. */
  preview(url: unknown, format: FormatKey, token: number): void {
    if (token <= this.token) return;
    this.token = token;
    this.stopPreview();
    const result = check(url);
    if (!result.ok) return;
    const link = urls.parse(result.canonical);
    if (link.video && this.o.settings().thumbnails) void this.sendThumbnail(token, link.video);
    else if (link.video) this.o.send("preview:thumbnail", { token, dataUrl: null });
    this.previewTimer = setTimeout(() => void this.readInfo(token, link, format), PREVIEW_DELAY_MS);
  }

  private stopPreview(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = null;
    this.probe?.cancel();
    this.probe = null;
    this.previewAbort?.abort();
    this.previewAbort = new AbortController();
  }

  private async thumbnail(id: string, signal?: AbortSignal): Promise<string | null> {
    const cached = this.thumbs.get(id);
    if (cached !== undefined) return cached;
    const value = await fetchThumbnail(id, this.o.fetcher, this.o.thumbnailBase, signal);
    if (!signal?.aborted) this.thumbs.set(id, value);
    return value;
  }

  private async sendThumbnail(token: number, id: string): Promise<void> {
    const dataUrl = await this.thumbnail(id, this.previewAbort?.signal);
    if (token === this.token) this.o.send("preview:thumbnail", { token, dataUrl });
  }

  private async readInfo(token: number, link: urls.Link, format: FormatKey): Promise<void> {
    if (token !== this.token) return;
    const probe = new Probe(this.o.ytdlpCommand());
    this.probe = probe;
    try {
      if ((await this.o.preflight()).length) throw new DownloadError("missing");
      if (link.video) {
        const info = await probe.video(urls.videoUrl(link), format);
        if (!info || token !== this.token) return;
        this.cache = { canonical: urls.canonical(link), format, info };
        this.o.send("preview:info", { token, kind: "video", title: info.title, channel: info.channel, duration: info.duration });
      } else {
        const list = await probe.playlist(urls.playlistUrl(link));
        if (!list || token !== this.token) return;
        this.cache = { canonical: urls.canonical(link), format, playlist: list };
        this.o.send("preview:info", { token, kind: "playlist", title: list.title, count: list.count });
        const first = list.entries.find((e) => e.id);
        if (first?.id && this.o.settings().thumbnails) void this.sendThumbnail(token, first.id);
        else if (token === this.token) this.o.send("preview:thumbnail", { token, dataUrl: null });
      }
    } catch (e) {
      if (token === this.token) this.o.send("preview:info", { token, kind: "error", code: e instanceof DownloadError ? e.code : "unknown" });
    } finally {
      if (this.probe === probe) this.probe = null;
    }
  }

  // -- downloads ---------------------------------------------------------------------------

  start(req: StartRequest): StartResult {
    if (this.busy) return { ok: false, error: "busy" };
    const result = check(req.url);
    if (!result.ok) return { ok: false, error: "url", reason: result.reason };
    const link = urls.parse(result.canonical);
    const s = this.o.settings();
    if (!isWritable(s.folder)) return { ok: false, error: "folder" };
    const playlist = req.mode === "playlist" && !!link.playlist;
    if (!playlist && !link.video) return { ok: false, error: "url", reason: "video" };
    // The preview is not needed any more; its information is reused below.
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.probe?.cancel();
    const cached = this.cache && this.cache.canonical === result.canonical ? this.cache : null;
    const common = {
      prefix: this.o.ytdlpCommand(),
      ffmpegDir: this.o.ffmpegDir,
      key: req.format,
      folder: s.folder,
      listener: this.listener(),
      step: s.announce,
      preflight: this.o.preflight,
    };
    this.title = "";
    this.lastProgress = 0;
    if (playlist) {
      this.job = new PlaylistJob({ ...common, url: urls.playlistUrl(link), playlist: cached?.playlist ?? null });
    } else {
      // Sizes depend on the format: the information is reused only for the same format.
      const info = cached?.info && cached.format === req.format ? cached.info : null;
      this.job = new Job({ ...common, url: urls.videoUrl(link), info });
    }
    this.job.start();
    return { ok: true, jobId: this.job.id };
  }

  confirmPlaylist(jobId: number, yes: boolean): void {
    const job = this.job;
    if (!(job instanceof PlaylistJob) || job.id !== jobId) return;
    if (yes) job.proceed();
    else job.cancel();
  }

  cancel(jobId?: number): void {
    if (this.job && (jobId === undefined || this.job.id === jobId)) this.job.cancel();
  }

  async cancelAndWait(timeoutMs = 15000): Promise<void> {
    if (!this.busy) return;
    this.job!.cancel();
    await this.job!.wait(timeoutMs);
  }

  result(jobId: number): { file: string | null; folder: string } | null {
    return this.results.get(jobId) ?? null;
  }

  private progress(jobId: number, payload: Events["job:progress"], force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastProgress < PROGRESS_INTERVAL_MS) return;
    this.lastProgress = now;
    this.o.send("job:progress", { ...payload, jobId });
    this.o.onProgress?.(payload.percent);
  }

  private listener(): Listener {
    return {
      onInfo: (job, info) => {
        this.title = info.title;
        this.o.send("job:info", { jobId: job.id, title: info.title, channel: info.channel, duration: info.duration });
      },
      onProgress: (job, u, milestone) => {
        this.progress(
          job.id,
          { jobId: job.id, percent: u.percent, downloaded: u.downloaded, total: u.total, eta: u.eta, milestone },
          milestone !== null || u.percent >= 100,
        );
      },
      onStage: (job, stage) => this.o.send("job:stage", { jobId: job.id, stage }),
      onDone: (job, file) => {
        const folder = path.dirname(file);
        this.results.set(job.id, { file, folder });
        const title = this.title || path.basename(file);
        this.o.send("job:done", { jobId: job.id, title, folder, isPlaylist: false });
        this.o.onFinished?.("done", title, { folder });
      },
      onError: (job, code) => {
        this.o.send("job:error", { jobId: job.id, code });
        this.o.onFinished?.("error", this.title, { code });
      },
      onCancelled: (job) => {
        const kept = job instanceof PlaylistJob ? job.files.length : 0;
        const folder = job instanceof PlaylistJob && kept ? job.targetFolder : null;
        if (folder) this.results.set(job.id, { file: null, folder });
        this.o.send("job:cancelled", { jobId: job.id, kept, folder });
        this.o.onFinished?.("cancelled", this.title, {});
      },
      onPlaylistInfo: (job, info) => {
        this.title = info.title;
        this.o.send("job:playlistInfo", { jobId: job.id, title: info.title, count: job.total, folder: job.folder });
      },
      onItem: (job, index, total, title, entry) => {
        this.o.send("job:item", { jobId: job.id, index, total, title });
        if (entry?.id && this.o.settings().thumbnails) {
          void this.thumbnail(entry.id).then((dataUrl) => {
            if (this.job === job) this.o.send("job:thumbnail", { jobId: job.id, index, dataUrl });
          });
        }
      },
      onPlaylistProgress: (job, index, total, u, percent) => {
        const now = Date.now();
        if (now - this.lastProgress < PROGRESS_INTERVAL_MS && u.percent < 100) return;
        this.lastProgress = now;
        this.o.send("job:itemProgress", { jobId: job.id, index, total, itemPercent: u.percent, percent });
        this.o.onProgress?.(percent);
      },
      onPlaylistDone: (job, folder, done, total) => {
        this.results.set(job.id, { file: null, folder });
        this.o.send("job:done", { jobId: job.id, title: this.title, folder, isPlaylist: true, done, total });
        this.o.onFinished?.("done", this.title, { folder });
      },
    };
  }

  /** The version shown in Settings. */
  version(): Promise<string> {
    return this.o.binaries.version();
  }
}
