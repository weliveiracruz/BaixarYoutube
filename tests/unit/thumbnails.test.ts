// T-THUMB: the thumbnail rules of RS-11, against a local HTTP server.
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MAX_BYTES, ThumbnailCache, fetchThumbnail, sniff, thumbnailUrls } from "../../src/core/thumbnails";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(5000, 2)]);
let server: http.Server;
let base = "";
const seen: { url: string; cookie?: string }[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push({ url: req.url ?? "", cookie: req.headers.cookie });
    const [, , id, name] = (req.url ?? "").split("/");
    if (id === "aaaaaaaaaaa") return void res.writeHead(200, { "content-type": "image/jpeg" }).end(JPEG);
    if (id === "bbbbbbbbbbb") {
      // no maxres: falls back to hqdefault
      if (name === "maxresdefault.jpg") return void res.writeHead(404).end(Buffer.alloc(1000));
      return void res.writeHead(200).end(PNG);
    }
    if (id === "redirect___") return void res.writeHead(302, { location: "https://evil.example/x.jpg" }).end();
    if (id === "notanimage_") return void res.writeHead(200).end("<html>" + "x".repeat(5000));
    if (id === "toolarge___") {
      res.writeHead(200);
      res.write(Buffer.from([0xff, 0xd8, 0xff]));
      return void res.end(Buffer.alloc(MAX_BYTES + 10));
    }
    if (id === "slow_______") return; // never answers
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("Thumbnails", () => {
  it("T-THUMB-01 only i.ytimg.com with a validated id", () => {
    expect(thumbnailUrls("jNQXAC9IVRw")).toEqual([
      "https://i.ytimg.com/vi/jNQXAC9IVRw/maxresdefault.jpg",
      "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
    ]);
    for (const bad of ["", "short", "../../etc/pa", "jNQXAC9IVRw/", "aaaaaaaaaa?", "a".repeat(12)]) expect(thumbnailUrls(bad), bad).toEqual([]);
  });

  it("T-THUMB-02 real images become data URLs; maxres falls back to hq", async () => {
    const jpeg = await fetchThumbnail("aaaaaaaaaaa", fetch, base);
    expect(jpeg?.startsWith("data:image/jpeg;base64,")).toBe(true);
    const png = await fetchThumbnail("bbbbbbbbbbb", fetch, base);
    expect(png?.startsWith("data:image/png;base64,")).toBe(true);
    expect(seen.every((s) => !s.cookie)).toBe(true);
  });

  it("T-THUMB-03 redirects, non-images, big files and timeouts give no picture", async () => {
    expect(await fetchThumbnail("redirect___", fetch, base)).toBeNull();
    expect(await fetchThumbnail("notanimage_", fetch, base)).toBeNull();
    expect(await fetchThumbnail("toolarge___", fetch, base)).toBeNull();
    const controller = new AbortController();
    const start = Date.now();
    setTimeout(() => controller.abort(), 300);
    expect(await fetchThumbnail("slow_______", fetch, base, controller.signal)).toBeNull();
    expect(Date.now() - start).toBeLessThan(3000);
    expect(seen.some((s) => s.url.includes("evil"))).toBe(false);
  });

  it("T-THUMB-04 sniffs JPEG, PNG and WebP only", () => {
    expect(sniff(JPEG)).toBe("image/jpeg");
    expect(sniff(PNG)).toBe("image/png");
    expect(sniff(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniff(Buffer.from("GIF89a"))).toBeNull();
    expect(sniff(Buffer.from("<svg"))).toBeNull();
  });

  it("T-THUMB-05 the memory cache keeps the last 20", () => {
    const cache = new ThumbnailCache(20);
    for (let i = 0; i < 25; i++) cache.set(String(i), "x");
    expect(cache.size).toBe(20);
    expect(cache.get("0")).toBeUndefined();
    expect(cache.get("24")).toBe("x");
  });
});
