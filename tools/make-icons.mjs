// Draws the app icon (a purple rounded square with a white download arrow, not the
// Nubank logo: D-02) and writes resources/icons/app.ico and app.png. No dependencies.
// Usage: node tools/make-icons.mjs

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "resources", "icons");
const PURPLE = [0x82, 0x0a, 0xd1];
const WHITE = [0xff, 0xff, 0xff];

/** Coverage (0..1) of the shapes at a point of the unit square. */
function shapes(x, y) {
  // rounded square, radius 0.22
  const r = 0.22;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const inSquare = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  if (!inSquare) return null;
  // arrow: shaft, head and base line
  const shaft = Math.abs(x - 0.5) <= 0.07 && y >= 0.2 && y <= 0.56;
  const headTop = 0.42;
  const headBottom = 0.66;
  const half = headBottom - y; // the triangle narrows to the tip
  const head = y >= headTop && y <= headBottom && Math.abs(x - 0.5) <= half;
  const base = y >= 0.74 && y <= 0.82 && x >= 0.25 && x <= 0.75;
  return shaft || head || base ? WHITE : PURPLE;
}

function render(size) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          const c = shapes((i + (si + 0.5) / ss) / size, (j + (sj + 0.5) / ss) / size);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 1;
          }
        }
      }
      const o = (j * size + i) * 4;
      if (a) {
        px[o] = Math.round(r / a);
        px[o + 1] = Math.round(g / a);
        px[o + 2] = Math.round(b / a);
      }
      px[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const px = render(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let j = 0; j < size; j++) px.copy(raw, j * (size * 4 + 1) + 1, j * size * 4, (j + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function ico(sizes) {
  const images = sizes.map(png);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map((img, k) => {
    const e = Buffer.alloc(16);
    e[0] = sizes[k] >= 256 ? 0 : sizes[k];
    e[1] = sizes[k] >= 256 ? 0 : sizes[k];
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "app.ico"), ico([16, 20, 24, 32, 40, 48, 64, 128, 256]));
fs.writeFileSync(path.join(OUT, "app.png"), png(256));
fs.writeFileSync(path.join(OUT, "tray.png"), png(32));
fs.writeFileSync(path.join(OUT, "app-64.png"), png(64));
console.log("icons written to resources/icons");
