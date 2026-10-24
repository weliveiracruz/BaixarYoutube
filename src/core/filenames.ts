// Baixar YouTube - filenames.ts
// Safe Windows file names from video titles, without overwriting anything (RF-10, RS-04).
// Port of core/filenames.py of YouTubeDownloaderNVDA.

import * as fs from "node:fs";
import * as path from "node:path";

export const MAX_NAME = 120;
// eslint-disable-next-line no-control-regex
const INVALID = /[<>:"/\\|?*\x00-\x1f\x7f]/g;
const SPACES = /\s+/gu;
export const RESERVED: ReadonlySet<string> = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
]);

function stripChars(text: string, chars: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && chars.includes(text[start])) start++;
  while (end > start && chars.includes(text[end - 1])) end--;
  return text.slice(start, end);
}

/** A file name (without extension) that Windows accepts and that never leaves the folder. */
export function safeName(title: string | null | undefined, fallback = "video"): string {
  let name = (title ?? "").replace(INVALID, " ");
  name = stripChars(name.replace(SPACES, " "), " .");
  const chars = Array.from(name);
  if (chars.length > MAX_NAME) name = stripChars(chars.slice(0, MAX_NAME).join(""), " .").replace(/[ .]+$/, "");
  if (!name || /^\.+$/.test(name)) name = fallback;
  if (RESERVED.has(name.split(".")[0].trim().toUpperCase())) name = "_" + name;
  return name;
}

function taken(folder: string, base: string): boolean {
  const lower = base.toLowerCase();
  const prefix = lower + ".";
  let names: string[];
  try {
    names = fs.readdirSync(folder);
  } catch {
    return false;
  }
  return names.some((n) => n.toLowerCase() === lower || n.toLowerCase().startsWith(prefix));
}

/** Full path without extension, so that no file of the folder starts with it
 * (<name>, <name> (2), <name> (3)...). This also makes the cleanup of a
 * cancelled download safe: every file starting with it belongs to this download. */
export function uniqueBase(folder: string, name: string): string {
  let base = name;
  let n = 2;
  while (taken(folder, base)) {
    base = `${name} (${n})`;
    n += 1;
  }
  const full = path.join(folder, base);
  if (!isInside(folder, full)) throw new Error("path outside the folder");
  return full;
}

/** yt-dlp output template for this path: % is a template character. */
export function outputTemplate(basePath: string): string {
  return basePath.replaceAll("%", "%%") + ".%(ext)s";
}

/** yt-dlp output template inside the playlist folder: "001 - <title>.<ext>".
 * The position keeps the playlist order and makes equal titles different;
 * yt-dlp itself removes the characters Windows does not accept (--windows-filenames). */
export function playlistTemplate(folder: string): string {
  return path.join(folder.replaceAll("%", "%%"), "%(playlist_index)03d - %(title)s.%(ext)s");
}

function norm(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function isInside(folder: string, target: string): boolean {
  const f = norm(folder);
  const t = norm(target);
  if (t === f) return false;
  const rel = path.relative(f, t);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}

/** Files that a download to basePath leaves behind (.part, .ytdl, .f137.mp4...). */
export function partialFiles(basePath: string): string[] {
  const folder = path.dirname(basePath);
  const prefix = path.basename(basePath).toLowerCase() + ".";
  let names: string[];
  try {
    names = fs.readdirSync(folder);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.toLowerCase().startsWith(prefix))
    .map((n) => path.join(folder, n))
    .sort();
}
