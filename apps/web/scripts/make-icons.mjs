// 產生 PWA 圖示（public/icon-*.png）——來源是公司 logo 檔。
// 重新產生： node scripts/make-icons.mjs [來源圖檔]
//
// 預設來源 C:\Claude\三順logo.png：整張圖上半部是圓角方形的 App 圖示，下方是「三順」字樣，
// 這裡自動偵測出上半部那塊圖示、裁成正方形後縮到各種尺寸。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "..", "public");
const SRC = process.argv[2] ?? "C:\\Claude\\三順logo.png";

// ---------- 最小 PNG 讀寫（只支援本專案用得到的格式，不引入額外套件） ----------
function crcTable() {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const TABLE = crcTable();
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 解析 PNG → { w, h, rgb: Buffer(w*h*3) }。支援 8-bit truecolor(2) 與 truecolor+alpha(6）。 */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("不是 PNG 檔");
  let o = 8;
  let w = 0, h = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("不支援交錯式 PNG");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`不支援的 PNG 格式（bitDepth ${bitDepth}, colorType ${colorType}）`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * 3);
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    raw.copy(line, 0, p, p + stride);
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 3] = line[x * bpp];
      out[(y * w + x) * 3 + 1] = line[x * bpp + 1];
      out[(y * w + x) * 3 + 2] = line[x * bpp + 2];
    }
    line.copy(prev);
  }
  return { w, h, rgb: out };
}

function encodePng(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- 找出圖示方塊的範圍 ----------
/** logo 圖上半部的圓角方塊明顯比周圍深藍底亮，靠亮度找出邊界。
 *  取「最長的一段連續亮列」而不是第一段：背景水波偶爾會有幾列偏亮，
 *  下方「三順」字樣雖然也亮，但只佔窄窄一條，不會超過寬度門檻。 */
function findTile({ w, h, rgb }) {
  const lum = (x, y) => {
    const i = (y * w + x) * 3;
    return 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
  };
  const THR = 95; // 方塊內部亮度約 120，外圍深藍底約 55
  const wide = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (lum(x, y) > THR) n++;
    wide.push(n > w * 0.45);
  }
  // 取所有「夠寬的亮列」的最上與最下：方塊中間偶爾有幾列因為線條配置而低於門檻，
  // 用連續區段會被切斷；底部「三順」字樣只佔約三成寬度，不會被誤算進來。
  const top = wide.indexOf(true);
  const bottom = wide.lastIndexOf(true);
  if (top < 0) throw new Error("找不到圖示區塊");
  const best = { top, bottom };
  let left = w, right = 0;
  for (let y = best.top; y <= best.bottom; y++) {
    for (let x = 0; x < w; x++) {
      if (lum(x, y) > THR) { if (x < left) left = x; if (x > right) right = x; }
    }
  }
  return { left, top: best.top, right, bottom: best.bottom };
}

const src = decodePng(readFileSync(SRC));
const box = findTile(src);
// 裁成正方形（以圖示中心為準，邊長取長邊，確保整塊都在裡面）
const cx = (box.left + box.right) / 2;
const cy = (box.top + box.bottom) / 2;
const side = Math.max(box.right - box.left, box.bottom - box.top) + 2;
const x0 = Math.round(cx - side / 2);
const y0 = Math.round(cy - side / 2);
console.log(`來源 ${src.w}x${src.h}，偵測到圖示範圍 x:${box.left}-${box.right} y:${box.top}-${box.bottom} → 裁切 ${Math.round(side)}px 正方形`);

function sample(sx, sy) {
  const x = Math.min(src.w - 1, Math.max(0, Math.round(sx)));
  const y = Math.min(src.h - 1, Math.max(0, Math.round(sy)));
  const i = (y * src.w + x) * 3;
  return [src.rgb[i], src.rgb[i + 1], src.rgb[i + 2]];
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512, 180]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  // 縮圖用區塊平均，避免直接抽點造成鋸齒
  const scale = side / size;
  const buf = encodePng(size, (x, y) => {
    const step = Math.max(1, Math.floor(scale / 3));
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = 0; dy < scale; dy += step) {
      for (let dx = 0; dx < scale; dx += step) {
        const [pr, pg, pb] = sample(x0 + x * scale + dx, y0 + y * scale + dy);
        r += pr; g += pg; b += pb; n++;
      }
    }
    // 稍微降低色階：logo 是漸層照片，PNG 對連續色調壓縮效率差，
    // 量化到 5 級距後檔案小很多，肉眼看不出差別。
    const q = (v) => Math.min(255, Math.round(v / n / 5) * 5);
    return [q(r), q(g), q(b)];
  });
  writeFileSync(path.join(OUT_DIR, name), buf);
  console.log(`${name}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
  if (buf.length > 300 * 1024) console.warn(`  ⚠ ${name} 偏大，考慮降低色階`);
}
