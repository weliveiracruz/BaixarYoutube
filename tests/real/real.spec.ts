// T-REAL: one real download from YouTube with the shipped yt-dlp and FFmpeg (needs the internet).
// Not part of the release gate (it depends on YouTube); run with: npm run test:real
import * as fs from "node:fs";
import * as path from "node:path";

import { ROOT, expect, launch, test } from "../e2e/fixtures";

const ZOO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

test("T-REAL-01 Me at the zoo: real thumbnail, MP4 and MP3", async () => {
  test.setTimeout(240000);
  const h = await launch({ real: true });
  try {
    const { page } = h;
    await page.getByLabel("URL do vídeo ou da playlist").fill(ZOO);
    await expect(page.locator("#media-img")).toBeVisible({ timeout: 30000 });
    expect(await page.locator("#media-img").getAttribute("src")).toMatch(/^data:image\/(jpeg|webp|png);base64,/);
    await expect(page.locator("#media-title")).toHaveText("Me at the zoo", { timeout: 60000 });
    await page.screenshot({ path: path.join(ROOT, "test-results", "12-real-previa.png") });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Download concluído: Me at the zoo/, { timeout: 120000 });
    await page.getByRole("combobox", { name: "Formato" }).selectOption("mp3");
    await page.getByRole("button", { name: "Baixar" }).click();
    await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue(/Download concluído: Me at the zoo/, { timeout: 120000 });
    const files = fs.readdirSync(h.downloads).sort();
    expect(files).toEqual(["Me at the zoo.mp3", "Me at the zoo.mp4"]);
    for (const f of files) expect(fs.statSync(path.join(h.downloads, f)).size).toBeGreaterThan(100000);
    await page.screenshot({ path: path.join(ROOT, "test-results", "13-real-concluido.png") });
    console.log("arquivos:", files.map((f) => `${f} ${fs.statSync(path.join(h.downloads, f)).size} bytes`).join(", "));
  } finally {
    await h.close();
  }
});
