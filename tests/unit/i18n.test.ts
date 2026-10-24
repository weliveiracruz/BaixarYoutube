// T-I18N: pt-BR and en have the same keys and placeholders; settings validation.
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_SHORTCUT } from "../../src/shared/types";
import { duration, progressText, shortcutText, size } from "../../src/shared/messages";
import { STRINGS, format, mnemonic } from "../../src/shared/strings";
import { SettingsStore, defaults, isAccelerator, validSetting } from "../../src/main/settings";
import { tempFolder } from "./helpers";

const placeholders = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Strings", () => {
  it("T-I18N-01 same keys and placeholders in both languages", () => {
    const pt = STRINGS["pt-BR"];
    const en = STRINGS.en;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
    for (const key of Object.keys(pt) as (keyof typeof pt)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(pt[key]));
      expect((pt[key].match(/&/g) ?? []).length, key).toBe((en[key].match(/&/g) ?? []).length);
    }
  });

  it("T-I18N-02 mnemonic, format, sizes and durations", () => {
    expect(mnemonic("Abrir &pasta")).toEqual({ text: "Abrir pasta", key: "p", index: 6 });
    expect(mnemonic("Sem tecla")).toEqual({ text: "Sem tecla", key: null, index: -1 });
    expect(format("{a} de {b} {c}", { a: 1, b: 2 })).toBe("1 de 2 {c}");
    const pt = STRINGS["pt-BR"];
    expect(size(pt, 12.5 * 1024 * 1024)).toBe("12,5 MB");
    expect(size(STRINGS.en, 12.5 * 1024 * 1024)).toBe("12.5 MB");
    expect(size(pt, 3 * 1024 ** 3)).toBe("3,0 GB");
    expect(size(pt, 10)).toBe("1 KB");
    expect(duration(pt, 200)).toBe("3 min 20 s");
    expect(duration(pt, 19)).toBe("19 s");
    expect(progressText(pt, { percent: 45, downloaded: 12 * 1024 * 1024, total: 27 * 1024 * 1024, eta: 20 })).toBe(
      "Baixando: 45%, 12,0 MB de 27,0 MB, faltam 20 s",
    );
    expect(progressText(pt, { percent: 45, downloaded: 1, total: null, eta: null })).toBe("Baixando: 45%");
    expect(shortcutText("Control+Alt+Y")).toBe("Ctrl+Alt+Y");
  });
});

describe("Settings", () => {
  it("T-I18N-03 closed schema: only valid values are accepted", () => {
    expect(validSetting("format", "mp3")).toBe(true);
    expect(validSetting("format", "exe")).toBe(false);
    expect(validSetting("announce", 25)).toBe(true);
    expect(validSetting("announce", "25")).toBe(false);
    expect(validSetting("folder", "C:\\")).toBe(false);
    expect(validSetting("__proto__", {})).toBe(false);
    expect(validSetting("language", "fr")).toBe(false);
    expect(isAccelerator(DEFAULT_SHORTCUT)).toBe(true);
    expect(isAccelerator("Control+Shift+F12")).toBe(true);
    expect(isAccelerator("Shift+A")).toBe(false);
    expect(isAccelerator("Control+Control+A")).toBe(false);
    expect(isAccelerator("Alt+Tab")).toBe(false);
  });

  it("T-I18N-04 the store ignores damaged values and a missing folder goes back to Downloads", () => {
    const dir = tempFolder();
    const file = path.join(dir, "settings.json");
    require("node:fs").writeFileSync(file, JSON.stringify({ format: "exe", announce: 25, folder: path.join(dir, "gone"), language: "en", extra: 1 }));
    const store = new SettingsStore(file, defaults(dir, "pt-BR"), (f) => require("node:fs").existsSync(f));
    const s = store.get();
    expect(s.format).toBe("mp4best");
    expect(s.announce).toBe(25);
    expect(s.language).toBe("en");
    expect(s.folder).toBe(dir);
    expect((s as unknown as Record<string, unknown>).extra).toBeUndefined();
    expect(defaults(dir, "en-US").language).toBe("en");
    expect(defaults(dir, "pt-PT").language).toBe("pt-BR");
  });
});
