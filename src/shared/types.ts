// Baixar YouTube - types.ts
// Settings and the IPC contract between the main process and the window (SDD 7).

import type { ErrorCode } from "../core/errors";
import type { FormatKey } from "../core/formats";
import type { Language, Strings } from "./strings";

export type Announce = 10 | 25 | 0;
export type Theme = "system" | "light" | "dark";
export type Motion = "system" | "on" | "off";

export interface Settings {
  folder: string;
  format: FormatKey;
  announce: Announce;
  theme: Theme;
  motion: Motion;
  thumbnails: boolean;
  language: Language;
  shortcutEnabled: boolean;
  shortcut: string;
  startWithWindows: boolean;
  noticeSeen: boolean;
}

export const DEFAULT_SHORTCUT = "Control+Alt+Y";

export type SettingKey = Exclude<keyof Settings, "folder">;

export interface AppState {
  settings: Settings;
  strings: Strings;
  clipboardLink: string | null;
  busy: boolean;
  version: string;
  /** Text of the global shortcut for messages ("Ctrl+Alt+Y"), or "" when off. */
  shortcutText: string;
}

export type LinkKind = "video" | "playlist" | "both";

export type CheckResult = { ok: true; kind: LinkKind; canonical: string; video: string | null } | { ok: false; reason: "empty" | "host" | "video" };

export type StartRequest = { url: string; format: FormatKey; mode: "video" | "playlist" };
export type StartResult = { ok: true; jobId: number } | { ok: false; error: "url" | "folder" | "busy"; reason?: string };

export interface ProgressPayload {
  jobId: number;
  percent: number;
  downloaded: number;
  total: number | null;
  eta: number | null;
  milestone: number | null;
}

/** Events from the main process to the window. */
export interface Events {
  "preview:thumbnail": { token: number; dataUrl: string | null };
  "preview:info":
    | { token: number; kind: "video"; title: string; channel: string; duration: number | null }
    | { token: number; kind: "playlist"; title: string; count: number }
    | { token: number; kind: "error"; code: ErrorCode };
  "job:info": { jobId: number; title: string; channel: string; duration: number | null };
  "job:playlistInfo": { jobId: number; title: string; count: number; folder: string };
  "job:progress": ProgressPayload;
  "job:item": { jobId: number; index: number; total: number; title: string };
  "job:itemProgress": { jobId: number; index: number; total: number; itemPercent: number; percent: number };
  "job:thumbnail": { jobId: number; index: number; dataUrl: string | null };
  "job:stage": { jobId: number; stage: "merging" | "converting" };
  "job:done": { jobId: number; title: string; folder: string; isPlaylist: boolean; done?: number; total?: number };
  "job:error": { jobId: number; code: ErrorCode };
  "job:cancelled": { jobId: number; kept: number; folder: string | null };
  "window:shown": { clipboardLink: string | null };
  "window:closeRequest": Record<string, never>;
  "app:settings": { settings: Settings; strings: Strings; shortcutText: string };
  "app:openSettings": Record<string, never>;
}

export type EventName = keyof Events;
export const EVENT_NAMES: readonly EventName[] = [
  "preview:thumbnail",
  "preview:info",
  "job:info",
  "job:playlistInfo",
  "job:progress",
  "job:item",
  "job:itemProgress",
  "job:thumbnail",
  "job:stage",
  "job:done",
  "job:error",
  "job:cancelled",
  "window:shown",
  "window:closeRequest",
  "app:settings",
  "app:openSettings",
];

/** What the preload exposes as window.baixar. */
export interface BaixarApi {
  getState(): Promise<AppState>;
  checkUrl(url: string): Promise<CheckResult>;
  /** token: chosen by the window (always growing); the preview events carry it back. */
  preview(url: string, format: FormatKey, token: number): Promise<void>;
  chooseFolder(forSettings: boolean): Promise<string | null>;
  start(request: StartRequest): Promise<StartResult>;
  confirmPlaylist(jobId: number, yes: boolean): Promise<void>;
  cancel(jobId: number): Promise<void>;
  open(jobId: number, what: "file" | "folder"): Promise<{ ok: boolean }>;
  close(): Promise<void>;
  closeChoice(choice: "background" | "cancel" | "back"): Promise<void>;
  setSetting<K extends SettingKey>(key: K, value: Settings[K]): Promise<{ ok: boolean; error?: "taken" | "invalid" }>;
  ytdlpVersion(): Promise<string>;
  updateEngine(): Promise<{ status: "updated" | "current" | "failed"; version: string }>;
  openManual(): Promise<void>;
  on<E extends EventName>(event: E, listener: (payload: Events[E]) => void): () => void;
}
