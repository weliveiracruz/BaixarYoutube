// Release gate (SDD 9): types, unit tests, real programs, the window tests; then the binaries
// check and electron-builder. Nothing is packaged when a test fails. Writes
// reports/RELATORIO-TESTES-<version>.md, reports/PROBLEMAS-<version>.md and dist/*.sha256.
// Usage: node tools/release.mjs

import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { check } from "./fetch-binaries.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(name, args) {
  const start = Date.now();
  const r = spawnSync(npx, args, { cwd: ROOT, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  // eslint-disable-next-line no-control-regex
  const clean = out.replace(/\x1b\[[0-9;]*m/g, "");
  const passed = Number(/Tests\s+(\d+) passed/.exec(clean)?.[1] ?? /(\d+) passed/.exec(clean)?.[1] ?? 0);
  const failed = Number(/(\d+) failed/.exec(clean)?.[1] ?? 0);
  const result = { name, ok: r.status === 0, passed, failed, seconds: Math.round((Date.now() - start) / 1000), tail: clean.split("\n").slice(-40).join("\n") };
  console.log(`${result.ok ? "OK  " : "FAIL"} ${name}: ${passed} passed, ${failed} failed (${result.seconds} s)`);
  return result;
}

const steps = [];
steps.push(run("Tipos (tsc)", ["tsc", "--noEmit", "-p", "tsconfig.json"]));
steps.push(run("Núcleo, miniaturas, tokens e tradução (Vitest)", ["vitest", "run", "tests/unit"]));
steps.push(run("Programas reais yt-dlp e FFmpeg (Vitest)", ["vitest", "run", "tests/bin"]));
spawnSync(process.execPath, [path.join(ROOT, "tools", "build-app.mjs")], { cwd: ROOT, stdio: "inherit" });
steps.push(run("Janela: fluxos, acessibilidade, segurança (Playwright)", ["playwright", "test"]));
const binProblems = check();
steps.push({ name: "resources/bin igual a tools/binaries.json", ok: binProblems.length === 0, passed: binProblems.length ? 0 : 1, failed: binProblems.length, seconds: 0, tail: binProblems.join("\n") });

const date = new Date().toISOString().slice(0, 10);
const allOk = steps.every((s) => s.ok);
let artifacts = [];
if (allOk) {
  const r = spawnSync(npx, ["electron-builder", "--win", "--config", "electron-builder.yml"], { cwd: ROOT, stdio: "inherit", shell: true });
  if (r.status !== 0) steps.push({ name: "electron-builder", ok: false, passed: 0, failed: 1, seconds: 0, tail: "electron-builder failed" });
  else {
    for (const name of fs.readdirSync(path.join(ROOT, "dist")).filter((n) => n.endsWith(".exe") && n.includes(version))) {
      const file = path.join(ROOT, "dist", name);
      const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      fs.writeFileSync(file + ".sha256", `${digest}  ${name}\n`);
      artifacts.push({ name, size: fs.statSync(file).size, digest });
    }
  }
}

const total = steps.reduce((a, s) => a + s.passed, 0);
const failedTotal = steps.reduce((a, s) => a + s.failed, 0);
fs.mkdirSync(path.join(ROOT, "reports"), { recursive: true });
const lines = [
  `# Relatório de testes ${version}`,
  "",
  `Data: ${date}. Resultado: **${allOk && artifacts.length ? "aprovado, pacote gerado" : "reprovado, nada foi empacotado"}** (${total} verificações aprovadas, ${failedTotal} com falha).`,
  "",
  "| Etapa | Resultado | Aprovados | Falhas | Tempo |",
  "|---|---|---|---|---|",
  ...steps.map((s) => `| ${s.name} | ${s.ok ? "OK" : "FALHOU"} | ${s.passed} | ${s.failed} | ${s.seconds} s |`),
  "",
  "## Pacotes",
  "",
  ...(artifacts.length ? artifacts.map((a) => `- \`${a.name}\`: ${(a.size / 1024 / 1024).toFixed(1)} MB, SHA-256 \`${a.digest}\``) : ["Nenhum."]),
  "",
  "Testes manuais com leitores de tela e downloads reais: docs/TESTES-MANUAIS.md.",
  "",
];
fs.writeFileSync(path.join(ROOT, "reports", `RELATORIO-TESTES-${version}.md`), lines.join("\n"));
const problems = steps.filter((s) => !s.ok);
fs.writeFileSync(
  path.join(ROOT, "reports", `PROBLEMAS-${version}.md`),
  [`# Problemas ${version}`, "", problems.length ? problems.map((p) => `## ${p.name}\n\n\`\`\`\n${p.tail}\n\`\`\`\n`).join("\n") : "Nenhum problema nos testes automáticos.", ""].join("\n"),
);
console.log(allOk && artifacts.length ? `\nPacotes em dist/: ${artifacts.map((a) => a.name).join(", ")}` : "\nReprovado: veja reports/PROBLEMAS-" + version + ".md");
process.exit(allOk && artifacts.length ? 0 : 1);
