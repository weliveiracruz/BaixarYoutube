// Baixar YouTube - binaries.ts
// The programs shipped with the app (resources/bin/yt-dlp.exe, resources/bin/ffmpeg)
// and the updated copy of yt-dlp kept in the user's folder (SDD 4.4, RF-12, RS-03).
// Port of core/binaries.py of YouTubeDownloaderNVDA.

import { execFile, type SpawnOptions } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const YTDLP = "yt-dlp.exe";
const VERSION = /\b(\d{4}\.\d{2}\.\d{2}(?:\.\d+)?)\b/;

/** Options for every process started by the app: no console window, no input,
 * UTF-8 output, never a shell (RS-02). */
export function processOptions(): SpawnOptions {
  return {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  };
}

export type RunResult = [code: number, output: string];
export type Runner = (cmd: string[], timeoutMs?: number) => Promise<RunResult>;

/** (exit code, stdout + stderr) of a command given as a list (never a shell). */
export const runCommand: Runner = (cmd, timeoutMs = 180000) =>
  new Promise((resolve) => {
    const opts = processOptions();
    execFile(
      cmd[0],
      cmd.slice(1),
      { shell: false, windowsHide: true, env: opts.env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        const out = (stdout ?? "") + (stderr ?? "");
        if (error) {
          // A non-zero exit gives the exit code; ENOENT, a timeout or a kill give -1.
          const exit = (error as { code?: unknown }).code;
          resolve([typeof exit === "number" && exit !== 0 ? exit : -1, out || error.message]);
          return;
        }
        resolve([0, out]);
      },
    );
  });

/** [2026, 10, 21, 0] for '2026.10.21'; [] when there is no version. */
export function versionKey(text: string | null | undefined): number[] {
  const m = VERSION.exec(text ?? "");
  if (!m) return [];
  const numbers = m[1].split(".").map(Number);
  while (numbers.length < 4) numbers.push(0);
  return numbers;
}

export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/** appBin: the app's bin folder (read only). userBin: where the updated yt-dlp goes. */
export class Binaries {
  private verified: string[] | null = null;
  private verifying: Promise<string[]> | null = null;

  constructor(
    readonly appBin: string,
    readonly userBin: string,
    private readonly run: Runner = runCommand,
  ) {}

  get bundledYtdlp(): string {
    return path.join(this.appBin, YTDLP);
  }

  get userYtdlp(): string {
    return path.join(this.userBin, YTDLP);
  }

  get ffmpegDir(): string {
    return path.join(this.appBin, "ffmpeg");
  }

  bundledVersion(): string {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(this.appBin, "versions.json"), "utf8"));
      return typeof data?.ytdlp === "string" ? data.ytdlp : "";
    } catch {
      return "";
    }
  }

  userVersion(): string {
    try {
      return fs.readFileSync(path.join(this.userBin, "version.txt"), "utf8").trim();
    } catch {
      return "";
    }
  }

  /** The updated copy when it exists and is newer than the shipped one
   * (a new app version may bring a newer yt-dlp than an old update). */
  ytdlpPath(): string {
    if (fs.existsSync(this.userYtdlp) && compareVersions(versionKey(this.userVersion()), versionKey(this.bundledVersion())) > 0) {
      return this.userYtdlp;
    }
    return this.bundledYtdlp;
  }

  ytdlpCommand(): string[] {
    return [this.ytdlpPath()];
  }

  /** Problems of the shipped files compared with bin/files.sha256 (empty list
   * when everything is right). Checked once per session unless forced. */
  verify(force = false): Promise<string[]> {
    if (this.verified && !force) return Promise.resolve([...this.verified]);
    if (this.verifying && !force) return this.verifying;
    this.verifying = this.doVerify().then((problems) => {
      this.verified = problems;
      this.verifying = null;
      return [...problems];
    });
    return this.verifying;
  }

  private async doVerify(): Promise<string[]> {
    const problems: string[] = [];
    let lines: string[] = [];
    try {
      lines = fs
        .readFileSync(path.join(this.appBin, "files.sha256"), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim());
    } catch {
      problems.push("files.sha256");
    }
    const root = path.normalize(this.appBin) + path.sep;
    for (const line of lines) {
      const sep = line.indexOf("  ");
      const digest = sep >= 0 ? line.slice(0, sep) : line;
      const rel = sep >= 0 ? line.slice(sep + 2) : "";
      const file = path.normalize(path.join(this.appBin, rel));
      if (!rel || !file.startsWith(root)) {
        problems.push(rel);
        continue;
      }
      try {
        if ((await sha256File(file)) !== digest) problems.push(rel);
      } catch {
        problems.push(rel);
      }
    }
    if (lines.length && !lines.some((l) => l.endsWith("  " + YTDLP))) problems.push(YTDLP);
    return problems;
  }

  async version(): Promise<string> {
    const [code, out] = await this.run([...this.ytdlpCommand(), "--version"], 120000);
    if (code !== 0) return "";
    const m = VERSION.exec(out);
    return m ? m[1] : "";
  }

  /** Updates the yt-dlp copy of the user folder with yt-dlp's own updater
   * (it checks the release signatures). */
  async update(): Promise<{ status: "updated" | "current" | "failed"; version: string }> {
    try {
      fs.mkdirSync(this.userBin, { recursive: true });
      const current = this.ytdlpPath();
      if (current !== this.userYtdlp) {
        fs.copyFileSync(current, this.userYtdlp);
        this.writeUserVersion(this.bundledVersion());
      }
    } catch (e) {
      return { status: "failed", version: String(e) };
    }
    let [code, out] = await this.run([this.userYtdlp, "-U"], 300000);
    if (code !== 0) return { status: "failed", version: out.slice(-300) };
    const updated = /Updated yt-dlp to \S*?(\d{4}\.\d{2}\.\d{2}(?:\.\d+)?)/.exec(out);
    if (updated) {
      this.writeUserVersion(updated[1]);
      return { status: "updated", version: updated[1] };
    }
    [code, out] = await this.run([this.userYtdlp, "--version"], 120000);
    const m = code === 0 ? VERSION.exec(out) : null;
    if (m) {
      this.writeUserVersion(m[1]);
      return { status: "current", version: m[1] };
    }
    return { status: "failed", version: out.slice(-300) };
  }

  private writeUserVersion(version: string): void {
    fs.writeFileSync(path.join(this.userBin, "version.txt"), version, "utf8");
  }
}
