// 從設計稿（三順主畫面.png）裁出八個磁磚圖示，輸出到 public/tiles/。
// 重新產生： node scripts/slice-tile-icons.mjs [設計稿路徑]
//
// 設計稿是 2048x2048、四列兩欄的磁磚，每格左側是插畫圖示。
// 這裡先自動找出每張白色磁磚的範圍，再從磁磚左側切出正方形的圖示區域。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "..", "public", "tiles");
const SRC = process.argv[2] ?? "C:\\Claude\\三順主畫面.png";
const OUT_SIZE = 160; // 手機上顯示約 40px，2 倍圖綽綽有餘

const TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let crc = 0xffffffff;
  for (const b of buf) crc = TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function decodePng(buf) {
  let o = 8, w = 0, h = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`不支援的 PNG（depth ${bitDepth}, type ${colorType}）`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const rgb = Buffer.alloc(w * h * 3);
  const line = Buffer.alloc(stride), prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    raw.copy(line, 0, p, p + stride); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      rgb[(y * w + x) * 3] = line[x * bpp];
      rgb[(y * w + x) * 3 + 1] = line[x * bpp + 1];
      rgb[(y * w + x) * 3 + 2] = line[x * bpp + 2];
    }
    line.copy(prev);
  }
  return { w, h, rgb };
}

function encodePng(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) { const [r, g, b] = pixel(x, y); raw[o++] = r; raw[o++] = g; raw[o++] = b; }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const img = decodePng(readFileSync(SRC));
const lum = (x, y) => {
  const i = (y * img.w + x) * 3;
  return 0.299 * img.rgb[i] + 0.587 * img.rgb[i + 1] + 0.114 * img.rgb[i + 2];
};

// 磁磚是近白色（亮度 > 225）。先找出每一列磁磚的上下範圍，再找左右兩欄的範圍。
const WHITE = 225;
// 磁磚之間的縫隙完全沒有白色，磁磚內部就算被圖示與文字佔掉也還有四成以上留白，
// 所以用很低的門檻（15%）就能把「磁磚」與「縫隙」分開。
const rowIsTile = [];
for (let y = 0; y < img.h; y++) {
  let n = 0;
  for (let x = 0; x < img.w; x += 4) if (lum(x, y) > WHITE) n++;
  rowIsTile.push(n > (img.w / 4) * 0.15);
}
const found = [];
for (let y = 0; y < img.h; y++) {
  if (!rowIsTile[y]) continue;
  let e = y;
  while (e + 1 < img.h && rowIsTile[e + 1]) e++;
  found.push([y, e]);
  y = e;
}
const bands = found.filter(([s, e]) => e - s > 200);
console.log("找到磁磚列:", bands.map(([a, b]) => `${a}-${b} (${b - a}px)`).join(", "));
if (bands.length < 4) throw new Error(`磁磚列偵測不足（找到 ${bands.length} 列）`);

// 取前四列（後面若還有，通常是底部導覽列）
const rows = bands.slice(0, 4);

/** 用磁磚頂端稍微往下一點的那一列來量左右範圍：
 *  中線會被圖示與文字打斷，頂端則是整片留白。 */
function colRange(y0, _y1) {
  const probe = y0 + 12;
  const white = [];
  for (let x = 0; x < img.w; x++) white.push(lum(x, probe) > WHITE);
  const runs = [];
  for (let x = 0; x < img.w; x++) {
    if (!white[x]) continue;
    let e = x;
    while (e + 1 < img.w && white[e + 1]) e++;
    if (e - x > 200) runs.push([x, e]);
    x = e;
  }
  return runs;
}

const cols = colRange(rows[0][0], rows[0][1]);
console.log("找到磁磚欄:", cols.map(([a, b]) => `${a}-${b}`).join(", "));
if (cols.length < 2) throw new Error("磁磚欄偵測不足");

const NAMES = [
  ["admin", "logi"],
  ["biz", "carrier"],
  ["inspection", "permit"],
  ["tracking", "quote"],
];

mkdirSync(OUT_DIR, { recursive: true });
for (let r = 0; r < 4; r++) {
  const [ty, by] = rows[r];
  const tileH = by - ty;
  for (let c = 0; c < 2; c++) {
    const [lx] = cols[c];
    // 圖示在磁磚左側，約佔磁磚高度的七成；垂直置中，水平留一點內縮避開圓角與陰影
    const side = Math.round(tileH * 0.72);
    const x0 = lx + Math.round(tileH * 0.1);
    const y0 = ty + Math.round((tileH - side) / 2);
    const scale = side / OUT_SIZE;
    const buf = encodePng(OUT_SIZE, (x, y) => {
      const step = Math.max(1, Math.floor(scale / 3));
      let R = 0, G = 0, B = 0, n = 0;
      for (let dy = 0; dy < scale; dy += step) {
        for (let dx = 0; dx < scale; dx += step) {
          const sx = Math.min(img.w - 1, Math.round(x0 + x * scale + dx));
          const sy = Math.min(img.h - 1, Math.round(y0 + y * scale + dy));
          const i = (sy * img.w + sx) * 3;
          R += img.rgb[i]; G += img.rgb[i + 1]; B += img.rgb[i + 2]; n++;
        }
      }
      const q = (v) => Math.min(255, Math.round(v / n / 4) * 4);
      return [q(R), q(G), q(B)];
    });
    const name = `${NAMES[r][c]}.png`;
    writeFileSync(path.join(OUT_DIR, name), buf);
    console.log(`${name}  來源 x:${x0} y:${y0} ${side}px → ${OUT_SIZE}px  ${(buf.length / 1024).toFixed(1)} KB`);
  }
}
