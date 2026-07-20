// 匯入本機的新竹／大榮託運報表 PDF 到正式資料庫（貨物追蹤）。
// 用法：node seed-shipments.mjs [檔案路徑...]（不給參數時用 C:\Claude 下預設的兩個檔）
// 之後日常請直接在網頁上傳，不必再跑這支。
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
require("tsx/cjs");
const { parseShipmentPdf, regionOfAddress, UNCLASSIFIED } = require("./src/services/shipmentParser.ts");

const prisma = new PrismaClient();

const files = process.argv.slice(2);
if (files.length === 0) {
  for (const f of fs.readdirSync("C:/Claude")) {
    if (/^pdfSummary\d*\.pdf$/i.test(f) || /^ReportDetails\.aspx\.pdf$/i.test(f)) files.push(`C:/Claude/${f}`);
  }
}
console.log("要匯入的檔案：", files.join("、") || "(找不到)");

const customers = await prisma.customer.findMany({ select: { name: true, city: true } });
const cityByName = new Map(customers.map((c) => [c.name, c.city]));

let created = 0, updated = 0, unclassified = 0;
const summary = {};

for (const path of files) {
  const rows = await parseShipmentPdf(fs.readFileSync(path));
  console.log(`\n${path} → ${rows.length} 筆`);

  for (const r of rows) {
    let region = regionOfAddress(r.address);
    if (!region) {
      const city = cityByName.get(r.recipient);
      if (city) region = regionOfAddress(city);
    }
    if (!region) { region = UNCLASSIFIED; unclassified++; }

    const data = { ...r, region };
    const existing = await prisma.shipment.findUnique({
      where: { carrier_trackingNo: { carrier: r.carrier, trackingNo: r.trackingNo } },
    });
    if (existing) {
      await prisma.shipment.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.shipment.create({ data });
      created++;
    }
    summary[`${region} ${r.carrier}`] = (summary[`${region} ${r.carrier}`] ?? 0) + 1;
  }
}

console.log(`\n完成：新增 ${created}、更新 ${updated}、未分類 ${unclassified}`);
console.log("分區統計：", JSON.stringify(summary, null, 1));
await prisma.$disconnect();
