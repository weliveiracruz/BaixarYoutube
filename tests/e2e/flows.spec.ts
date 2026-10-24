// T-E2E: download flows with the fake yt-dlp (video, audio, playlist, choice, cancel, close).
import * as fs from "node:fs";
import * as path from "node:path";

import { BOTH, PLAYLIST, ROOT, VIDEO, expect, lastAnnouncement, test } from "./fixtures";

const shot = (name: string) => path.join(ROOT, "test-results", name);

test.describe("video", () => {
  test.use({ env: { fake: { title: "Me at the zoo", channel: "jawed", parts: 2, sizes: [300000, 100000], delay: 0.02 } } });

  test("T-E2E-02 preview card, download, completion and open buttons", async ({ baixar }) => {
    const { page } = baixar;
    const url = page.getByRole("textbox", { name: "URL do vídeo ou da playlist" });
    await url.fill("youtu.be/jNQXAC9IVRw?si=abc");
    // RF-25: thumbnail first, then title, channel and length, announced once.
    const card = page.locator("#media");
    await expect(card).toBeVisible();
    await expect(page.locator("#media-img")).toBeVisible();
    await expect(page.locator("#media-img")).toHaveAttribute("alt", "");
    await expect(page.locator("#media-title")).toHaveText("Me at the zoo");
    await expect(page.locator("#media-meta")).toHaveText("jawed · 19 s");
    await expect(page.locator("#media-badge")).toHaveText("Vídeo MP4 (melhor qualidade)");
    await expect.poll(() => lastAnnouncement(page)).toBe("Vídeo: Me at the zoo, 19 s");
    expect(baixar.thumbRequests.some((r) => r.includes("/vi/jNQXAC9IVRw/"))).toBe(true);
    await page.screenshot({ path: shot("02-previa.png") });

    await page.getByRole("combobox", { name: "Formato" }).selectOption("mp3");
    await expect(page.locator("#media-badge")).toHaveText("Áudio MP3");
    await expect(card).toHaveClass(/is-audio/);
    await page.getByRole("combobox", { name: "Formato" }).selectOption("mp4best");

    await page.getByRole("button", { name: "Baixar" }).click();
    await expect(page.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await expect(url).toBeDisabled();
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Download concluído: Me at the zoo\. Salvo em /);
    await expect.poll(() => lastAnnouncement(page)).toBe("Download concluído: Me at the zoo");
    await expect(page.getByRole("button", { name: "Baixar" })).toBeFocused();
    await expect(page.getByRole("progressbar", { name: "Progresso" })).toHaveAttribute("aria-valuetext", "100%");
    await expect(page.getByRole("button", { name: "Abrir arquivo" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Abrir pasta" })).toBeEnabled();
    await expect(card).toHaveClass(/is-done/);
    expect(fs.readdirSync(baixar.downloads)).toEqual(["Me at the zoo.mp4"]);
    // D-12: the information read for the preview was reused: only one -J.
    const calls = baixar.fakeCalls();
    expect(calls.filter((c) => c.includes("-J")).length).toBe(1);
    expect(calls[calls.length - 1].slice(-2)).toEqual(["--", VIDEO]);
    await page.screenshot({ path: shot("03-concluido.png") });
    await page.getByRole("button", { name: "Abrir arquivo" }).click();
    await expect(page.locator("#live-alert")).toHaveText("");
  });

  test("T-E2E-03 milestones are announced and the status shows sizes", async ({ baixar }) => {
    const { page } = baixar;
    await baixar.setFake({ title: "Lento", parts: 1, sizes: [1000000], steps: 20, delay: 0.15 });
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await page.getByRole("combobox", { name: "Formato" }).selectOption("m4a");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Baixando: \d+%, .* KB de .* KB/);
    await expect.poll(() => lastAnnouncement(page), { timeout: 20000 }).toMatch(/^\d0%$/);
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Download concluído/, { timeout: 30000 });
  });
});

test.describe("errors", () => {
  test("T-E2E-04 validation: message by the field, alert and focus", async ({ baixar }) => {
    const { page } = baixar;
    await page.getByRole("button", { name: "Baixar" }).click();
    const url = page.getByRole("textbox", { name: "URL do vídeo ou da playlist" });
    await expect(url).toBeFocused();
    await expect(url).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#url-error")).toBeVisible();
    await expect(page.locator("#live-alert")).toHaveText("Cole um link do YouTube no campo URL.");
    await expect(url).toHaveAccessibleDescription(/Cole um link do YouTube no campo URL\./);
    await url.fill("https://vimeo.com/1");
    await expect(url).not.toHaveAttribute("aria-invalid", "true");
    await page.keyboard.press("Enter");
    await expect(page.locator("#live-alert")).toHaveText("Este não é um link do YouTube. Cole um link de youtube.com ou youtu.be.");
    await url.fill("https://www.youtube.com/@canal");
    await page.keyboard.press("Enter");
    await expect(page.locator("#live-alert")).toHaveText(/não é de um vídeo nem de uma playlist/);
    await page.screenshot({ path: shot("04-erro.png") });
  });

  test("T-E2E-05 a download error is said and the partial files are deleted", async ({ baixar }) => {
    const { page } = baixar;
    await baixar.setFake({ parts: 2, downloadError: "unable to write data: [Errno 28] No space left on device", failAfterPart: 1 });
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await page.keyboard.press("Enter");
    await expect(page.locator("#live-alert")).toHaveText("Não há espaço suficiente no disco.");
    await expect(page.locator("#status-card")).toHaveClass(/is-error/);
    expect(fs.readdirSync(baixar.downloads)).toEqual([]);
    await expect(page.getByRole("button", { name: "Baixar" })).toBeEnabled();
  });

  test("T-E2E-06 a private video", async ({ baixar }) => {
    const { page } = baixar;
    await baixar.setFake({ probeError: "Private video. Sign in if you've been granted access" });
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await expect(page.locator("#media-placeholder, #media-img").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#live-alert")).toHaveText("Este vídeo é privado e não pode ser baixado.");
  });
});

test.describe("playlist", () => {
  test.use({ env: { fake: { steps: 3, delay: 0.05, playlist: { title: "Minhas músicas", entries: ["Alpha", "Beta", "Gamma"], fail: [2] } } } });

  test("T-E2E-07 confirm, items announced, folder named after the list", async ({ baixar }) => {
    const { page } = baixar;
    await page.getByLabel("URL do vídeo ou da playlist").fill(PLAYLIST);
    await expect(page.locator("#media-badge")).toHaveText("Playlist · 3 vídeos");
    await expect(page.locator("#media-title")).toHaveText("Minhas músicas");
    await page.getByRole("combobox", { name: "Formato" }).selectOption("mp3");
    await page.getByRole("button", { name: "Baixar" }).click();
    const dialog = page.getByRole("dialog", { name: "Baixar a playlist?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(/A playlist "Minhas músicas" tem 3 vídeos/);
    await expect(dialog.getByRole("button", { name: "Sim, baixar" })).toBeFocused();
    await page.screenshot({ path: shot("05-confirmar-playlist.png") });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Playlist concluída: 2 de 3 baixados .* 1 não puderam ser baixados/, { timeout: 30000 });
    expect(fs.readdirSync(path.join(baixar.downloads, "Minhas músicas")).sort()).toEqual(["001 - Alpha.mp3", "003 - Gamma.mp3"]);
    await expect(page.getByRole("button", { name: "Abrir arquivo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Abrir pasta" })).toBeEnabled();
  });

  test("T-E2E-08 declining downloads nothing and the focus goes back", async ({ baixar }) => {
    const { page } = baixar;
    await page.getByLabel("URL do vídeo ou da playlist").fill(PLAYLIST);
    await page.getByRole("button", { name: "Baixar" }).click();
    await expect(page.getByRole("dialog", { name: "Baixar a playlist?" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue("Download cancelado.");
    await expect(page.getByRole("button", { name: "Baixar" })).toBeFocused();
    expect(fs.readdirSync(baixar.downloads)).toEqual([]);
  });

  test("T-E2E-09 a video inside a playlist asks video or playlist", async ({ baixar }) => {
    const { page } = baixar;
    await page.getByLabel("URL do vídeo ou da playlist").fill(BOTH);
    await page.getByRole("button", { name: "Baixar" }).click();
    const dialog = page.getByRole("dialog", { name: "Vídeo ou playlist?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Só este vídeo" })).toBeFocused();
    // Tab stays inside the dialog (RA-07).
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
    await page.keyboard.press("Alt+V");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Baixar" })).toBeFocused();
    expect(fs.readdirSync(baixar.downloads)).toEqual([]);
  });
});

test.describe("cancel and close", () => {
  test.use({ env: { fake: { title: "Longo", parts: 1, sizes: [2000000], steps: 60, delay: 0.2 } } });

  test("T-E2E-10 cancel stops and cleans", async ({ baixar }) => {
    const { page } = baixar;
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Baixando: \d+%/);
    await page.keyboard.press("Alt+C");
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue("Download cancelado.");
    await expect.poll(() => fs.readdirSync(baixar.downloads)).toEqual([]);
  });

  test("T-E2E-11 closing during a download asks, Back keeps it, Background hides", async ({ baixar }) => {
    const { page, app } = baixar;
    await page.getByLabel("URL do vídeo ou da playlist").fill(VIDEO);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Baixando/);
    await page.keyboard.press("Escape");
    const dialog = page.getByRole("dialog", { name: "Download em andamento" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Continuar em segundo plano" })).toBeFocused();
    await page.screenshot({ path: shot("06-fechar-durante.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // document.activeElement: the OS focus of the test window does not matter here.
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe("go");
    await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
    // Alt+F4 / the window close button go through the same question.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Continuar em segundo plano" }).click();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false);
    // The tray / shortcut brings it back, still downloading.
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.show();
    });
    await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue("Download cancelado.");
  });
});

test.describe("clipboard", () => {
  test.use({ env: { clipboard: "olha isso https://youtu.be/jNQXAC9IVRw obrigado" } });

  test("T-E2E-12 a link in the clipboard is pasted and selected", async ({ baixar }) => {
    const { page } = baixar;
    const url = page.getByRole("textbox", { name: "URL do vídeo ou da playlist" });
    await expect(url).toHaveValue(VIDEO);
    await expect(url).toBeFocused();
    expect(await page.evaluate(() => {
      const i = document.getElementById("url") as HTMLInputElement;
      return [i.selectionStart, i.selectionEnd, i.value.length];
    })).toEqual([0, VIDEO.length, VIDEO.length]);
    await expect(page.locator("#media")).toBeVisible();
  });
});
