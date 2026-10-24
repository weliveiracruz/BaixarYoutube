// Starts the built app (build/) with the fake yt-dlp, a temporary profile and a local
// thumbnail server. The test hooks only exist in the development build (main.ts, TEST).
import { _electron as electron, test as base, type ElectronApplication, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";

export const ROOT = path.resolve(__dirname, "..", "..");
const FAKE = path.join(ROOT, "tests", "fake", "fake-ytdlp.mjs");
export const VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
export const PLAYLIST = "https://www.youtube.com/playlist?list=PLzCxunOM5WFI6sgbAppnSgLQxxNg_d10L";
export const BOTH = "https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLzCxunOM5WFI6sgbAppnSgLQxxNg_d10L";

/** A 320 x 180 PNG with noise (so it is a real, decodable picture bigger than 2 KB). */
function thumbnailPng(): Buffer {
  const w = 320;
  const h = 180;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let seed = 7;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 0x82 + ((seed >> 8) & 31);
      raw[o + 1] = 0x0a + ((x * 255) / w) * 0.4;
      raw[o + 2] = 0xd1 - ((y * 255) / h) * 0.3;
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

export interface Env {
  fake?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  clipboard?: string;
  reducedMotion?: boolean;
  colorScheme?: "light" | "dark";
  /** The real yt-dlp of resources/bin and the real i.ytimg.com (network). */
  real?: boolean;
}

export interface AppHandle {
  app: ElectronApplication;
  page: Page;
  downloads: string;
  userData: string;
  log: string;
  thumbRequests: string[];
  /** Changes the behaviour of the fake yt-dlp for the next calls. */
  setFake(conf: Record<string, unknown>): Promise<void>;
  fakeCalls(): string[][];
  close(): Promise<void>;
}

export async function launch(opts: Env = {}): Promise<AppHandle> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "baixar-e2e-"));
  const downloads = path.join(tmp, "Downloads");
  const userData = path.join(tmp, "profile");
  fs.mkdirSync(downloads);
  fs.mkdirSync(userData);
  fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ noticeSeen: true, language: "pt-BR", ...opts.settings }));
  const log = path.join(tmp, "calls.jsonl");
  const confFile = path.join(tmp, "fake.json");
  fs.writeFileSync(confFile, JSON.stringify(opts.fake ?? {}));

  const png = thumbnailPng();
  const thumbRequests: string[] = [];
  const server = http.createServer((req, res) => {
    thumbRequests.push(req.url ?? "");
    if ((req.url ?? "").includes("/vi/")) res.writeHead(200, { "content-type": "image/png" }).end(png);
    else res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const thumbBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // The fake reads its configuration from a file, so a test can change it while the app runs.
  const wrapper = path.join(tmp, "fake-wrapper.mjs");
  fs.writeFileSync(
    wrapper,
    `import * as fs from "node:fs";\nprocess.env.FAKE_YTDLP = fs.readFileSync(${JSON.stringify(confFile)}, "utf8");\nawait import(${JSON.stringify("file:///" + FAKE.replaceAll("\\", "/"))});\n`,
  );
  const node = process.execPath;
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      ...(opts.real ? {} : { BAIXAR_TEST_YTDLP: JSON.stringify([node, wrapper]), BAIXAR_TEST_THUMB_BASE: thumbBase }),
      BAIXAR_TEST_USERDATA: userData,
      BAIXAR_TEST_DOWNLOADS: downloads,
      BAIXAR_TEST_PICK_FOLDER: downloads,
      BAIXAR_TEST_NO_OPEN: "1",
      FAKE_YTDLP_LOG: log,
    },
    colorScheme: opts.colorScheme,
  });
  if (opts.clipboard !== undefined) await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), opts.clipboard);
  else await app.evaluate(({ clipboard }) => clipboard.writeText(""));
  const page = await app.firstWindow();
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  if (opts.colorScheme) await page.emulateMedia({ colorScheme: opts.colorScheme });
  await page.waitForSelector("body[data-ready='true']");
  return {
    app,
    page,
    downloads,
    userData,
    log,
    thumbRequests,
    setFake: async (conf) => fs.writeFileSync(confFile, JSON.stringify(conf)),
    fakeCalls: () => {
      try {
        return fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      } catch {
        return [];
      }
    },
    close: async () => {
      await app.evaluate(({ app: a }) => {
        a.removeAllListeners("before-quit");
        a.exit(0);
      }).catch(() => undefined);
      await app.close().catch(() => undefined);
      server.closeAllConnections();
      server.close();
    },
  };
}

export const test = base.extend<{ baixar: AppHandle; env: Env }>({
  env: [{}, { option: true }],
  baixar: async ({ env }, use) => {
    const handle = await launch(env);
    await use(handle);
    await handle.close();
  },
});
export { expect } from "@playwright/test";

/** Text of the polite live region after it settles. */
export async function lastAnnouncement(page: Page): Promise<string> {
  await page.waitForTimeout(120);
  return (await page.locator("#live-status").textContent()) ?? "";
}

/** Runs axe-core (WCAG 2.2 A and AA) in the page; CDP evaluation is not blocked by the CSP. */
export async function axe(page: Page): Promise<{ id: string; impact: string; nodes: string[] }[]> {
  const source = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  // Contrast is measured on the final state, not in the middle of an entrance animation.
  await page.evaluate(() => Promise.race([Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, 6000))]));
  await page.evaluate(source);
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected above
    const result = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
    return result.violations.map((v: { id: string; impact: string; nodes: { target: string[] }[] }) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(" ")),
    }));
  });
}

/** A key press through the real input pipeline of the window (Playwright's keyboard does not
 * pass through Electron's before-input-event, where zoom and the manual's Esc are handled). */
export async function osKey(app: ElectronApplication, windowIndex: number, keyCode: string, modifiers: string[] = []): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [i, k, m]) => {
      const wc = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id)[i as number].webContents;
      wc.sendInputEvent({ type: "keyDown", keyCode: k as string, modifiers: m as never });
      wc.sendInputEvent({ type: "keyUp", keyCode: k as string, modifiers: m as never });
    },
    [windowIndex, keyCode, modifiers] as const,
  );
}
