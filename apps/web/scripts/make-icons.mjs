// 產生 PWA 圖示（public/icon-*.png）。
// 用純幾何圖形直接寫 PNG，不依賴字型或瀏覽器，任何機器上重跑結果都一樣。
// 圖案：品牌深藍底 + 白色「三」（三橫），對應「三順」。
// 重新產生： node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const NAVY = [28, 43, 69]; // #1C2B45，與 manifest 的 theme_color 一致
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** size×size 的 RGB 圖，pixel(x,y) 回傳 [r,g,b] */
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 三條白色橫線（「三」）。中間短、上下長，比例參考標準字形 */
function makeIcon(size) {
  const bars = [
    { cy: 0.34, w: 0.46 },
    { cy: 0.5, w: 0.34 },
    { cy: 0.66, w: 0.54 },
  ];
  const h = size * 0.055; // 線條粗細
  const r = h / 2; // 端點圓角
  return png(size, (x, y) => {
    for (const b of bars) {
      const cy = size * b.cy;
      const halfW = (size * b.w) / 2;
      const left = size / 2 - halfW;
      const right = size / 2 + halfW;
      const dy = Math.abs(y - cy);
      if (dy > h / 2) continue;
      if (x >= left + r && x <= right - r) return WHITE;
      // 兩端做成圓頭
      const cx = x < size / 2 ? left + r : right - r;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return WHITE;
    }
    return NAVY;
  });
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512, 180]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  const buf = makeIcon(size);
  writeFileSync(path.join(OUT_DIR, name), buf);
  console.log(`${name}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}
