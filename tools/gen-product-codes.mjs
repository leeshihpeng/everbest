// 從 ERP 匯出的「貨品基本資料」產生前端用的產品編號對照表。
//
// 為什麼要有這支：派遣單 CSV 只帶品名，不帶編號（`商品別編號` 欄實測全空），
// 但物流管理的貨品統計要依產品編號排序。所以先在這裡把「品名 → 編號」固定下來。
//
// 用法（ERP 的產品主檔更新後重跑一次，然後 commit 產生出來的檔案）：
//   node tools/gen-product-codes.mjs "C:\server\產品編號.xls"
//
// 預設讀 C:\Claude\產品編號.xls（使用者 2026-08-06 提供的那份）。

import XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2] || String.raw`C:\Claude\產品編號.xls`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "src", "lib", "productCodes.ts");
const SHEET = "貨品基本資料";

const wb = XLSX.readFile(SRC);
if (!wb.Sheets[SHEET]) {
  console.error(`找不到工作表「${SHEET}」，這份檔案有：${wb.SheetNames.join("、")}`);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { defval: "" });

// 同一個品名可能對到多個編號，實測差別都是 `…TEMP` 這種暫存編號（例如
// 金龍牌櫻桃特大 → CH／CHTEMP／CHTEMP1）。排除 TEMP，再取檔案裡先出現的那個。
const map = new Map(); // 品名 → { code, order }
const ambiguous = [];
rows.forEach((r, i) => {
  const code = String(r["產品編號"] ?? "").trim();
  const name = String(r["產品名稱"] ?? "").trim();
  if (!code || !name || /TEMP\d*$/i.test(code)) return;
  if (map.has(name)) {
    ambiguous.push(`${name}: ${map.get(name).code} / ${code}`);
    return; // 先出現的優先
  }
  map.set(name, { code, order: i });
});

const entries = [...map.entries()].sort((a, b) => a[1].order - b[1].order);
const body = entries.map(([name, { code }]) => `  ${JSON.stringify(name)}: ${JSON.stringify(code)},`).join("\n");

const file = `// 產品編號對照表 — **這是產生出來的檔案，不要手改**。
// 來源：ERP「貨品基本資料」匯出檔；重新產生請跑 \`node tools/gen-product-codes.mjs <xls路徑>\`。
//
// 為什麼需要：派遣單 CSV 只帶品名不帶編號（新竹的「商品別編號」欄實測全空），
// 但物流管理的貨品統計要依產品編號排序，所以在這裡把對照固定下來。
// 產生時間：${new Date().toISOString().slice(0, 10)}｜共 ${entries.length} 項

/** 品名 → 產品編號。鍵是 ERP 實際用在派遣單上的品名，要完全相符。 */
export const PRODUCT_CODE_BY_NAME: Record<string, string> = {
${body}
};

/** 產品編號 → 主檔裡的排列順序。**照 ERP 主檔的原始順序**，
 *  不是把編號拿去做字串排序——編號有 A／A300／AH 這種混合格式，
 *  自己排會跟 ERP 看到的順序對不起來。 */
const ORDER: Record<string, number> = Object.fromEntries(
  Object.values(PRODUCT_CODE_BY_NAME).map((code, i) => [code, i])
);

/** 查品名對應的產品編號；查不到回 undefined（表示 ERP 新增了品項但對照表還沒更新）。 */
export function productCodeOf(name: string): string | undefined {
  return PRODUCT_CODE_BY_NAME[name.trim()];
}

/** 依產品編號排序用的比較函式。**對不到編號的一律排最後**，
 *  這樣新品項會集中在下面，一眼就看得出對照表要補。 */
export function compareByProductCode(a: string, b: string): number {
  const ca = productCodeOf(a);
  const cb = productCodeOf(b);
  if (ca && cb) return ORDER[ca] - ORDER[cb];
  if (ca) return -1;
  if (cb) return 1;
  return a.localeCompare(b, "zh-Hant");
}
`;

writeFileSync(OUT, file, "utf8");
console.log(`已寫入 ${OUT}`);
console.log(`  來源 ${SRC}｜${rows.length} 列 → 對照 ${entries.length} 項`);
if (ambiguous.length) {
  console.log(`  同名多編號（已取先出現的）：${ambiguous.length} 組`);
  ambiguous.forEach((a) => console.log("    " + a));
}
