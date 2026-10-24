// Functional tests of the core (FUN-xx), ported from tests/test_pure.py of YouTubeDownloaderNVDA.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import * as binaries from "../../src/core/binaries";
import * as engine from "../../src/core/engine";
import * as errors from "../../src/core/errors";
import * as filenames from "../../src/core/filenames";
import * as folders from "../../src/core/folders";
import * as formats from "../../src/core/formats";
import * as progress from "../../src/core/progress";
import * as urls from "../../src/core/urls";
import {
  FAKE_PREFIX,
  LIST_ID,
  PLAYLIST,
  Recorder,
  VIDEO,
  configureFake,
  fakeCalls,
  runJob,
  runPlaylist,
  sleep,
  tempFolder,
  until,
} from "./helpers";

function reason(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof urls.InvalidUrl ? e.reason : "other";
  }
}

describe("Urls", () => {
  it("FUN-01 accepts every video link form", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=jNQXAC9IVRw",
      "http://youtube.com/watch?v=jNQXAC9IVRw&t=10s",
      "https://m.youtube.com/watch?v=jNQXAC9IVRw&list=PL123&index=2",
      "https://music.youtube.com/watch?v=jNQXAC9IVRw&feature=share",
      "https://youtu.be/jNQXAC9IVRw?si=abc",
      "youtu.be/jNQXAC9IVRw",
      "www.youtube.com/watch?v=jNQXAC9IVRw",
      "https://www.youtube.com/shorts/jNQXAC9IVRw",
      "https://www.youtube.com/live/jNQXAC9IVRw?feature=share",
      "https://www.youtube.com/embed/jNQXAC9IVRw",
      "  https://WWW.YOUTUBE.COM/watch?v=jNQXAC9IVRw  ",
      "https://www.youtube.com:443/watch?v=jNQXAC9IVRw",
    ]) {
      expect(urls.normalize(url), url).toBe(VIDEO);
    }
  });

  it("FUN-02 refuses other sites and non-video links", () => {
    const cases: Record<string, string> = {
      "": "empty",
      "   ": "empty",
      "https://vimeo.com/123": "host",
      "https://youtube.com.evil.example/watch?v=jNQXAC9IVRw": "host",
      "https://evil.example/youtube.com/watch?v=jNQXAC9IVRw": "host",
      "https://evil.example/?u=https://youtu.be/jNQXAC9IVRw": "host",
      "https://user@www.youtube.com/watch?v=jNQXAC9IVRw": "host",
      "https://@www.youtube.com/watch?v=jNQXAC9IVRw": "host",
      "https://www.youtube.com:8080/watch?v=jNQXAC9IVRw": "host",
      "ftp://www.youtube.com/watch?v=jNQXAC9IVRw": "host",
      "javascript:alert(1)": "host",
      "file:///C:/Windows/win.ini": "host",
      "--exec calc": "host",
      "https://www.youtube.com/watch?v=jNQXAC9IVRw\n--exec": "host",
      "https://evil.example\\@www.youtube.com/watch?v=jNQXAC9IVRw": "host",
      "https://www.youtube.com/playlist?list=PL123": "video",
      "https://www.youtube.com/@channel": "video",
      "https://www.youtube.com/watch?v=short": "video",
      "https://www.youtube.com/watch?v=jNQXAC9IVRw&v=aaaaaaaaaaa": "video",
      "https://youtu.be/": "video",
      ["https://www.youtube.com/watch?v=" + "a".repeat(3000)]: "host",
    };
    for (const [url, why] of Object.entries(cases)) expect(reason(() => urls.normalize(url)), url).toBe(why);
  });

  it("FUN-03 finds the link in the clipboard text", () => {
    expect(urls.findInText("veja isto: https://youtu.be/jNQXAC9IVRw.")).toBe(VIDEO);
    expect(urls.findInText("https://vimeo.com/1 e (youtube.com/watch?v=jNQXAC9IVRw)")).toBe(VIDEO);
    expect(urls.findInText("nenhum link aqui")).toBeNull();
    expect(urls.findInText("https://www.youtube.com/@canal")).toBeNull();
    expect(urls.findInText("")).toBeNull();
    expect(urls.findInText(null)).toBeNull();
  });

  it("FUN-21 playlist links", () => {
    const P = (video: string | null, playlist: string | null) => ({ video, playlist });
    expect(urls.parse(PLAYLIST)).toEqual(P(null, LIST_ID));
    expect(urls.parse(`https://www.youtube.com/watch?v=jNQXAC9IVRw&list=${LIST_ID}&index=3`)).toEqual(P("jNQXAC9IVRw", LIST_ID));
    expect(urls.parse(`https://youtu.be/jNQXAC9IVRw?list=${LIST_ID}`)).toEqual(P("jNQXAC9IVRw", LIST_ID));
    expect(urls.parse("https://music.youtube.com/playlist?list=OLAK5uy_kAbCdEfGhIjKlMnOpQrStUvWxYz012345")).toEqual(
      P(null, "OLAK5uy_kAbCdEfGhIjKlMnOpQrStUvWxYz012345"),
    );
    expect(urls.parse(`https://www.youtube.com/shorts/jNQXAC9IVRw?list=${LIST_ID}`)).toEqual(P("jNQXAC9IVRw", null));
    expect(urls.playlistUrl(urls.parse(`https://www.youtube.com/watch?v=jNQXAC9IVRw&list=${LIST_ID}`))).toBe(PLAYLIST);
    const mix = urls.parse("https://www.youtube.com/watch?v=jNQXAC9IVRw&list=RDjNQXAC9IVRw");
    expect(urls.playlistUrl(mix)).toBe("https://www.youtube.com/watch?v=jNQXAC9IVRw&list=RDjNQXAC9IVRw");
    expect(urls.videoUrl(mix)).toBe(VIDEO);
    expect(urls.normalize(`https://www.youtube.com/watch?v=jNQXAC9IVRw&list=${LIST_ID}`)).toBe(VIDEO);
    expect(urls.canonical(urls.parse(`youtu.be/jNQXAC9IVRw?list=${LIST_ID}&si=x`))).toBe(
      "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=" + LIST_ID,
    );
    expect(urls.findInText(`ouça: ${PLAYLIST}.`)).toBe(PLAYLIST);
    for (const bad of [
      "https://www.youtube.com/playlist?list=WL",
      "https://www.youtube.com/playlist?list=LL",
      "https://www.youtube.com/playlist",
      "https://www.youtube.com/playlist?list=PL%3Cscript%3Ezzzzzzzz",
      `https://www.youtube.com/playlist?list=${LIST_ID}&list=${LIST_ID}`,
    ]) {
      expect(reason(() => urls.parse(bad)), bad).not.toBeNull();
    }
    expect(reason(() => urls.videoId(PLAYLIST))).toBe("video");
  });
});

describe("Formats", () => {
  it("FUN-04 arguments of each format", () => {
    expect(formats.FORMATS).toEqual(["mp4best", "mp4_720", "mp4_360", "mp3", "m4a"]);
    for (const key of ["mp4best", "mp4_720", "mp4_360"] as const) {
      const a = formats.args(key);
      expect(formats.extension(key)).toBe("mp4");
      expect(a).toContain("--merge-output-format");
      expect(a[a.indexOf("--remux-video") + 1]).toBe("mp4");
      expect(a[a.indexOf("-S") + 1]).toBe("res,fps,vcodec:h264,acodec:aac");
      expect(a).not.toContain("-x");
      expect(formats.selector(key).endsWith("/b")).toBe(true);
    }
    expect(formats.selector("mp4_720")).toContain("[height<=720]");
    expect(formats.selector("mp4_360")).toContain("[height<=360]");
    expect(formats.selector("mp4best")).not.toContain("height");
    const mp3 = formats.args("mp3");
    expect(mp3[mp3.indexOf("--audio-format") + 1]).toBe("mp3");
    expect(mp3).toContain("-x");
    expect(mp3).not.toContain("-S");
    expect(formats.extension("m4a")).toBe("m4a");
    expect(formats.isAudio("m4a") && !formats.isAudio("mp4best")).toBe(true);
    expect(() => formats.args("exe" as formats.FormatKey)).toThrow();
  });
});

describe("Progress", () => {
  it("FUN-05 parses the progress lines", () => {
    expect(progress.parseLine("BAIXARYT|D|downloading|1024|2048|NA|5|300.5\r\n")).toEqual({
      kind: "download",
      status: "downloading",
      downloaded: 1024,
      total: 2048,
      eta: 5,
      speed: 300.5,
    });
    const e = progress.parseLine("BAIXARYT|D|downloading|1024|NA|4096.0|NA|NA") as progress.Download;
    expect([e.total, e.eta, e.speed]).toEqual([4096, null, null]);
    expect(progress.parseLine("BAIXARYT|P|started|Merger")).toEqual({ kind: "postprocess", status: "started", name: "Merger" });
    expect(progress.parseLine("BAIXARYT|F|C:\\a\\b.mp4")).toEqual({ kind: "file", path: "C:\\a\\b.mp4" });
    for (const line of ["[download] 10%", "", "BAIXARYT|D|x", "BAIXARYT|Z|a|b", "XBAIXARYT|D|downloading|1|2|3|4|5"]) {
      expect(progress.parseLine(line), line).toBeNull();
    }
    const n = progress.parseLine("BAIXARYT|D|downloading|nan|-5|NA|NA|NA") as progress.Download;
    expect([n.downloaded, n.total]).toEqual([null, null]);
    expect(progress.DOWNLOAD_TEMPLATE).toContain("%(progress.downloaded_bytes)s");
    expect(progress.FILE_TEMPLATE.startsWith("after_move:")).toBe(true);
    expect(progress.STAGES).toEqual({ Merger: "merging", ExtractAudio: "converting", VideoRemuxer: "converting" });
    expect(progress.parseLine("BAIXARYT|I|7|A | B")).toEqual({ kind: "item", index: 7, title: "A | B" });
    expect(progress.parseLine("BAIXARYT|I|x|A")).toBeNull();
  });

  it("FUN-06 one growing percentage and milestones", () => {
    const D = (status: string, downloaded: number, total: number | null, eta: number | null = 1, speed: number | null = 1): progress.Download => ({
      kind: "download",
      status,
      downloaded,
      total,
      eta,
      speed,
    });
    let t = new progress.Tracker(2, [300, 100], 10);
    expect(t.feed(D("downloading", 150, 300))!.percent).toBe(37);
    expect(t.milestone()).toBe(30);
    expect(t.milestone()).toBeNull();
    let u = t.feed(D("finished", 300, 300, null, null))!;
    expect([u.percent, u.part]).toEqual([75, 1]);
    u = t.feed(D("downloading", 50, 100))!;
    expect([u.percent, u.part, u.parts]).toEqual([87, 2, 2]);
    expect(t.milestone()).toBe(80);
    expect(t.feed(D("finished", 100, 100, null, null))!.percent).toBe(100);
    expect(t.milestone()).toBeNull();
    t = new progress.Tracker(2, null, 25);
    expect(t.feed(D("downloading", 50, 100))!.percent).toBe(25);
    expect(t.milestone()).toBe(25);
    t.feed(D("finished", 100, 100, null, null));
    expect(t.feed(D("downloading", 0, 100))!.percent).toBe(50);
    expect(t.feed(D("downloading", 0, null))!.percent).toBe(50);
    t = new progress.Tracker(1, null, 0);
    t.feed(D("downloading", 90, 100));
    expect(t.milestone()).toBeNull();
    expect(new progress.Tracker().feed({ kind: "postprocess", status: "started", name: "Merger" })).toBeNull();
  });
});

describe("Filenames", () => {
  it("FUN-07 safe Windows names", () => {
    expect(filenames.safeName('A/B\\C:D*E?F"G<H>I|J')).toBe("A B C D E F G H I J");
    expect(filenames.safeName("  ..Título. ")).toBe("Título");
    expect(filenames.safeName("CON")).toBe("_CON");
    expect(filenames.safeName("nul.txt")).toBe("_nul.txt");
    expect(filenames.safeName("..\\..\\Windows")).toBe("Windows");
    expect(filenames.safeName("")).toBe("video");
    expect(filenames.safeName("....")).toBe("video");
    expect(filenames.safeName("a\x00b\tc")).toBe("a b c");
    expect(Array.from(filenames.safeName("x".repeat(500))).length).toBeLessThanOrEqual(filenames.MAX_NAME);
    expect(filenames.safeName("Música 🎵 ação")).toBe("Música 🎵 ação");
    expect(Array.from(filenames.safeName("🎵".repeat(200))).length).toBe(filenames.MAX_NAME);
  });

  it("FUN-08 never overwrites and finds partial files", () => {
    const folder = tempFolder();
    const base = filenames.uniqueBase(folder, "Video");
    expect(base).toBe(path.join(folder, "Video"));
    fs.writeFileSync(base + ".mp4", "");
    expect(filenames.uniqueBase(folder, "Video")).toBe(path.join(folder, "Video (2)"));
    fs.writeFileSync(path.join(folder, "video (2).f1.part"), "");
    expect(filenames.uniqueBase(folder, "Video")).toBe(path.join(folder, "Video (3)"));
    fs.writeFileSync(path.join(folder, "Video (3)x.mp4"), "");
    expect(filenames.uniqueBase(folder, "Video")).toBe(path.join(folder, "Video (3)"));
    expect(filenames.partialFiles(path.join(folder, "Video (2)")).map((p) => path.basename(p))).toEqual(["video (2).f1.part"]);
    expect(filenames.outputTemplate("C:\\d\\100% real")).toBe("C:\\d\\100%% real.%(ext)s");
    expect(filenames.isInside(folder, path.join(folder, "a.mp4"))).toBe(true);
    expect(filenames.isInside(folder, path.join(folder, "..foo.mp4"))).toBe(true);
    expect(filenames.isInside(folder, path.join(folder, "..", "a.mp4"))).toBe(false);
    expect(filenames.isInside(folder, folder)).toBe(false);
    expect(filenames.isInside(folder, folder + "x\\a.mp4")).toBe(false);
  });
});

describe("Errors", () => {
  it("FUN-09 classifies the yt-dlp errors", () => {
    const cases: Record<string, string> = {
      "ERROR: [youtube] x: Private video. Sign in if you've been granted access": "private",
      "ERROR: [youtube] x: Sign in to confirm your age. This video may be inappropriate for some users.": "age",
      "ERROR: [youtube] x: Join this channel to get access to members-only content": "members",
      "ERROR: [youtube] x: Sign in to confirm you’re not a bot.": "blocked",
      "ERROR: [youtube] x: This live event will begin in 3 hours.": "live",
      "ERROR: unable to write data: [Errno 28] No space left on device": "diskfull",
      "ERROR: unable to open for writing: [Errno 13] Permission denied": "permission",
      "ERROR: [youtube] x: Unable to download API page: <urlopen error [Errno 11001] getaddrinfo failed>": "network",
      "ERROR: Postprocessing: Conversion failed!": "ffmpeg",
      "ERROR: [youtube] x: Video unavailable. This video has been removed by the uploader": "unavailable",
      "ERROR: [youtube] x: Requested format is not available. Use --list-formats": "unavailable",
      "ERROR: [youtube] x: Unable to extract nsig function; please report this issue": "extractor",
      "ERROR: something new": "unknown",
      "": "unknown",
    };
    for (const [text, code] of Object.entries(cases)) expect(errors.classify("WARNING: [youtube] Falling back\n" + text), text).toBe(code);
    expect(new errors.DownloadError("nonsense").code).toBe("unknown");
  });
});

describe("Commands", () => {
  it("FUN-10 probe and download commands", () => {
    const prefix = ["C:\\bin\\yt-dlp.exe"];
    const probe = engine.probeCommand(prefix, VIDEO, "mp3");
    expect(probe[0]).toBe(prefix[0]);
    expect(probe.slice(-2)).toEqual(["--", VIDEO]);
    for (const o of ["-J", "--ignore-config", "--no-playlist"]) expect(probe).toContain(o);
    const cmd = engine.downloadCommand(prefix, "C:\\bin\\ffmpeg", VIDEO, "mp4_720", "C:\\Down\\My 50% video");
    expect(cmd.slice(-2)).toEqual(["--", VIDEO]);
    expect(cmd.filter((a) => a === "--").length).toBe(1);
    expect(cmd[cmd.indexOf("-o") + 1]).toBe("C:\\Down\\My 50%% video.%(ext)s");
    expect(cmd[cmd.indexOf("--ffmpeg-location") + 1]).toBe("C:\\bin\\ffmpeg");
    for (const o of ["--newline", "--progress", "--no-simulate", "--ignore-config", "--no-playlist", progress.DOWNLOAD_TEMPLATE, progress.FILE_TEMPLATE]) {
      expect(cmd).toContain(o);
    }
    expect(cmd).not.toContain("--exec");
  });

  it("FUN-11 reads title, channel and sizes", () => {
    const info = engine.parseProbe(
      JSON.stringify({ id: "jNQXAC9IVRw", title: "T", uploader: "U", duration: 19, requested_formats: [{ filesize: 10 }, { filesize_approx: 5 }] }),
    );
    expect(info).toEqual({ id: "jNQXAC9IVRw", title: "T", channel: "U", duration: 19, parts: 2, sizes: [10, 5] });
    const bare = engine.parseProbe(JSON.stringify({ id: "abc", filesize: null }));
    expect([bare.title, bare.parts, bare.sizes]).toEqual(["abc", 1, null]);
    for (const [text, code] of [
      ["not json", "extractor"],
      ['{"_type": "playlist"}', "unavailable"],
      ['{"is_live": true}', "live"],
      ["[1]", "unavailable"],
    ]) {
      try {
        engine.parseProbe(text);
        expect.fail(text);
      } catch (e) {
        expect((e as errors.DownloadError).code, text).toBe(code);
      }
    }
  });

  it("FUN-22 playlist commands", () => {
    const probe = engine.playlistProbeCommand(["yt-dlp.exe"], PLAYLIST);
    expect(probe.slice(-2)).toEqual(["--", PLAYLIST]);
    for (const o of ["--flat-playlist", "-J", "--yes-playlist", "--ignore-config"]) expect(probe).toContain(o);
    expect(probe).not.toContain("--no-playlist");
    const cmd = engine.playlistDownloadCommand(["yt-dlp.exe"], "C:\\ff", PLAYLIST, "mp3", "C:\\Down\\My 100% list");
    expect(cmd.slice(-2)).toEqual(["--", PLAYLIST]);
    expect(cmd.filter((a) => a === "--").length).toBe(1);
    expect(cmd[cmd.indexOf("-o") + 1]).toBe("C:\\Down\\My 100%% list\\%(playlist_index)03d - %(title)s.%(ext)s");
    for (const o of ["-i", "--yes-playlist", "--windows-filenames", "--ignore-config", "--no-simulate", progress.ITEM_TEMPLATE, progress.FILE_TEMPLATE]) {
      expect(cmd).toContain(o);
    }
    expect(cmd).not.toContain("--playlist-items");
    const limited = engine.playlistDownloadCommand(["x"], "f", PLAYLIST, "mp3", "C:\\d", 3);
    expect(limited[limited.indexOf("--playlist-items") + 1]).toBe("1:3");
  });

  it("FUN-23 reads the list", () => {
    const info = engine.parsePlaylistProbe(
      JSON.stringify({ _type: "playlist", title: "Músicas", entries: [{ id: "jNQXAC9IVRw", title: "A" }, { id: "b" }] }),
    );
    expect(info).toEqual({
      title: "Músicas",
      count: 2,
      entries: [
        { index: 1, title: "A", id: "jNQXAC9IVRw" },
        { index: 2, title: "b", id: null },
      ],
    });
    for (const [text, code] of [
      ['{"_type": "video"}', "unavailable"],
      ['{"_type": "playlist", "entries": []}', "empty"],
      ["x", "extractor"],
    ]) {
      try {
        engine.parsePlaylistProbe(text);
        expect.fail(text);
      } catch (e) {
        expect((e as errors.DownloadError).code, text).toBe(code);
      }
    }
  });
});

describe("Jobs", () => {
  it("FUN-12 downloads one file with progress", async () => {
    const { rec, folder, log } = await runJob("mp3", { fake: { title: "Música: teste/1", sizes: [100000] } });
    expect(rec.kinds()[0]).toBe("info");
    expect(rec.last()![0], JSON.stringify(rec.events)).toBe("done");
    const file = rec.last()![1] as string;
    expect(path.basename(file)).toBe("Música teste 1.mp3");
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readdirSync(folder).sort()).toEqual(["Música teste 1.mp3"]);
    const milestones = rec.events.filter((e) => e[0] === "progress" && e[2]).map((e) => e[2]);
    expect(milestones).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(rec.events).toContainEqual(["stage", "converting"]);
    const calls = fakeCalls(log);
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("-J");
    expect(calls[1].slice(-2)).toEqual(["--", VIDEO]);
  });

  it("FUN-13 video and audio in one percentage", async () => {
    const { rec, folder } = await runJob("mp4best", { step: 25, fake: { parts: 2, sizes: [300000, 100000] } });
    expect(rec.last()![0]).toBe("done");
    const percents = rec.events.filter((e) => e[0] === "progress").map((e) => (e[1] as progress.Update).percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(percents[percents.length - 1]).toBe(100);
    expect(rec.events.filter((e) => e[0] === "progress" && e[2]).map((e) => e[2])).toEqual([25, 50, 75]);
    expect(rec.events.filter((e) => e[0] === "stage")).toEqual([["stage", "merging"]]);
    expect(fs.readdirSync(folder)).toEqual(["Fake video.mp4"]);
    const second = await runJob("mp4best", { folder, fake: { parts: 2, sizes: [300000, 100000] } });
    expect(path.basename(second.rec.last()![1] as string)).toBe("Fake video (2).mp4");
  });

  it("FUN-14 error cleans partial files", async () => {
    let r = await runJob("mp4best", { fake: { parts: 2, downloadError: "unable to write data: [Errno 28] No space left on device", failAfterPart: 1 } });
    expect(r.rec.last()).toEqual(["error", "diskfull"]);
    expect(fs.readdirSync(r.folder)).toEqual([]);
    r = await runJob("mp3", { fake: { probeError: "Private video. Sign in if you've been granted access" } });
    expect(r.rec.events).toEqual([["error", "private"]]);
    r = await runJob("mp3", { fake: { live: true } });
    expect(r.rec.events).toEqual([["error", "live"]]);
  });

  it("FUN-15 cancel stops and cleans", async () => {
    configureFake({ delay: 0.2, steps: 50, sizes: [500000] });
    const folder = tempFolder();
    let rec = new Recorder();
    let job = new engine.Job({ prefix: FAKE_PREFIX, ffmpegDir: "C:\\ffmpeg", url: VIDEO, key: "mp4_360", folder, listener: rec });
    job.start();
    expect(await until(() => rec.kinds().includes("progress"))).toBe(true);
    expect(fs.readdirSync(folder).length).toBeGreaterThan(0);
    job.cancel();
    expect(await job.wait(30000)).toBe(true);
    expect(rec.last()).toEqual(["cancelled"]);
    expect(fs.readdirSync(folder)).toEqual([]);
    // Cancel during the probe
    configureFake({ probeDelay: 5 });
    rec = new Recorder();
    job = new engine.Job({ prefix: FAKE_PREFIX, ffmpegDir: "C:\\ffmpeg", url: VIDEO, key: "mp3", folder, listener: rec });
    const start = Date.now();
    job.start();
    await sleep(1000);
    job.cancel();
    expect(await job.wait(30000)).toBe(true);
    expect(rec.events).toEqual([["cancelled"]]);
    expect(Date.now() - start).toBeLessThan(4500);
  });

  it("FUN-16 damaged engine is reported", async () => {
    const r = await runJob("mp3", { preflight: () => ["yt-dlp.exe"] });
    expect(r.rec.events).toEqual([["error", "missing"]]);
    expect(fakeCalls(r.log)).toEqual([]);
    const rec = new Recorder();
    const job = new engine.Job({
      prefix: [path.join(tempFolder(), "missing.exe")],
      ffmpegDir: "x",
      url: VIDEO,
      key: "mp3",
      folder: tempFolder(),
      listener: rec,
    });
    job.start();
    await job.wait(30000);
    expect(rec.events).toEqual([["error", "missing"]]);
  });

  it("FUN-29 information read before (D-12) skips the probe", async () => {
    const log = configureFake({ title: "Lido antes" });
    const rec = new Recorder();
    const info = await new engine.Probe(FAKE_PREFIX).video(VIDEO, "mp3");
    expect(info).toMatchObject({ title: "Lido antes", channel: "jawed", duration: 19 });
    const job = new engine.Job({ prefix: FAKE_PREFIX, ffmpegDir: "C:\\ffmpeg", url: VIDEO, key: "mp3", folder: tempFolder(), listener: rec, info });
    job.start();
    await job.wait(30000);
    expect(rec.last()![0]).toBe("done");
    const calls = fakeCalls(log);
    expect(calls.length).toBe(2);
    expect(calls[1]).not.toContain("-J");
  });

  it("FUN-30 a cancelled probe returns nothing", async () => {
    configureFake({ probeDelay: 5 });
    const probe = new engine.Probe(FAKE_PREFIX);
    const start = Date.now();
    const pending = probe.video(VIDEO, "mp3");
    await sleep(500);
    probe.cancel();
    expect(await pending).toBeNull();
    expect(Date.now() - start).toBeLessThan(4000);
    configureFake({ playlist: { title: "L", entries: ["A", "B"] } });
    const list = await new engine.Probe(FAKE_PREFIX).playlist(PLAYLIST);
    expect(list).toMatchObject({ title: "L", count: 2 });
    expect(list!.entries[0].id).toBe("vid00000001");
  });
});

describe("Playlists", () => {
  it("FUN-24 downloads every video skipping failures", async () => {
    const fake = { playlist: { title: "Minhas músicas: rock/pop", entries: ["Alpha", "Beta", "Gamma"], fail: [2] } };
    const { rec, folder, log } = await runPlaylist("mp3", { fake });
    expect(rec.kinds()[0]).toBe("playlistInfo");
    expect((rec.events[0][1] as engine.PlaylistInfo).count).toBe(3);
    expect(rec.events.filter((e) => e[0] === "item").map((e) => e.slice(1))).toEqual([
      [1, 3, "Alpha"],
      [2, 3, "Beta"],
      [3, 3, "Gamma"],
    ]);
    const sub = path.join(folder, "Minhas músicas rock pop");
    expect(rec.last()).toEqual(["playlistDone", sub, 2, 3]);
    expect(fs.readdirSync(folder)).toEqual(["Minhas músicas rock pop"]);
    expect(fs.readdirSync(sub).sort()).toEqual(["001 - Alpha.mp3", "003 - Gamma.mp3"]);
    const percents = rec.events.filter((e) => e[0] === "playlistProgress").map((e) => e[2] as number);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(percents[percents.length - 1]).toBe(100);
    const calls = fakeCalls(log);
    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("--flat-playlist");
    expect(calls[1].slice(-2)).toEqual(["--", PLAYLIST]);
    const again = await runPlaylist("mp3", { folder, fake: { playlist: { title: "Minhas músicas: rock/pop", entries: ["Alpha"] } } });
    expect(again.rec.last()![1]).toBe(sub + " (2)");
  });

  it("FUN-25 declining downloads nothing", async () => {
    const { rec, folder, log } = await runPlaylist("mp3", { confirm: false, fake: { playlist: { title: "L", entries: ["A", "B"] } } });
    expect(rec.kinds()).toEqual(["playlistInfo", "cancelled"]);
    expect(fs.readdirSync(folder)).toEqual([]);
    expect(fakeCalls(log).length).toBe(1);
  });

  it("FUN-26 cancel keeps finished files", async () => {
    configureFake({ delay: 0.15, steps: 10, playlist: { title: "Long", entries: ["A", "B", "C", "D"] } });
    const folder = tempFolder();
    const rec = new Recorder();
    const job = new engine.PlaylistJob({ prefix: FAKE_PREFIX, ffmpegDir: "C:\\ffmpeg", url: PLAYLIST, key: "mp3", folder, listener: rec });
    job.start();
    await until(() => rec.events.some((e) => e[0] === "item" && e[1] === 2));
    await sleep(400);
    job.cancel();
    expect(await job.wait(30000)).toBe(true);
    expect(rec.last()).toEqual(["cancelled"]);
    expect(fs.readdirSync(path.join(folder, "Long"))).toEqual(["001 - A.mp3"]);
    expect(job.files).toEqual([path.join(folder, "Long", "001 - A.mp3")]);
  });

  it("FUN-27 nothing downloaded is an error", async () => {
    let r = await runPlaylist("mp3", { fake: { playlist: { title: "Private", entries: ["A", "B"], fail: [1, 2] } } });
    expect(r.rec.last()).toEqual(["error", "private"]);
    expect(fs.readdirSync(r.folder)).toEqual([]);
    r = await runPlaylist("mp3", { fake: { playlist: { title: "None", entries: [] } } });
    expect(r.rec.events).toEqual([["error", "empty"]]);
    r = await runPlaylist("mp3", { fake: { probeError: "The playlist does not exist", playlist: { entries: [] } } });
    expect(r.rec.events).toEqual([["error", "unavailable"]]);
  });

  it("FUN-28 first videos only", async () => {
    const { rec, folder } = await runPlaylist("mp4_360", { limit: 2, fake: { playlist: { title: "Big", entries: ["A", "B", "C", "D", "E"] } } });
    expect(rec.last()).toEqual(["playlistDone", path.join(folder, "Big"), 2, 2]);
    expect(fs.readdirSync(path.join(folder, "Big")).sort()).toEqual(["001 - A.mp4", "002 - B.mp4"]);
  });
});

describe("Binaries", () => {
  async function makeBin(version = "2026.10.21"): Promise<string> {
    const folder = tempFolder("baixar-bin-");
    fs.mkdirSync(path.join(folder, "ffmpeg"));
    const files: Record<string, string> = { "yt-dlp.exe": "exe", "ffmpeg/ffmpeg.exe": "ff", "ffmpeg/avcodec.dll": "dll" };
    const lines: string[] = [];
    for (const [rel, data] of Object.entries(files)) {
      fs.writeFileSync(path.join(folder, rel), data);
      lines.push(`${await binaries.sha256File(path.join(folder, rel))}  ${rel}`);
    }
    fs.writeFileSync(path.join(folder, "files.sha256"), lines.join("\n") + "\n");
    fs.writeFileSync(path.join(folder, "versions.json"), JSON.stringify({ ytdlp: version }));
    return folder;
  }

  it("FUN-17 detects damaged shipped files", async () => {
    const folder = await makeBin();
    const b = new binaries.Binaries(folder, tempFolder());
    expect(await b.verify()).toEqual([]);
    fs.writeFileSync(path.join(folder, "ffmpeg", "avcodec.dll"), "changed");
    expect(await b.verify()).toEqual([]);
    expect(await b.verify(true)).toEqual(["ffmpeg/avcodec.dll"]);
    fs.unlinkSync(path.join(folder, "yt-dlp.exe"));
    expect(await b.verify(true)).toContain("yt-dlp.exe");
    fs.appendFileSync(path.join(folder, "files.sha256"), "00  ../outside.txt\n");
    expect(await b.verify(true)).toContain("../outside.txt");
    fs.unlinkSync(path.join(folder, "files.sha256"));
    expect((await b.verify(true)).length).toBeGreaterThan(0);
  });

  it("FUN-18 version, update and newest copy", async () => {
    const folder = await makeBin();
    const userBin = path.join(tempFolder(), "bin");
    const run: binaries.Runner = (cmd, t) => binaries.runCommand([...FAKE_PREFIX, ...cmd.slice(1)], t);
    const b = new binaries.Binaries(folder, userBin, run);
    expect(b.ytdlpPath()).toBe(path.join(folder, "yt-dlp.exe"));
    configureFake({ version: "2026.10.21" });
    expect(await b.version()).toBe("2026.10.21");
    configureFake({ update: "current" });
    expect(await b.update()).toEqual({ status: "current", version: "2026.10.21" });
    expect(fs.existsSync(path.join(userBin, "yt-dlp.exe"))).toBe(true);
    expect(b.ytdlpPath()).toBe(path.join(folder, "yt-dlp.exe"));
    configureFake({ update: "updated" });
    expect(await b.update()).toEqual({ status: "updated", version: "2026.11.02" });
    expect(b.ytdlpPath()).toBe(path.join(userBin, "yt-dlp.exe"));
    configureFake({ update: "fail" });
    expect((await b.update()).status).toBe("failed");
    const newer = await makeBin("2027.01.05");
    expect(new binaries.Binaries(newer, userBin, run).ytdlpPath()).toBe(path.join(newer, "yt-dlp.exe"));
    expect(binaries.versionKey("stable@2026.10.21.1")).toEqual([2026, 10, 21, 1]);
    expect(binaries.versionKey("nothing")).toEqual([]);
  });
});

describe("Folders", () => {
  it("FUN-19 write check", () => {
    const folder = tempFolder();
    expect(folders.isWritable(folder)).toBe(true);
    expect(fs.readdirSync(folder)).toEqual([]);
    expect(folders.isWritable(path.join(folder, "missing"))).toBe(false);
    expect(folders.isWritable("")).toBe(false);
    expect(folders.isWritable(path.join(os.tmpdir(), "x", "y", "z"))).toBe(false);
  });
});
