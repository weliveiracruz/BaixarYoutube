// T-A11Y-TOK: WCAG contrast of every pair of tokens used together (SDD 5.2), in both themes.
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT } from "./helpers";

const css = fs.readFileSync(path.join(ROOT, "src", "renderer", "styles", "tokens.css"), "utf8");

function block(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of source.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = block(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)")));
const dark = { ...light, ...block(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf(':root[data-motion="off"]'))) };

function rgb(value: string, over = [255, 255, 255]): number[] {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  const m = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!m) throw new Error("color " + value);
  const [r, g, b, a = 1] = m[1].split(",").map((x) => Number(x.trim()));
  return [r, g, b].map((c, i) => c * a + over[i] * (1 - a));
}

function lum([r, g, b]: number[]): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(fg: string, bg: string, base?: string): number {
  const back = rgb(bg, base ? rgb(base) : undefined);
  const a = lum(rgb(fg, back));
  const b = lum(back);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// [foreground, background, minimum]: 4.5 for text, 3 for components and focus.
const PAIRS: [string, string, number][] = [
  ["--color-text", "--color-bg", 4.5],
  ["--color-text-body", "--color-bg", 4.5],
  ["--color-text-body", "--color-surface", 4.5],
  ["--color-text-muted", "--color-bg", 4.5],
  ["--color-text-muted", "--color-bg-purple-tint", 4.5],
  ["--color-text-muted", "--color-surface", 4.5],
  ["--color-text-disabled", "--color-bg-subtle", 4.5],
  ["--color-on-brand", "--color-brand", 4.5],
  ["--color-on-brand", "--color-header-bg", 4.5],
  ["--color-brand-text", "--color-bg", 4.5],
  ["--color-brand-text", "--color-badge-bg", 4.5],
  ["--color-on-danger", "--color-danger", 4.5],
  ["--color-danger", "--color-bg", 4.5],
  ["--color-danger", "--color-bg-purple-tint", 4.5],
  ["--color-success", "--color-bg-purple-tint", 3],
  ["--color-success", "--color-bg", 4.5],
  ["--color-warning", "--color-bg", 4.5],
  ["--color-text", "--color-bg-subtle", 4.5],
  ["--color-border-control", "--color-bg", 3],
  ["--focus-ring", "--color-bg", 3],
  ["--focus-ring", "--color-bg-purple-tint", 3],
  ["--color-brand", "--color-bg", 3],
];

describe("Token contrast", () => {
  for (const [theme, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`T-A11Y-TOK ${theme}: every pair meets WCAG`, () => {
      const failures: string[] = [];
      for (const [fg, bg, min] of PAIRS) {
        const ratio = contrast(tokens[fg], tokens[bg], tokens["--color-bg"]);
        if (ratio < min) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
      }
      expect(failures).toEqual([]);
    });
  }

  it("T-A11Y-TOK the brand purple is #820AD1 and AAA on white", () => {
    expect(light["--color-brand"].toLowerCase()).toBe("#820ad1");
    expect(contrast("#ffffff", "#820ad1")).toBeGreaterThanOrEqual(7);
  });
});
