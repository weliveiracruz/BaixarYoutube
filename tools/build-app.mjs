// Builds the app into build/: main.js and preload.js (Node, CommonJS) and the window
// (renderer/app.js, HTML, CSS and the manual). Usage: node tools/build-app.mjs

import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "build");
const WEB = path.join(OUT, "renderer");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(WEB, { recursive: true });

const common = { bundle: true, target: "es2023", sourcemap: false, legalComments: "none", logLevel: "warning" };
await esbuild.build({ ...common, entryPoints: [path.join(ROOT, "src/main/main.ts")], outfile: path.join(OUT, "main.js"), platform: "node", format: "cjs", external: ["electron"] });
// A sandboxed preload may require only "electron": everything else is bundled.
await esbuild.build({ ...common, entryPoints: [path.join(ROOT, "src/preload/preload.ts")], outfile: path.join(OUT, "preload.js"), platform: "node", format: "cjs", external: ["electron"] });
await esbuild.build({ ...common, entryPoints: [path.join(ROOT, "src/renderer/app.ts")], outfile: path.join(WEB, "app.js"), platform: "browser", format: "iife" });

fs.copyFileSync(path.join(ROOT, "src/renderer/index.html"), path.join(WEB, "index.html"));
fs.cpSync(path.join(ROOT, "src/renderer/styles"), path.join(WEB, "styles"), { recursive: true });
fs.cpSync(path.join(ROOT, "src/manual"), path.join(WEB, "manual"), { recursive: true });
console.log("build/ ready");
