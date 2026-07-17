// 將本機 C:\Claude\檢驗報告 下各年度資料夾（例如 2026檢驗報告、2027檢驗報告）的 PDF 匯入正式資料庫。
// 年份取自資料夾名稱開頭的西元年；報告日期以 pdftotext 從 PDF 第 1~2 頁抓第一個 YYYY/MM/DD
// （掃描檔無文字層則留空，由主管在畫面上補填）。
// 可重複執行：同年份+同檔名會更新內容，不會重複建立；已補填過的日期不會被覆蓋掉。
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const prisma = new PrismaClient();
const ROOT = "C:/Claude/檢驗報告";

function extractReportDate(fullPath) {
  try {
    const out = execSync(`pdftotext -f 1 -l 2 "${fullPath}" -`, { encoding: "utf8" });
    const m = out.match(/20[0-9]{2}\/[0-9]{2}\/[0-9]{2}/);
    return m ? new Date(m[0].replace(/\//g, "-")) : null;
  } catch {
    return null;
  }
}

// 找出所有以西元年開頭的年度資料夾
const yearDirs = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^20[0-9]{2}/.test(d.name))
  .map((d) => ({ name: d.name, year: Number(d.name.match(/^(20[0-9]{2})/)[1]) }));

console.log(`找到 ${yearDirs.length} 個年度資料夾：${yearDirs.map((d) => d.name).join("、")}`);

for (const dir of yearDirs) {
  const dirPath = path.join(ROOT, dir.name);
  const files = fs.readdirSync(dirPath).filter((f) => f.toLowerCase().endsWith(".pdf"));
  console.log(`\n[${dir.year}] ${files.length} 個 PDF`);

  // 確保年份目錄存在（畫面上的年份分類以此為準）
  await prisma.reportYear.upsert({ where: { year: dir.year }, update: {}, create: { year: dir.year } });

  for (const f of files) {
    const full = path.join(dirPath, f);
    const fileName = f.replace(/\.pdf$/i, "");
    const content = fs.readFileSync(full);
    const reportDate = extractReportDate(full);

    const existing = await prisma.inspectionReport.findFirst({ where: { year: dir.year, fileName } });
    if (existing) {
      await prisma.inspectionReport.update({
        where: { id: existing.id },
        data: {
          content,
          sizeBytes: content.length,
          // 抓不到日期時保留既有（可能是主管手動補填的），不要蓋掉
          reportDate: reportDate ?? existing.reportDate,
          mimeType: "application/pdf",
        },
      });
      console.log(`  更新：${fileName}（${(reportDate ?? existing.reportDate)?.toISOString().slice(0, 10) ?? "日期待補填"}）`);
    } else {
      await prisma.inspectionReport.create({
        data: { year: dir.year, fileName, content, sizeBytes: content.length, reportDate, mimeType: "application/pdf" },
      });
      console.log(`  新增：${fileName}（${reportDate ? reportDate.toISOString().slice(0, 10) : "日期待補填"}）`);
    }
  }
}

console.log("\n完成");
await prisma.$disconnect();
