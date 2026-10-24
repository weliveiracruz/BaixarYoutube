// Baixar YouTube - settings.ts
// %APPDATA%\BaixarYoutube\settings.json, read and written with a closed schema (SDD 8, RS-07).

import * as fs from "node:fs";
import * as path from "node:path";

import { DEFAULT as DEFAULT_FORMAT, isFormat } from "../core/formats";
import { isLanguage, type Language } from "../shared/strings";
import { DEFAULT_SHORTCUT, type Settings, type SettingKey } from "../shared/types";

const ACCELERATOR = /^(?:(?:Control|Alt|Shift)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/;

export function isAccelerator(value: unknown): value is string {
  return typeof value === "string" && ACCELERATOR.test(value) && /Control|Alt/.test(value) && new Set(value.split("+")).size === value.split("+").length;
}

/** Whether `value` is valid for `key`; folder is set only through the folder dialog. */
export function validSetting(key: string, value: unknown): key is SettingKey {
  switch (key) {
    case "format":
      return isFormat(value);
    case "announce":
      return value === 10 || value === 25 || value === 0;
    case "theme":
      return value === "system" || value === "light" || value === "dark";
    case "motion":
      return value === "system" || value === "on" || value === "off";
    case "language":
      return isLanguage(value);
    case "thumbnails":
    case "shortcutEnabled":
    case "startWithWindows":
    case "noticeSeen":
      return typeof value === "boolean";
    case "shortcut":
      return isAccelerator(value);
    default:
      return false;
  }
}

export function defaults(downloads: string, locale: string): Settings {
  const language: Language = locale.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
  return {
    folder: downloads,
    format: DEFAULT_FORMAT,
    announce: 10,
    theme: "system",
    motion: "system",
    thumbnails: true,
    language,
    shortcutEnabled: true,
    shortcut: DEFAULT_SHORTCUT,
    startWithWindows: false,
    noticeSeen: false,
  };
}

export class SettingsStore {
  private data: Settings;

  constructor(
    private readonly file: string,
    private readonly base: Settings,
    private readonly folderExists: (folder: string) => boolean,
  ) {
    this.data = { ...base };
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      for (const [key, value] of Object.entries(raw)) {
        if (validSetting(key, value)) (this.data as unknown as Record<string, unknown>)[key] = value;
      }
      if (typeof raw.folder === "string" && path.isAbsolute(raw.folder)) this.data.folder = raw.folder;
    } catch {
      // first run or damaged file: defaults
    }
  }

  /** The settings; a folder that no longer exists goes back to Downloads (RF-03). */
  get(): Settings {
    if (!this.folderExists(this.data.folder)) this.data.folder = this.base.folder;
    return { ...this.data };
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.data[key] = value;
    this.save();
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf8");
      fs.renameSync(tmp, this.file);
    } catch {
      // read-only profile: the settings last for this session
    }
  }
}
