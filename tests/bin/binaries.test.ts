// Tests of the real shipped programs (BIN-xx), without network: integrity, versions, and that
// the real yt-dlp accepts every command the app builds. Port of tests/test_binaries.py.
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { Binaries, runCommand } from "../../src/core/binaries";
import * as engine from "../../src/core/engine";
import { FORMATS } from "../../src/core/formats";
import { ROOT, tempFolder } from "../unit/helpers";

const BIN = path.join(ROOT, "resources", "bin");
const pins = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "binaries.json"), "utf8"));

/** A video information file as yt-dlp writes it, with local (unreachable) URLs. */
function fakeInfo(folder: string): string {
  const fmt = (format_id: string, ext: string, vcodec: string, acodec: string, height?: number, size = 1000) => ({
    format_id,
    ext,
    vcodec,
    acodec,
    url: `http://127.0.0.1:9/${format_id}`,
    protocol: "https",
    filesize: size,
    ...(height ? { height, width: Math.floor((height * 16) / 9) } : {}),
  });
  const info = {
    id: "jNQXAC9IVRw",
    title: "Me at the zoo",
    extractor: "youtube",
    extractor_key: "Youtube",
    webpage_url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    _type: "video",
    duration: 19,
    formats: [
      fmt("18", "mp4", "avc1.42001E", "mp4a.40.2", 360),
      fmt("140", "m4a", "none", "mp4a.40.2"),
      fmt("251", "webm", "none", "opus"),
      fmt("134", "mp4", "avc1.4d401e", "none", 360),
      fmt("136", "mp4", "avc1.4d401f", "none", 720),
      fmt("137", "mp4", "avc1.640028", "none", 1080),
      // AV1 at the same resolution, bigger: H.264 must still win (plays everywhere).
      fmt("399", "mp4", "av01.0.08M.08", "none", 1080, 5000),
    ],
  };
  const file = path.join(folder, "info.json");
  fs.writeFileSync(file, JSON.stringify(info));
  return file;
}

describe("Shipped programs", () => {
  it("BIN-01 resources/bin matches files.sha256 and the pinned yt-dlp", async () => {
    // @ts-expect-error plain JavaScript module of the tools folder
    const { check } = await import("../../tools/fetch-binaries.mjs");
    expect(check()).toEqual([]);
    expect(await new Binaries(BIN, tempFolder()).verify()).toEqual([]);
  });

  it("BIN-02 the real yt-dlp runs and is the pinned version", async () => {
    const b = new Binaries(BIN, tempFolder());
    expect(await b.version()).toBe(pins.ytdlp.version);
    expect(b.bundledVersion()).toBe(pins.ytdlp.version);
  });

  it("BIN-03 ffmpeg and ffprobe run (DLLs present)", async () => {
    const b = new Binaries(BIN, tempFolder());
    for (const exe of ["ffmpeg.exe", "ffprobe.exe"]) {
      const [code, out] = await runCommand([path.join(b.ffmpegDir, exe), "-hide_banner", "-version"], 60000);
      expect(code, out.slice(0, 200)).toBe(0);
      expect(out).toContain(pins.ffmpeg.version.split("-")[1]);
    }
  });

  it("BIN-04 the real yt-dlp accepts the download command of every format", async () => {
    const b = new Binaries(BIN, tempFolder());
    const folder = tempFolder();
    const info = fakeInfo(folder);
    const expected: Record<string, string[]> = {
      mp4best: ["137+140"],
      mp4_720: ["136+140"],
      mp4_360: ["18", "134+140"],
      mp3: ["251", "140"],
      m4a: ["140"],
    };
    for (const key of FORMATS) {
      let cmd = engine.downloadCommand(b.ytdlpCommand(), b.ffmpegDir, "https://www.youtube.com/watch?v=jNQXAC9IVRw", key, path.join(folder, "Me at the zoo"));
      cmd = [...cmd.slice(0, -2), "--simulate", "--no-warnings", "--print", "%(format_id)s", "--load-info-json", info];
      const [code, out] = await runCommand(cmd, 120000);
      const lines = out.trim().split(/\r?\n/);
      expect(code, out.slice(-300)).toBe(0);
      expect(expected[key], key).toContain(lines[lines.length - 1]);
    }
    expect(fs.readdirSync(folder)).toEqual(["info.json"]);
  });

  it("BIN-05 licenses are shipped", () => {
    for (const name of ["yt-dlp-LICENSE.txt", path.join("ffmpeg", "LICENSE.txt")]) expect(fs.statSync(path.join(BIN, name)).size).toBeGreaterThan(500);
  });

  it("BIN-06 the real yt-dlp accepts every option of the playlist command", async () => {
    const b = new Binaries(BIN, tempFolder());
    const folder = tempFolder();
    const info = fakeInfo(folder);
    const target = path.join(folder, "Lista");
    let cmd = engine.playlistDownloadCommand(b.ytdlpCommand(), b.ffmpegDir, "https://www.youtube.com/playlist?list=PLtest", "mp3", target, 5);
    cmd = [...cmd.slice(0, -2), "--simulate", "--no-warnings", "--print", "%(filename)s", "--load-info-json", info];
    const [code, out] = await runCommand(cmd, 120000);
    expect(code, out.slice(-400)).toBe(0);
    const names = out.split(/\r?\n/).filter((l) => l.startsWith(target + path.sep));
    expect(names.length).toBe(1);
    expect(names[0]).toContain(" - Me at the zoo.");
    expect(fs.existsSync(target)).toBe(false);
  });
});
