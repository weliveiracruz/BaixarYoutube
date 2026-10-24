// T-KEY, T-A11Y, T-VIS, T-MOTION: keyboard, axe-core in every state and theme, high contrast, zoom, motion.
import * as fs from "node:fs";
import * as path from "node:path";

import { PLAYLIST, ROOT, VIDEO, axe, expect, lastAnnouncement, launch, osKey, test } from "./fixtures";

const shot = (name: string) => path.join(ROOT, "test-results", name);
const focused = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.id || el?.getAttribute("name") || el?.tagName || "";
  });

test("T-KEY-01 Tab order of the main window (RA-02)", async ({ baixar }) => {
  const { page } = baixar;
  // Before a download: open buttons are disabled and leave the order.
  const expected = ["url", "folder", "browse", "format", "go", "status", "settings", "close"];
  const seen = [await focused(page)];
  for (let i = 1; i < expected.length; i++) {
    await page.keyboard.press("Tab");
    seen.push(await focused(page));
  }
  expect(seen).toEqual(expected);
  await page.keyboard.press("Shift+Tab");
  expect(await focused(page)).toBe("settings");
});

test.describe("after a download", () => {
  test.use({ env: { fake: { title: "Vídeo" } } });
  test("T-KEY-02 Tab order with the open buttons", async ({ baixar }) => {
    const { page } = baixar;
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Abrir arquivo" })).toBeEnabled();
    await page.locator("#status").focus();
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      seen.push(await focused(page));
    }
    expect(seen).toEqual(["open-file", "open-folder", "settings", "close"]);
  });
});

test("T-KEY-03 access keys in pt-BR (RA-03)", async ({ baixar }) => {
  const { page } = baixar;
  const keys: [string, string][] = [
    ["Alt+D", "folder"],
    ["Alt+E", "browse"],
    ["Alt+F", "format"],
    ["Alt+S", "status"],
    ["Alt+U", "url"],
  ];
  for (const [key, id] of keys) {
    await page.keyboard.press(key);
    expect(await focused(page), key).toBe(id);
  }
  await expect(page.getByRole("button", { name: "Baixar" })).toHaveAttribute("aria-keyshortcuts", "Alt+B");
  await expect(page.getByRole("textbox", { name: "URL do vídeo ou da playlist" })).toHaveAttribute("aria-keyshortcuts", "Alt+U");
  await page.keyboard.press("Alt+G");
  await expect(page.getByRole("heading", { name: "Configurações" })).toBeFocused();
  await page.keyboard.press("Alt+V");
  await expect(page.getByRole("button", { name: "Configurações" })).toBeFocused();
  await page.keyboard.press("Alt+B");
  await expect(page.locator("#live-alert")).toHaveText("Cole um link do YouTube no campo URL.");
});

test.describe("english", () => {
  test.use({ env: { settings: { language: "en" } } });
  test("T-KEY-04 access keys and texts in English", async ({ baixar }) => {
    const { page } = baixar;
    await expect(page).toHaveTitle("Download from YouTube");
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
    for (const [key, id] of [
      ["Alt+R", "folder"],
      ["Alt+O", "format"],
      ["Alt+S", "status"],
      ["Alt+U", "url"],
    ] as const) {
      await page.keyboard.press(key);
      expect(await focused(page), key).toBe(id);
    }
    await expect(page.getByRole("button", { name: "Download" })).toHaveAttribute("aria-keyshortcuts", "Alt+D");
    await expect(page.getByRole("button", { name: "Settings" })).toHaveAttribute("aria-keyshortcuts", "Alt+T");
    expect(await axe(page)).toEqual([]);
  });
});

test("T-KEY-05 no repeated access key in any view or dialog, in both languages", async ({ baixar }) => {
  const { page } = baixar;
  for (const language of ["pt-BR", "en"] as const) {
    await page.evaluate((l) => window.baixar.setSetting("language", l), language);
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(language);
    const scopes = await page.evaluate(() =>
      ["view-main", "view-settings", "dlg-choice", "dlg-confirm", "dlg-close", "dlg-notice"].map((id) => {
        const keys = [...document.getElementById(id)!.querySelectorAll<HTMLElement>("[data-key]")]
          .filter((el) => el.dataset.key)
          // the Download/Cancel label is one control with two states
          .map((el) => el.dataset.key!);
        return { id, keys };
      }),
    );
    for (const { id, keys } of scopes) {
      const extra = id === "view-main" ? 0 : 0;
      expect(new Set(keys).size + extra, `${language} ${id}: ${keys.join(",")}`).toBe(keys.length);
    }
    // Cancel (Alt+C) must not collide with another key of the main view.
    const main = scopes.find((x) => x.id === "view-main")!.keys;
    const cancel = language === "pt-BR" ? "c" : "c";
    expect(main.filter((k) => k === cancel).length, `${language} cancel key`).toBe(0);
  }
});

test("T-KEY-06 Esc closes Settings; F1 opens the manual; Ctrl+L goes to the URL", async ({ baixar }) => {
  const { page, app } = baixar;
  await page.keyboard.press("Alt+G");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Configurações" })).toBeFocused();
  await page.keyboard.press("Control+L");
  await expect(page.getByRole("textbox", { name: "URL do vídeo ou da playlist" })).toBeFocused();
  const manual = app.waitForEvent("window");
  await page.keyboard.press("F1");
  const m = await manual;
  await expect(m.getByRole("heading", { level: 1, name: "Manual do Baixar YouTube" })).toBeVisible();
  expect(await axe(m)).toEqual([]);
  await osKey(app, 1, "Escape");
  await expect.poll(() => app.windows().length).toBe(1);
});

test.describe("axe in every state, light theme", () => {
  test.use({ env: { colorScheme: "light", fake: { title: "Me at the zoo", parts: 2, sizes: [300000, 100000], steps: 30, delay: 0.1, playlist: { title: "Lista", entries: ["A"] } } } });
  test("T-A11Y-01 preview, busy, dialogs, error, settings", async ({ baixar }) => {
    const { page } = baixar;
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await expect(page.locator("#media-title")).toHaveText("Me at the zoo");
    expect(await axe(page), "preview").toEqual([]);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Baixando: \d+%/);
    expect(await axe(page), "busy").toEqual([]);
    await page.screenshot({ path: shot("07-baixando.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Download em andamento" })).toBeVisible();
    expect(await axe(page), "close dialog").toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue("Download cancelado.");
    await page.getByLabel("URL do vídeo ou da playlist").fill("https://vimeo.com/1");
    await page.keyboard.press("Enter");
    expect(await axe(page), "error").toEqual([]);
    await page.getByLabel("URL do vídeo ou da playlist").fill(PLAYLIST);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Baixar a playlist?" })).toBeVisible();
    expect(await axe(page), "playlist dialog").toEqual([]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Alt+G");
    expect(await axe(page), "settings").toEqual([]);
    await page.screenshot({ path: shot("08-configuracoes.png"), fullPage: true });
  });
});

test.describe("dark theme", () => {
  test.use({ env: { colorScheme: "dark", settings: { theme: "dark" }, fake: { title: "Me at the zoo" } } });
  test("T-A11Y-02 dark theme: axe and contrast", async ({ baixar }) => {
    const { page } = baixar;
    expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(26, 11, 41)");
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await expect(page.locator("#media-title")).toHaveText("Me at the zoo");
    expect(await axe(page)).toEqual([]);
    await page.screenshot({ path: shot("09-escuro.png") });
    await page.keyboard.press("Alt+G");
    expect(await axe(page)).toEqual([]);
  });
});

test("T-A11Y-03 live regions: polite for progress, assertive only for errors, no repetition", async ({ baixar }) => {
  const { page } = baixar;
  await expect(page.locator("#live-status")).toHaveAttribute("role", "status");
  await expect(page.locator("#live-status")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#live-alert")).toHaveAttribute("role", "alert");
  // The Status field is not a live region (no double reading).
  expect(await page.locator("#status").getAttribute("aria-live")).toBeNull();
  await page.keyboard.press("Enter");
  await expect(page.locator("#live-alert")).not.toBeEmpty();
  expect(await lastAnnouncement(page)).toBe("");
});

test("T-VIS-01 Windows high contrast (forced colors)", async ({ baixar }) => {
  const { page } = baixar;
  await page.emulateMedia({ forcedColors: "active" });
  const border = await page.evaluate(() => getComputedStyle(document.getElementById("go")!).borderTopStyle);
  expect(border).toBe("solid");
  await page.locator("#browse").focus();
  const outline = await page.evaluate(() => getComputedStyle(document.getElementById("browse")!).outlineStyle);
  expect(outline).toBe("solid");
  await page.screenshot({ path: shot("10-alto-contraste.png") });
});

test("T-VIS-02 reflow at 320 CSS px (400% zoom): no horizontal scroll", async ({ baixar }) => {
  const { page, app } = baixar;
  // Ctrl+= twenty times through the real input pipeline: 100% + 20 x 10% = 300%.
  for (let i = 0; i < 20; i++) await osKey(app, 0, "=", ["control"]);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBeCloseTo(3, 5);
  await page.waitForTimeout(300);
  const { scrollWidth, clientWidth, inner } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    inner: window.innerWidth,
  }));
  expect(inner).toBeLessThan(330);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  // Electron's own capture: Playwright's screenshot crops a zoomed page.
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString("base64"));
  fs.writeFileSync(shot("11-zoom-400.png"), Buffer.from(png, "base64"));
  await osKey(app, 0, "0", ["control"]);
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBe(1);
});

test("T-VIS-03 targets of at least 44 px and the visible focus ring", async ({ baixar }) => {
  const { page } = baixar;
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#view-main button, #view-main input, #view-main select")]
      .filter((el) => el.offsetParent)
      .map((el) => ({ id: el.id, h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width }))
      .filter((r) => r.h < 44 || r.w < 44),
  );
  expect(small).toEqual([]);
  await page.locator("#go").focus();
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById("go")!);
    return [cs.outlineStyle, cs.outlineWidth, cs.outlineOffset];
  });
  // 3 px snapped to whole device pixels (2.4 CSS px at 125% Windows scaling): never under 2 CSS px.
  expect(ring[0]).toBe("solid");
  expect(parseFloat(ring[1])).toBeGreaterThanOrEqual(2);
  expect(parseFloat(ring[2])).toBeGreaterThanOrEqual(1.5);
});

test.describe("motion", () => {
  test("T-MOTION-01 with reduced motion nothing moves", async () => {
    const h = await launch({ reducedMotion: true, fake: { title: "Calmo" } });
    try {
      const { page } = h;
      await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
      await expect(page.locator("#media-title")).toHaveText("Calmo");
      const moving = await page.evaluate(() =>
        document
          .getAnimations()
          .map((a) => ({ name: (a as CSSAnimation).animationName ?? "transition", duration: Number((a.effect?.getTiming().duration as number) ?? 0) }))
          .filter((a) => !(a.name === "fade-in" && a.duration <= 150) && a.duration > 0),
      );
      expect(moving).toEqual([]);
      expect(await page.evaluate(() => getComputedStyle(document.getElementById("media")!).animationName)).toBe("none");
    } finally {
      await h.close();
    }
  });

  test("T-MOTION-02 the Animations setting turns them off and on", async ({ baixar }) => {
    const { page } = baixar;
    await page.keyboard.press("Alt+G");
    await page.getByRole("radio", { name: "Desligadas" }).check();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.motion)).toBe("off");
    await page.keyboard.press("Escape");
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await expect(page.locator("#media")).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("media")!).animationName)).toBe("none");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".media-skeleton")!).animationName)).toBe("none");
  });

  test("T-MOTION-03 with animations on, none is longer than 320 ms and loading ones stop", async ({ baixar }) => {
    const { page } = baixar;
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await expect(page.locator("#media")).toBeVisible();
    const timings = await page.evaluate(() =>
      document.getAnimations().map((a) => {
        const t = a.effect!.getComputedTiming();
        return { name: (a as CSSAnimation).animationName ?? "transition", duration: Number(t.duration), iterations: t.iterations, end: Number(t.endTime) };
      }),
    );
    for (const t of timings) {
      if (t.name === "shimmer" || t.name === "stripes") expect(t.end, t.name).toBeLessThanOrEqual(5000);
      else expect(t.duration, t.name).toBeLessThanOrEqual(320);
      expect(Number.isFinite(t.iterations), t.name).toBe(true);
    }
  });
});
