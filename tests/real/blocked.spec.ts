import * as path from "node:path";
import { ROOT, expect, launch, test } from "../e2e/fixtures";
test("T-REAL-02 when YouTube blocks, the app says so", async () => {
  const h = await launch({ real: true });
  try {
    await h.page.getByLabel("URL do vídeo ou da playlist").fill("https://www.youtube.com/watch?v=jNQXAC9IVRw");
    await h.page.waitForTimeout(4000);
    await h.page.keyboard.press("Enter");
    await expect(h.page.locator("#live-alert, #live-status").first()).not.toBeEmpty({ timeout: 60000 });
    await expect(h.page.getByRole("textbox", { name: "Situação" })).toHaveValue(/robô|Download concluído/, { timeout: 90000 });
    console.log("Situação:", await h.page.locator("#status").inputValue());
    await h.page.screenshot({ path: path.join(ROOT, "test-results", "14-real-bloqueado.png") });
  } finally {
    await h.close();
  }
});
