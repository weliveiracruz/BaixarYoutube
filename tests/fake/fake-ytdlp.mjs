// A fake yt-dlp used by the tests (no network). The tests start it as
// [node, fake-ytdlp.mjs, <the app's arguments>]. Port of tests/fake_ytdlp.py of YouTubeDownloaderNVDA.
//
// Behaviour comes from the environment variable FAKE_YTDLP (JSON):
//   title, channel, parts (1 or 2), sizes, steps, delay (seconds per progress line),
//   noTotal, probeError, probeDelay, downloadError (printed as ERROR, exit 1),
//   failAfterPart, live, version, update ("current", "updated" or "fail"),
//   playlist: {title, entries: [titles], fail: [positions that fail]}.
// Every call is appended (argv as JSON) to the file in FAKE_YTDLP_LOG.

import * as fs from "node:fs";

const P = "BAIXARYT";
const conf = JSON.parse(process.env.FAKE_YTDLP || "{}");
const argv = process.argv.slice(2);
if (process.env.FAKE_YTDLP_LOG) fs.appendFileSync(process.env.FAKE_YTDLP_LOG, JSON.stringify(argv) + "\n", "utf8");

const say = (text) => fs.writeSync(1, text + "\n");
const err = (text) => fs.writeSync(2, text + "\n");
const value = (option) => argv[argv.indexOf(option) + 1];
const sleep = (s) => {
  if (s > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000);
};
const exit = (code) => process.exit(code);

if (argv.includes("--version")) {
  say(conf.version || "2026.10.21");
  exit(0);
}

if (argv.includes("-U")) {
  const mode = conf.update || "current";
  if (mode === "fail") {
    say("ERROR: Unable to obtain version info (<urlopen error [Errno 11001] getaddrinfo failed>)");
    exit(100);
  }
  if (mode === "updated") {
    say("Current version: stable@2026.10.21 from yt-dlp/yt-dlp");
    say("Latest version: stable@2026.11.02 from yt-dlp/yt-dlp");
    say("Updated yt-dlp to stable@2026.11.02 from yt-dlp/yt-dlp");
    exit(0);
  }
  say("Latest version: stable@2026.10.21 from yt-dlp/yt-dlp");
  say("yt-dlp is up to date (stable@2026.10.21 from yt-dlp/yt-dlp)");
  exit(0);
}

const parts = Number(conf.parts || 1);
const sizes = conf.sizes || Array(parts).fill(400000);
const title = conf.title || "Fake video";
const delay = Number(conf.delay || 0);
const playlist = conf.playlist;

if (playlist && argv.includes("--yes-playlist")) {
  const titles = playlist.entries || [];
  if (argv.includes("--flat-playlist")) {
    if (conf.probeError) {
      err("ERROR: [youtube:tab] PLx: " + conf.probeError);
      exit(1);
    }
    sleep(Number(conf.probeDelay || 0));
    say(
      JSON.stringify({
        _type: "playlist",
        id: "PLfake",
        title: playlist.title || "Fake list",
        playlist_count: titles.length,
        entries: titles.map((t, n) => ({ _type: "url", id: "vid" + String(n + 1).padStart(8, "0"), title: t })),
      }),
    );
    exit(0);
  }
  const template = value("-o");
  const audio = argv.includes("--audio-format");
  const ext = audio ? value("--audio-format") : "mp4";
  let last = titles.length;
  if (argv.includes("--playlist-items")) last = Math.min(last, Number(value("--playlist-items").split(":")[1]));
  let failed = 0;
  const steps = Number(conf.steps || 4);
  for (let n = 1; n <= last; n++) {
    const t = titles[n - 1];
    say(`${P}|I|${n}|${t}`);
    if ((playlist.fail || []).includes(n)) {
      say(`ERROR: [youtube] vid${String(n).padStart(8, "0")}: Video unavailable. This video is private`);
      failed++;
      continue;
    }
    const final = template
      .replace("%(playlist_index)03d", String(n).padStart(3, "0"))
      .replace("%(title)s", t.replaceAll("/", "_"))
      .replace("%(ext)s", ext)
      .replaceAll("%%", "%");
    const fd = fs.openSync(final + ".part", "w");
    for (let k = 1; k <= steps; k++) {
      fs.writeSync(fd, "x".repeat(1000));
      say(`${P}|D|downloading|${k * 1000}|${steps * 1000}|NA|1|1000.0`);
      sleep(delay);
    }
    fs.closeSync(fd);
    say(`${P}|D|finished|${steps * 1000}|${steps * 1000}|NA|NA|NA`);
    fs.renameSync(final + ".part", final);
    say(`${P}|F|${final}`);
  }
  exit(failed ? 1 : 0);
}

if (argv.includes("-J")) {
  if (conf.probeError) {
    err("WARNING: [youtube] something harmless");
    err("ERROR: [youtube] abc: " + conf.probeError);
    exit(1);
  }
  sleep(Number(conf.probeDelay || 0));
  const data = { id: "jNQXAC9IVRw", title, channel: conf.channel || "jawed", duration: 19 };
  if (conf.live) data.is_live = true;
  if (parts > 1) data.requested_formats = sizes.map((s) => ({ filesize: s }));
  else data.filesize = sizes[0];
  say("WARNING: [youtube] No supported JavaScript runtime could be found.");
  say(JSON.stringify(data));
  exit(0);
}

const template = value("-o");
const base = template.slice(0, -".%(ext)s".length).replaceAll("%%", "%");
const audio = argv.includes("--audio-format");
const ext = audio ? value("--audio-format") : "mp4";
const steps = Number(conf.steps || 10);
const pieces = [];
for (let i = 0; i < parts; i++) {
  const total = sizes[i];
  const partPath = `${base}.f${i}.part`;
  const fd = fs.openSync(partPath, "w");
  for (let n = 1; n <= steps; n++) {
    const done = Math.floor((total * n) / steps);
    fs.writeSync(fd, "x".repeat(Math.floor(total / steps)));
    say(`${P}|D|downloading|${done}|${conf.noTotal ? "NA" : total}|NA|${steps - n}|1000.0`);
    if (conf.downloadError && i === Number(conf.failAfterPart || 0) && n === Math.floor(steps / 2)) {
      fs.closeSync(fd);
      say("ERROR: " + conf.downloadError);
      exit(1);
    }
    sleep(delay);
  }
  fs.closeSync(fd);
  say(`${P}|D|finished|${total}|${total}|NA|NA|NA`);
  const piece = `${base}.f${i}.${audio ? "webm" : "mp4"}`;
  fs.renameSync(partPath, piece);
  pieces.push(piece);
}
if (parts > 1) {
  say(`${P}|P|started|Merger`);
  // The real yt-dlp also starts the remuxer after joining (it does nothing for MP4).
  say(`${P}|P|started|VideoRemuxer`);
} else if (audio) {
  say(`${P}|P|started|ExtractAudio`);
}
const final = `${base}.${ext}`;
fs.writeFileSync(final, Buffer.concat(pieces.map((p) => fs.readFileSync(p))));
for (const p of pieces) fs.unlinkSync(p);
say(`${P}|P|finished|MoveFiles`);
say(`${P}|F|${final}`);
exit(0);
