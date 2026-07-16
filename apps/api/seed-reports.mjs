// 將本機 C:\Claude\檢驗報告\2026檢驗報告 下的 PDF 檢驗報告匯入正式資料庫。
// 報告日期以 pdftotext 從 PDF 第 1~2 頁抓第一個 YYYY/MM/DD（掃描檔無文字層則留空，由主管補填）。
// 可重複執行：同檔名會更新內容與日期，不會重複建立。
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const prisma = new PrismaClient();
const DIR = "C:/Claude/檢驗報告/2026檢驗報告";

function extractReportDate(fullPath) {
  try {
    const out = execSync(`pdftotext -f 1 -l 2 "${fullPath}" -`, { encoding: "utf8" });
    const m = out.match(/20[0-9]{2}\/[0-9]{2}\/[0-9]{2}/);
    return m ? new Date(m[0].replace(/\//g, "-")) : null;
  } catch {
    return null;
  }
}

const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
console.log(`找到 ${files.length} 個 PDF`);

for (const f of files) {
  const full = path.join(DIR, f);
  const fileName = f.replace(/\.pdf$/i, "");
  const content = fs.readFileSync(full);
  const reportDate = extractReportDate(full);

  const existing = await prisma.inspectionReport.findFirst({ where: { fileName } });
  if (existing) {
    await prisma.inspectionReport.update({
      where: { id: existing.id },
      data: { content, sizeBytes: content.length, reportDate: reportDate ?? existing.reportDate, mimeType: "application/pdf" },
    });
    console.log(`更新：${fileName}（${reportDate ? reportDate.toISOString().slice(0, 10) : "日期由主管補填"}，${(content.length / 1024).toFixed(0)}KB）`);
  } else {
    await prisma.inspectionReport.create({
      data: { fileName, content, sizeBytes: content.length, reportDate, mimeType: "application/pdf" },
    });
    console.log(`新增：${fileName}（${reportDate ? reportDate.toISOString().slice(0, 10) : "日期由主管補填"}，${(content.length / 1024).toFixed(0)}KB）`);
  }
}

console.log("完成");
await prisma.$disconnect();
