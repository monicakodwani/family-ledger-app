// Generates the PNG app icons from simple shapes (same design as public/icons/icon.svg).
// Uses only Node built-ins: run with `node scripts/make-icons.mjs`.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Shapes in a 512 coordinate space, painted in order.
const shapes = (rounded) => [
  { kind: "rect", x: 0, y: 0, w: 512, h: 512, r: rounded ? 112 : 0, c: hex("#1F5F5B") },
  { kind: "rect", x: 136, y: 112, w: 240, h: 296, r: 28, c: hex("#FAF7F2") },
  { kind: "rect", x: 136, y: 112, w: 44, h: 296, r: 20, c: hex("#E9DFCF") },
  { kind: "rect", x: 212, y: 176, w: 128, h: 20, r: 10, c: hex("#1F5F5B") },
  { kind: "rect", x: 212, y: 228, w: 104, h: 20, r: 10, c: hex("#9DB8A8") },
  { kind: "rect", x: 212, y: 280, w: 120, h: 20, r: 10, c: hex("#9DB8A8") },
  { kind: "circle", cx: 276, cy: 352, r: 18, c: hex("#C9963B") },
];

function inside(s, x, y) {
  if (s.kind === "circle") return (x - s.cx) ** 2 + (y - s.cy) ** 2 <= s.r ** 2;
  if (x < s.x || y < s.y || x > s.x + s.w || y > s.y + s.h) return false;
  const r = s.r;
  const cx = Math.min(Math.max(x, s.x + r), s.x + s.w - r);
  const cy = Math.min(Math.max(y, s.y + r), s.y + s.h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size, rounded) {
  const px = Buffer.alloc(size * size * 4);
  const list = shapes(rounded);
  const ss = 4;
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((pxl + (sx + 0.5) / ss) / size) * 512;
          const y = ((py + (sy + 0.5) / ss) / size) * 512;
          let col = null;
          for (const s of list) if (inside(s, x, y)) col = s.c;
          if (col) {
            r += col[0];
            g += col[1];
            b += col[2];
            a += 255;
          }
        }
      }
      const n = ss * ss;
      const i = (py * size + pxl) * 4;
      const cover = a / n;
      px[i] = cover ? Math.round((r / n) * (255 / cover)) : 0;
      px[i + 1] = cover ? Math.round((g / n) * (255 / cover)) : 0;
      px[i + 2] = cover ? Math.round((b / n) * (255 / cover)) : 0;
      px[i + 3] = Math.round(cover);
    }
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
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
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Apple applies its own rounded mask, so the touch icon is full-bleed.
for (const [name, size, rounded] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["apple-touch-icon.png", 180, false],
]) {
  writeFileSync(join(outDir, name), png(size, render(size, rounded)));
  console.log(`wrote ${name}`);
}
