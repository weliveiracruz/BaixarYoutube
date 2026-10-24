// T-SEC: hardened window, CSP, navigation, permissions and IPC validation (RS-06, RS-07, RS-08, RS-11).
import * as fs from "node:fs";

import { VIDEO, expect, test } from "./fixtures";

test("T-SEC-01 webPreferences: isolation, sandbox, no Node", async ({ baixar }) => {
  const prefs = await baixar.app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): Record<string, unknown> };
    const p = wc.getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, sandbox: p.sandbox, nodeIntegration: p.nodeIntegration, webSecurity: p.webSecurity, webviewTag: p.webviewTag };
  });
  expect(prefs).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false });
  const page = baixar.page;
  expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe("undefined");
  expect(await page.evaluate(() => typeof (window as unknown as { process?: unknown }).process)).toBe("undefined");
  expect(await page.evaluate(() => Object.keys(window.baixar).sort())).toEqual(
    ["cancel", "checkUrl", "chooseFolder", "close", "closeChoice", "confirmPlaylist", "getState", "on", "open", "openManual", "preview", "setSetting", "start", "updateEngine", "ytdlpVersion"].sort(),
  );
  expect(await page.evaluate(() => location.href)).toBe("app://baixar/index.html");
});

test("T-SEC-02 CSP blocks inline scripts and network access from the window", async ({ baixar }) => {
  const { page } = baixar;
  const blocked = await page.evaluate(async () => {
    const results: string[] = [];
    try {
      await fetch("https://example.com/");
      results.push("fetch allowed");
    } catch {
      results.push("fetch blocked");
    }
    const s = document.createElement("script");
    s.textContent = "window.__inline = 1";
    document.body.append(s);
    results.push((window as unknown as { __inline?: number }).__inline ? "inline allowed" : "inline blocked");
    return results;
  });
  expect(blocked).toEqual(["fetch blocked", "inline blocked"]);
});

test("T-SEC-03 navigation and new windows are refused", async ({ baixar }) => {
  const { page, app } = baixar;
  await page.evaluate(() => {
    window.open("https://example.com/");
    location.href = "https://example.com/";
  });
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => location.href)).toBe("app://baixar/index.html");
  expect(app.windows().length).toBe(1);
  const permission = await page.evaluate(() => navigator.permissions.query({ name: "geolocation" as PermissionName }).then((p) => p.state).catch(() => "error"));
  expect(permission).not.toBe("granted");
});

test("T-SEC-04 IPC rejects invalid arguments", async ({ baixar }) => {
  const { page } = baixar;
  const results = await page.evaluate(async () => {
    const b = window.baixar;
    return {
      badFormat: await b.start({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", format: "exe" as never, mode: "video" }),
      badMode: await b.start({ url: "https://www.youtube.com/watch?v=jNQXAC9IVRw", format: "mp3", mode: "shell" as never }),
      badUrl: await b.start({ url: "--exec calc", format: "mp3", mode: "video" }),
      badSetting: await b.setSetting("folder" as never, "C:\\Windows" as never),
      badValue: await b.setSetting("announce", 7 as never),
      badShortcut: await b.setSetting("shortcut", "A" as never),
      openUnknown: await b.open(9999, "file"),
      check: await b.checkUrl("https://evil.example/?u=https://youtu.be/jNQXAC9IVRw"),
      unknownEvent: (() => {
        try {
          b.on("evil" as never, () => undefined);
          return "accepted";
        } catch {
          return "refused";
        }
      })(),
    };
  });
  expect(results.badFormat).toEqual({ ok: false, error: "url" });
  expect(results.badMode).toEqual({ ok: false, error: "url" });
  expect(results.badUrl).toEqual({ ok: false, error: "url", reason: "host" });
  expect(results.badSetting).toEqual({ ok: false, error: "invalid" });
  expect(results.badValue).toEqual({ ok: false, error: "invalid" });
  expect(results.badShortcut).toEqual({ ok: false, error: "invalid" });
  expect(results.openUnknown).toEqual({ ok: false });
  expect(results.check).toEqual({ ok: false, reason: "host" });
  expect(results.unknownEvent).toBe("refused");
  expect(baixar.fakeCalls()).toEqual([]);
});

test("T-SEC-05 the URL reaches yt-dlp only in canonical form, after --", async ({ baixar }) => {
  const { page } = baixar;
  await page.getByLabel("URL do vídeo ou da playlist").fill("https://m.youtube.com/watch?v=jNQXAC9IVRw&t=10s&list=x&feature=share");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Download concluído/);
  for (const call of baixar.fakeCalls()) {
    expect(call.slice(-2)).toEqual(["--", VIDEO]);
    expect(call).toContain("--ignore-config");
    expect(call).not.toContain("--exec");
  }
});

test.describe("thumbnails off", () => {
  test.use({ env: { settings: { thumbnails: false }, fake: { title: "Sem foto" } } });
  test("T-SEC-06 with Show thumbnail off no picture is requested (RS-11)", async ({ baixar }) => {
    const { page } = baixar;
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await expect(page.locator("#media-title")).toHaveText("Sem foto");
    await expect(page.locator("#media-placeholder")).toBeVisible();
    expect(baixar.thumbRequests).toEqual([]);
  });
});

test("T-SEC-07 no history: settings keep no link", async ({ baixar }) => {
  const { page } = baixar;
  await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Download concluído/);
  const saved = fs.readFileSync(`${baixar.userData}/settings.json`, "utf8");
  expect(saved).not.toContain("youtube");
  expect(saved).not.toContain("jNQXAC9IVRw");
});
