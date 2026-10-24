import * as fs from "node:fs";
import * as path from "node:path";

import { ROOT, axe, expect, test } from "./fixtures";

test("T-E2E-01 the window opens with every control named", async ({ baixar }) => {
  const { page } = baixar;
  await expect(page).toHaveTitle("Baixar do YouTube");
  await expect(page.getByRole("heading", { level: 1, name: "Baixar do YouTube" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "URL do vídeo ou da playlist" })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Pasta de download" })).toHaveValue(baixar.downloads);
  await expect(page.getByRole("combobox", { name: "Formato" })).toHaveValue("mp4best");
  await expect(page.getByRole("button", { name: "Baixar" })).toBeEnabled();
  await expect(page.getByRole("textbox", { name: "Situação" })).toHaveValue("Cole o link de um vídeo ou de uma playlist e pressione Baixar.");
  await expect(page.getByRole("progressbar", { name: "Progresso" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir arquivo" })).toBeDisabled();
  expect(await axe(page)).toEqual([]);
  fs.mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, "test-results", "01-inicial.png") });
});
