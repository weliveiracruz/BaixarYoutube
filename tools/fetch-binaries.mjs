// Downloads the programs shipped with the app (yt-dlp and FFmpeg), checks the
// SHA-256 pinned in tools/binaries.json and installs them in resources/bin (SDD 4.4, RS-03).
// Port of tools/fetch_binaries.py of YouTubeDownloaderNVDA.
//
// Usage:  node tools/fetch-binaries.mjs [--check]
//   --check   only checks resources/bin against resources/bin/files.sha256 (no network)
//
// The downloads are kept in .cache/ (not in git); resources/bin is also not in git.

import { execFileSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
const CACHE = path.join(ROOT, ".cache");
export const BIN = path.join(ROOT, "resources", "bin");
const PINS = path.join(HERE, "binaries.json");
// Files of the FFmpeg "shared" build that yt-dlp needs (ffplay and SDL are left out).
const FFMPEG_KEEP = ["ffmpeg.exe", "ffprobe.exe"];
const FFMPEG_DLL_PREFIXES = ["avcodec", "avdevice", "avfilter", "avformat", "avutil", "postproc", "swresample", "swscale"];
const META = new Set(["files.sha256", "versions.json", ".gitkeep"]);

export function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function download(url, target, expected) {
  if (!url.startsWith("https://")) throw new Error(`refused: ${url} is not https`);
  if (fs.existsSync(target) && (!expected || sha256(target) === expected)) {
    console.log(`cached: ${path.basename(target)}`);
    return target;
  }
  console.log(`downloading ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const tmp = target + ".download";
  fs.writeFileSync(tmp, Buffer.from(await response.arrayBuffer()));
  if (expected && sha256(tmp) !== expected) {
    fs.unlinkSync(tmp);
    throw new Error(`SHA-256 mismatch for ${url}: the file was removed`);
  }
  fs.renameSync(tmp, target);
  return target;
}

function binFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!META.has(entry.name)) out.push(path.relative(BIN, full).replaceAll(path.sep, "/"));
    }
  };
  if (fs.existsSync(BIN)) walk(BIN);
  return out.sort();
}

function writeManifest(pins) {
  const lines = binFiles().map((rel) => `${sha256(path.join(BIN, rel))}  ${rel}`);
  fs.writeFileSync(path.join(BIN, "files.sha256"), lines.join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(BIN, "versions.json"), JSON.stringify({ ytdlp: pins.ytdlp.version, ffmpeg: pins.ffmpeg.version }, null, 1), "utf8");
}

async function fetchAll() {
  const pins = JSON.parse(fs.readFileSync(PINS, "utf8"));
  fs.mkdirSync(CACHE, { recursive: true });
  const ytdlp = await download(pins.ytdlp.url, path.join(CACHE, `yt-dlp-${pins.ytdlp.version}.exe`), pins.ytdlp.sha256);
  const license = await download(pins.ytdlp.license, path.join(CACHE, `yt-dlp-LICENSE-${pins.ytdlp.version}.txt`));
  const ffzip = await download(pins.ffmpeg.url, path.join(CACHE, path.basename(pins.ffmpeg.url)), pins.ffmpeg.sha256);

  fs.rmSync(BIN, { recursive: true, force: true });
  const ffDir = path.join(BIN, "ffmpeg");
  fs.mkdirSync(ffDir, { recursive: true });
  fs.writeFileSync(path.join(BIN, ".gitkeep"), "");
  fs.copyFileSync(ytdlp, path.join(BIN, "yt-dlp.exe"));
  fs.copyFileSync(license, path.join(BIN, "yt-dlp-LICENSE.txt"));
  // Windows' own tar (bsdtar) reads zip files; it extracts into an empty temporary folder
  // and only the needed files are copied, by base name (no path from the zip reaches resources/bin).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baixar-ffmpeg-"));
  const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  execFileSync(tar, ["-xf", ffzip, "-C", tmp], { stdio: "inherit" });
  const [top] = fs.readdirSync(tmp);
  const binDir = path.join(tmp, top, "bin");
  for (const name of fs.readdirSync(binDir)) {
    const keep = FFMPEG_KEEP.includes(name) || (name.endsWith(".dll") && FFMPEG_DLL_PREFIXES.some((p) => name.startsWith(p)));
    if (keep) fs.copyFileSync(path.join(binDir, name), path.join(ffDir, path.basename(name)));
  }
  fs.copyFileSync(path.join(tmp, top, "LICENSE.txt"), path.join(ffDir, "LICENSE.txt"));
  fs.rmSync(tmp, { recursive: true, force: true });
  writeManifest(pins);
  console.log("resources/bin ready");
}

/** The problems of resources/bin (empty list when everything matches). */
export function check() {
  const manifest = path.join(BIN, "files.sha256");
  if (!fs.existsSync(manifest)) return ["resources/bin/files.sha256 not found: run npm run fetch-binaries"];
  const pins = JSON.parse(fs.readFileSync(PINS, "utf8"));
  const problems = [];
  const listed = new Map();
  for (const line of fs.readFileSync(manifest, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const i = line.indexOf("  ");
    listed.set(line.slice(i + 2), line.slice(0, i));
  }
  for (const [rel, digest] of listed) {
    const file = path.join(BIN, rel);
    if (!fs.existsSync(file)) problems.push(`missing ${rel}`);
    else if (sha256(file) !== digest) problems.push(`changed ${rel}`);
  }
  for (const rel of binFiles()) if (!listed.has(rel)) problems.push(`not listed ${rel}`);
  if (listed.get("yt-dlp.exe") !== pins.ytdlp.sha256) problems.push("yt-dlp.exe is not the version pinned in tools/binaries.json");
  for (const rel of ["yt-dlp.exe", "ffmpeg/ffmpeg.exe", "ffmpeg/ffprobe.exe", "ffmpeg/LICENSE.txt", "yt-dlp-LICENSE.txt"]) {
    if (!listed.has(rel)) problems.push(`required file not listed: ${rel}`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const found = check();
    console.log(found.join("\n") || "resources/bin OK");
    process.exit(found.length ? 1 : 0);
  }
  await fetchAll();
  const found = check();
  if (found.length) {
    console.error(found.join("\n"));
    process.exit(1);
  }
}
